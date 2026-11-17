import { Rng } from '../rng';
import type { RaceInstance, Run } from '../types';
import { appraisedValue } from './auction';
import { canAfford } from '../economy/finance';
import { addInbox, formatMoney, type GameState, horsesOfStable, sortedById } from '../game/state';
import { freeBoxes, MarketError, transferHorse } from './transfer';

/**
 * Claiming-Rennen: Jedes Pferd im Rennen kann zum festen Claiming-Preis gekauft werden.
 * Claims werden in der Rennwoche nach der Startliste abgegeben; nach dem Rennen entscheidet
 * bei mehreren Claims das Los. Das Preisgeld des Rennens gehört noch dem alten Besitzer.
 */

export function toggleClaim(g: GameState, raceId: string, horseId: string): boolean {
  const race = g.races[raceId];
  if (!race) throw new MarketError('Rennen nicht gefunden.');
  const t = g.templates[race.templateId]!;
  if (t.claimPrice === null) throw new MarketError('Kein Claiming-Rennen.');
  if (race.status !== 'closed' || race.weekIndex !== g.weekIndex) throw new MarketError('Claims sind nur in der Rennwoche nach Bekanntgabe der Starter möglich.');
  const runner = race.runners?.find((x) => x.horseId === horseId);
  if (!runner) throw new MarketError('Das Pferd steht nicht im Starterfeld.');
  if (runner.stableId === g.playerStableId) throw new MarketError('Eigene Pferde kannst du nicht claimen.');
  const idx = race.claims.findIndex((c) => c.horseId === horseId && c.stableId === g.playerStableId);
  if (idx >= 0) {
    race.claims.splice(idx, 1);
    return false;
  }
  const pending = Object.values(g.races).reduce((a, r) => a + r.claims.filter((c) => c.stableId === g.playerStableId && r.status === 'closed').length, 0);
  if (freeBoxes(g) - pending <= 0) throw new MarketError('Keine freie Box für ein weiteres Pferd.');
  if (!canAfford(g, g.playerStableId, t.claimPrice)) throw new MarketError('Das übersteigt deinen Kreditrahmen.');
  race.claims.push({ stableId: g.playerStableId, horseId, weekIndex: g.weekIndex });
  return true;
}

/**
 * KI-Ställe claimen Pferde, die ihr eigener Gutachter deutlich über dem Claiming-Preis sieht
 * (der öffentliche Marktwert liegt bei Claiming-Startern meist nahe am Claiming-Preis).
 */
export function aiClaims(g: GameState, race: RaceInstance): void {
  const t = g.templates[race.templateId]!;
  if (t.claimPrice === null || !race.runners) return;
  const r = new Rng(race.seed).fork('ai-claims');
  for (const rn of race.runners) {
    const h = g.horses[rn.horseId]!;
    for (const st of sortedById(Object.values(g.stables))) {
      if (st.kind !== 'ai' || st.id === rn.stableId) continue;
      const sr = r.fork(st.id, h.id);
      const v = appraisedValue(g, h, 5 * (1.2 - st.staffQuality), sr.normal(0, 1));
      if (v < t.claimPrice * 1.3) continue;
      if (st.balance < t.claimPrice * 5 || horsesOfStable(g, st.id).length >= g.config.horsesPerStable + 4) continue;
      if (race.claims.some((c) => c.stableId === st.id)) continue;
      if (sr.chance(0.15)) race.claims.push({ stableId: st.id, horseId: h.id, weekIndex: g.weekIndex });
    }
  }
}

/** Nach dem Rennen: Claims ausführen. */
export function resolveClaims(g: GameState, race: RaceInstance, runs: Run[]): void {
  const t = g.templates[race.templateId]!;
  if (t.claimPrice === null || !race.claims.length) return;
  const price = t.claimPrice;
  const r = new Rng(race.seed).fork('claims');
  const byHorse = new Map<string, string[]>();
  for (const c of race.claims) {
    const arr = byHorse.get(c.horseId) ?? [];
    arr.push(c.stableId);
    byHorse.set(c.horseId, arr);
  }
  for (const [horseId, claimants] of [...byHorse.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const h = g.horses[horseId];
    if (!h || h.status !== 'active') continue;
    const valid = claimants.filter((s) => s !== h.stableId && (s !== g.playerStableId || (canAfford(g, s, price) && freeBoxes(g) > 0)));
    if (!valid.length) continue;
    const winner = valid.length === 1 ? valid[0]! : r.pick(valid);
    const from = h.stableId;
    transferHorse(g, horseId, winner, price, 'claim');
    const run = runs.find((x) => x.horseId === horseId);
    if (run) run.claimedBy = winner;
    if (winner === g.playerStableId) {
      addInbox(g, { kind: 'market', title: `Claim erfolgreich: ${h.name}`, body: `Du hast ${h.name} aus dem Rennen „${t.name}“ für ${formatMoney(price)} geclaimt${valid.length > 1 ? ` (Losentscheid unter ${valid.length} Claims)` : ''}.`, horseId, raceId: race.id });
    } else if (from === g.playerStableId) {
      addInbox(g, { kind: 'market', title: `${h.name} wurde geclaimt`, body: `${g.stables[winner]!.name} hat ${h.name} nach dem Rennen „${t.name}“ für ${formatMoney(price)} gekauft.`, horseId, raceId: race.id });
    }
    if (claimants.includes(g.playerStableId) && winner !== g.playerStableId) {
      addInbox(g, { kind: 'market', title: `Claim verloren: ${h.name}`, body: `Mehrere Claims für ${h.name} – das Los entschied für ${g.stables[winner]!.name}.`, horseId, raceId: race.id });
    }
  }
}
