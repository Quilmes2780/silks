import { Rng } from '../rng';
import type { Horse, PurchaseVia, TransferOffer } from '../types';
import { DEFAULT_TRAINING } from '../horse/generate';
import { aiLevel } from '../ai/ai';
import { marketValue } from '../economy/value';
import { canAfford } from '../economy/finance';
import {
  addInbox,
  book,
  formatMoney,
  type GameState,
  horseAccount,
  horsesOfStable,
  sortedById,
  touch,
  touchRace,
} from '../game/state';
import type { TrainingPlan } from '../types';

/**
 * Transfermarkt: Besitzerwechsel, Verkaufslisten, Verhandlungen mit KI-Ställen.
 * Die KI entscheidet deterministisch anhand ihrer Mindestforderung, damit der Spieler
 * Verhandlungen nachvollziehen kann.
 */

export class MarketError extends Error {}

export function roundPrice(x: number): number {
  const step = x < 20000 ? 250 : x < 100000 ? 500 : x < 1000000 ? 2500 : 10000;
  return Math.round(x / step) * step;
}

/** Freie Boxen im Stall des Spielers. */
export function freeBoxes(g: GameState): number {
  const st = g.stables[g.playerStableId]!;
  return st.facilities.boxes - horsesOfStable(g, st.id).length;
}

/** Nennungen eines Pferds in noch nicht gelaufenen Rennen entfernen. */
export function scratchFutureEntries(g: GameState, horseId: string): void {
  for (const race of Object.values(g.races)) {
    if (race.status !== 'open' && race.status !== 'closed') continue;
    if (!race.entries.some((e) => e.horseId === horseId)) continue;
    race.entries = race.entries.filter((e) => e.horseId !== horseId);
    if (race.runners) {
      race.runners = race.runners.filter((x) => x.horseId !== horseId);
      if (race.status === 'closed' && race.runners.length < 2) race.status = 'void';
    }
    race.claims = race.claims.filter((c) => c.horseId !== horseId);
    touchRace(g, race.id);
  }
}

/**
 * Besitzerwechsel mit Buchungen für Käufer und Verkäufer.
 * commission: Provision, die der Verkäufer abgibt (Auktionen 5 %).
 */
export function transferHorse(g: GameState, horseId: string, toStableId: string, price: number, via: PurchaseVia, commission = 0): void {
  const h = g.horses[horseId]!;
  const from = h.stableId;
  const player = g.playerStableId;
  if (toStableId === player) {
    const old = g.finance.horses[horseId];
    if (old && old.toWeekIndex !== null) {
      g.finance.horses[`${horseId}#${old.fromWeekIndex}`] = old;
      delete g.finance.horses[horseId];
    }
    horseAccount(g, horseId);
  }
  const what = via === 'auction' ? 'Auktion' : via === 'claim' ? 'Claim' : via === 'forced_sale' ? 'Zwangsverkauf' : 'Kauf';
  book(g, toStableId, { amount: -price, kind: 'purchase', text: `${what}: ${h.name}`, horseId });
  const net = Math.round(price * (1 - commission));
  book(g, from, { amount: net, kind: 'sale', text: `Verkauf: ${h.name}${commission ? ` (abzgl. ${Math.round(commission * 100)} % Provision)` : ''}`, horseId });
  if (from === player) {
    const acc = horseAccount(g, horseId);
    acc.toWeekIndex = g.weekIndex;
  }
  scratchFutureEntries(g, horseId);
  delete g.breeding.plans[horseId];
  for (const o of g.offers) if (o.horseId === horseId && (o.status === 'open' || o.status === 'countered')) o.status = 'withdrawn';
  h.stableId = toStableId;
  h.purchase = { price, weekIndex: g.weekIndex, fromStableId: from, via };
  h.forSale = null;
  h.groomId = null;
  h.groomBond = 0;
  h.training = [...DEFAULT_TRAINING] as TrainingPlan;
  touch(g, horseId);
}

