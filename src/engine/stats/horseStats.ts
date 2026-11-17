import type { ConditionCell, Going, HorseStats, Run } from '../types';

/** Distanzgruppen in britischer Notation. */
export const DIST_BUCKETS: Array<{ key: string; max: number }> = [
  { key: '5f', max: 1100 },
  { key: '6f', max: 1300 },
  { key: '7f', max: 1500 },
  { key: '1m', max: 1750 },
  { key: '9–10f', max: 2150 },
  { key: '11–12f', max: 2550 },
  { key: '13–14f', max: 2950 },
  { key: '15f+', max: Infinity },
];

export const GOING_GROUPS = ['Fest', 'Gut', 'Gut–weich', 'Weich', 'Allwetter'] as const;

export function distBucket(m: number): string {
  return DIST_BUCKETS.find((b) => m <= b.max)!.key;
}

export function goingGroup(g: Going): string {
  switch (g) {
    case 'firm':
    case 'good_to_firm':
      return 'Fest';
    case 'good':
      return 'Gut';
    case 'good_to_soft':
      return 'Gut–weich';
    case 'soft':
    case 'heavy':
      return 'Weich';
    default:
      return 'Allwetter';
  }
}

export function stallBucket(stall: number, field: number): string {
  const f = field <= 1 ? 0 : (stall - 1) / (field - 1);
  return f < 0.34 ? 'innen' : f < 0.67 ? 'Mitte' : 'außen';
}

export function layoffBucket(days: number | null): string {
  if (days === null) return 'Debüt';
  if (days <= 14) return '≤ 14 Tage';
  if (days <= 35) return '15–35 Tage';
  if (days <= 90) return '36–90 Tage';
  return '> 90 Tage';
}

export function emptyStats(): HorseStats {
  return {
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    earnings: 0,
    lastFigures: [],
    bestFigure: null,
    figureSd: null,
    consistencyIndex: null,
    formTrend: null,
    avgFinishingSpeed: null,
    strikeByClass: {},
    byDistance: {},
    byGoing: {},
    bySurface: {},
    byTrack: {},
    byStall: {},
    byJockey: {},
    byLayoff: {},
    heatmap: {},
  };
}

function addCell(map: Record<string, ConditionCell>, key: string, run: Run) {
  const c = map[key] ?? { n: 0, meanFigure: 0, bestFigure: -Infinity, wins: 0, runIds: [] };
  c.meanFigure = (c.meanFigure * c.n + run.speedFigure) / (c.n + 1);
  c.n += 1;
  c.bestFigure = Math.max(c.bestFigure, run.speedFigure);
  if (run.position === 1) c.wins += 1;
  c.runIds.push(run.id);
  map[key] = c;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Lineare Regression: Steigung von y über den Index. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xm) * (y - ym);
    den += (i - xm) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

/**
 * Berechnet alle Kennzahlen eines Pferds aus seinen Starts (chronologisch).
 * Wird beim Rennabschluss aufgerufen und gespeichert, nicht bei jedem Seitenaufruf.
 */
export function computeHorseStats(runs: Run[]): HorseStats {
  const s = emptyStats();
  for (const r of runs) {
    s.starts++;
    if (r.position === 1) s.wins++;
    if (r.position === 2) s.seconds++;
    if (r.position === 3) s.thirds++;
    s.earnings += r.prize;
    const sr = s.strikeByClass[r.raceClass] ?? { starts: 0, wins: 0, places: 0 };
    sr.starts++;
    if (r.position === 1) sr.wins++;
    if (r.position <= 3) sr.places++;
    s.strikeByClass[r.raceClass] = sr;
    if (!s.bestFigure || r.speedFigure > s.bestFigure.value) s.bestFigure = { value: r.speedFigure, runId: r.id };
    const db = distBucket(r.distanceM);
    const gg = goingGroup(r.going);
    addCell(s.byDistance, db, r);
    addCell(s.byGoing, gg, r);
    addCell(s.bySurface, r.surface, r);
    addCell(s.byTrack, r.trackId, r);
    addCell(s.byStall, stallBucket(r.stall, r.fieldSize), r);
    addCell(s.byJockey, r.jockeyId, r);
    addCell(s.byLayoff, layoffBucket(r.daysSinceLastRun), r);
    addCell(s.heatmap, `${db}|${gg}`, r);
  }
  const last = runs.slice(-10);
  s.lastFigures = last.map((r) => ({ value: r.speedFigure, runId: r.id }));
  if (last.length >= 3) {
    const figs = last.map((r) => r.speedFigure);
    s.figureSd = Math.round(stdDev(figs) * 10) / 10;
    // Konstanz-Index: 100 bei SD 0, 0 bei SD ≥ 25 lb
    s.consistencyIndex = Math.round(Math.max(0, 100 - s.figureSd * 4));
    s.formTrend = Math.round(slope(figs) * 10) / 10;
  }
  const fs = runs.filter((r) => Number.isFinite(r.finishingSpeedPct)).map((r) => r.finishingSpeedPct);
  if (fs.length) s.avgFinishingSpeed = Math.round(mean(fs) * 10) / 10;
  return s;
}

export function strikeRate(wins: number, starts: number): number {
  return starts === 0 ? 0 : Math.round((wins / starts) * 1000) / 10;
}
