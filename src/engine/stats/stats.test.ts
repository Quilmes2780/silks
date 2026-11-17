import { describe, expect, it } from 'vitest';
import tracksJson from '../../../data/world/tracks.json';
import { specialisedAttributes } from '../horse/generate';
import { simulateRace } from '../race/sim';
import type { Run, Track } from '../types';
import { computeHorseStats, distBucket, goingGroup } from './horseStats';
import { updateRating } from './rating';
import { finishingSpeedPct, PAR_FIGURE, speedFigure, standardTime } from './speedFigure';

const tracks = tracksJson.tracks as Track[];
const newbury = tracks.find((t) => t.id === 'newbury')!;
const york = tracks.find((t) => t.id === 'york')!;

function run(partial: Partial<Run>, i: number): Run {
  return {
    id: `r${i}`,
    raceId: `race${i}`,
    templateId: `t${i}`,
    raceName: 'Test',
    horseId: 'h',
    stableId: 's',
    jockeyId: 'j1',
    season: 2027,
    week: 10 + i,
    weekIndex: i,
    trackId: 'newbury',
    surface: 'turf',
    going: 'good',
    distanceM: 1609,
    raceClass: 'Handicap',
    fieldSize: 10,
    stall: 3,
    weightLb: 130,
    tactic: { position: 'natural', attack: 'normal', path: 'normal' },
    ageAtRace: 4,
    daysSinceLastRun: 21,
    position: 4,
    timeS: 98,
    beatenL: 3,
    marginL: 1,
    topSpeed: 17.5,
    distanceRunM: 1615,
    sectionals: [],
    speedCurve: [],
    events: [],
    speedFigure: 70,
    finishingSpeedPct: 101,
    officialRatingBefore: null,
    prize: 0,
    ...partial,
  };
}

function soloTime(q: number, distanceM: number, track: Track, going: 'good' | 'soft' = 'good', weightLb = 126): number {
  return simulateRace({
    seed: 1,
    distanceM,
    track,
    surface: 'turf',
    going,
    randomness: 0,
    runners: [
      {
        horseId: 'x',
        attrs: specialisedAttributes(q, distanceM),
        prefs: { distOptM: distanceM, distRange: 1, going: 0, direction: 0, runStyle: 'prominent' },
        fitness: 100,
        freshness: 100,
        weightLb,
        stall: 1,
        tactic: { position: 'natural', attack: 'normal', path: 'rails' },
        jockey: { tactics: 0.75, pace: 0.75, finishing: 0.75 },
      },
    ],
  }).results[0]!.timeS;
}

function fieldMeanFigure(q: number, distanceM: number, track: Track): number {
  const styles = ['front', 'prominent', 'midfield', 'held_up'] as const;
  const out = simulateRace({
    seed: 3,
    distanceM,
    track,
    surface: 'turf',
    going: 'good',
    randomness: 0,
    runners: Array.from({ length: 10 }, (_, i) => ({
      horseId: `f${i}`,
      attrs: specialisedAttributes(q, distanceM),
      prefs: { distOptM: distanceM, distRange: 1, going: 0, direction: 0, runStyle: styles[i % 4]! },
      fitness: 100,
      freshness: 100,
      weightLb: 126,
      stall: i + 1,
      tactic: { position: 'natural' as const, attack: 'normal' as const, path: 'normal' as const },
      jockey: { tactics: 0.75, pace: 0.75, finishing: 0.75 },
    })),
  });
  const figs = out.results.map((r) => speedFigure({ timeS: r.timeS, track, surface: 'turf', distanceM, going: 'good', weightLb: 126 }));
  return figs.reduce((a, b) => a + b, 0) / figs.length;
}