// ---------------------------------------------------------------- Spieler kauft

/** Mindestforderung der KI für eines ihrer Pferde. */
export function aiReservation(g: GameState, h: Horse): number {
  const v = marketValue(g, h);
  if (h.forSale) return h.forSale.askingPrice * 0.93;
  const ranked = horsesOfStable(g, h.stableId).sort((a, b) => aiLevel(b) - aiLevel(a));
  const rank = ranked.findIndex((x) => x.id === h.id);
  const premium = rank < 3 ? 2 : rank < 8 ? 1.5 : 1.3;
  return v * premium;
}

export interface OfferResult {
  status: TransferOffer['status'];
  counter: number | null;
  message: string;
  offerId: string;
}

function checkBuy(g: GameState, h: Horse | undefined, amount: number): asserts h is Horse {
  if (!h || h.status !== 'active') throw new MarketError('Pferd nicht gefunden.');
  if (h.stableId === g.playerStableId) throw new MarketError('Das Pferd gehört dir bereits.');
  if (g.stables[h.stableId]?.kind !== 'ai') throw new MarketError('Dieses Pferd steht nicht zum Verkauf.');
  if (freeBoxes(g) <= 0) throw new MarketError('Keine freie Box. Erweitere die Anlage oder verkaufe ein Pferd.');
  if (!canAfford(g, g.playerStableId, amount)) throw new MarketError('Das übersteigt deinen Kreditrahmen.');
}

export function makeOffer(g: GameState, horseId: string, amount: number): OfferResult {
  const h = g.horses[horseId];
  amount = Math.round(amount);
  if (!(amount > 0)) throw new MarketError('Ungültiger Betrag.');
  checkBuy(g, h, amount);
  const recent = g.offers.filter((o) => o.horseId === horseId && o.buyerId === g.playerStableId && o.createdWeekIndex >= g.weekIndex - 8);
  if (recent.filter((o) => o.status === 'declined').length >= 2) {
    throw new MarketError(`${g.stables[h.stableId]!.name} verhandelt vorerst nicht mehr über ${h.name}.`);
  }
  let offer = recent.find((o) => o.status === 'open' || o.status === 'countered');
  if (!offer) {
    offer = {
      id: `o${++g.counters.offer}`,
      horseId,
      buyerId: g.playerStableId,
      sellerId: h.stableId,
      amount,
      counter: null,
      status: 'open',
      createdWeekIndex: g.weekIndex,
      expiresWeekIndex: g.weekIndex + 1,
      rounds: 0,
      limit: null,
    };
    g.offers.push(offer);
  }
  offer.amount = amount;
  offer.rounds += 1;
  const res = aiReservation(g, h);
  const seller = g.stables[h.stableId]!.name;
  if (amount >= res) {
    offer.status = 'accepted';
    transferHorse(g, horseId, g.playerStableId, amount, 'transfer');
    addInbox(g, { kind: 'market', title: `Gekauft: ${h.name}`, body: `${seller} nimmt dein Angebot von ${formatMoney(amount)} an. ${h.name} steht jetzt in deinem Stall.`, horseId });
    return { status: 'accepted', counter: null, message: `${seller} nimmt an.`, offerId: offer.id };
  }
  if (amount >= res * 0.8 && offer.rounds < 3) {
    offer.status = 'countered';
    offer.counter = roundPrice(Math.max(amount * 1.02, (amount + res * 1.05) / 2));
    offer.expiresWeekIndex = g.weekIndex + 1;
    return { status: 'countered', counter: offer.counter, message: `${seller} verlangt ${formatMoney(offer.counter)}.`, offerId: offer.id };
  }
  offer.status = 'declined';
  return {
    status: 'declined',
    counter: null,
    message: offer.rounds >= 3 ? `${seller} bricht die Verhandlung ab.` : `${seller} lehnt ab – das Angebot ist zu niedrig.`,
    offerId: offer.id,
  };
}

