import type { Rng } from '../rng';
import type { AttrKey, Horse, InjuryType, TrainingBlock } from '../types';
import { ATTR_KEYS } from '../types';
import { ageAt, ceilingAttributes, PHYSICAL } from './maturity';

/**
 * Trainingsbausteine aus dem Konzept. Jeder Baustein trainiert bestimmte Attribute
 * und kostet (oder bringt) Frische. Training verschiebt die aktuellen Werte Richtung
 * Obergrenze (Potenzial × Reifefaktor), nie darüber hinaus.
 */
export interface BlockDef {
  label: string;
  gain: Partial<Record<AttrKey, number>>;
  fitness: number;
  fresh: number;
  /** Belastung für das Verletzungsrisiko (negativ = schonend) */
  load: number;
  intensity: 'niedrig' | 'mittel' | 'hoch' | 'erholend' | '–';
}

export const BLOCKS: Record<TrainingBlock, BlockDef> = {
  rest: { label: 'Ruhetag', gain: {}, fitness: -0.8, fresh: 4, load: 0, intensity: '–' },
  canter: { label: 'Ruhiger Canter', gain: {}, fitness: 1.6, fresh: -1, load: 0.3, intensity: 'niedrig' },
  gallop: { label: 'Galopp-Arbeit', gain: { speed: 1, stamina: 1 }, fitness: 2.6, fresh: -4, load: 1, intensity: 'mittel' },
  hill: { label: 'Bergtraining', gain: { stamina: 1.3, acceleration: 0.5 }, fitness: 3, fresh: -6, load: 1.4, intensity: 'hoch' },
  sprints: { label: 'Sprint-Intervalle', gain: { acceleration: 1, kick: 1.2 }, fitness: 2.2, fresh: -6, load: 1.5, intensity: 'hoch' },
  stalls: { label: 'Startboxtraining', gain: { temperament: 1 }, fitness: 0.3, fresh: -0.5, load: 0.2, intensity: 'niedrig' },
  swim: { label: 'Schwimmen / Weide', gain: {}, fitness: 0.8, fresh: 4, load: -0.6, intensity: 'erholend' },
};

export const TRAINING_TEMPLATES: Record<string, { label: string; plan: TrainingBlock[] }> = {
  normal: { label: 'Normal', plan: ['canter', 'gallop', 'canter', 'sprints', 'canter', 'gallop'] },
  light: { label: 'Leicht', plan: ['canter', 'swim', 'canter', 'gallop', 'canter', 'rest'] },
  hard: { label: 'Hart', plan: ['gallop', 'hill', 'canter', 'sprints', 'gallop', 'hill'] },
  sprint: { label: 'Sprinter', plan: ['canter', 'sprints', 'canter', 'sprints', 'stalls', 'gallop'] },
  stayer: { label: 'Steher', plan: ['canter', 'hill', 'gallop', 'canter', 'hill', 'gallop'] },
  rest: { label: 'Erholung', plan: ['swim', 'rest', 'swim', 'canter', 'swim', 'rest'] },
};

/** Lernrate je Gain-Einheit und Tag (Anteil der Lücke zur Obergrenze). */
const LEARN_RATE = 0.035;
/** Natürliche Erholung pro Woche */
const FRESH_RECOVERY = 16;

export interface WeekTrainingContext {
  season: number;
  week: number;
  weekIndex: number;
  trainerSkill: number;
  /** Rennen in dieser Woche gelaufen (Distanz in m) – ersetzt einen Trainingstag */
  racedDistanceM: number | null;
}

export interface TrainingOutcome {
  injury: { type: InjuryType; weeks: number; leg: number | null } | null;
}

