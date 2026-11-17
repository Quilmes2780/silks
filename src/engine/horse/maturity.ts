import type { AttrKey, Attributes, Maturity } from '../types';
import { ATTR_KEYS } from '../types';

/** Physische Attribute folgen voll der Reifekurve, mentale nur abgeschwächt. */
export const PHYSICAL: ReadonlySet<AttrKey> = new Set(['speed', 'acceleration', 'stamina', 'kick']);

export const PEAK_AGE: Record<Maturity['type'], number> = { early: 2.9, normal: 3.9, late: 4.8 };
/** Reifegrad im Alter von 2,0 Jahren */
const START_LEVEL: Record<Maturity['type'], number> = { early: 0.93, normal: 0.885, late: 0.84 };

/**
 * Reifefaktor (0–1) der physischen Attribute in Abhängigkeit vom Alter (Jahre, dezimal).
 * Anstieg bis zum Höhepunkt, ein Jahr Plateau, danach Abbau von ca. 3 % pro Jahr.
 */
export function maturityFactor(m: Maturity, age: number): number {
  const start = START_LEVEL[m.type];
  if (age <= 2) return start - (2 - age) * 0.08;
  if (age < m.peakAge) {
    const f = (age - 2) / (m.peakAge - 2);
    // weiche S-Kurve
    const s = f * f * (3 - 2 * f);
    return start + (1 - start) * s;
  }
  if (age < m.peakAge + 1) return 1;
  return Math.max(0.75, 1 - 0.03 * (age - m.peakAge - 1));
}

/** Aktuelle Obergrenze je Attribut: Potenzial × Reifefaktor. */
export function ceilingAttributes(potential: Attributes, m: Maturity, age: number): Attributes {
  const f = maturityFactor(m, age);
  const mental = 1 - (1 - f) * 0.35;
  const out = {} as Attributes;
  for (const k of ATTR_KEYS) out[k] = potential[k] * (PHYSICAL.has(k) ? f : mental);
  return out;
}

/** Dezimalalter nach britischer Konvention (Geburtstag 1. Januar). */
export function ageAt(foalYear: number, season: number, week: number): number {
  return season - foalYear + (week - 1) / 52;
}
