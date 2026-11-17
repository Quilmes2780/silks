/**
 * Zentrale Datenmodelle des Spielkerns.
 * Felder für spätere Phasen (Zucht, Genetik, Personal, Finanzen) sind bereits angelegt,
 * damit diese ohne Umbau dazukommen.
 */
import type { SimInput } from './race/sim';

export type AttrKey =
  | 'speed' // Grundschnelligkeit
  | 'acceleration' // Beschleunigung
  | 'stamina' // Ausdauer
  | 'kick' // Speedreserve
  | 'fight' // Kampfgeist
  | 'agility' // Wendigkeit
  | 'temperament' // Temperament (hoch = ruhig, gut)
  | 'consistency'; // Konstanz

export const ATTR_KEYS: readonly AttrKey[] = [
  'speed',
  'acceleration',
  'stamina',
  'kick',
  'fight',
  'agility',
  'temperament',
  'consistency',
];

export type Attributes = Record<AttrKey, number>;

export type Sex = 'male' | 'female';
export type Colour = 'bay' | 'chestnut' | 'black' | 'grey' | 'brown';
export const COLOURS: readonly Colour[] = ['bay', 'chestnut', 'black', 'grey', 'brown'];

export interface Markings {
  face: 'none' | 'star' | 'blaze' | 'stripe';
  /** Weiße Füße: VL, VR, HL, HR */
  socks: [boolean, boolean, boolean, boolean];
}

export type Surface = 'turf' | 'aw';
export type Going =
  | 'firm'
  | 'good_to_firm'
  | 'good'
  | 'good_to_soft'
  | 'soft'
  | 'heavy'
  | 'standard'
  | 'standard_to_slow';

export type RunStyle = 'front' | 'prominent' | 'midfield' | 'held_up';
export type Direction = 'left' | 'right';

export interface Preferences {
  /** Distanzoptimum in Metern */
  distOptM: number;
  /** Toleranz (1 = normal, größer = vielseitiger) */
  distRange: number;
  /** Bodenvorliebe: −1 fest … +1 schwer */
  going: number;
  /** Bahnrichtung: −1 links … +1 rechts, 0 neutral */
  direction: number;
  runStyle: RunStyle;
}

export interface Maturity {
  type: 'early' | 'normal' | 'late';
  /** Alter (Jahre, dezimal) des Leistungshöhepunkts */
  peakAge: number;
}

export type InjuryType = 'cough' | 'tendon' | 'hoof' | 'sore_shins' | 'muscle';

export interface Injury {
  type: InjuryType;
  leg: number | null;
  weeksRemaining: number;
  sinceWeekIndex: number;
}

export interface Condition {
  /** 0–100 */
  fitness: number;
  /** 0–100 (100 = ausgeruht) */
  freshness: number;
  /** Verletzungsrisiko je Bein in % pro Woche (VL, VR, HL, HR) */
  legRisk: [number, number, number, number];
  injury: Injury | null;
}

export type TrainingBlock = 'rest' | 'canter' | 'gallop' | 'hill' | 'sprints' | 'stalls' | 'swim';
/** Wochenplan Montag bis Samstag (Sonntag ist Ruhetag). */
export type TrainingPlan = [TrainingBlock, TrainingBlock, TrainingBlock, TrainingBlock, TrainingBlock, TrainingBlock];

/** Platzhalter für Phase 4 (Zucht und Genetik). */
export interface Genotype {
  loci: Partial<Record<AttrKey, Array<[number, number]>>>;
  colour?: { extension: string; agouti: string; grey: string };
}

export interface RatingEntry {
  season: number;
  week: number;
  rating: number;
  runId: string | null;
}

export interface Horse {
  id: string;
  name: string;
  sex: Sex;
  gelded: boolean;
  foalYear: number;
  colour: Colour;
  markings: Markings;
  // Abstammung (Phase 4)
  sireId: string | null;
  damId: string | null;
  sireName: string | null;
  damName: string | null;
  genotype: Genotype | null;
  breederId: string | null;
  // Besitz
  stableId: string;
  status: 'active' | 'retired';
  // Verborgene Werte
  potential: Attributes;
  current: Attributes;
  prefs: Preferences;
  maturity: Maturity;
  condition: Condition;
  training: TrainingPlan;
  officialRating: number | null;
  ratingHistory: RatingEntry[];
  lastRunWeekIndex: number | null;
  /** IDs aller Starts, chronologisch */
  runIds: string[];
  /** Bilanz vor Spielbeginn (aus der Weltdatei oder generiert) */
  preRecord: { starts: number; wins: number; places: number; earnings: number };
  /** Beim Rennabschluss berechnete Kennzahlen */
  stats: HorseStats;
  /** Feste z-Werte für die Schätzung (der Spieler sieht nie die echten Werte). */
  estimateNoise: Attributes;
  /** Aktueller Marktwert in £ (öffentliche Einschätzung des Markts) */
  value: number | null;
  /** Marktwertverlauf */
  valueHistory: ValuePoint[];
  /** Öffentlicher Eindruck vom Körperbau (1–100, verrauscht) – für Pferde ohne Rennleistung */
  conformation: number;
  /** Pfleger und Bindung (0–100) */
  groomId: string | null;
  groomBond: number;
  /** Kauf durch den jetzigen Besitzer */
  purchase: { price: number; weekIndex: number; fromStableId: string | null; via: PurchaseVia } | null;
  /** Zum Verkauf angeboten */
  forSale: { askingPrice: number; sinceWeekIndex: number } | null;
  source: 'world' | 'generated';
  placeholder: boolean;
}

