import type { Facilities, LedgerKind } from '../types';
import { addInbox, book, formatMoney, type GameState, horseAccount, horsesOfStable, sortedById } from '../game/state';
import { marketValue } from './value';
import { OWN_STUD_COST, STALLION_UPKEEP, STUD_LEVEL_COST, STUD_LEVEL_UPKEEP, STUD_MAX_LEVEL, STUD_PLACES_PER_LEVEL, studHorses, studWeeklyCost, stallionsOf, inOwnStud, EXTERNAL_STUD_COST } from '../breeding/stud';

/**
 * Finanzen: Unterhalt, Anlagenkosten, Dispozinsen, Zwangsverkauf, Ruf, Kontoverlauf.
 * Gemeinkosten (Gehälter, Anlage) werden in der Kostenrechnung gleichmäßig auf die
 * Pferde des Spielers verteilt, damit Kosten je Pferd und ROI vollständig sind.
 */

export type FacilityKey = 'boxes' | 'pool' | 'hill' | 'clinic' | 'stud';

export const FACILITY_INFO: Record<FacilityKey, { label: string; cost: number; upkeep: number; effect: string }> = {
  boxes: { label: '4 weitere Boxen', cost: 40000, upkeep: 12, effect: 'Platz für 4 weitere Pferde (Unterhalt je Box)' },
  pool: { label: 'Schwimmbecken', cost: 120000, upkeep: 250, effect: 'Schwimmen statt Weide: mehr Erholung, −5 % Verletzungsrisiko' },
  hill: { label: 'Bergstrecke', cost: 150000, upkeep: 180, effect: 'volles Bergtraining (ohne: 60 % Wirkung)' },
  clinic: { label: 'Tierklinik', cost: 200000, upkeep: 400, effect: '20 % kürzere Ausfallzeiten, −5 % Verletzungsrisiko' },
  stud: {
    label: `Gestüt (+${STUD_PLACES_PER_LEVEL} Plätze)`,
    cost: STUD_LEVEL_COST,
    upkeep: STUD_LEVEL_UPKEEP,
    effect: `Weiden und Abfohlboxen für ${STUD_PLACES_PER_LEVEL} Stuten oder Nachwuchs: £${OWN_STUD_COST} statt £${EXTERNAL_STUD_COST} Pension je Pferd und Woche; mit Gestütsleiter höhere Trächtigkeitsrate`,
  },
};
export { STUD_MAX_LEVEL };

export const MAX_BOXES = 80;

export function facilityUpkeep(f: Facilities): number {
  return (
    f.boxes * FACILITY_INFO.boxes.upkeep +
    (f.pool ? FACILITY_INFO.pool.upkeep : 0) +
    (f.hill ? FACILITY_INFO.hill.upkeep : 0) +
    (f.clinic ? FACILITY_INFO.clinic.upkeep : 0) +
    (f.stud ?? 0) * FACILITY_INFO.stud.upkeep
  );
}

/** KI-Besitzer schießen Geld nach, wenn der Kontostand zu tief fällt (Mäzene, wie im echten Rennsport). */
export const AI_PATRON_FLOOR = 150000;
export const AI_PATRON_TOPUP = 250000;

/** Zähler für die Kalibrierung (nicht Teil des Spielstands). */
export const ECONOMY_DEBUG = { patronTopups: 0 };

/** Verfügbarer Rahmen: Kontostand plus Dispokredit. */
export function spendable(g: GameState, stableId: string): number {
  const s = g.stables[stableId]!;
  return s.balance + (s.kind === 'player' ? g.config.overdraftLimit : 0);
}

export function canAfford(g: GameState, stableId: string, amount: number): boolean {
  return spendable(g, stableId) >= amount;
}

/** Gemeinkosten anteilig auf die Pferde des Spielers verteilen (nur Kostenrechnung, kein Kontoauszug). */
function allocate(g: GameState, kind: LedgerKind, amount: number): void {
  const horses = horsesOfStable(g, g.playerStableId);
  if (!horses.length || amount === 0) return;
  const each = amount / horses.length;
  for (const h of horses) {
    const acc = horseAccount(g, h.id);
    acc.byKind[kind] = Math.round(((acc.byKind[kind] ?? 0) + each) * 100) / 100;
  }
}

export interface FinanceWeekResult {
  upkeep: number;
  facilities: number;
  interest: number;
  forcedSale: string | null;
}