/** Antwort des Spielers auf ein Gegenangebot (Kauf) oder ein Angebot der KI (Verkauf). */
export function respondOffer(g: GameState, offerId: string, action: 'accept' | 'decline' | 'counter', amount?: number): OfferResult {
  const o = g.offers.find((x) => x.id === offerId);
  if (!o || (o.status !== 'open' && o.status !== 'countered')) throw new MarketError('Das Angebot ist nicht mehr gültig.');
  const h = g.horses[o.horseId]!;
  const other = (id: string) => g.stables[id]!.name;
  if (o.buyerId === g.playerStableId) {
    if (action === 'decline') {
      o.status = 'withdrawn';
      return { status: 'withdrawn', counter: null, message: 'Verhandlung beendet.', offerId };
    }
    if (action === 'counter') return makeOffer(g, o.horseId, amount ?? 0);
    if (o.status !== 'countered' || o.counter === null) throw new MarketError('Es liegt kein Gegenangebot vor.');
    checkBuy(g, h, o.counter);
    o.status = 'accepted';
    o.amount = o.counter;
    transferHorse(g, o.horseId, g.playerStableId, o.counter, 'transfer');
    addInbox(g, { kind: 'market', title: `Gekauft: ${h.name}`, body: `Für ${formatMoney(o.counter)} von ${other(o.sellerId)}.`, horseId: h.id });
    return { status: 'accepted', counter: null, message: 'Kauf abgeschlossen.', offerId };
  }
  // Angebot der KI für ein Pferd des Spielers
  if (h.stableId !== g.playerStableId) throw new MarketError('Das Pferd gehört dir nicht mehr.');
  if (action === 'decline') {
    o.status = 'declined';
    return { status: 'declined', counter: null, message: 'Angebot abgelehnt.', offerId };
  }
  const price = action === 'accept' ? o.amount : Math.round(amount ?? 0);
  if (action === 'counter') {
    if (!(price > 0)) throw new MarketError('Ungültiger Betrag.');
    if (o.limit === null || price > o.limit) {
      o.status = 'declined';
      return { status: 'declined', counter: null, message: `${other(o.buyerId)} steigt aus – zu teuer.`, offerId };
    }
  }
  o.status = 'accepted';
  o.amount = price;
  transferHorse(g, o.horseId, o.buyerId, price, 'transfer');
  addInbox(g, { kind: 'market', title: `Verkauft: ${h.name}`, body: `${h.name} geht für ${formatMoney(price)} an ${other(o.buyerId)}.`, horseId: h.id });
  return { status: 'accepted', counter: null, message: `Verkauft für ${formatMoney(price)}.`, offerId };
}

export function listForSale(g: GameState, horseId: string, askingPrice: number | null): void {
  const h = g.horses[horseId];
  if (!h || h.stableId !== g.playerStableId || h.status !== 'active') throw new MarketError('Das Pferd gehört nicht zu deinem Stall.');
  h.forSale = askingPrice && askingPrice > 0 ? { askingPrice: Math.round(askingPrice), sinceWeekIndex: g.weekIndex } : null;
  touch(g, horseId);
}

// ---------------------------------------------------------------- KI: Angebote und Verkaufslisten

/** KI-Ställe, die sich ein Pferd leisten können und Platz haben. */
function buyers(g: GameState, price: number): string[] {
  return sortedById(Object.values(g.stables))
    .filter((s) => s.kind === 'ai' && s.balance > price * 1.5 + 100000 && horsesOfStable(g, s.id).length < g.config.horsesPerStable + 5)
    .map((s) => s.id);
}