export interface ValuePoint {
  weekIndex: number;
  value: number;
}

export type PurchaseVia = 'auction' | 'transfer' | 'claim' | 'forced_sale';

/** Ein Kennzahlwert mit Verweis auf den Start, aus dem er stammt. */
export interface FigureRef {
  value: number;
  runId: string;
}

/** Aggregat einer Bedingung (Distanz, Boden, Bahn …) mit Verweis auf alle Starts. */
export interface ConditionCell {
  n: number;
  meanFigure: number;
  bestFigure: number;
  wins: number;
  runIds: string[];
}

export interface StrikeRate {
  starts: number;
  wins: number;
  places: number;
}

export interface HorseStats {
  starts: number;
  wins: number;
  seconds: number;
  thirds: number;
  earnings: number;
  lastFigures: FigureRef[];
  bestFigure: FigureRef | null;
  /** Standardabweichung der letzten 10 Speed Figures */
  figureSd: number | null;
  /** 0–100, hoch = konstant */
  consistencyIndex: number | null;
  /** Steigung der Formkurve (lb pro Start) */
  formTrend: number | null;
  avgFinishingSpeed: number | null;
  strikeByClass: Record<string, StrikeRate>;
  byDistance: Record<string, ConditionCell>;
  byGoing: Record<string, ConditionCell>;
  bySurface: Record<string, ConditionCell>;
  byTrack: Record<string, ConditionCell>;
  byStall: Record<string, ConditionCell>;
  byJockey: Record<string, ConditionCell>;
  byLayoff: Record<string, ConditionCell>;
  /** Distanz × Boden, Schlüssel "distanz|boden" */
  heatmap: Record<string, ConditionCell>;
}

export interface Track {
  id: string;
  name: string;
  direction: Direction;
  /** Umfang des Rundkurses in m */
  circuitM: number;
  /** Länge der Zielgeraden in m */
  homeStraightM: number;
  /** Länge der geraden Bahn (für Sprints), 0 wenn keine */
  straightCourseM: number;
  bends: 'tight' | 'normal' | 'galloping';
  gradient: 'flat' | 'undulating' | 'stiff' | 'downhill';
  uphillFinish: boolean;
  surfaces: Surface[];
  note?: string;
}

export type RaceClass =
  | 'G1'
  | 'G2'
  | 'G3'
  | 'Listed'
  | 'Heritage'
  | 'Handicap'
  | 'Conditions'
  | 'Novice'
  | 'Maiden'
  | 'Claiming';

export type SexRestriction = 'open' | 'fillies' | 'colts_fillies' | 'colts_geldings';

export interface RaceConditions {
  ageMin: number;
  ageMax: number | null;
  sex: SexRestriction;
  /** Für Handicaps: OR-Band (inklusive) */
  orMin: number | null;
  orMax: number | null;
  /** Maiden: nur sieglose Pferde */
  maidenOnly: boolean;
  /** Novice: Pferde mit höchstens N Siegen */
  maxWins: number | null;
}

export interface RaceTemplate {
  id: string;
  name: string;
  trackId: string;
  surface: Surface;
  week: number;
  day: 'sat' | 'sun';
  raceClass: RaceClass;
  /** Britische Klasse 1–6 */
  bhaClass: number;
  distanceM: number;
  conditions: RaceConditions;
  /** Gesamtpreisgeld in £ */
  prize: number;
  /** Nennschluss: so viele Wochen vor der Rennwoche */
  entryDeadlineWeeks: number;
  entryFee: number;
  maxRunners: number;
  feature: boolean;
  /** Claiming-Rennen: fester Preis, zu dem jedes Pferd gekauft werden kann */
  claimPrice: number | null;
}

export type TacticPosition = 'natural' | RunStyle;
export interface Tactic {
  position: TacticPosition;
  attack: 'early' | 'normal' | 'late';
  path: 'rails' | 'normal' | 'wide';
}

