import { Rng } from '../rng';
import type { Horse } from '../types';
import { NameRegistry, PersonNameRegistry } from '../world/names';
import { importHorse } from '../breeding/stud';
import { publicLevel } from '../economy/value';
import { addInbox, book, formatMoney, type GameState, MARKET_STABLE_ID, sortedById, touch, usedHorseNames } from '../game/state';
import { freeBoxes, MarketError, scratchFutureEntries } from './transfer';

/**
 * Einstellpferde: Fremde (fiktive) Besitzer stellen Pferde in den Stall des Spielers.
 * Der Spieler erhält eine Wochengebühr (Trainingspauschale) und 10 % des Preisgelds;
 * Nenn- und Reitgebühren zahlt der Besitzer. Verkaufen oder in Claiming-Rennen schicken darf der
 * Spieler das Pferd nicht. Läuft es schlecht oder gar nicht, holt der Besitzer es wieder ab.
 */

export interface BoardingOffer {
  id: string;
  horseId: string;
  ownerName: string;
  weeklyFee: number;
  createdWeekIndex: number;
  expiresWeekIndex: number;
}

export const TRAINER_PRIZE_SHARE = 0.1;
export const OFFER_INTERVAL = 4;

export function boardingFee(reputation: number): number {
  return Math.round((300 + reputation * 4) / 10) * 10;
}

function ownerNames(g: GameState): PersonNameRegistry {
  return new PersonNameRegistry([...Object.values(g.staff).map((s) => s.name), ...Object.values(g.horses).map((h) => h.boarding?.ownerName ?? '')].filter(Boolean));
}

/** Alle vier Wochen: Anfragen fremder Besitzer, abhängig vom Ruf und von freien Boxen. */
export function boardingWeek(g: GameState): void {
  const r = new Rng(g.seed).fork('boarding', g.weekIndex);
  // abgelaufene Anfragen: Pferd geht an einen anderen Trainer (verschwindet aus dem Spiel)
  for (const o of g.boardingOffers) {
    if (o.expiresWeekIndex < g.weekIndex) retireOfferHorse(g, o);
  }
  g.boardingOffers = g.boardingOffers.filter((o) => o.expiresWeekIndex >= g.weekIndex);
  updateSatisfaction(g, r.fork('satisfaction'));

  const st = g.stables[g.playerStableId]!;
  if (g.week % OFFER_INTERVAL !== 0 || g.boardingOffers.length >= 2) return;
  if (freeBoxes(g) <= 0) return;
  const p = Math.max(0.08, Math.min(0.6, (st.reputation - 15) / 80));
  if (!r.chance(p)) return;
  const names = new NameRegistry(usedHorseNames(g));
  const age = r.weighted([2, 3, 4], [3, 3, 1]);
  const h = importHorse(g, r.fork('horse'), names, {
    stableId: MARKET_STABLE_ID,
    foalYear: g.season - age,
    damQuality: r.normal(54 + st.reputation / 5, 5),
    status: 'active',
    trainedLevel: 0.92,
  });
  const ownerName = ownerNames(g).personName(r);
  const offer: BoardingOffer = {
    id: `bo${g.weekIndex}-${h.id}`,
    horseId: h.id,
    ownerName,
    weeklyFee: boardingFee(st.reputation),
    createdWeekIndex: g.weekIndex,
    expiresWeekIndex: g.weekIndex + 3,
  };
  g.boardingOffers.push(offer);
  addInbox(g, {
    kind: 'market',
    title: `Anfrage: ${ownerName} möchte ${h.name} bei dir einstellen`,
    body: `${ownerName} sucht einen Trainer für ${h.name} (${age}-jährig). Angeboten werden ${formatMoney(offer.weeklyFee)} pro Woche und 10 % des Preisgelds. Annehmen oder ablehnen unter Markt → Einstellpferde (gültig 3 Wochen).`,
    horseId: h.id,
  });
}

function retireOfferHorse(g: GameState, o: BoardingOffer): void {
  const h = g.horses[o.horseId];
  if (h && h.stableId === MARKET_STABLE_ID) {
    h.status = 'retired';
    touch(g, h.id);
  }
}

