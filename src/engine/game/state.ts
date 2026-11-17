import type {
  Auction,
  Horse,
  InboxMessage,
  LedgerEntry,
  LedgerKind,
  RaceInstance,
  RaceTemplate,
  Run,
  Stable,
  Staff,
  Stallion,
  Track,
  TransferOffer,
} from '../types';
import type { WorldData } from '../world/load';

export interface GameConfig {
  aiStables: number;
  horsesPerStable: number;
  playerHorses: number;
  /** 0 = berechenbar … 1 = sehr zufällig */
  randomness: number;
  /** freie Jockeys im Pool */
  jockeys: number;
  startBalance: number;
  /** Unterhalt je Pferd und Woche (Futter, Einstreu, Versicherung) */
  upkeepPerHorse: number;
  /** Dispokredit: so weit darf der Kontostand ins Minus */
  overdraftLimit: number;
  /** Jahreszins auf negative Salden */
  overdraftRate: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  aiStables: 20,
  horsesPerStable: 45,
  playerHorses: 6,
  randomness: 0.4,
  jockeys: 45,
  startBalance: 250000,
  upkeepPerHorse: 110,
  overdraftLimit: 100000,
  overdraftRate: 0.09,
};

export interface WeekSummary {
  season: number;
  week: number;
  racesRun: number;
  runners: number;
  playerRuns: string[];
  injuries: number;
  durationMs: number;
  /** Veränderung des Kontostands in dieser Woche */
  balanceDelta: number;
  events: string[];
}

/** Kosten und Erträge eines Pferds, solange es dem Spieler gehört(e). */
export interface HorseAccount {
  horseId: string;
  name: string;
  fromWeekIndex: number;
  toWeekIndex: number | null;
  byKind: Partial<Record<LedgerKind, number>>;
}

export interface FinanceState {
  /** Kontostand am Ende jeder Woche */
  balanceHistory: Array<{ weekIndex: number; balance: number }>;
  /** Wochen in Folge unter dem Dispolimit */
  overdraftWeeks: number;
  horses: Record<string, HorseAccount>;
}

export interface GameState {
  version: 2;
  id: string;
  name: string;
  createdAt: string;
  seed: number;
  config: GameConfig;
  startSeason: number;
  season: number;
  week: number;
  weekIndex: number;
  playerStableId: string;
  world: WorldData;
  tracks: Record<string, Track>;
  templates: Record<string, RaceTemplate>;
  races: Record<string, RaceInstance>;
  horses: Record<string, Horse>;
  runs: Record<string, Run>;
  stables: Record<string, Stable>;
  staff: Record<string, Staff>;
  stallions: Record<string, Stallion>;
  auctions: Record<string, Auction>;
  offers: TransferOffer[];
  finance: FinanceState;
  inbox: InboxMessage[];
  ledger: LedgerEntry[];
  counters: { horse: number; run: number; msg: number; staff: number; offer: number; lot: number };
  calendarSeasons: number[];
  lastSummary: WeekSummary | null;
  /** Pferde, die seit dem letzten Speichern Besitzer oder Status gewechselt haben (für die Persistenz) */
  touchedHorses: string[];
  /** Rennen, die außerhalb der Wochenschleife geändert wurden (Nennungen gestrichen) */
  touchedRaces: string[];
}

export const MARKET_STABLE_ID = 'breeders';

export function weekIndexOf(g: Pick<GameState, 'startSeason'>, season: number, week: number): number {
  return (season - g.startSeason) * 52 + (week - 1);
}

export function playerStable(g: GameState): Stable {
  return g.stables[g.playerStableId]!;
}

export function addInbox(g: GameState, m: Omit<InboxMessage, 'id' | 'season' | 'week' | 'read'>): void {
  g.inbox.push({ ...m, id: `m${++g.counters.msg}`, season: g.season, week: g.week, read: false });
  if (g.inbox.length > 400) g.inbox.splice(0, g.inbox.length - 400);
}

/**
 * Buchung auf das Konto eines Stalls. Für den Spieler entsteht ein Kontoauszugseintrag und,
 * mit horseId, ein Eintrag in der Kostenrechnung des Pferds.
 */
export function book(
  g: GameState,
  stableId: string,
  e: { amount: number; kind: LedgerKind; text: string; raceId?: string; horseId?: string; staffId?: string },
): void {
  const s = g.stables[stableId];
  if (!s) return;
  s.balance += e.amount;
  if (stableId !== g.playerStableId) return;
  g.ledger.push({ ...e, season: g.season, week: g.week, weekIndex: g.weekIndex });
  if (e.horseId) {
    const acc = horseAccount(g, e.horseId);
    acc.byKind[e.kind] = (acc.byKind[e.kind] ?? 0) + e.amount;
  }
}

/** Kurzform für Buchungen des Spielers. */
export function addLedger(g: GameState, e: { amount: number; kind: LedgerKind; text: string; raceId?: string; horseId?: string; staffId?: string }): void {
  book(g, g.playerStableId, e);
}

export function horseAccount(g: GameState, horseId: string): HorseAccount {
  let acc = g.finance.horses[horseId];
  if (!acc) {
    const h = g.horses[horseId];
    acc = { horseId, name: h?.name ?? horseId, fromWeekIndex: g.weekIndex, toWeekIndex: null, byKind: {} };
    g.finance.horses[horseId] = acc;
  }
  return acc;
}

export function touch(g: GameState, horseId: string): void {
  if (!g.touchedHorses.includes(horseId)) g.touchedHorses.push(horseId);
}

export function touchRace(g: GameState, raceId: string): void {
  if (!g.touchedRaces.includes(raceId)) g.touchedRaces.push(raceId);
}

export function horsesOfStable(g: GameState, stableId: string): Horse[] {
  return sortedById(Object.values(g.horses)).filter((h) => h.stableId === stableId && h.status === 'active');
}

export function staffOfStable(g: GameState, stableId: string, role?: Staff['role']): Staff[] {
  return sortedById(Object.values(g.staff)).filter((s) => s.contract?.stableId === stableId && (!role || s.role === role));
}

export function isAiStable(s: Stable): boolean {
  return s.kind === 'ai';
}

export function runsOfHorse(g: GameState, h: Horse): Run[] {
  return h.runIds.map((id) => g.runs[id]!).filter(Boolean);
}

/**
 * Werte eines Datensatzes in fester Reihenfolge (nach ID). Wichtig für den Determinismus:
 * Nach dem Laden aus IndexedDB unterscheidet sich die Einfügereihenfolge vom Original.
 */
export function sortedById<T extends { id: string }>(items: Iterable<T>): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function formatMoney(x: number): string {
  const r = Math.round(x);
  return `${r < 0 ? '−' : ''}£${Math.abs(r).toLocaleString('en-GB')}`;
}