export interface Entry {
  horseId: string;
  stableId: string;
  enteredWeekIndex: number;
  jockeyId: string | null;
  tactic: Tactic;
}

export interface Runner {
  horseId: string;
  stableId: string;
  jockeyId: string;
  stall: number;
  /** getragenes Gewicht inkl. Erlaubnis des Nachwuchsjockeys und Übergewicht */
  weightLb: number;
  /** Gewichtserlaubnis des Nachwuchsjockeys (lb) */
  allowanceLb: number;
  /** zugeteiltes Gewicht laut Ausschreibung bzw. Handicap */
  assignedLb: number;
  tactic: Tactic;
}

export interface Claim {
  stableId: string;
  horseId: string;
  weekIndex: number;
}

export interface RaceInstance {
  id: string;
  templateId: string;
  season: number;
  week: number;
  weekIndex: number;
  meetingId: string;
  going: Going | null;
  entries: Entry[];
  /** Nach Nennschluss: endgültige Starter mit Box und Gewicht */
  runners: Runner[] | null;
  seed: number;
  randomness: number;
  status: 'open' | 'closed' | 'run' | 'void';
  resultRunIds: string[];
  winningTimeS: number | null;
  /** Claiming-Rennen: abgegebene Claims */
  claims: Claim[];
  /** Eingefrorene Simulationseingaben – ein Replay ist eine deterministische Neusimulation */
  replayInput?: Omit<SimInput, 'record'>;
}

export type RaceEventType =
  | 'slow_start'
  | 'stumbled'
  | 'pulled_hard'
  | 'boxed_in'
  | 'hampered'
  | 'wide'
  | 'led'
  | 'faded'
  | 'finished_fast'
  | 'eased'
  | 'duel';

export interface RaceEvent {
  type: RaceEventType;
  atM: number;
}

export interface Sectional {
  /** Messpunkt in m ab Start */
  atM: number;
  /** Zeit des Abschnitts in s */
  splitS: number;
  /** kumulierte Zeit in s */
  cumS: number;
  position: number;
  /** Abstand zum Führenden in Längen */
  gapL: number;
}

/** Ein Start eines Pferdes: Rohdaten plus die beim Abschluss berechneten Kennzahlen. */
export interface Run {
  id: string;
  raceId: string;
  templateId: string;
  raceName: string;
  horseId: string;
  stableId: string;
  jockeyId: string;
  season: number;
  week: number;
  weekIndex: number;
  trackId: string;
  surface: Surface;
  going: Going;
  distanceM: number;
  raceClass: RaceClass;
  fieldSize: number;
  stall: number;
  weightLb: number;
  tactic: Tactic;
  ageAtRace: number;
  daysSinceLastRun: number | null;
  // Ergebnis
  position: number;
  timeS: number;
  beatenL: number;
  marginL: number;
  topSpeed: number;
  distanceRunM: number;
  sectionals: Sectional[];
  /** Geschwindigkeit (m/s) je 50 m */
  speedCurve: number[];
  events: RaceEvent[];
  // Kennzahlen
  speedFigure: number;
  finishingSpeedPct: number;
  officialRatingBefore: number | null;
  prize: number;
  /** Claiming-Rennen: das Pferd wurde nach dem Rennen von diesem Stall gekauft */
  claimedBy?: string;
}

export type SilksPattern =
  | 'plain'
  | 'hoops'
  | 'stripes'
  | 'sash'
  | 'chevrons'
  | 'quartered'
  | 'diamond'
  | 'cross_belts'
  | 'spots'
  | 'halved';

export interface Silks {
  pattern: SilksPattern;
  body: string;
  pattern2: string;
  sleeves: string;
  cap: string;
}

export interface Facilities {
  /** Boxenkapazität */
  boxes: number;
  /** Schwimmbecken: bessere Erholung und Verletzungsvorbeugung */
  pool: boolean;
  /** Bergstrecke: volles Bergtraining */
  hill: boolean;
  /** Tierklinik: schnellere Heilung, Früherkennung */
  clinic: boolean;
}

export interface Stable {
  id: string;
  name: string;
  /** player = Spieler, ai = KI-Stall, market = Züchter/Verkäufer (nur Auktionen) */
  kind: 'player' | 'ai' | 'market';
  isPlayer: boolean;
  silks: Silks;
  /** Cheftrainer (Staff-ID) */
  trainerId: string;
  strategy: 'balanced' | 'sprint' | 'staying' | 'trader' | 'player';
  balance: number;
  /** 0–100, aus dem Erfolg der letzten 52 Wochen */
  reputation: number;
  facilities: Facilities;
  /** KI: Qualität des nicht einzeln modellierten Personals (0–1) */
  staffQuality: number;
  source: 'world' | 'generated';
  placeholder: boolean;
}