export function weeklyTraining(h: Horse, rng: Rng, ctx: WeekTrainingContext): TrainingOutcome {
  const c = h.condition;
  const age = ageAt(h.foalYear, ctx.season, ctx.week);
  const ceiling = ceilingAttributes(h.potential, h.maturity, age);

  // Verletzt: kein Training, Formverlust, Erholung
  if (c.injury) {
    c.injury.weeksRemaining -= 1;
    c.fitness = Math.max(20, c.fitness - 5);
    c.freshness = Math.min(100, c.freshness + 10);
    if (c.injury.weeksRemaining <= 0) c.injury = null;
    clampToCeiling(h, ceiling);
    return { injury: null };
  }

  const days = [...h.training];
  if (ctx.racedDistanceM !== null) days[5] = 'rest'; // Renntag ersetzt die Samstagsarbeit

  let fitnessGain = 0;
  let freshDelta = FRESH_RECOVERY;
  let load = 0;
  const gains: Partial<Record<AttrKey, number>> = {};
  for (const b of days) {
    const def = BLOCKS[b];
    fitnessGain += def.fitness;
    freshDelta += def.fresh;
    load += def.load;
    for (const [k, v] of Object.entries(def.gain) as [AttrKey, number][]) gains[k] = (gains[k] ?? 0) + v;
  }

  // Fitness nähert sich mit abnehmendem Ertrag 100
  c.fitness = clamp(c.fitness + fitnessGain * (1 - c.fitness / 112) - 2, 10, 100);
  if (ctx.racedDistanceM !== null) {
    c.fitness = clamp(c.fitness + 4, 10, 100);
    freshDelta -= 12 + ctx.racedDistanceM / 200;
    load += 1 + ctx.racedDistanceM / 1600;
  }
  c.freshness = clamp(c.freshness + freshDelta, 0, 100);

  // Attribute Richtung Obergrenze
  const freshEff = c.freshness < 40 ? 0.5 : 1;
  const eff = (0.6 + 0.8 * ctx.trainerSkill) * freshEff;
  for (const k of ATTR_KEYS) {
    const cur = h.current[k];
    const cap = ceiling[k];
    const g = gains[k] ?? 0;
    if (g > 0 && cur < cap) {
      h.current[k] = Math.min(cap, cur + (cap - cur) * LEARN_RATE * g * eff);
    } else if (PHYSICAL.has(k) && g === 0 && cur > cap * 0.9) {
      // ohne Reiz leichter Abbau
      h.current[k] = cur - (cur - cap * 0.9) * 0.02;
    } else if (!PHYSICAL.has(k) && cur < cap) {
      // mentale Reife kommt langsam von selbst
      h.current[k] = Math.min(cap, cur + (cap - cur) * 0.01);
    }
  }
  if (ctx.racedDistanceM !== null) {
    // Rennerfahrung
    for (const k of ['fight', 'agility', 'temperament'] as AttrKey[]) {
      h.current[k] = Math.min(ceiling[k], h.current[k] + (ceiling[k] - h.current[k]) * 0.04);
    }
  }
  clampToCeiling(h, ceiling);
  for (const k of ATTR_KEYS) h.current[k] = Math.round(h.current[k] * 100) / 100;

  // Verletzungsrisiko je Bein (% pro Woche)
  const tired = Math.max(0, 45 - c.freshness) * 0.02;
  const old = Math.max(0, age - 5) * 0.15;
  const base = [0.09, 0.09, 0.06, 0.06];
  c.legRisk = base.map((b) => round2(Math.max(0.05, b + Math.max(-0.1, load) * 0.015 + tired + old))) as [number, number, number, number];

  const injury = rollInjury(rng, c.legRisk, age);
  if (injury) {
    c.injury = { type: injury.type, leg: injury.leg, weeksRemaining: injury.weeks, sinceWeekIndex: ctx.weekIndex };
  }
  return { injury };
}

export function rollInjury(
  rng: Rng,
  legRisk: readonly number[],
  age: number,
): { type: InjuryType; weeks: number; leg: number | null } | null {
  if (rng.chance(0.002)) return { type: 'cough', weeks: rng.int(2, 3), leg: null };
  for (let leg = 0; leg < 4; leg++) {
    if (rng.chance((legRisk[leg] ?? 0) / 100)) {
      const type = rng.weighted<InjuryType>(['sore_shins', 'hoof', 'muscle', 'tendon'], [age < 3 ? 4 : 1, 3, 3, 1.2]);
      const weeks =
        type === 'tendon' ? rng.int(20, 40) : type === 'sore_shins' ? rng.int(3, 6) : type === 'hoof' ? rng.int(2, 5) : rng.int(2, 4);
      return { type, weeks, leg };
    }
  }
  return null;
}

function clampToCeiling(h: Horse, ceiling: Record<AttrKey, number>) {
  for (const k of ATTR_KEYS) if (h.current[k] > ceiling[k]) h.current[k] = ceiling[k];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Formbeschreibung des Trainers aus Fitness und Frische. */
export function formLabel(fitness: number, freshness: number): { label: string; score: number } {
  const score = Math.round(fitness * 0.7 + Math.min(freshness, 80) * 0.375);
  if (score >= 92) return { label: 'in Topform', score };
  if (score >= 84) return { label: 'fast bereit', score };
  if (score >= 74) return { label: 'braucht noch Arbeit', score };
  if (score >= 60) return { label: 'weit von der Form', score };
  return { label: 'nicht rennfähig', score };
}

export const INJURY_LABEL: Record<InjuryType, string> = {
  cough: 'Husten',
  tendon: 'Sehnenschaden',
  hoof: 'Hufprobleme',
  sore_shins: 'Schienbeinschmerzen',
  muscle: 'Muskelzerrung',
};
