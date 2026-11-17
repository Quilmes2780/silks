import type { Going, Surface, Track } from '../types';
import { goingFactor, PHYS } from '../race/physics';
import { simulateRace } from '../race/sim';
import { specialisedAttributes } from '../horse/generate';

/**
 * Speed Figure auf Pfund-Skala (vergleichbar mit dem Official Rating).
 *
 * Standardzeit je Bahn und Distanz = Zeit eines Referenz-Spezialisten der Qualität PAR_QUALITY
 * für genau diese Distanz (9st 0lb, guter Boden bzw. Standard auf Allwetter, allein auf der Bahn).
 * Diese Zeit entspricht der Figure PAR_FIGURE. 1 lb = PHYS.perLb (0,06 %) der Standardzeit.
 * Bereinigt wird um Boden (Bodenfaktor), Distanz und Bahn (Standardzeit) sowie Gewicht (+1 je lb über 126).
 */

export const PAR_QUALITY = 65;
export const PAR_FIGURE = 80;

const stdCache = new Map<string, number>();

const PAR_FIELD_STYLES = ['front', 'prominent', 'prominent', 'midfield', 'midfield', 'midfield', 'held_up', 'held_up', 'prominent', 'midfield'] as const;

/**
 * Standardzeit für Bahn + Distanz auf gutem Boden (bzw. Standard auf Allwetter):
 * mittlere Zeit eines Referenzfelds aus zehn Par-Spezialisten (ohne Zufall).
 * So sind Bogen- und Verkehrsverluste der jeweiligen Bahn bereits enthalten –
 * wie bei empirisch ermittelten Standardzeiten echter Figure-Macher.
 */
export function standardTime(track: Track, surface: Surface, distanceM: number): number {
  const key = `${track.id}|${surface}|${distanceM}`;
  const hit = stdCache.get(key);
  if (hit !== undefined) return hit;
  const out = simulateRace({
    seed: 1,
    distanceM,
    track,
    surface,
    going: surface === 'aw' ? 'standard' : 'good',
    randomness: 0,
    runners: PAR_FIELD_STYLES.map((runStyle, i) => ({
      horseId: `par${i}`,
      attrs: specialisedAttributes(PAR_QUALITY, distanceM),
      prefs: { distOptM: distanceM, distRange: 1, going: 0, direction: 0, runStyle },
      fitness: 100,
      freshness: 100,
      weightLb: PHYS.refWeightLb,
      stall: i + 1,
      tactic: { position: 'natural', attack: 'normal', path: 'normal' },
      jockey: { tactics: 0.75, pace: 0.75, finishing: 0.75 },
    })),
  });
  const t = out.results.reduce((a, r) => a + r.timeS, 0) / out.results.length;
  stdCache.set(key, t);
  return t;
}

const goingCache = new Map<Going, number>();

/**
 * Effektiver Bodenfaktor für die Bereinigung: Bodenfaktor des Modells, gemittelt über die
 * Bodenvorlieben der Population (Vorliebe ~ N(0; 0,45)). Entspricht einer Going Allowance.
 */
export function goingAllowance(going: Going): number {
  const hit = goingCache.get(going);
  if (hit !== undefined) return hit;
  let sum = 0;
  let wsum = 0;
  for (let p = -1; p <= 1.0001; p += 0.05) {
    const w = Math.exp(-(p * p) / (2 * 0.45 * 0.45));
    sum += w * goingFactor({ distOptM: 1600, distRange: 1, going: p, direction: 0, runStyle: 'midfield' }, going);
    wsum += w;
  }
  const v = sum / wsum;
  goingCache.set(going, v);
  return v;
}

export function speedFigure(opts: {
  timeS: number;
  track: Track;
  surface: Surface;
  distanceM: number;
  going: Going;
  weightLb: number;
}): number {
  const st = standardTime(opts.track, opts.surface, opts.distanceM);
  const base = goingAllowance(opts.surface === 'aw' ? 'standard' : 'good');
  const goingAdj = goingAllowance(opts.going) / base;
  // Zeit auf Standardbedingungen umrechnen
  const tAdj = opts.timeS * goingAdj;
  const lbs = (st - tAdj) / (PHYS.perLb * st);
  return Math.round(PAR_FIGURE + lbs + (opts.weightLb - PHYS.refWeightLb));
}

/** Finishing Speed %: Tempo der letzten 400 m relativ zum Durchschnittstempo des ganzen Rennens. */
export function finishingSpeedPct(timeS: number, distanceM: number, timeAt400Out: number): number {
  const avg = distanceM / timeS;
  const last = 400 / (timeS - timeAt400Out);
  return Math.round((last / avg) * 1000) / 10;
}
