import type {
  CalendarFilter,
  CalendarRow,
  HeaderView,
  HorseProfileView,
  JockeyView,
  OfficeView,
  RaceCardView,
  ReplayView,
  RunLink,
  StableRow,
  TrainingInfo,
} from '../engine/game/queries';
import type { WeekSummary } from '../engine/game/state';
import type { Silks, Tactic, TrainingPlan } from '../engine/types';

/**
 * Typisierte Nachrichten zwischen UI und Worker.
 * Die UI sendet Befehle/Abfragen ({ id, type, payload }), der Worker antwortet mit
 * { id, ok, data } bzw. { id, ok: false, error }. Nur der Worker liest und schreibt die Datenbank.
 */

export interface SaveMeta {
  id: string;
  name: string;
  stableName: string;
  silks: Silks;
  season: number;
  week: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewGameParams {
  name: string;
  stableName: string;
  silks: Silks;
  seed: number;
  randomness: number;
  playerHorses: number;
  aiStables: number;
}

export interface Api {
  // Spielstände
  listSaves: { req: void; res: SaveMeta[] };
  newGame: { req: NewGameParams; res: SaveMeta };
  loadGame: { req: { saveId: string }; res: SaveMeta };
  deleteSave: { req: { saveId: string }; res: null };
  exportSave: { req: { saveId: string }; res: { fileName: string; json: string } };
  importSave: { req: { json: string }; res: SaveMeta };
  // Spielzug
  advanceWeek: { req: void; res: WeekSummary };
  enterRace: { req: { raceId: string; horseId: string; jockeyId?: string | null; tactic?: Tactic }; res: null };
  withdrawEntry: { req: { raceId: string; horseId: string }; res: null };
  setRaceOrders: { req: { raceId: string; horseId: string; tactic: Tactic; jockeyId?: string | null }; res: null };
  setTraining: { req: { horseId: string; plan: TrainingPlan | string }; res: null };
  markInboxRead: { req: { ids: string[] | 'all' }; res: null };
  renameStable: { req: { name: string }; res: null };
  setSilks: { req: { silks: Silks }; res: null };
  // Abfragen
  header: { req: void; res: HeaderView };
  office: { req: void; res: OfficeView };
  stableList: { req: { stableId?: string }; res: StableRow[] };
  horseProfile: { req: { horseId: string }; res: HorseProfileView };
  calendar: { req: CalendarFilter; res: CalendarRow[] };
  raceCard: { req: { raceId: string }; res: RaceCardView };
  replay: { req: { raceId: string }; res: ReplayView };
  jockeys: { req: void; res: JockeyView[] };
  trainingInfo: { req: void; res: TrainingInfo };
  runLinks: { req: { runIds: string[] }; res: RunLink[] };
}

export type ApiType = keyof Api;

export interface RequestMessage<K extends ApiType = ApiType> {
  id: number;
  type: K;
  payload: Api[K]['req'];
}

export type ResponseMessage<K extends ApiType = ApiType> =
  | { id: number; ok: true; data: Api[K]['res'] }
  | { id: number; ok: false; error: string };

export type WorkerEvent = { event: 'ready' } | { event: 'progress'; label: string };
