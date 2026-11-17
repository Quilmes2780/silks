import { describe, expect, it } from 'vitest';
import tracksJson from '../../../data/world/tracks.json';
import { Rng } from '../rng';
import { generateHorse, specialisedAttributes } from '../horse/generate';
import type { Track } from '../types';
import { benchmarkField, benchmarkTable, runBenchmark, toSimRunners } from './benchmark';
import { buildCourse, pointOnCourse } from './geometry';
import { sectionalMarks, simulateRace, type SimRunner } from './sim';

const tracks = tracksJson.tracks as Track[];
const newbury = tracks.find((t) => t.id === 'newbury')!;
const chester = tracks.find((t) => t.id === 'chester')!;

function field(seed: number, distanceM: number) {
  const rng = new Rng(seed);
  const horses = benchmarkField(rng, distanceM);
  return { horses, runners: toSimRunners(horses, rng) };
}

describe('Bahngeometrie', () => {
  it('Sprint auf gerader Bahn, Langstrecke auf dem Oval', () => {
    expect(buildCourse(newbury, 1200).straight).toBe(true);
    const c = buildCourse(newbury, 2400);
    expect(c.straight).toBe(false);
    expect(c.segments.reduce((a, s) => a + s.lengthM, 0)).toBeCloseTo(2400, 5);
    expect(c.segments[c.segments.length - 1]!.kind).toBe('straight');
  });

  it('Ziel liegt im Ursprung, Zielrichtung +x', () => {
    const c = buildCourse(chester, 2000);
    const p = pointOnCourse(c, 2000, 0);
    expect(Math.abs(p.x)).toBeLessThan(1e-6);
    expect(Math.abs(p.y)).toBeLessThan(1e-6);
    const q = pointOnCourse(c, 1990, 0);
    expect(q.x).toBeLessThan(0);
  });

  it('Sectional-Messpunkte alle 200 m vom Ziel rückwärts', () => {
    expect(sectionalMarks(1200)).toEqual([200, 400, 600, 800, 1000, 1200]);
    expect(sectionalMarks(1207)).toEqual([7, 207, 407, 607, 807, 1007, 1207]);
  });
});

