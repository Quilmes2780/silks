import { deriveSeed, Rng } from '../rng';
import type { Auction, AuctionKind, Horse, Lot } from '../types';
import { breedHorse } from '../economy/stallions';
import { marketValue, unracedLevel, valueFromLevel } from '../economy/value';
import { canAfford } from '../economy/finance';
import { aiLevel } from '../ai/ai';
import { PAR_FIGURE, PAR_QUALITY } from '../stats/speedFigure';
import { NameRegistry } from '../world/names';
import {
  addInbox,
  formatMoney,
  type GameState,
  horsesOfStable,
  MARKET_STABLE_ID,
  sortedById,
  touch,
  weekIndexOf,
} from '../game/state';
import { freeBoxes, MarketError, roundPrice, transferHorse } from './transfer';

/**
 * Auktionen: Breeze-up (Frühjahr), Jährlinge (Herbst), Horses in Training (November).
 * Der Katalog erscheint drei Wochen vorher; in der Auktionswoche bietet der Spieler Los für Los
 * gegen die KI (rundenbasiert, ohne Uhr). Offene Lose werden zum Wochenende mit den
 * Auto-Geboten entschieden.
 */

export const AUCTION_SCHEDULE: Array<{ kind: AuctionKind; week: number; name: string; lots: number }> = [
  { kind: 'breeze_up', week: 15, name: 'Breeze-up-Auktion', lots: 30 },
  { kind: 'yearling', week: 40, name: 'Jährlingsauktion', lots: 80 },
  { kind: 'horses_in_training', week: 46, name: 'Horses-in-Training-Auktion', lots: 0 },
];
export const CATALOGUE_WEEKS = 3;
export const AUCTION_COMMISSION = 0.05;

export function increment(price: number): number {
  return price < 10000 ? 500 : price < 50000 ? 1000 : price < 100000 ? 2500 : price < 250000 ? 5000 : price < 500000 ? 10000 : 25000;
}

function trueQuality(h: Horse): number {
  const p = h.potential;
  return (p.speed + p.stamina + p.kick + p.acceleration) / 4;
}

/** Breeze-Zeit über 2 Furlongs aus aktuellem Speed und Beschleunigung (mit Streuung). */
export function breezeTime(h: Horse, r: Rng): number {
  const c = h.current;
  return Math.round((23.2 - ((c.speed + c.acceleration) / 2 - 45) * 0.045 + r.normal(0, 0.22)) * 100) / 100;
}

/** Bewertung eines Loses aus öffentlicher Sicht (Abstammung, Exterieur, Breeze-Zeit). */
export function lotPublicValue(g: GameState, lot: Lot): number {
  const h = g.horses[lot.horseId]!;
  if (h.stats.starts > 0 || h.officialRating !== null) return marketValue(g, h);
  const breeze = lot.breezeTimeS !== null ? (22.4 - lot.breezeTimeS) * 3 : 0;
  return valueFromLevel(h, unracedLevel(g, h, breeze), g.season - h.foalYear);
}

/** Bewertung durch einen Stall mit eigenem Gutachter (Rauschen sd in Attributpunkten). */
export function appraisedValue(g: GameState, h: Horse, sd: number, z: number): number {
  if (h.stats.starts > 0 || h.officialRating !== null) return marketValue(g, h) * Math.exp(z * 0.1);
  const q = trueQuality(h) + z * sd;
  return valueFromLevel(h, PAR_FIGURE + 2 * (q - PAR_QUALITY) - 8, g.season - h.foalYear);
}

function computeAiMax(g: GameState, lot: Lot, r: Rng): Lot['aiMax'] {
  const h = g.horses[lot.horseId]!;
  const out: Lot['aiMax'] = [];
  for (const st of sortedById(Object.values(g.stables))) {
    if (st.kind !== 'ai' || st.id === lot.consignorId) continue;
    const sr = r.fork(st.id);
    const fitDist = st.strategy === 'sprint' ? h.prefs.distOptM < 1400 : st.strategy === 'staying' ? h.prefs.distOptM > 2000 : true;
    if (!sr.chance(fitDist ? 0.3 : 0.1)) continue;
    const val = appraisedValue(g, h, 5 * (1.2 - st.staffQuality), sr.normal(0, 1)) * Math.max(0.6, sr.normal(st.strategy === 'trader' ? 0.85 : 1, 0.12));
    out.push({ stableId: st.id, max: roundPrice(val) });
  }
  return out.sort((a, b) => b.max - a.max).slice(0, 5);
}

