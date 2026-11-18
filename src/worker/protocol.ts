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
import type { AuctionView, FacilitiesView, FinanceView, MarketView, StaffView } from '../engine/game/econQueries';
import type { HireResult } from '../engine/game/staffCommands';
import type { OfferResult } from '../engine/market/transfer';
import type { BidResult } from '../engine/market/auction';
import type { FacilityKey } from '../engine/economy/finance';
import type { Silks, Tactic, TrainingPlan } from '../engine/types';
import type { BreedingStatsView, PartnershipsView, PedigreeView, StallionRow, StudView } from '../engine/breeding/queries';

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

export interface ContractReq {
  staffId: string;
  weeklySalary: number;
  years: number;
  prizeShare?: number;
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
  markTutorial: { req: { step: string }; res: null };
  dismissTutorial: { req: { dismissed: boolean }; res: null };
  renameStable: { req: { name: string }; res: null };
  setSilks: { req: { silks: Silks }; res: null };
  // Personal
  hireStaff: { req: ContractReq; res: HireResult };
  offerContract: { req: ContractReq; res: HireResult };
  fireStaff: { req: { staffId: string }; res: { severance: number } };
  assignGroom: { req: { horseId: string; groomId: string | null }; res: null };
  upgradeFacility: { req: { key: FacilityKey }; res: null };
  // Markt
  makeOffer: { req: { horseId: string; amount: number }; res: OfferResult };
  respondOffer: { req: { offerId: string; action: 'accept' | 'decline' | 'counter'; amount?: number }; res: OfferResult };
  listForSale: { req: { horseId: string; askingPrice: number | null }; res: null };
  bid: { req: { lotId: string; amount?: number }; res: BidResult };
  pass: { req: { lotId: string }; res: BidResult };
  setAutoBid: { req: { lotId: string; limit: number | null }; res: null };
  finishAuction: { req: { auctionId: string }; res: null };
  consign: { req: { horseId: string; auctionId: string; reserve: number }; res: null };
  withdrawLot: { req: { horseId: string; auctionId: string }; res: null };
  claimHorse: { req: { raceId: string; horseId: string }; res: { claimed: boolean } };
  // Zucht
  setMating: { req: { mareId: string; stallionId: string | null }; res: { planned: boolean } };
  toBroodmare: { req: { horseId: string }; res: null };
  standAsStallion: { req: { horseId: string }; res: null };
  bringIntoTraining: { req: { horseId: string }; res: null };
  retireHorse: { req: { horseId: string }; res: null };
  sellToBreeders: { req: { horseId: string }; res: { price: number } };
  // Teilhaberschaften und Einstellpferde
  buyShare: { req: { horseId: string; share: number }; res: { price: number } };
  sellShare: { req: { horseId: string }; res: { price: number } };
  acceptBoarding: { req: { offerId: string }; res: null };
  declineBoarding: { req: { offerId: string }; res: null };
  endBoarding: { req: { horseId: string }; res: null };
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
  staff: { req: void; res: StaffView };
  staffOfferHint: { req: { staffId: string }; res: { demand: number; mood: string } };
  finance: { req: { season?: number }; res: FinanceView };
  facilities: { req: void; res: FacilitiesView };
  market: { req: void; res: MarketView };
  auction: { req: { auctionId: string }; res: AuctionView };
  stud: { req: void; res: StudView };
  stallions: { req: { mareId?: string | null }; res: { rows: StallionRow[]; mare: { id: string; name: string; line: string | null } | null; studManager: number | null } };
  pedigree: { req: { horseId: string }; res: PedigreeView };
  breedingStats: { req: void; res: BreedingStatsView };
  partnerships: { req: void; res: PartnershipsView };
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
