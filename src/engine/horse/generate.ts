import type { Rng } from '../rng';
import type { Attributes, Colour, Horse, Markings, Maturity, Preferences, RunStyle, Sex, TrainingPlan } from '../types';
import { ATTR_KEYS } from '../types';
import { ageAt, ceilingAttributes, PEAK_AGE } from './maturity';
import { emptyStats } from '../stats/horseStats';

export interface GenerateHorseOptions {
  id: string;
  name: string;
  stableId: string;
  foalYear: number;
  /** Mittleres Leistungsniveau des Potenzials (Attributskala) */
  quality: number;
  season: number;
  week: number;
  sex?: Sex;
  /** Wie weit das Pferd bereits trainiert ist (0–1 Anteil der Obergrenze) */
  trainedLevel?: number;
  distOptM?: number;
}

export const DEFAULT_TRAINING: TrainingPlan = ['canter', 'gallop', 'canter', 'sprints', 'canter', 'gallop'];

const clampAttr = (x: number) => Math.max(5, Math.min(99, x));

export function generatePreferences(rng: Rng, distOptM?: number): Preferences {
  // Log-normal um 1.600 m, 1.000–3.400 m
  const opt = distOptM ?? Math.round(Math.min(3400, Math.max(1000, 1600 * Math.pow(2, rng.normal(0.05, 0.42)))) / 50) * 50;
  const going = Math.max(-1, Math.min(1, rng.normal(0, 0.45)));
  const direction = rng.chance(0.65) ? 0 : Math.max(-1, Math.min(1, rng.normal(0, 0.6)));
  return {
    distOptM: opt,
    distRange: Math.max(0.6, Math.min(1.6, rng.normal(1, 0.18))),
    going: Math.round(going * 100) / 100,
    direction: Math.round(direction * 100) / 100,
    runStyle: 'midfield',
  };
}

/** Spezialisierungs-Koeffizienten je Verdopplung der Distanz über 1.600 m. */
export const SPECIALISATION = { speed: -10, acceleration: -7, stamina: 13, kick: 0 };

/**
 * Leistungsattribute eines "idealen" Spezialisten der Qualität q für die Distanz distOptM
 * (ohne Zufall). Dient auch als Referenzpferd für die Standardzeiten der Speed Figure.
 */
export function specialisedAttributes(q: number, distOptM: number): Attributes {
  const s = Math.log2(distOptM / 1600);
  return {
    speed: q + SPECIALISATION.speed * s,
    acceleration: q + SPECIALISATION.acceleration * s,
    stamina: q + SPECIALISATION.stamina * s,
    kick: q + SPECIALISATION.kick * s,
    fight: 55,
    agility: 55,
    temperament: 58,
    consistency: 58,
  };
}

/** Potenzial aus Qualität und Distanzspezialisierung. */
export function generatePotential(rng: Rng, quality: number, distOptM: number): Attributes {
  const base = specialisedAttributes(quality, distOptM);
  return {
    speed: clampAttr(base.speed + rng.normal(0, 5)),
    acceleration: clampAttr(base.acceleration + rng.normal(0, 7)),
    stamina: clampAttr(base.stamina + rng.normal(0, 5)),
    kick: clampAttr(base.kick + rng.normal(0, 7)),
    fight: clampAttr(rng.normal(55, 15)),
    agility: clampAttr(rng.normal(55, 14)),
    temperament: clampAttr(rng.normal(58, 16)),
    consistency: clampAttr(rng.normal(58, 15)),
  };
}

export function deriveRunStyle(a: Attributes, rng: Rng): RunStyle {
  const score = (a.acceleration - a.kick) / 10 + (a.speed - a.stamina) / 25 + rng.normal(0, 0.9);
  if (score > 1.1) return 'front';
  if (score > 0.2) return 'prominent';
  if (score > -0.8) return 'midfield';
  return 'held_up';
}

export function generateMaturity(rng: Rng, distOptM: number): Maturity {
  // Sprinter tendenziell frühreif, Steher spät
  const s = Math.log2(distOptM / 1600);
  const type = rng.weighted<Maturity['type']>(['early', 'normal', 'late'], [Math.max(0.1, 0.35 - 0.3 * s), 0.45, Math.max(0.1, 0.2 + 0.3 * s)]);
  return { type, peakAge: Math.round((PEAK_AGE[type] + rng.normal(0, 0.2)) * 10) / 10 };
}

export function generateColour(rng: Rng): Colour {
  return rng.weighted<Colour>(['bay', 'chestnut', 'brown', 'grey', 'black'], [45, 25, 17, 9, 4]);
}

export function generateMarkings(rng: Rng): Markings {
  const face = rng.weighted<Markings['face']>(['none', 'star', 'blaze', 'stripe'], [35, 30, 20, 15]);
  return { face, socks: [rng.chance(0.2), rng.chance(0.2), rng.chance(0.3), rng.chance(0.3)] };
}

export function generateHorse(rng: Rng, o: GenerateHorseOptions): Horse {
  const prefs = generatePreferences(rng, o.distOptM);
  const potential = generatePotential(rng, o.quality, prefs.distOptM);
  prefs.runStyle = deriveRunStyle(potential, rng);
  const maturity = generateMaturity(rng, prefs.distOptM);
  const sex: Sex = o.sex ?? (rng.chance(0.5) ? 'male' : 'female');
  const age = ageAt(o.foalYear, o.season, o.week);
  const ceiling = ceilingAttributes(potential, maturity, age);
  const trained = o.trainedLevel ?? rng.range(0.93, 0.99);
  const current = {} as Attributes;
  const estimateNoise = {} as Attributes;
  for (const k of ATTR_KEYS) {
    current[k] = Math.round(ceiling[k] * trained * 10) / 10;
    estimateNoise[k] = Math.round(rng.normal(0, 1) * 100) / 100;
  }
  for (const k of ATTR_KEYS) potential[k] = Math.round(potential[k] * 10) / 10;
  const gelded = sex === 'male' && age >= 3 && rng.chance(0.35);
  return {
    id: o.id,
    name: o.name,
    sex,
    gelded,
    foalYear: o.foalYear,
    colour: generateColour(rng),
    markings: generateMarkings(rng),
    sireId: null,
    damId: null,
    sireName: null,
    damName: null,
    genotype: null,
    breederId: null,
    stableId: o.stableId,
    status: 'active',
    potential,
    current,
    prefs,
    maturity,
    condition: {
      fitness: Math.round(rng.range(70, 92)),
      freshness: Math.round(rng.range(80, 100)),
      legRisk: [0.3, 0.3, 0.2, 0.2],
      injury: null,
    },
    training: [...DEFAULT_TRAINING] as TrainingPlan,
    officialRating: null,
    ratingHistory: [],
    lastRunWeekIndex: null,
    runIds: [],
    preRecord: { starts: 0, wins: 0, places: 0, earnings: 0 },
    stats: emptyStats(),
    estimateNoise,
    value: null,
    source: 'generated',
    placeholder: false,
  };
}
