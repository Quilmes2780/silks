import type { Horse } from '../types';
import { marketValue } from '../economy/value';
import { canAfford } from '../economy/finance';
import { aiLevel } from '../ai/ai';
import { STALLION_UPKEEP } from '../breeding/stud';
import { addInbox, book, formatMoney, type GameState, horsesOfStable, sortedById } from '../game/state';
import { MarketError, roundPrice } from './transfer';

/**
 * Teilhaberschaften: Der Spieler kauft Anteile (25 % oder 50 %) an Rennpferden und Deckhengsten
 * der KI-Ställe. Der Besitzer behält die Mehrheit und entscheidet allein; Teilhaber erhalten ihren
 * Anteil an Preisgeld (nach Erfolgsbeteiligungen und Reitgebühr), Decktaxen und Verkaufserlös und
 * tragen anteilig den Unterhalt.
 */

export const SHARE_OPTIONS = [0.25, 0.5] as const;
/** Höchstens so viel dürfen Teilhaber zusammen halten (der Besitzer behält die Mehrheit). */
export const MAX_PARTNER_SHARE = 0.5;
/** Aufschlag der KI beim Verkauf von Anteilen bzw. Abschlag beim Rückkauf */
export const SHARE_PREMIUM = 1.15;
export const BUYBACK_DISCOUNT = 0.85;

export function partnerShare(h: Horse, stableId: string): number {
  return h.partners?.find((p) => p.stableId === stableId)?.share ?? 0;
}

export function partnersTotal(h: Horse): number {
  return (h.partners ?? []).reduce((a, p) => a + p.share, 0);
}

/** Bietet der Besitzer Anteile an diesem Pferd an? (KI: Hengste und gute Pferde außerhalb der Top 3) */
export function sharesOffered(g: GameState, h: Horse): boolean {
  const st = g.stables[h.stableId];
  if (!st || st.kind === 'player') return false;
  // Deckhengste der KI und der Gestüte; Rennpferde nur von KI-Ställen
  if (h.status === 'stud') return !!g.stallions[h.id]?.active && (g.stallions[h.id]?.fee ?? 0) >= 2000;
  if (st.kind !== 'ai') return false;
  if (h.status !== 'active' || h.condition.injury?.type === 'tendon') return false;
  if ((h.value ?? 0) < 25000) return false;
  const top = horsesOfStable(g, st.id)
    .sort((a, b) => aiLevel(b) - aiLevel(a))
    .slice(0, 3)
    .map((x) => x.id);
  return !top.includes(h.id);
}

export function sharePrice(g: GameState, h: Horse, share: number): number {
  return roundPrice(marketValue(g, h) * share * SHARE_PREMIUM);
}

export function buyShare(g: GameState, horseId: string, share: number): number {
  const h = g.horses[horseId];
  if (!h) throw new MarketError('Pferd nicht gefunden.');
  if (!SHARE_OPTIONS.includes(share as (typeof SHARE_OPTIONS)[number])) throw new MarketError('Anteile gibt es zu 25 % oder 50 %.');
  if (!sharesOffered(g, h)) throw new MarketError('Für dieses Pferd werden keine Anteile angeboten.');
  const mine = partnerShare(h, g.playerStableId);
  if (partnersTotal(h) + share > MAX_PARTNER_SHARE + 1e-9) throw new MarketError(`Der Besitzer gibt höchstens ${MAX_PARTNER_SHARE * 100} % ab.`);
  const price = sharePrice(g, h, share);
  if (!canAfford(g, g.playerStableId, price)) throw new MarketError('Das übersteigt deinen Kreditrahmen.');
  book(g, g.playerStableId, { amount: -price, kind: 'partner', text: `Anteil ${Math.round(share * 100)} % an ${h.name}`, horseId: h.id });
  book(g, h.stableId, { amount: price, kind: 'partner', text: `Anteil an ${h.name} verkauft` });
  const list = (h.partners ?? []).filter((p) => p.stableId !== g.playerStableId);
  list.push({ stableId: g.playerStableId, share: mine + share });
  h.partners = list;
  return price;
}

