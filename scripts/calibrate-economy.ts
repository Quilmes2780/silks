/**
 * Kalibrierung der Wirtschaft: simuliert mehrere Saisons und prüft, ob KI-Budgets stabil
 * bleiben, Auktionspreise zur Qualität passen und ein durchschnittlich geführter Spielerstall
 * (Autopilot) plausible Zahlen schreibt.
 * Aufruf: npm run calibrate:economy [-- seed=123 seasons=3]
 */
import { bundledWorld } from '../src/engine/world/bundled';
import { createGame } from '../src/engine/game/newGame';
import { advanceWeek } from '../src/engine/game/week';
import { autopilot } from '../src/engine/ai/ai';
import { ECONOMY_DEBUG } from '../src/engine/economy/finance';
import { formatMoney, type GameState } from '../src/engine/game/state';
import type { Horse, LedgerKind } from '../src/engine/types';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const seed = Number(args.seed ?? 20261117);
const seasons = Number(args.seasons ?? 3);

const g = createGame({ id: 'eco', name: 'Kalibrierung', createdAt: new Date().toISOString(), seed, world: bundledWorld() });
const t0 = performance.now();

const quality = (h: Horse) => (h.potential.speed + h.potential.stamina + h.potential.kick + h.potential.acceleration) / 4;
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) * p)]! : 0;
};
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  if (n < 3) return NaN;
  const d2 = ra.reduce((s, x, i) => s + (x - rb[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

function seasonReport(g: GameState, season: number) {
  const ai = Object.values(g.stables).filter((s) => s.kind === 'ai');
  const balances = ai.map((s) => s.balance);
  const prize = Object.values(g.runs)
    .filter((r) => r.season === season)
    .reduce((a, r) => a + r.prize, 0);
  const ledger = g.ledger.filter((l) => l.season === season);
  const byKind = new Map<LedgerKind, number>();
  for (const l of ledger) byKind.set(l.kind, (byKind.get(l.kind) ?? 0) + l.amount);
  const via = new Map<string, number>();
  for (const h of Object.values(g.horses)) {
    if (!h.purchase) continue;
    const s = g.startSeason + Math.floor(h.purchase.weekIndex / 52);
    if (s !== season) continue;
    via.set(h.purchase.via, (via.get(h.purchase.via) ?? 0) + 1);
  }
  console.log(`\n### Saison ${season}`);
  console.log('| Kennzahl | Wert |');
  console.log('|---|---|');
  console.log(`| Preisgeld gesamt | ${formatMoney(prize)} |`);
  console.log(`| KI-Kontostände P10 / P50 / P90 | ${formatMoney(pct(balances, 0.1))} / ${formatMoney(pct(balances, 0.5))} / ${formatMoney(pct(balances, 0.9))} |`);
  const earn = new Map<string, number>();
  for (const r of Object.values(g.runs)) if (r.season === season && g.stables[r.stableId]?.kind === 'ai') earn.set(r.horseId, (earn.get(r.horseId) ?? 0) + r.prize);
  const ev = [...earn.values()];
  console.log(`| Preisgeld je KI-Starter P50 / P90 / Mittel | ${formatMoney(pct(ev, 0.5))} / ${formatMoney(pct(ev, 0.9))} / ${formatMoney(ev.reduce((a, b) => a + b, 0) / Math.max(1, ev.length))} |`);
  const claims = Object.values(g.runs).filter((r) => r.season === season && r.claimedBy).length;
  console.log(`| Claims | ${claims} |`);
  console.log(`| Einlagen der KI-Besitzer (bisher gesamt) | ${ECONOMY_DEBUG.patronTopups} |`);
  console.log(`| Besitzerwechsel: Auktion / Transfer / Claim / Zwangsverkauf | ${via.get('auction') ?? 0} / ${via.get('transfer') ?? 0} / ${via.get('claim') ?? 0} / ${via.get('forced_sale') ?? 0} |`);
  console.log(`| Spieler (Autopilot): Pferde / Starts / Siege | ${Object.values(g.horses).filter((h) => h.stableId === 'player' && h.status === 'active').length} / ${Object.values(g.runs).filter((r) => r.season === season && r.stableId === 'player').length} / ${Object.values(g.runs).filter((r) => r.season === season && r.stableId === 'player' && r.position === 1).length} |`);
  console.log(`| Spieler: Saisonergebnis / Kontostand | ${formatMoney(ledger.reduce((a, l) => a + l.amount, 0))} / ${formatMoney(g.stables.player!.balance)} |`);
  console.log(`| Spieler nach Kategorie | ${[...byKind.entries()].map(([k, v]) => `${k} ${formatMoney(v)}`).join(', ')} |`);
}

let lastSeason = g.season;
const totalWeeks = seasons * 52;
for (let i = 0; i < totalWeeks; i++) {
  autopilot(g);
  advanceWeek(g);
  if (g.season !== lastSeason) {
    seasonReport(g, lastSeason);
    lastSeason = g.season;
  }
}

// Auktionen
console.log('\n### Auktionen');
console.log('| Auktion | Lose | verkauft | Preis P50 | Preis max | Rangkorrelation Preis ~ Qualität |');
console.log('|---|---|---|---|---|---|');
for (const a of Object.values(g.auctions).sort((x, y) => x.weekIndex - y.weekIndex)) {
  const sold = a.lots.filter((l) => l.status === 'sold');
  const prices = sold.map((l) => l.price!);
  const rho = spearman(prices, sold.map((l) => quality(g.horses[l.horseId]!)));
  console.log(`| ${a.name} | ${a.lots.length} | ${sold.length} | ${formatMoney(pct(prices, 0.5))} | ${formatMoney(pct(prices, 1))} | ${rho.toFixed(2)} |`);
}

// Marktwert nach Rating
console.log('\n### Marktwert nach Official Rating (aktive Pferde, 3–4 Jahre)');
console.log('| OR | n | Marktwert P50 |');
console.log('|---|---|---|');
const bands = [40, 55, 70, 85, 100, 115];
for (let i = 0; i < bands.length; i++) {
  const lo = bands[i]!;
  const hi = bands[i + 1] ?? 200;
  const hs = Object.values(g.horses).filter(
    (h) => h.status === 'active' && h.officialRating !== null && h.officialRating >= lo && h.officialRating < hi && [3, 4].includes(g.season - h.foalYear),
  );
  console.log(`| ${lo}–${hi - 1} | ${hs.length} | ${formatMoney(pct(hs.map((h) => h.value ?? 0), 0.5))} |`);
}
console.log(`\nLaufzeit ${((performance.now() - t0) / 1000).toFixed(1)} s für ${seasons} Saisons.`);
