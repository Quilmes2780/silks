/**
 * Zentrale Datenmodelle des Spielkerns.
 * Felder für spätere Phasen (Zucht, Genetik, Personal, Finanzen) sind bereits angelegt,
 * damit diese ohne Umbau dazukommen.
 */

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
  /** Feste z-Werte für die Schätzung (der Spieler sieht nie die echten Werte). */
  estimateNoise: Attributes;
  /** Marktwert (Phase 3) */
  value: number | null;
  source: 'world' | 'generated';
  placeholder: boolean;
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
  | 'Maiden';

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
  weightLb: number;
  tactic: Tactic;
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

export interface Stable {
  id: string;
  name: string;
  isPlayer: boolean;
  silks: Silks;
  trainerId: string;
  strategy: 'balanced' | 'sprint' | 'staying' | 'player';
  balance: number;
  source: 'world' | 'generated';
  placeholder: boolean;
}

export interface Jockey {
  id: string;
  name: string;
  /** 0–1 */
  tactics: number;
  pace: number;
  finishing: number;
  weightLb: number;
  fee: number;
  source: 'world' | 'generated';
  placeholder: boolean;
}

export interface Trainer {
  id: string;
  name: string;
  /** 0–1 Trainingseffizienz */
  skill: number;
  /** 0–1 Prognosegenauigkeit */
  insight: number;
  specialty: 'none' | 'sprint' | 'staying';
  source: 'world' | 'generated';
  placeholder: boolean;
}

export interface InboxMessage {
  id: string;
  season: number;
  week: number;
  kind: 'injury' | 'result' | 'deadline' | 'trainer' | 'season' | 'info';
  title: string;
  body: string;
  horseId?: string;
  raceId?: string;
  read: boolean;
}

export interface LedgerEntry {
  season: number;
  week: number;
  amount: number;
  kind: 'prize' | 'entry_fee' | 'jockey_fee' | 'training' | 'other';
  text: string;
  raceId?: string;
  horseId?: string;
}
