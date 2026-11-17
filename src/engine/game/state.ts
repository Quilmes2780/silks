import type {
  Horse,
  InboxMessage,
  Jockey,
  LedgerEntry,
  RaceInstance,
  RaceTemplate,
  Run,
  Stable,
  Track,
  Trainer,
} from '../types';
import type { WorldData } from '../world/load';

export interface GameConfig {
  aiStables: number;
  horsesPerStable: number;
  playerHorses: number;
  /** 0 = berechenbar … 1 = sehr zufällig */
  randomness: number;
  jockeys: number;
  trainingFeePerWeek: number;
  startBalance: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  aiStables: 20,
  horsesPerStable: 45,
  playerHorses: 6,
  randomness: 0.4,
  jockeys: 45,
  trainingFeePerWeek: 450,
  startBalance: 150000,
};

export interface WeekSummary {
  season: number;
  week: number;
  racesRun: number;
  runners: number;
  playerRuns: string[];
  injuries: number;
  durationMs: number;
}

export interface GameState {
  version: 1;
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
  jockeys: Record<string, Jockey>;
  trainers: Record<string, Trainer>;
  inbox: InboxMessage[];
  ledger: LedgerEntry[];
  counters: { horse: number; run: number; msg: number };
  calendarSeasons: number[];
  lastSummary: WeekSummary | null;
}

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

export function addLedger(g: GameState, e: Omit<LedgerEntry, 'season' | 'week'>): void {
  g.ledger.push({ ...e, season: g.season, week: g.week });
  g.stables[g.playerStableId]!.balance += e.amount;
}

export function horsesOfStable(g: GameState, stableId: string): Horse[] {
  return Object.values(g.horses).filter((h) => h.stableId === stableId && h.status === 'active');
}

export function runsOfHorse(g: GameState, h: Horse): Run[] {
  return h.runIds.map((id) => g.runs[id]!).filter(Boolean);
}

export function formatMoney(x: number): string {
  return `£${Math.round(x).toLocaleString('en-GB')}`;
}