describe('Rennsimulation', () => {
  it('ist deterministisch: gleicher Seed + gleiche Eingaben = gleiches Ergebnis', () => {
    const { runners } = field(5, 1600);
    const input = { seed: 123, distanceM: 1600, track: newbury, surface: 'turf' as const, going: 'good' as const, randomness: 0.4, runners };
    const a = simulateRace(input);
    const b = simulateRace(input);
    expect(a.order).toEqual(b.order);
    expect(a.results.map((r) => r.timeS)).toEqual(b.results.map((r) => r.timeS));
    const c = simulateRace({ ...input, seed: 124 });
    expect(c.results.map((r) => r.timeS)).not.toEqual(a.results.map((r) => r.timeS));
  });

  it('liefert vollständige Rohdaten je Starter', () => {
    const { runners } = field(8, 2400);
    const out = simulateRace({ seed: 1, distanceM: 2400, track: newbury, surface: 'turf', going: 'good', randomness: 0.4, runners, record: true });
    const positions = out.results.map((r) => r.position).sort((a, b) => a - b);
    expect(positions).toEqual(runners.map((_, i) => i + 1));
    for (const r of out.results) {
      expect(r.sectionals).toHaveLength(12);
      expect(r.sectionals[r.sectionals.length - 1]!.cumS).toBeCloseTo(r.timeS, 1);
      expect(r.speedCurve.length).toBe(48);
      expect(r.distanceRunM).toBeGreaterThanOrEqual(2400);
      expect(r.topSpeed).toBeGreaterThan(14);
      expect(r.topSpeed).toBeLessThan(20);
      if (r.position === 1) expect(r.beatenL).toBe(0);
      else expect(r.beatenL).toBeGreaterThanOrEqual(0);
    }
    // Sieger führt im letzten Messpunkt
    const winner = out.results[out.order[0]!]!;
    expect(winner.sectionals.at(-1)!.position).toBe(1);
    expect(out.frames!.length).toBeGreaterThan(100);
  });

  it('weicher Boden macht langsamer, mehr Gewicht macht langsamer', () => {
    const { runners } = field(11, 1600);
    const base = { seed: 9, distanceM: 1600, track: newbury, surface: 'turf' as const, randomness: 0, runners };
    const good = simulateRace({ ...base, going: 'good' });
    const soft = simulateRace({ ...base, going: 'soft' });
    expect(soft.results[soft.order[0]!]!.timeS).toBeGreaterThan(good.results[good.order[0]!]!.timeS + 1);
    const heavy = simulateRace({ ...base, going: 'good', runners: runners.map((r) => ({ ...r, weightLb: r.weightLb + 14 })) });
    expect(heavy.results[heavy.order[0]!]!.timeS).toBeGreaterThan(good.results[good.order[0]!]!.timeS);
  });

  it('Sprinter schlagen Steher über 1.000 m, Steher gewinnen über 3.200 m', () => {
    const rng = new Rng(77);
    let sprinterWinsShort = 0;
    let stayerWinsLong = 0;
    const trials = 40;
    for (let k = 0; k < trials; k++) {
      const make = (opt: number, id: string) =>
        generateHorse(rng, { id, name: id, stableId: 's', foalYear: 2022, quality: 65, season: 2026, week: 26, distOptM: opt });
      const horses = [make(1000, 'sprinter'), make(3200, 'stayer')];
      for (const [d, track] of [[1000, newbury], [3200, newbury]] as const) {
        const out = simulateRace({ seed: k, distanceM: d, track, surface: 'turf', going: 'good', randomness: 0.2, runners: toSimRunners(horses, rng) });
        const winner = out.results[out.order[0]!]!.horseId;
        if (d === 1000 && winner === 'sprinter') sprinterWinsShort++;
        if (d === 3200 && winner === 'stayer') stayerWinsLong++;
      }
    }
    expect(sprinterWinsShort / trials).toBeGreaterThan(0.55);
    expect(stayerWinsLong / trials).toBeGreaterThan(0.55);
  });

  function evenField(rng: Rng, strongBonus: number): SimRunner[] {
    const styles = ['front', 'prominent', 'midfield', 'held_up'] as const;
    const stalls = rng.shuffle(Array.from({ length: 10 }, (_, i) => i + 1));
    return stalls.map((stall, i) => ({
      horseId: `h${i}`,
      attrs: specialisedAttributes(65 + (i === 0 ? strongBonus : 0), 1600),
      prefs: { distOptM: 1600, distRange: 1, going: 0, direction: 0, runStyle: styles[i % 4]! },
      fitness: 95,
      freshness: 90,
      weightLb: 126,
      stall,
      tactic: { position: 'natural', attack: 'normal', path: 'normal' },
      jockey: { tactics: 0.7, pace: 0.7, finishing: 0.7 },
    }));
  }

  it('randomness 0: das klar bessere Pferd gewinnt fast immer', () => {
    const rng = new Rng(2024);
    let wins = 0;
    for (let k = 0; k < 30; k++) {
      const out = simulateRace({ seed: k, distanceM: 1600, track: newbury, surface: 'turf', going: 'good', randomness: 0, runners: evenField(rng, 10) });
      if (out.results[0]!.position === 1) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(27);
  });

  it('mehr randomness führt zu mehr Überraschungen', () => {
    const rate = (randomness: number) => {
      const rng = new Rng(55);
      let wins = 0;
      for (let k = 0; k < 150; k++) {
        const out = simulateRace({ seed: k, distanceM: 1600, track: newbury, surface: 'turf', going: 'good', randomness, runners: evenField(rng, 4) });
        if (out.results[0]!.position === 1) wins++;
      }
      return wins / 150;
    };
    const low = rate(0.1);
    const high = rate(1);
    expect(low).toBeGreaterThan(high + 0.15);
  });
});

describe('Pflichttest: 1.000 Rennen über 1.200 m und 2.400 m', () => {
  it('liefert plausible Siegerzeiten und Favoritenquoten bei randomness 0,4', () => {
    const results = [1200, 2400].map((d) =>
      runBenchmark({ track: newbury, distanceM: d, races: 1000, randomness: 0.4, seed: 20261117 }),
    );
    console.log(`\nPflichttest (Bahn ${newbury.name}, guter Boden, randomness 0,4)\n` + benchmarkTable(results));
    for (const r of results) {
      const sorted = [...r.winnerTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      expect(median).toBeGreaterThanOrEqual(r.band[0]);
      expect(median).toBeLessThanOrEqual(r.band[1]);
      expect(r.inBand).toBeGreaterThan(0.8);
      const favRate = r.favouriteWins / r.races;
      expect(favRate).toBeGreaterThanOrEqual(0.25);
      expect(favRate).toBeLessThanOrEqual(0.4);
    }
  });
});