function newLot(g: GameState, h: Horse, consignorId: string, reserve: number, breeze: number | null, r: Rng): Lot {
  const lot: Lot = {
    id: `lot${++g.counters.lot}`,
    horseId: h.id,
    consignorId,
    reserve: roundPrice(Math.max(2000, reserve)),
    breezeTimeS: breeze,
    status: 'pending',
    price: null,
    buyerId: null,
    currentBid: 0,
    leaderId: null,
    aiMax: [],
    playerLimit: null,
  };
  lot.aiMax = computeAiMax(g, lot, r.fork(lot.id));
  lot.currentBid = lot.reserve;
  return lot;
}

/** Katalog drei Wochen vor der Auktion; in der Auktionswoche wird sie eröffnet. */
export function auctionWeek(g: GameState): void {
  for (const s of AUCTION_SCHEDULE) {
    for (const season of [g.season, g.season + 1]) {
      const wi = weekIndexOf(g, season, s.week);
      const id = `${season}-${s.kind}`;
      if (wi - CATALOGUE_WEEKS === g.weekIndex && !g.auctions[id]) createCatalogue(g, s.kind, season);
    }
  }
  for (const a of sortedById(Object.values(g.auctions))) {
    if (a.status === 'catalogue' && a.weekIndex === g.weekIndex) openAuction(g, a);
  }
}

export function createCatalogue(g: GameState, kind: AuctionKind, season: number): Auction {
  const s = AUCTION_SCHEDULE.find((x) => x.kind === kind)!;
  const a: Auction = { id: `${season}-${kind}`, kind, name: `${s.name} ${season}`, season, week: s.week, weekIndex: weekIndexOf(g, season, s.week), lots: [], status: 'catalogue' };
  const r = new Rng(g.seed).fork('auction', a.id);
  const names = new NameRegistry(Object.values(g.horses).map((h) => h.name));
  if (kind === 'breeze_up' || kind === 'yearling') {
    const age = kind === 'breeze_up' ? 2 : 1;
    for (let i = 0; i < s.lots; i++) {
      const hr = r.fork('lot', i);
      const h = breedHorse(
        g,
        hr,
        {
          id: `h${++g.counters.horse}`,
          name: names.horseName(hr),
          stableId: MARKET_STABLE_ID,
          foalYear: season - age,
          season: g.season,
          week: g.week,
          trainedLevel: kind === 'breeze_up' ? 0.9 : 0.6,
          damQuality: hr.normal(58, 6),
        },
        names,
      );
      g.horses[h.id] = h;
      touch(g, h.id);
      const breeze = kind === 'breeze_up' ? breezeTime(h, hr) : null;
      const lot = newLot(g, h, MARKET_STABLE_ID, 0, breeze, hr);
      lot.reserve = roundPrice(Math.max(2000, lotPublicValue(g, lot) * 0.45));
      lot.currentBid = lot.reserve;
      a.lots.push(lot);
    }
  } else {
    // KI-Ställe geben schwächere ältere Pferde und Überzählige ab
    for (const st of sortedById(Object.values(g.stables))) {
      if (st.kind !== 'ai') continue;
      const horses = horsesOfStable(g, st.id)
        .filter((h) => g.season - h.foalYear >= 3 && !h.condition.injury)
        .sort((x, y) => aiLevel(x) - aiLevel(y));
      const n = Math.min(horses.length, 2 + Math.max(0, horsesOfStable(g, st.id).length - g.config.horsesPerStable));
      for (const h of horses.slice(0, n)) {
        a.lots.push(newLot(g, h, st.id, marketValue(g, h) * 0.6, null, r.fork('hit', h.id)));
      }
    }
  }
  g.auctions[a.id] = a;
  addInbox(g, {
    kind: 'market',
    title: `Katalog: ${a.name}`,
    body: `Der Katalog mit ${a.lots.length} Losen ist erschienen. Die Auktion findet in Woche ${a.week} statt. Unter Markt → Auktionen kannst du die Lose prüfen${
      kind === 'horses_in_training' ? ', eigene Pferde einliefern' : ''
    } und Auto-Gebote setzen.`,
  });
  return a;
}