describe('Speed Figure', () => {
  it('die Standardzeit (Referenzfeld) entspricht der Par-Figure, allein läuft der Par-Spezialist etwas schneller', () => {
    for (const d of [1207, 1609, 2414]) {
      const st = standardTime(newbury, 'turf', d);
      expect(speedFigure({ timeS: st, track: newbury, surface: 'turf', distanceM: d, going: 'good', weightLb: 126 })).toBe(PAR_FIGURE);
      const solo = speedFigure({ timeS: soloTime(65, d, newbury), track: newbury, surface: 'turf', distanceM: d, going: 'good', weightLb: 126 });
      expect(Math.abs(solo - PAR_FIGURE)).toBeLessThanOrEqual(12);
    }
  });

  it('ist über Distanzen vergleichbar (Felder von Spezialisten gleicher Qualität, Spanne ≤ 12 lb)', () => {
    for (const q of [55, 75]) {
      const figs = [1006, 1207, 1609, 2012, 2414, 3219].map((d) => fieldMeanFigure(q, d, york));
      expect(Math.max(...figs) - Math.min(...figs)).toBeLessThanOrEqual(12);
      // und etwa 2 lb pro Attributpunkt neben dem Par
      const mean = figs.reduce((a, b) => a + b, 0) / figs.length;
      expect(Math.abs(mean - (PAR_FIGURE + 2 * (q - 65)))).toBeLessThanOrEqual(6);
    }
  });

  it('steigt mit der Qualität um etwa 2 lb pro Attributpunkt', () => {
    const f = (q: number) => speedFigure({ timeS: soloTime(q, 1609, newbury), track: newbury, surface: 'turf', distanceM: 1609, going: 'good', weightLb: 126 });
    const slope = (f(80) - f(60)) / 20;
    expect(slope).toBeGreaterThan(1.5);
    expect(slope).toBeLessThan(2.6);
  });

  it('bereinigt Gewicht: gleiche Zeit mit 7 lb mehr = 7 Punkte mehr', () => {
    const base = { timeS: 97, track: newbury, surface: 'turf' as const, distanceM: 1609, going: 'good' as const };
    expect(speedFigure({ ...base, weightLb: 133 }) - speedFigure({ ...base, weightLb: 126 })).toBe(7);
  });

  it('bereinigt Boden: trotz deutlich langsamerer Zeit auf weichem Boden eine ähnliche Figure', () => {
    const tGood = soloTime(70, 1609, newbury, 'good');
    const tSoft = soloTime(70, 1609, newbury, 'soft');
    expect(tSoft - tGood).toBeGreaterThan(1.5); // roh ca. 40 lb Unterschied
    const good = speedFigure({ timeS: tGood, track: newbury, surface: 'turf', distanceM: 1609, going: 'good', weightLb: 126 });
    const soft = speedFigure({ timeS: tSoft, track: newbury, surface: 'turf', distanceM: 1609, going: 'soft', weightLb: 126 });
    // Rest = Bodenvorliebe (neutral = mag guten Boden am liebsten)
    expect(Math.abs(good - soft)).toBeLessThanOrEqual(8);
  });

  it('Finishing Speed %: gleichmäßiges Tempo = 100 %', () => {
    expect(finishingSpeedPct(100, 1600, 75)).toBe(100);
    expect(finishingSpeedPct(100, 1600, 76)).toBeGreaterThan(100);
  });
});

describe('Kennzahlen je Pferd', () => {
  const runs: Run[] = [
    run({ position: 1, speedFigure: 72, prize: 5000, going: 'good', distanceM: 1207 }, 1),
    run({ position: 3, speedFigure: 68, going: 'soft', distanceM: 1609 }, 2),
    run({ position: 7, speedFigure: 60, going: 'good_to_firm', distanceM: 1609, jockeyId: 'j2' }, 3),
    run({ position: 2, speedFigure: 75, going: 'good', distanceM: 1609, raceClass: 'G3' }, 4),
  ];
  const s = computeHorseStats(runs);

  it('zählt Starts, Siege, Platzierungen und Verdienst', () => {
    expect(s.starts).toBe(4);
    expect(s.wins).toBe(1);
    expect(s.seconds).toBe(1);
    expect(s.thirds).toBe(1);
    expect(s.earnings).toBe(5000);
    expect(s.strikeByClass.Handicap).toEqual({ starts: 3, wins: 1, places: 2 });
    expect(s.strikeByClass.G3).toEqual({ starts: 1, wins: 0, places: 1 });
  });

  it('jede Kennzahl verweist auf ihre Starts', () => {
    expect(s.bestFigure).toEqual({ value: 75, runId: 'r4' });
    expect(s.lastFigures.map((f) => f.runId)).toEqual(['r1', 'r2', 'r3', 'r4']);
    const mile = s.byDistance['1m']!;
    expect(mile.n).toBe(3);
    expect(mile.runIds).toEqual(['r2', 'r3', 'r4']);
    expect(s.heatmap['1m|Gut']!.runIds).toEqual(['r4']);
    expect(s.byJockey.j2!.runIds).toEqual(['r3']);
  });

  it('Konstanz-Index und Formtrend', () => {
    expect(s.figureSd).toBe(6.5);
    expect(s.consistencyIndex).toBe(Math.round(100 - s.figureSd! * 4));
    expect(s.formTrend).not.toBeNull();
  });

  it('Gruppen für Distanz und Boden', () => {
    expect(distBucket(1006)).toBe('5f');
    expect(distBucket(2414)).toBe('11–12f');
    expect(goingGroup('heavy')).toBe('Weich');
    expect(goingGroup('standard')).toBe('Allwetter');
  });
});

describe('Official Rating', () => {
  it('erst nach drei Starts, danach angepasst', () => {
    const r1 = [run({ speedFigure: 60 }, 1)];
    expect(updateRating(null, r1)).toBeNull();
    const r2 = [...r1, run({ speedFigure: 64 }, 2)];
    expect(updateRating(null, r2)).toBeNull();
    const r3 = [...r2, run({ speedFigure: 70 }, 3)];
    const or = updateRating(null, r3)!;
    expect(or).toBeGreaterThanOrEqual(64);
    expect(or).toBeLessThanOrEqual(70);
    // klarer Sieg mit höherer Figure hebt das Rating
    const up = updateRating(or, [...r3, run({ speedFigure: or + 10, position: 1 }, 4)])!;
    expect(up).toBeGreaterThan(or + 4);
    // schwache Leistung senkt nur langsam
    const down = updateRating(or, [...r3, run({ speedFigure: or - 20, position: 9 }, 4)])!;
    expect(down).toBeLessThan(or);
    expect(or - down).toBeLessThanOrEqual(5);
  });
});
