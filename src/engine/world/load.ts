import AjvModule from 'ajv';
import commonSchema from '../../../data/schema/common.schema.json';
import tracksSchema from '../../../data/schema/tracks.schema.json';
import racesSchema from '../../../data/schema/races.schema.json';
import stablesSchema from '../../../data/schema/stables.schema.json';
import trainersSchema from '../../../data/schema/trainers.schema.json';
import jockeysSchema from '../../../data/schema/jockeys.schema.json';
import horsesSchema from '../../../data/schema/horses.schema.json';
import type {
  Attributes,
  Colour,
  Preferences,
  RaceClass,
  SexRestriction,
  Silks,
  Track,
} from '../types';

/** Rohdaten der Weltdateien (data/world/*.json). */
export interface FeatureRace {
  id: string;
  name: string;
  trackId: string;
  week: number;
  day: 'sat' | 'sun';
  raceClass: RaceClass;
  distanceM: number;
  ageMin: number;
  ageMax: number | null;
  sex: SexRestriction;
  orMin?: number;
  orMax?: number;
  prize: number;
  maxRunners?: number;
}

export interface GenericRace {
  key: string;
  name: string;
  raceClass: RaceClass;
  bhaClass: number;
  ageMin: number;
  ageMax: number | null;
  orMin?: number;
  orMax?: number;
  maidenOnly?: boolean;
  maxWins?: number;
  fromWeek?: number;
  toWeek?: number;
  weight: number;
  distances: number[];
  prize: number;
}

export interface MeetingRules {
  turfSeason: { fromWeek: number; toWeek: number };
  turfSaturday: number;
  turfSunday: number;
  awSaturdayInSeason: number;
  awSaturdayWinter: number;
  awSundayWinter: number;
  racesPerMeeting: number;
  majorTurfRotation: string[];
  minorTurfRotation: string[];
  awRotation: string[];
}

export interface RawStable {
  id: string;
  name: string;
  trainerId: string;
  strategy?: 'balanced' | 'sprint' | 'staying';
  silks: Silks;
  placeholder?: boolean;
}

export interface RawTrainer {
  id: string;
  name: string;
  skill: number;
  insight: number;
  specialty?: 'none' | 'sprint' | 'staying';
  placeholder?: boolean;
}

export interface RawJockey {
  id: string;
  name: string;
  tactics: number;
  pace: number;
  finishing: number;
  weightLb?: number;
  fee?: number;
  placeholder?: boolean;
}

export interface RawHorse {
  id: string;
  name: string;
  sex: 'male' | 'female';
  gelded?: boolean;
  foalYear: number;
  colour?: Colour;
  stableId: string;
  sireName?: string | null;
  damName?: string | null;
  quality?: number;
  distOptM?: number;
  potential?: Attributes;
  prefs?: Preferences;
  maturity?: 'early' | 'normal' | 'late';
  placeholder?: boolean;
}

export interface WorldData {
  tracks: Track[];
  features: FeatureRace[];
  meetings: MeetingRules;
  generic: GenericRace[];
  stables: RawStable[];
  trainers: RawTrainer[];
  jockeys: RawJockey[];
  horses: RawHorse[];
}

export interface RawWorldFiles {
  tracks: unknown;
  races: unknown;
  stables: unknown;
  trainers: unknown;
  jockeys: unknown;
  horses: unknown;
}

export class WorldValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Weltdaten ungültig:\n- ${problems.join('\n- ')}`);
  }
}

type AjvCtor = new (opts: object) => {
  addSchema: (s: object) => void;
  compile: (s: object) => ((d: unknown) => boolean) & { errors?: Array<{ instancePath: string; message?: string }> | null };
};
const Ajv = ((AjvModule as unknown as { default?: AjvCtor }).default ?? (AjvModule as unknown as AjvCtor)) as AjvCtor;

let validators: Record<keyof RawWorldFiles, ReturnType<InstanceType<AjvCtor>['compile']>> | null = null;

function getValidators() {
  if (validators) return validators;
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addSchema(commonSchema);
  validators = {
    tracks: ajv.compile(tracksSchema),
    races: ajv.compile(racesSchema),
    stables: ajv.compile(stablesSchema),
    trainers: ajv.compile(trainersSchema),
    jockeys: ajv.compile(jockeysSchema),
    horses: ajv.compile(horsesSchema),
  };
  return validators;
}

/** Validiert alle Weltdateien gegen ihre JSON-Schemas und prüft Querverweise. */
export function loadWorld(files: RawWorldFiles): WorldData {
  const v = getValidators();
  const problems: string[] = [];
  for (const key of Object.keys(v) as (keyof RawWorldFiles)[]) {
    const validate = v[key];
    if (!validate(files[key])) {
      for (const e of validate.errors ?? []) problems.push(`${key}.json${e.instancePath}: ${e.message ?? 'ungültig'}`);
    }
  }
  if (problems.length) throw new WorldValidationError(problems);

  const tracks = (files.tracks as { tracks: Track[] }).tracks;
  const races = files.races as { features: FeatureRace[]; meetings: MeetingRules; generic: GenericRace[] };
  const stables = (files.stables as { stables: RawStable[] }).stables;
  const trainers = (files.trainers as { trainers: RawTrainer[] }).trainers;
  const jockeys = (files.jockeys as { jockeys: RawJockey[] }).jockeys;
  const horses = (files.horses as { horses: RawHorse[] }).horses;

  // Querverweise und Eindeutigkeit
  const trackIds = new Set(tracks.map((t) => t.id));
  const unique = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${name}: doppelte ID "${id}"`);
      seen.add(id);
    }
  };
  unique('tracks', tracks.map((t) => t.id));
  unique('races.features', races.features.map((f) => f.id));
  unique('stables', stables.map((s) => s.id));
  unique('trainers', trainers.map((t) => t.id));
  unique('jockeys', jockeys.map((j) => j.id));
  unique('horses', horses.map((h) => h.id));
  for (const f of races.features) {
    const t = tracks.find((x) => x.id === f.trackId);
    if (!t) problems.push(`races.features ${f.id}: unbekannte Bahn "${f.trackId}"`);
    else if (!t.surfaces.includes('turf') && !t.surfaces.includes('aw')) problems.push(`races.features ${f.id}: Bahn ohne Belag`);
  }
  for (const id of [...races.meetings.majorTurfRotation, ...races.meetings.minorTurfRotation]) {
    const t = tracks.find((x) => x.id === id);
    if (!t) problems.push(`races.meetings: unbekannte Bahn "${id}"`);
    else if (!t.surfaces.includes('turf')) problems.push(`races.meetings: "${id}" hat keinen Rasen`);
  }
  for (const id of races.meetings.awRotation) {
    const t = tracks.find((x) => x.id === id);
    if (!t) problems.push(`races.meetings: unbekannte Bahn "${id}"`);
    else if (!t.surfaces.includes('aw')) problems.push(`races.meetings: "${id}" hat keine Allwetterbahn`);
  }
  const trainerIds = new Set(trainers.map((t) => t.id));
  for (const s of stables) if (!trainerIds.has(s.trainerId)) problems.push(`stables ${s.id}: unbekannter Trainer "${s.trainerId}"`);
  const stableIds = new Set(stables.map((s) => s.id));
  for (const h of horses) if (!stableIds.has(h.stableId)) problems.push(`horses ${h.id}: unbekannter Stall "${h.stableId}"`);
  void trackIds;
  if (problems.length) throw new WorldValidationError(problems);

  return { tracks, features: races.features, meetings: races.meetings, generic: races.generic, stables, trainers, jockeys, horses };
}