/** Eröffnung: Unter den KI-Bietern steht der Preis bereits beim zweithöchsten Limit. */
function openAuction(g: GameState, a: Auction): void {
  a.status = 'live';
  for (const lot of a.lots) {
    if (lot.status !== 'pending') continue;
    const bidders = effectiveBidders(g, lot);
    if (bidders.length >= 2) {
      lot.currentBid = Math.max(lot.reserve, Math.min(bidders[0]!.max, bidders[1]!.max + increment(bidders[1]!.max)));
      lot.leaderId = bidders[0]!.stableId;
    } else if (bidders.length === 1 && bidders[0]!.max >= lot.reserve) {
      lot.currentBid = lot.reserve;
      lot.leaderId = bidders[0]!.stableId;
    }
  }
  addInbox(g, { kind: 'market', title: `${a.name} läuft`, body: 'Die Auktion ist eröffnet (Markt → Auktionen). Offene Lose werden zum Wochenende mit deinen Auto-Geboten entschieden.' });
}

/** KI-Bieter, die sich das Los noch leisten können und Platz haben. */
function effectiveBidders(g: GameState, lot: Lot): Lot['aiMax'] {
  return lot.aiMax.filter((b) => {
    const st = g.stables[b.stableId];
    if (!st || st.id === g.horses[lot.horseId]!.stableId) return false;
    return st.balance > b.max * 1.2 + 50000 && horsesOfStable(g, st.id).length < g.config.horsesPerStable + 6;
  });
}

function findLot(g: GameState, lotId: string): { a: Auction; lot: Lot } {
  for (const a of Object.values(g.auctions)) {
    const lot = a.lots.find((l) => l.id === lotId);
    if (lot) return { a, lot };
  }
  throw new MarketError('Los nicht gefunden.');
}

function sell(g: GameState, a: Auction, lot: Lot, buyerId: string, price: number): void {
  const h = g.horses[lot.horseId]!;
  lot.status = 'sold';
  lot.price = price;
  lot.buyerId = buyerId;
  lot.leaderId = buyerId;
  lot.currentBid = price;
  transferHorse(g, h.id, buyerId, price, 'auction', AUCTION_COMMISSION);
  if (buyerId === g.playerStableId) {
    addInbox(g, { kind: 'market', title: `Zuschlag: ${h.name}`, body: `Du hast ${h.name} bei der ${a.name} für ${formatMoney(price)} ersteigert.`, horseId: h.id });
  } else if (lot.consignorId === g.playerStableId) {
    addInbox(g, { kind: 'market', title: `Versteigert: ${h.name}`, body: `${h.name} ging für ${formatMoney(price)} an ${g.stables[buyerId]!.name} (abzüglich ${AUCTION_COMMISSION * 100} % Provision).`, horseId: h.id });
  }
}

function unsold(g: GameState, lot: Lot): void {
  lot.status = 'unsold';
  const h = g.horses[lot.horseId]!;
  if (lot.consignorId === MARKET_STABLE_ID) {
    h.status = 'retired';
    touch(g, h.id);
  } else if (lot.consignorId === g.playerStableId) {
    addInbox(g, { kind: 'market', title: `Nicht verkauft: ${h.name}`, body: `${h.name} hat den Mindestpreis von ${formatMoney(lot.reserve)} nicht erreicht und bleibt in deinem Stall.`, horseId: h.id });
  }
}

function playerCanBuy(g: GameState, price: number): boolean {
  return freeBoxes(g) > 0 && canAfford(g, g.playerStableId, price);
}

export interface BidResult {
  status: Lot['status'];
  currentBid: number;
  leader: 'player' | 'ai' | null;
  message: string;
}

