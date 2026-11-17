import type { Horse, RaceTemplate } from '../types';

/**
 * Startberechtigung und Gewichte nach britischem Muster (vereinfacht).
 */

export const TOP_WEIGHT_HCP = 136; // 9st 10lb
export const MIN_WEIGHT = 112; // 8st 0lb
export const FILLIES_ALLOWANCE = 3;

export function ageInSeason(h: Horse, season: number): number {
  return season - h.foalYear;
}

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

export function checkEligibility(h: Horse, t: RaceTemplate, season: number): Eligibility {
  if (h.status !== 'active') return { ok: false, reason: 'nicht im Training' };
  const age = ageInSeason(h, season);
  const c = t.conditions;
  if (age < c.ageMin || (c.ageMax !== null && age > c.ageMax)) return { ok: false, reason: 'Alter passt nicht' };
  if (c.sex === 'fillies' && h.sex !== 'female') return { ok: false, reason: 'nur Stuten' };
  if (c.sex === 'colts_geldings' && h.sex !== 'male') return { ok: false, reason: 'nur Hengste und Wallache' };
  if (c.sex === 'colts_fillies' && h.gelded) return { ok: false, reason: 'keine Wallache' };
  if (c.orMin !== null || c.orMax !== null) {
    if (h.officialRating === null) return { ok: false, reason: 'braucht ein Official Rating (3 Starts)' };
    if (c.orMin !== null && h.officialRating < c.orMin) return { ok: false, reason: `OR unter ${c.orMin}` };
    if (c.orMax !== null && h.officialRating > c.orMax) return { ok: false, reason: `OR über ${c.orMax}` };
  }
  const wins = h.stats.wins + h.preRecord.wins;
  if (c.maidenOnly && wins > 0) return { ok: false, reason: 'nur sieglose Pferde (Maiden)' };
  if (c.maxWins !== null && wins > c.maxWins) return { ok: false, reason: `höchstens ${c.maxWins} Sieg(e)` };
  return { ok: true };
}

/** Weight-for-Age: Erlaubnis für Dreijährige gegenüber Älteren (lb). */
export function wfa3(distanceM: number, week: number): number {
  const d = Math.max(0, Math.min(1.6, Math.log2(distanceM / 1200)));
  return Math.round(Math.max(0, (9 + 6 * d) * (1 - (week - 8) / 52)));
}

/** Weight-for-Age: Erlaubnis für Zweijährige gegenüber Älteren (lb). */
export function wfa2(week: number): number {
  return Math.round(Math.max(12, 36 - week * 0.35));
}

/** Grundgewicht für Nicht-Handicaps. */
function baseWeight(t: RaceTemplate): number {
  const c = t.conditions;
  if (c.ageMax === 2) return 128; // 9st 2lb
  if (c.ageMin === 3 && c.ageMax === 3) return 128;
  if (t.raceClass === 'Maiden' || t.raceClass === 'Novice') return 131;
  return 133; // 9st 7lb
}

/**
 * Gewichte für alle Starter.
 * Handicap: Höchstbewerteter trägt 9st 10lb, jeder OR-Punkt weniger = 1 lb weniger, Minimum 8st 0lb.
 * Sonst: Grundgewicht minus WFA und Stutenerlaubnis.
 */
export function assignWeights(t: RaceTemplate, horses: Horse[], season: number): number[] {
  const isHcp = t.raceClass === 'Handicap' || t.raceClass === 'Heritage';
  if (isHcp) {
    const top = Math.max(...horses.map((h) => h.officialRating ?? 0));
    return horses.map((h) => Math.max(MIN_WEIGHT, TOP_WEIGHT_HCP - (top - (h.officialRating ?? 0))));
  }
  const base = baseWeight(t);
  const mixedAge = t.conditions.ageMax === null || t.conditions.ageMax > t.conditions.ageMin;
  return horses.map((h) => {
    let w = base;
    const age = ageInSeason(h, season);
    if (mixedAge && age === 3) w -= wfa3(t.distanceM, t.week);
    if (mixedAge && age === 2) w -= wfa2(t.week);
    if (t.conditions.sex !== 'fillies' && h.sex === 'female') w -= FILLIES_ALLOWANCE;
    return Math.max(MIN_WEIGHT - 4, w);
  });
}

/** Gewicht in Stones und Pfund, z. B. 9-7. */
export function formatWeight(lb: number): string {
  return `${Math.floor(lb / 14)}-${lb % 14}`;
}

/** Leistungsniveau eines Rennens auf der Rating-Skala (für KI und Empfehlungen). */
export function raceLevel(t: RaceTemplate): number {
  const c = t.conditions;
  const juvenile = c.ageMax === 2;
  const threeOnly = c.ageMin === 3 && c.ageMax === 3;
  const base = (() => {
    switch (t.raceClass) {
      case 'G1':
        return 104;
      case 'G2':
        return 98;
      case 'G3':
        return 93;
      case 'Listed':
        return 88;
      case 'Conditions':
        return 82;
      case 'Heritage':
      case 'Handicap':
        return ((c.orMin ?? 40) + (c.orMax ?? 100)) / 2;
      case 'Novice':
        return 70;
      case 'Maiden':
        return 62;
      case 'Claiming':
        return 58;
    }
  })();
  // Altersbeschränkte Rennen: die Jüngeren sind physisch noch nicht ausgereift
  const isHcp = t.raceClass === 'Handicap' || t.raceClass === 'Heritage';
  if (isHcp) return base;
  return juvenile ? base - 16 : threeOnly ? base - 6 : base;
}