/** Anteil an den Besitzer zurückverkaufen. */
export function sellShare(g: GameState, horseId: string): number {
  const h = g.horses[horseId];
  const share = h ? partnerShare(h, g.playerStableId) : 0;
  if (!h || share <= 0) throw new MarketError('Du hältst keinen Anteil an diesem Pferd.');
  const price = roundPrice(Math.max(0, marketValue(g, h)) * share * BUYBACK_DISCOUNT);
  book(g, g.playerStableId, { amount: price, kind: 'partner', text: `Anteil an ${h.name} zurückverkauft`, horseId: h.id });
  book(g, h.stableId, { amount: -price, kind: 'partner', text: `Anteil an ${h.name} zurückgekauft` });
  h.partners = (h.partners ?? []).filter((p) => p.stableId !== g.playerStableId);
  return price;
}

/** Anteil der Teilhaber an einer Einnahme (Preisgeld) oder einem Erlös (Verkauf) auszahlen. */
export function payPartners(g: GameState, h: Horse, ownerId: string, amount: number, text: string, raceId?: string): void {
  if (!h.partners?.length || amount === 0) return;
  for (const p of h.partners) {
    const part = Math.round(amount * p.share);
    if (!part) continue;
    book(g, ownerId, { amount: -part, kind: 'partner', text: `${text}: Anteil ${g.stables[p.stableId]?.name ?? ''}`, raceId, horseId: h.id });
    book(g, p.stableId, { amount: part, kind: 'partner', text: `${text} (Anteil ${Math.round(p.share * 100)} %)`, raceId, horseId: h.id });
  }
}

/** Beim Verkauf werden die Teilhaber ausbezahlt; beim Ruhestand endet die Teilhaberschaft. */
export function settlePartnersOnSale(g: GameState, h: Horse, sellerId: string, price: number): void {
  if (!h.partners?.length) return;
  payPartners(g, h, sellerId, price, `Verkauf ${h.name}`);
  h.partners = [];
}

export function endPartnerships(g: GameState, h: Horse): void {
  if (!h.partners?.length) return;
  if (h.partners.some((p) => p.stableId === g.playerStableId)) {
    addInbox(g, { kind: 'market', title: `Teilhaberschaft beendet: ${h.name}`, body: `${h.name} hat die Karriere beendet; damit endet auch dein Anteil.`, horseId: h.id });
  }
  h.partners = [];
}

/** Wöchentlich: Teilhaber tragen ihren Anteil am Unterhalt. */
export function partnershipWeek(g: GameState): void {
  for (const h of sortedById(Object.values(g.horses).filter((x) => x.partners?.length))) {
    if (h.status !== 'active' && h.status !== 'stud') {
      endPartnerships(g, h);
      continue;
    }
    const cost = h.status === 'stud' ? STALLION_UPKEEP : g.config.upkeepPerHorse;
    for (const p of h.partners ?? []) {
      const part = Math.round(cost * p.share);
      book(g, p.stableId, { amount: -part, kind: 'partner', text: `Unterhaltsanteil ${h.name}`, horseId: h.id });
      book(g, h.stableId, { amount: part, kind: 'partner', text: `Unterhaltsanteil Teilhaber (${h.name})` });
    }
  }
}

export interface ShareListing {
  horseId: string;
  name: string;
  owner: string;
  kind: 'stallion' | 'racehorse';
  value: number;
  fee: number | null;
  rating: number | null;
  offered: number;
  priceFor: Record<string, number>;
}

export function shareListings(g: GameState): ShareListing[] {
  const out: ShareListing[] = [];
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status !== 'active' && h.status !== 'stud') continue;
    if (!sharesOffered(g, h)) continue;
    const free = MAX_PARTNER_SHARE - partnersTotal(h);
    if (free < 0.25 - 1e-9) continue;
    out.push({
      horseId: h.id,
      name: h.name,
      owner: g.stables[h.stableId]!.name,
      kind: h.status === 'stud' ? 'stallion' : 'racehorse',
      value: marketValue(g, h),
      fee: g.stallions[h.id]?.fee ?? null,
      rating: h.officialRating,
      offered: free,
      priceFor: Object.fromEntries(SHARE_OPTIONS.filter((s) => s <= free + 1e-9).map((s) => [String(s), sharePrice(g, h, s)])),
    });
  }
  return out;
}

export { formatMoney };
