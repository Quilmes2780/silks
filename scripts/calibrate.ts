import { readFileSync } from 'node:fs';
import { benchmarkTable, runBenchmark } from '../src/engine/race/benchmark';
import type { Track } from '../src/engine/types';

const tracks = JSON.parse(readFileSync(new URL('../data/world/tracks.json', import.meta.url), 'utf8')).tracks as Track[];
const trackId = process.argv[2] ?? 'newbury';
const races = Number(process.argv[3] ?? 1000);
const randomness = Number(process.argv[4] ?? 0.4);
const track = tracks.find((t) => t.id === trackId)!;

const t0 = performance.now();
const res = [1200, 2400].map((d) => runBenchmark({ track, distanceM: d, races, randomness, seed: 20261117 }));
console.log(`Bahn: ${track.name}, randomness ${randomness}, ${races} Rennen je Distanz`);
console.log(benchmarkTable(res));
console.log(`Laufzeit: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