export type StaffRole =
  | 'head_trainer'
  | 'assistant_trainer'
  | 'jockey'
  | 'work_rider'
  | 'groom'
  | 'vet'
  | 'farrier'
  | 'agent'
  | 'analyst';

export const STAFF_ROLES: readonly StaffRole[] = [
  'head_trainer',
  'assistant_trainer',
  'jockey',
  'work_rider',
  'groom',
  'vet',
  'farrier',
  'agent',
  'analyst',
];

export interface Contract {
  stableId: string;
  weeklySalary: number;
  /** Erfolgsbeteiligung am Preisgeld (0–0,15), für Trainer und Jockeys */
  prizeShare: number;
  startWeekIndex: number;
  /** Vertrag läuft bis zum Ende dieser Saison */
  endSeason: number;
}

export interface JockeyProfile {
  /** 0–1 */
  tactics: number;
  pace: number;
  finishing: number;
  /** Mindestgewicht in lb */
  weightLb: number;
  /** Reitgebühr je Ritt */
  fee: number;
  /** Siege in der Karriere (bestimmt die Erlaubnis für Nachwuchsjockeys) */
  careerWins: number;
  suspendedUntilWeekIndex: number | null;
  suspensions: number;
}

export interface TrainerProfile {
  /** 0–1 Prognosegenauigkeit */
  insight: number;
  specialty: 'none' | 'sprint' | 'staying';
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  age: number;
  /** Fachkönnen 0–1 (verborgen, der Spieler sieht eine Einstufung) */
  skill: number;
  /** Entwicklungsgrenze 0–1 */
  potential: number;
  /** 0–100 */
  experience: number;
  /** 0–100 */
  morale: number;
  jockey?: JockeyProfile;
  trainer?: TrainerProfile;
  contract: Contract | null;
  /** angekündigter Abgang */
  leaving: { weekIndex: number; reason: 'resign' | 'poached' | 'retire' | 'contract_end'; toStableId: string | null } | null;
  /** nach einer Absage erst wieder ansprechbar ab */
  blockedUntilWeekIndex: number | null;
  source: 'world' | 'generated';
  placeholder: boolean;
}

/** Deckhengst des generierten Registers (Abstammung für Jährlinge bis Phase 4). */
export interface Stallion {
  id: string;
  name: string;
  foalYear: number;
  /** Decktaxe in £ (öffentlich) */
  fee: number;
  /** verborgene Vererbungsqualität (Attributskala) */
  quality: number;
  distOptM: number;
  going: number;
  active: boolean;
}

export type AuctionKind = 'breeze_up' | 'yearling' | 'horses_in_training';

export interface Lot {
  id: string;
  horseId: string;
  consignorId: string;
  reserve: number;
  /** Breeze-up: gemessene Zeit über 2 Furlongs (s) */
  breezeTimeS: number | null;
  status: 'pending' | 'sold' | 'unsold' | 'withdrawn';
  price: number | null;
  buyerId: string | null;
  currentBid: number;
  leaderId: string | null;
  /** Höchstgebote der KI-Ställe (verborgen) */
  aiMax: Array<{ stableId: string; max: number }>;
  /** Auto-Gebot des Spielers bis zu diesem Limit */
  playerLimit: number | null;
}

export interface Auction {
  id: string;
  kind: AuctionKind;
  name: string;
  season: number;
  week: number;
  weekIndex: number;
  lots: Lot[];
  status: 'catalogue' | 'live' | 'done';
}

export interface TransferOffer {
  id: string;
  horseId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  /** Gegenangebot der Gegenseite */
  counter: number | null;
  status: 'open' | 'countered' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  createdWeekIndex: number;
  expiresWeekIndex: number;
  rounds: number;
  /** verborgenes Limit der KI (bei Angeboten der KI für Spielerpferde) */
  limit: number | null;
}

export interface InboxMessage {
  id: string;
  season: number;
  week: number;
  kind: 'injury' | 'result' | 'deadline' | 'trainer' | 'season' | 'info' | 'staff' | 'market' | 'finance';
  title: string;
  body: string;
  horseId?: string;
  raceId?: string;
  staffId?: string;
  read: boolean;
}

export type LedgerKind =
  | 'prize'
  | 'sale'
  | 'purchase'
  | 'entry_fee'
  | 'jockey_fee'
  | 'prize_share'
  | 'salary'
  | 'upkeep'
  | 'vet'
  | 'facility'
  | 'interest'
  | 'other';

export interface LedgerEntry {
  season: number;
  week: number;
  weekIndex: number;
  amount: number;
  kind: LedgerKind;
  text: string;
  raceId?: string;
  horseId?: string;
  staffId?: string;
}
