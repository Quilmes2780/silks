import type { Going, Surface, Track } from '../types';
import { GOING_SPEED, PHYS } from '../race/physics';
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
    runners: [
      {
        horseId: 'par',
        attrs: specialisedAttributes(PAR_QUALITY, distanceM),
        prefs: { distOptM: distanceM, distRange: 1, going: 0, direction: 0, runStyle: 'prominent' },
        fitness: 100,
        freshness: 100,
        weightLb: PHYS.refWeightLb,
        stall: 1,
        tactic: { position: 'natural', attack: 'normal', path: 'rails' },
        jockey: { tactics: 0.75, pace: 0.75, finishing: 0.75 },
      },
    ],
  });
  const t = out.results[0]!.timeS;
  stdCache.set(key, t);
  return t;
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
  const base = opts.surface === 'aw' ? GOING_SPEED.standard : GOING_SPEED.good;
  const goingAdj = GOING_SPEED[opts.going] / base;
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