function bidResult(g: GameState, lot: Lot, message: string): BidResult {
  return { status: lot.status, currentBid: lot.currentBid, leader: lot.leaderId === null ? null : lot.leaderId === g.playerStableId ? 'player' : 'ai', message };
}

/** Gebot des Spielers (Mindestschritt oder ein höherer Betrag). Die KI antwortet sofort. */
export function bid(g: GameState, lotId: string, amount?: number): BidResult {
  const { a, lot } = findLot(g, lotId);
  if (a.status !== 'live') throw new MarketError('Die Auktion ist nicht eröffnet.');
  if (lot.status !== 'pending') throw new MarketError('Das Los ist bereits entschieden.');
  if (lot.consignorId === g.playerStableId) throw new MarketError('Auf eigene Pferde kannst du nicht bieten.');
  if (lot.leaderId === g.playerStableId) throw new MarketError('Du führst bereits.');
  const min = lot.leaderId === null ? lot.currentBid : lot.currentBid + increment(lot.currentBid);
  const price = Math.max(min, roundPrice(amount ?? min));
  if (!playerCanBuy(g, price)) throw new MarketError(freeBoxes(g) <= 0 ? 'Keine freie Box.' : 'Das übersteigt deinen Kreditrahmen.');
  lot.currentBid = price;
  lot.leaderId = g.playerStableId;
  const rival = effectiveBidders(g, lot).find((b) => b.max >= price + increment(price));
  if (rival) {
    lot.currentBid = price + increment(price);
    lot.leaderId = rival.stableId;
    return bidResult(g, lot, `${g.stables[rival.stableId]!.name} erhöht auf ${formatMoney(lot.currentBid)}.`);
  }
  sell(g, a, lot, g.playerStableId, price);
  return bidResult(g, lot, `Zuschlag für ${formatMoney(price)}!`);
}

/** Spieler steigt aus: Das Los geht an den führenden KI-Bieter oder bleibt unverkauft. */
export function pass(g: GameState, lotId: string): BidResult {
  const { a, lot } = findLot(g, lotId);
  if (a.status !== 'live') throw new MarketError('Die Auktion ist nicht eröffnet.');
  if (lot.status !== 'pending') throw new MarketError('Das Los ist bereits entschieden.');
  if (lot.leaderId === g.playerStableId) throw new MarketError('Du führst – das Los geht an dich, sobald niemand mehr bietet.');
  lot.playerLimit = null;
  resolveLot(g, a, lot);
  return bidResult(g, lot, (lot.status as Lot['status']) === 'sold' ? `Zuschlag an ${g.stables[lot.buyerId!]!.name} für ${formatMoney(lot.price!)}.` : 'Nicht verkauft.');
}

export function setAutoBid(g: GameState, lotId: string, limit: number | null): void {
  const { a, lot } = findLot(g, lotId);
  if (a.status === 'done' || lot.status !== 'pending') throw new MarketError('Das Los ist bereits entschieden.');
  if (lot.consignorId === g.playerStableId) throw new MarketError('Auf eigene Pferde kannst du nicht bieten.');
  lot.playerLimit = limit && limit > 0 ? roundPrice(limit) : null;
}

/** Englische Auktion mit festen Limits: Höchstes Limit gewinnt zum zweithöchsten plus Schritt. */
export function resolveLot(g: GameState, a: Auction, lot: Lot): void {
  if (lot.status !== 'pending') return;
  const bidders: Array<{ stableId: string; max: number }> = [...effectiveBidders(g, lot)];
  if (lot.playerLimit !== null && lot.consignorId !== g.playerStableId) {
    const cap = Math.min(lot.playerLimit, freeBoxes(g) > 0 ? g.stables[g.playerStableId]!.balance + g.config.overdraftLimit : 0);
    if (cap >= lot.reserve) bidders.push({ stableId: g.playerStableId, max: cap });
  }
  if (lot.leaderId === g.playerStableId && !bidders.some((b) => b.stableId === g.playerStableId)) {
    bidders.push({ stableId: g.playerStableId, max: lot.currentBid });
  }
  bidders.sort((x, y) => y.max - x.max || (x.stableId === g.playerStableId ? -1 : 1));
  const top = bidders[0];
  const floor = Math.max(lot.reserve, lot.leaderId ? lot.currentBid : lot.reserve);
  if (!top || top.max < floor) {
    if (lot.leaderId && lot.leaderId !== g.playerStableId && g.stables[lot.leaderId]) sell(g, a, lot, lot.leaderId, lot.currentBid);
    else unsold(g, lot);
    return;
  }
  const second = bidders[1];
  const price = Math.min(top.max, Math.max(floor, second ? second.max + increment(second.max) : floor));
  sell(g, a, lot, top.stableId, price);
}

