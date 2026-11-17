import { Rng } from '../rng';
import { generateHorse } from '../horse/generate';
import type { Horse, Track } from '../types';
import { simulateRace, type SimRunner } from './sim';
import { speedFigure } from '../stats/speedFigure';

/**
 * Benchmark für den Pflichttest: viele Rennen mit realistisch gestreuten Feldern.
 * Favorit = Pferd mit dem höchsten Speed-Figure-Schnitt aus drei Vorstarts.
 */

export interface BenchmarkOptions {
  track: Track;
  distanceM: number;
  races: number;
  randomness: number;
  seed: number;
}

export interface BenchmarkResult {
  distanceM: number;
  races: number;
  winnerTimes: number[];
  favouriteWins: number;
  favouritePlaced: number;
  favouritePositions: number[];
  avgFieldSize: number;
  meanWinnerFigure: number;
  /** Anteil der Siegerzeiten im Zielband */
  inBand: number;
  band: [number, number];
}

export const TIME_BANDS: Record<number, [number, number]> = {
  1200: [71, 74],
  2400: [148, 156],
};

export function benchmarkField(rng: Rng, distanceM: number, season = 2026): Horse[] {
  const n = rng.int(8, 14);
  const raceQ = rng.range(54, 72);
  const horses: Horse[] = [];
  for (let i = 0; i < n; i++) {
    const h = generateHorse(rng, {
      id: `b${i}`,
      name: `Bench ${i}`,
      stableId: 's',
      foalYear: season - 4,
      quality: rng.normal(raceQ, 4.5),
      season,
      week: 26,
      distOptM: Math.round(distanceM * Math.pow(2, rng.normal(0, 0.25))),
    });
    h.condition.fitness = rng.range(78, 100);
    h.condition.freshness = rng.range(70, 100);
    horses.push(h);
  }
  return horses;
}

export function toSimRunners(horses: Horse[], rng: Rng): SimRunner[] {
  const stalls = rng.shuffle(horses.map((_, i) => i + 1));
  return horses.map((h, i) => ({
    horseId: h.id,
    attrs: h.current,
    prefs: h.prefs,
    fitness: h.condition.fitness,
    freshness: h.condition.freshness,
    weightLb: 126,
    stall: stalls[i]!,
    tactic: { position: 'natural', attack: 'normal', path: 'normal' },
    jockey: { tactics: rng.range(0.4, 0.9), pace: rng.range(0.4, 0.9), finishing: rng.range(0.4, 0.9) },
  }));
}

export function runBenchmark(o: BenchmarkOptions): BenchmarkResult {
  const rng = new Rng(o.seed);
  const winnerTimes: number[] = [];
  const favPositions: number[] = [];
  let favWins = 0;
  let favPlaced = 0;
  let fieldSum = 0;
  let winnerFigSum = 0;
  const going = o.track.surfaces.includes('turf') ? 'good' : 'standard';
  const surface = o.track.surfaces.includes('turf') ? 'turf' : 'aw';

  for (let r = 0; r < o.races; r++) {
    const fr = rng.fork('race', r);
    const horses = benchmarkField(fr, o.distanceM);
    fieldSum += horses.length;
    // drei Vorstarts zur Bestimmung des Favoriten
    const figs = horses.map(() => 0);
    for (let k = 0; k < 3; k++) {
      const out = simulateRace({
        seed: fr.fork('prior', k).seed,
        distanceM: o.distanceM,
        track: o.track,
        surface,
        going,
        randomness: o.randomness,
        runners: toSimRunners(horses, fr.fork('stalls', k)),
      });
      out.results.forEach((res, i) => {
        figs[i]! += speedFigure({ timeS: res.timeS, track: o.track, surface, distanceM: o.distanceM, going, weightLb: 126 }) / 3;
      });
    }
    let fav = 0;
    figs.forEach((f, i) => {
      if (f > figs[fav]!) fav = i;
    });
    const out = simulateRace({
      seed: fr.fork('main').seed,
      distanceM: o.distanceM,
      track: o.track,
      surface,
      going,
      randomness: o.randomness,
      runners: toSimRunners(horses, fr.fork('stalls', 'main')),
    });
    const win = out.results[out.order[0]!]!;
    winnerTimes.push(win.timeS);
    winnerFigSum += speedFigure({ timeS: win.timeS, track: o.track, surface, distanceM: o.distanceM, going, weightLb: 126 });
    const favPos = out.results[fav]!.position;
    favPositions.push(favPos);
    if (favPos === 1) favWins++;
    if (favPos <= 3) favPlaced++;
  }
  const band = TIME_BANDS[o.distanceM] ?? [0, Infinity];
  const inBand = winnerTimes.filter((t) => t >= band[0] && t <= band[1]).length / winnerTimes.length;
  return {
    distanceM: o.distanceM,
    races: o.races,
    winnerTimes,
    favouriteWins: favWins,
    favouritePlaced: favPlaced,
    favouritePositions: favPositions,
    avgFieldSize: fieldSum / o.races,
    meanWinnerFigure: winnerFigSum / o.races,
    inBand,
    band,
  };
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

export function quantile(sorted: number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/** Verteilung als Markdown-Tabelle. */
export function benchmarkTable(results: BenchmarkResult[]): string {
  const lines: string[] = [];
  lines.push('| Distanz | Rennen | Ø Feld | Sieger min | P5 | Median | P95 | max | im Band | Favorit Sieg | Favorit Platz (1–3) | Ø Sieger-SF |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const s = [...r.winnerTimes].sort((a, b) => a - b);
    lines.push(
      `| ${r.distanceM} m | ${r.races} | ${r.avgFieldSize.toFixed(1)} | ${formatTime(s[0]!)} | ${formatTime(quantile(s, 0.05))} | ${formatTime(quantile(s, 0.5))} | ${formatTime(quantile(s, 0.95))} | ${formatTime(s[s.length - 1]!)} | ${(r.inBand * 100).toFixed(1)} % | ${((r.favouriteWins / r.races) * 100).toFixed(1)} % | ${((r.favouritePlaced / r.races) * 100).toFixed(1)} % | ${r.meanWinnerFigure.toFixed(1)} |`,
    );
  }
  lines.push('');
  lines.push('Siegerzeiten-Histogramm:');
  for (const r of results) {
    const s = [...r.winnerTimes].sort((a, b) => a - b);
    const lo = Math.floor(s[0]!);
    const hi = Math.ceil(s[s.length - 1]!);
    const step = r.distanceM >= 2000 ? 2 : 1;
    lines.push(`${r.distanceM} m:`);
    for (let b = lo; b < hi; b += step) {
      const c = s.filter((t) => t >= b && t < b + step).length;
      lines.push(`  ${formatTime(b)}–${formatTime(b + step)} ${'#'.repeat(Math.ceil(c / 10))} ${c}`);
    }
  }
  return lines.join('\n');
}