export function acceptBoarding(g: GameState, offerId: string): void {
  const o = g.boardingOffers.find((x) => x.id === offerId);
  if (!o) throw new MarketError('Die Anfrage ist nicht mehr gültig.');
  if (freeBoxes(g) <= 0) throw new MarketError('Keine freie Box.');
  const h = g.horses[o.horseId]!;
  h.stableId = g.playerStableId;
  h.boarding = { ownerName: o.ownerName, weeklyFee: o.weeklyFee, sinceWeekIndex: g.weekIndex, satisfaction: 65, expectation: Math.round(publicLevel(g, h)) };
  h.purchase = null;
  touch(g, h.id);
  g.boardingOffers = g.boardingOffers.filter((x) => x.id !== offerId);
}

export function declineBoarding(g: GameState, offerId: string): void {
  const o = g.boardingOffers.find((x) => x.id === offerId);
  if (!o) throw new MarketError('Die Anfrage ist nicht mehr gültig.');
  retireOfferHorse(g, o);
  g.boardingOffers = g.boardingOffers.filter((x) => x.id !== offerId);
}

/** Einstellpferd zurückgeben (Spieler) oder abholen lassen (Besitzer unzufrieden). */
export function endBoarding(g: GameState, horseId: string, reason: 'player' | 'owner' | 'retire'): void {
  const h = g.horses[horseId];
  if (!h || !h.boarding || h.stableId !== g.playerStableId) throw new MarketError('Kein Einstellpferd.');
  const owner = h.boarding.ownerName;
  scratchFutureEntries(g, horseId);
  delete g.breeding.plans[horseId];
  h.boarding = null;
  h.groomId = null;
  h.stableId = MARKET_STABLE_ID;
  h.status = 'retired';
  touch(g, h.id);
  const body =
    reason === 'owner'
      ? `${owner} ist mit der Betreuung von ${h.name} nicht zufrieden und hat das Pferd zu einem anderen Trainer gebracht.`
      : reason === 'retire'
        ? `${owner} beendet die Rennkarriere von ${h.name} und holt das Pferd nach Hause.`
        : `${h.name} geht zurück an ${owner}.`;
  addInbox(g, { kind: 'market', title: `Einstellpferd verlässt den Stall: ${h.name}`, body, horseId: h.id });
}

/**
 * Zufriedenheit: steigt mit Starts und guten Leistungen (Speed Figure über der Erwartung),
 * sinkt, wenn ein gesundes Pferd lange nicht läuft oder deutlich unter der Erwartung bleibt.
 */
function updateSatisfaction(g: GameState, r: Rng): void {
  for (const h of sortedById(Object.values(g.horses).filter((x) => x.boarding && x.stableId === g.playerStableId))) {
    const b = h.boarding!;
    let delta = 0;
    const since = h.lastRunWeekIndex === null ? g.weekIndex - b.sinceWeekIndex : g.weekIndex - h.lastRunWeekIndex;
    if (!h.condition.injury && since > 8 && (g.week >= 14 && g.week <= 44)) delta -= 2;
    const last = h.stats.lastFigures.at(-1);
    const lastRun = h.runIds.length ? g.runs[h.runIds.at(-1)!] : undefined;
    if (lastRun && lastRun.weekIndex === g.weekIndex) {
      const fig = last?.value ?? null;
      if (lastRun.position === 1) delta += 12;
      else if (lastRun.position <= 3) delta += 5;
      if (fig !== null) delta += Math.max(-8, Math.min(8, (fig - b.expectation) / 2));
    }
    delta += (60 - b.satisfaction) * 0.02 + r.normal(0, 0.5);
    b.satisfaction = Math.round(Math.max(0, Math.min(100, b.satisfaction + delta)) * 10) / 10;
    if (b.satisfaction < 20) endBoarding(g, h.id, 'owner');
  }
}

/** Gebühren der Einstellpferde (wöchentlich, als Einnahme). */
export function boardingIncome(g: GameState): number {
  let total = 0;
  for (const h of sortedById(Object.values(g.horses).filter((x) => x.boarding && x.stableId === g.playerStableId))) {
    total += h.boarding!.weeklyFee;
    book(g, g.playerStableId, { amount: h.boarding!.weeklyFee, kind: 'boarding_fee', text: `Trainingspauschale ${h.name} (${h.boarding!.ownerName})`, horseId: h.id });
  }
  return total;
}

/** Jahreswechsel: Besitzer beenden die Karriere älterer Einstellpferde. */
export function boardingTurnover(g: GameState): void {
  for (const h of sortedById(Object.values(g.horses).filter((x) => x.boarding && x.stableId === g.playerStableId))) {
    if (g.season - h.foalYear >= 6) endBoarding(g, h.id, 'retire');
  }
}

export function isBoarder(h: Horse): boolean {
  return !!h.boarding;
}