/** Alle offenen Lose entscheiden (Wochenende oder auf Wunsch des Spielers). */
export function finishAuction(g: GameState, auctionId: string): void {
  const a = g.auctions[auctionId];
  if (!a || a.status !== 'live') throw new MarketError('Die Auktion ist nicht eröffnet.');
  for (const lot of a.lots) resolveLot(g, a, lot);
  a.status = 'done';
  const mine = a.lots.filter((l) => l.buyerId === g.playerStableId);
  if (mine.length) {
    addInbox(g, { kind: 'market', title: `${a.name}: ${mine.length} Zuschl${mine.length === 1 ? 'ag' : 'äge'}`, body: mine.map((l) => `${g.horses[l.horseId]!.name}: ${formatMoney(l.price!)}`).join('\n') });
  }
}

/** Zum Wochenende: laufende Auktionen abschließen. */
export function closeAuctions(g: GameState): void {
  for (const a of sortedById(Object.values(g.auctions))) if (a.status === 'live' && a.weekIndex === g.weekIndex) finishAuction(g, a.id);
}

/** Eigenes Pferd in die Horses-in-Training-Auktion einliefern. */
export function consign(g: GameState, horseId: string, auctionId: string, reserve: number): void {
  const a = g.auctions[auctionId];
  if (!a || a.kind !== 'horses_in_training' || a.status !== 'catalogue') throw new MarketError('In diese Auktion kann nicht (mehr) eingeliefert werden.');
  const h = g.horses[horseId];
  if (!h || h.stableId !== g.playerStableId || h.status !== 'active') throw new MarketError('Das Pferd gehört nicht zu deinem Stall.');
  const existing = a.lots.find((l) => l.horseId === horseId && l.status === 'pending');
  if (existing) {
    existing.reserve = roundPrice(Math.max(1000, reserve));
    existing.currentBid = existing.reserve;
    return;
  }
  const r = new Rng(deriveSeed(g.seed, 'consign', horseId, a.id));
  a.lots.push(newLot(g, h, g.playerStableId, reserve, null, r));
}

export function withdrawLot(g: GameState, horseId: string, auctionId: string): void {
  const a = g.auctions[auctionId];
  const lot = a?.lots.find((l) => l.horseId === horseId && l.status === 'pending' && l.consignorId === g.playerStableId);
  if (!a || a.status !== 'catalogue' || !lot) throw new MarketError('Das Los kann nicht zurückgezogen werden.');
  lot.status = 'withdrawn';
}

/** Gutachten des Bloodstock-Agenten: verrauschte Einschätzung der Qualität, je besser der Agent, desto genauer. */
export function agentReport(g: GameState, lot: Lot, agentSkill: number | null): { low: number; high: number; mid: number; valueLow: number; valueHigh: number } | null {
  if (agentSkill === null) return null;
  const h = g.horses[lot.horseId]!;
  const sd = 1.5 + 6 * (1 - agentSkill);
  const z = new Rng(deriveSeed(g.seed, 'agent-report', lot.id)).normal();
  const mid = trueQuality(h) + z * sd;
  const lo = mid - 1.3 * sd;
  const hi = mid + 1.3 * sd;
  const age = g.season - h.foalYear;
  const lv = (q: number) => PAR_FIGURE + 2 * (q - PAR_QUALITY) - 8;
  return {
    low: Math.round(lo),
    high: Math.round(hi),
    mid: Math.round(mid),
    valueLow: valueFromLevel(h, lv(lo), age),
    valueHigh: valueFromLevel(h, lv(hi), age),
  };
}
