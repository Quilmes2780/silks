import type { Attributes, Going, Preferences, Track } from '../types';

/**
 * Leistungsmodell nach dem "Critical Speed"-Prinzip:
 *  - CS (kritische Geschwindigkeit, aerob) – kann beliebig lange gehalten werden.
 *  - W  (anaerober Vorrat in Metern) – wird verbraucht, solange v > CS: dW = (v − CS)·dt.
 *  - K  (Speedreserve, "Kick") – zusätzlicher Vorrat, erst im Endkampf freigegeben.
 *  - vTop – absolute Spitzengeschwindigkeit.
 * Optimales Tempo bei Restdistanz R: v = CS / (1 − W/R). Damit entstehen
 * Distanzspezialisten, einbrechende Frontläufer und aufkommende Schlussläufer.
 */

export const PHYS = {
  csBase: 13.85,
  csPerStamina: 1.2,
  wBase: 115.25,
  wPerSpeed: 35,
  kBase: 36.25,
  kPerKick: 15,
  vTopBase: 15.72,
  vTopPerSpeed: 2.2,
  /** Startbeschleunigung (m/s²) */
  aStartBase: 4.0,
  aStartPerAcc: 3.5,
  /** Beschleunigung im Rennen (m/s²) */
  aRaceBase: 0.5,
  aRacePerAcc: 1.3,
  /** Zeitanteil je lb Gewicht */
  perLb: 0.0006,
  refWeightLb: 126,
  /** Abschlag bei doppelter/halber Wunschdistanz */
  distPenalty: 0.018,
  fitnessPerPoint: 0.0005,
  freshnessPerPoint: 0.0004,
  /** Tagesform-Streuung bei randomness = 1 und Konstanz 0 */
  dayFormSigma: 0.029,
};

export const GOING_SPEED: Record<Going, number> = {
  firm: 1.01,
  good_to_firm: 1.005,
  good: 1.0,
  good_to_soft: 0.99,
  soft: 0.976,
  heavy: 0.955,
  standard: 0.997,
  standard_to_slow: 0.986,
};

/** Bodenwert für die Vorliebe: −1 fest … +1 schwer */
export const GOING_VALUE: Record<Going, number> = {
  firm: -1,
  good_to_firm: -0.5,
  good: 0,
  good_to_soft: 0.35,
  soft: 0.7,
  heavy: 1,
  standard: 0,
  standard_to_slow: 0.3,
};

export const GRADIENT_FACTOR: Record<Track['gradient'], number> = {
  flat: 1.0,
  undulating: 0.995,
  stiff: 0.99,
  downhill: 1.003,
};

export const BEND_TIGHTNESS: Record<Track['bends'], number> = {
  tight: 1,
  normal: 0.5,
  galloping: 0.2,
};

export interface DerivedParams {
  cs: number;
  w0: number;
  k0: number;
  vTop: number;
  aStart: number;
  aRace: number;
  /** Multiplikator auf Zielgeschwindigkeit in Bögen */
  bendFactor: number;
}

export interface Modifiers {
  dayForm: number;
  fitness: number;
  freshness: number;
  weightLb: number;
  going: Going;
  distanceM: number;
  track: Track;
}

export function distanceFactor(prefs: Preferences, distanceM: number): number {
  const x = Math.log2(distanceM / prefs.distOptM) / Math.max(0.3, prefs.distRange);
  return 1 - PHYS.distPenalty * Math.min(2.5, x * x);
}

export function goingFactor(prefs: Preferences, going: Going): number {
  const g = GOING_VALUE[going];
  const isAw = going === 'standard' || going === 'standard_to_slow';
  const mismatch = Math.max(0, Math.abs(prefs.going - g) - 0.25) * (isAw ? 0.4 : 1);
  return GOING_SPEED[going] * (1 - 0.009 * mismatch);
}

export function deriveParams(a: Attributes, prefs: Preferences, m: Modifiers): DerivedParams {
  const sp = a.speed / 100;
  const st = a.stamina / 100;
  const kk = a.kick / 100;
  const ac = a.acceleration / 100;
  const ag = a.agility / 100;

  const form =
    (1 + m.dayForm) *
    (1 - PHYS.fitnessPerPoint * Math.max(0, 100 - m.fitness)) *
    (1 - PHYS.freshnessPerPoint * Math.max(0, 60 - m.freshness)) *
    (1 - PHYS.perLb * (m.weightLb - PHYS.refWeightLb)) *
    goingFactor(prefs, m.going) *
    GRADIENT_FACTOR[m.track.gradient];

  const cs = (PHYS.csBase + PHYS.csPerStamina * st) * form * distanceFactor(prefs, m.distanceM);
  const vTop = (PHYS.vTopBase + PHYS.vTopPerSpeed * sp) * form;
  const w0 = (PHYS.wBase + PHYS.wPerSpeed * sp) * (1 + m.dayForm * 2);
  const k0 = PHYS.kBase + PHYS.kPerKick * kk;

  const dirMismatch =
    m.track.direction === 'left' ? Math.max(0, prefs.direction) : Math.max(0, -prefs.direction);
  const tight = BEND_TIGHTNESS[m.track.bends];
  const bendFactor = (1 - tight * (0.03 - 0.022 * ag)) * (1 - 0.006 * dirMismatch);

  return {
    cs,
    w0,
    k0,
    vTop,
    aStart: PHYS.aStartBase + PHYS.aStartPerAcc * ac,
    aRace: PHYS.aRaceBase + PHYS.aRacePerAcc * ac,
    bendFactor,
  };
}