/** Wöchentlich: KI-Angebote für Pferde des Spielers, Ablauf alter Angebote, KI-Verkaufslisten. */
export function marketWeek(g: GameState): void {
  const r = new Rng(g.seed).fork('market', g.weekIndex);
  for (const o of g.offers) {
    if ((o.status === 'open' || o.status === 'countered') && o.expiresWeekIndex < g.weekIndex) o.status = 'expired';
  }
  // Alte, abgeschlossene Verhandlungen aufräumen
  g.offers = g.offers.filter((o) => o.status === 'open' || o.status === 'countered' || o.createdWeekIndex >= g.weekIndex - 26);

  for (const h of horsesOfStable(g, g.playerStableId)) {
    const v = marketValue(g, h);
    if (v < 1500) continue;
    if (g.offers.some((o) => o.horseId === h.id && o.sellerId === g.playerStableId && (o.status === 'open' || o.status === 'countered'))) continue;
    const hr = r.fork(h.id);
    const ask = h.forSale?.askingPrice ?? null;
    const p = ask === null ? 0.02 : ask <= v ? 0.3 : ask <= v * 1.2 ? 0.14 : 0.04;
    if (!hr.chance(p)) continue;
    const cands = buyers(g, v);
    if (!cands.length) continue;
    const buyerId = hr.pick(cands);
    const limit = roundPrice(v * Math.max(0.8, Math.min(1.25, hr.normal(1, 0.12))));
    if (ask !== null && ask <= limit) {
      transferHorse(g, h.id, buyerId, ask, 'transfer');
      addInbox(g, { kind: 'market', title: `Verkauft: ${h.name}`, body: `${g.stables[buyerId]!.name} hat ${h.name} zum geforderten Preis von ${formatMoney(ask)} gekauft.`, horseId: h.id });
      continue;
    }
    const amount = roundPrice(Math.min(limit, v * Math.max(0.75, hr.normal(0.88, 0.05))));
    g.offers.push({
      id: `o${++g.counters.offer}`,
      horseId: h.id,
      buyerId,
      sellerId: g.playerStableId,
      amount,
      counter: null,
      status: 'open',
      createdWeekIndex: g.weekIndex,
      expiresWeekIndex: g.weekIndex + 2,
      rounds: 0,
      limit,
    });
    addInbox(g, {
      kind: 'market',
      title: `Angebot für ${h.name}: ${formatMoney(amount)}`,
      body: `${g.stables[buyerId]!.name} bietet ${formatMoney(amount)} für ${h.name} (Marktwert ${formatMoney(v)}). Das Angebot gilt zwei Wochen (Markt → Angebote).`,
      horseId: h.id,
    });
  }

  if (g.week % 4 === 2) aiListings(g, r.fork('listings'));
}

/** KI-Ställe bieten schwächere und überzählige Pferde an. */
export function aiListings(g: GameState, r: Rng): void {
  for (const st of sortedById(Object.values(g.stables))) {
    if (st.kind !== 'ai') continue;
    const horses = horsesOfStable(g, st.id);
    for (const h of horses) {
      if (h.forSale && g.weekIndex - h.forSale.sinceWeekIndex > 12) h.forSale = null;
    }
    const sorted = horses.filter((h) => g.season - h.foalYear >= 2).sort((a, b) => aiLevel(a) - aiLevel(b));
    if (!sorted.length) continue;
    const median = aiLevel(sorted[Math.floor(sorted.length / 2)]!);
    const excess = Math.max(0, horses.length - g.config.horsesPerStable);
    let listed = horses.filter((h) => h.forSale).length;
    for (const h of sorted) {
      if (listed >= 4 + excess) break;
      if (h.forSale || h.condition.injury) continue;
      const weak = aiLevel(h) < median - 8 && g.season - h.foalYear >= 3;
      const trader = st.strategy === 'trader' && r.chance(0.15);
      if (!weak && !trader && listed >= excess) continue;
      const v = marketValue(g, h);
      h.forSale = { askingPrice: roundPrice(v * Math.max(1.02, r.normal(1.15, 0.06))), sinceWeekIndex: g.weekIndex };
      touch(g, h.id);
      listed++;
    }
  }
}