export function financeWeek(g: GameState, playerSalaries: number, sellHorse: (horseId: string, toStableId: string, price: number) => void): FinanceWeekResult {
  const out: FinanceWeekResult = { upkeep: 0, facilities: 0, interest: 0, forcedSale: null };
  for (const st of sortedById(Object.values(g.stables))) {
    if (st.kind === 'market') continue;
    const horses = horsesOfStable(g, st.id);
    const upkeep = horses.length * g.config.upkeepPerHorse;
    const fac = facilityUpkeep(st.facilities);
    if (st.kind === 'player') {
      if (upkeep) book(g, st.id, { amount: -upkeep, kind: 'upkeep', text: `Unterhalt (${horses.length} Pferde)` });
      if (fac) book(g, st.id, { amount: -fac, kind: 'facility', text: 'Unterhalt der Anlage' });
      for (const h of horses) {
        const acc = horseAccount(g, h.id);
        acc.byKind.upkeep = (acc.byKind.upkeep ?? 0) - g.config.upkeepPerHorse;
      }
      allocate(g, 'facility', -fac);
      allocate(g, 'salary', -playerSalaries);
      // Gestüt: eigene Plätze oder Pension, eigene Deckhengste
      const stud = studWeeklyCost(g, st);
      if (stud.total) {
        book(g, st.id, { amount: -stud.total, kind: 'stud_upkeep', text: `Gestüt: ${studHorses(g, st.id).length} Stuten/Nachwuchs, ${stallionsOf(g, st.id).length} Hengste` });
        for (const h of studHorses(g, st.id)) {
          const acc = horseAccount(g, h.id);
          acc.byKind.stud_upkeep = (acc.byKind.stud_upkeep ?? 0) - (inOwnStud(g, h) ? OWN_STUD_COST : EXTERNAL_STUD_COST);
        }
        for (const s of stallionsOf(g, st.id)) {
          const acc = horseAccount(g, s.id);
          acc.byKind.stud_upkeep = (acc.byKind.stud_upkeep ?? 0) - STALLION_UPKEEP;
        }
      }
      out.upkeep = upkeep;
      out.facilities = fac;
    } else {
      const stud = studHorses(g, st.id).length * OWN_STUD_COST + stallionsOf(g, st.id).length * STALLION_UPKEEP;
      book(g, st.id, { amount: -(upkeep + fac + stud), kind: 'upkeep', text: 'Unterhalt' });
      if (st.balance < AI_PATRON_FLOOR) {
        book(g, st.id, { amount: AI_PATRON_TOPUP, kind: 'other', text: 'Einlage der Besitzer' });
        ECONOMY_DEBUG.patronTopups++;
      }
    }
  }

  // Dispozinsen und Überziehung
  const p = g.stables[g.playerStableId]!;
  if (p.balance < 0) {
    const interest = Math.round((-p.balance * g.config.overdraftRate) / 52);
    if (interest > 0) {
      book(g, p.id, { amount: -interest, kind: 'interest', text: 'Dispozinsen' });
      out.interest = interest;
    }
  }
  if (p.balance < -g.config.overdraftLimit) {
    g.finance.overdraftWeeks += 1;
    const w = g.finance.overdraftWeeks;
    if (w === 1 || w === 4 || w === 7) {
      addInbox(g, {
        kind: 'finance',
        title: w === 7 ? 'Letzte Mahnung der Bank' : 'Mahnung: Dispolimit überschritten',
        body: `Dein Kontostand (${formatMoney(p.balance)}) liegt unter dem Dispolimit von ${formatMoney(-g.config.overdraftLimit)}. ${
          w === 7 ? 'Nächste Woche verkauft die Bank dein wertvollstes Pferd.' : `Nach ${8 - w} weiteren Wochen verkauft die Bank dein wertvollstes Pferd.`
        } Verkaufe Pferde oder senke die Kosten.`,
      });
    }
    if (w >= 8) {
      const horses = horsesOfStable(g, p.id).sort((a, b) => marketValue(g, b) - marketValue(g, a));
      const h = horses[0];
      const buyers = sortedById(Object.values(g.stables)).filter((s) => s.kind === 'ai').sort((a, b) => b.balance - a.balance);
      if (h && buyers[0]) {
        const price = Math.round((marketValue(g, h) * 0.75) / 500) * 500;
        sellHorse(h.id, buyers[0].id, price);
        out.forcedSale = h.id;
        addInbox(g, {
          kind: 'finance',
          title: `Zwangsverkauf: ${h.name}`,
          body: `Die Bank hat ${h.name} für ${formatMoney(price)} (75 % des Marktwerts) an ${buyers[0].name} verkauft.`,
          horseId: h.id,
        });
      }
      g.finance.overdraftWeeks = 4;
    }
  } else {
    g.finance.overdraftWeeks = 0;
  }
  return out;
}

/** Ruf (0–100) aus Preisgeld, Siegen und Gruppensiegen der letzten 52 Wochen. */
export function updateReputation(g: GameState): void {
  const prize = new Map<string, number>();
  const group = new Map<string, number>();
  for (const race of Object.values(g.races)) {
    if (race.status !== 'run' || race.weekIndex < g.weekIndex - 52) continue;
    const t = g.templates[race.templateId];
    for (const id of race.resultRunIds) {
      const run = g.runs[id];
      if (!run) continue;
      prize.set(run.stableId, (prize.get(run.stableId) ?? 0) + run.prize);
      if (run.position === 1 && t && (t.raceClass === 'G1' || t.raceClass === 'G2' || t.raceClass === 'G3')) {
        group.set(run.stableId, (group.get(run.stableId) ?? 0) + (t.raceClass === 'G1' ? 2 : 1));
      }
    }
  }
  for (const st of Object.values(g.stables)) {
    if (st.kind === 'market') continue;
    const target = Math.max(5, Math.min(100, 20 + 12 * Math.log10(1 + (prize.get(st.id) ?? 0) / 5000) + 3 * (group.get(st.id) ?? 0)));
    st.reputation = Math.round((st.reputation + (target - st.reputation) * 0.2) * 10) / 10;
  }
}

export function recordBalance(g: GameState, weekIndex = g.weekIndex): void {
  const p = g.stables[g.playerStableId]!;
  const hist = g.finance.balanceHistory;
  const last = hist.at(-1);
  if (last && last.weekIndex === weekIndex) last.balance = p.balance;
  else hist.push({ weekIndex, balance: p.balance });
  if (hist.length > 52 * 12) hist.splice(0, hist.length - 52 * 12);
}
