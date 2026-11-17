/**
 * Simuliert eine komplette Saison ohne UI und gibt Kennzahlen aus.
 * Aufruf: npm run simulate:season [-- seed=123 weeks=52 randomness=0.4]
 */
import { bundledWorld } from '../src/engine/world/bundled';
import { createGame } from '../src/engine/game/newGame';
import { advanceWeek } from '../src/engine/game/week';
import { formatTime } from '../src/engine/race/benchmark';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const seed = Number(args.seed ?? 20261117);
const weeks = Number(args.weeks ?? 52);
const randomness = Number(args.randomness ?? 0.4);

const t0 = performance.now();
const g = createGame({ id: 'sim', name: 'Simulation', createdAt: new Date().toISOString(), seed, world: bundledWorld(), config: { randomness } });
const tCreate = performance.now() - t0;
const startSeason = g.season;
const startWeek = g.week;

const weekTimes: number[] = [];
for (let i = 0; i < weeks; i++) {
  const s = advanceWeek(g, () => performance.now());
  weekTimes.push(s.durationMs);
}
const total = performance.now() - t0;

const runRaces = Object.values(g.races).filter((r) => r.status === 'run');
const voidRaces = Object.values(g.races).filter((r) => r.status === 'void' && r.entries.length > 0);
const fields = runRaces.map((r) => r.resultRunIds.length);
const avgField = fields.reduce((a, b) => a + b, 0) / Math.max(1, fields.length);
const runs = Object.values(g.runs);
const byClass = new Map<string, { n: number; field: number }>();
for (const r of runRaces) {
  const t = g.templates[r.templateId]!;
  const x = byClass.get(t.raceClass) ?? { n: 0, field: 0 };
  x.n++;
  x.field += r.resultRunIds.length;
  byClass.set(t.raceClass, x);
}
const active = Object.values(g.horses).filter((h) => h.status === 'active');
const rated = active.filter((h) => h.officialRating !== null).map((h) => h.officialRating!).sort((a, b) => a - b);
const q = (p: number) => rated[Math.floor((rated.length - 1) * p)] ?? 0;
const injuries = active.filter((h) => h.condition.injury).length;
const startsPerHorse = new Map<string, number>();
for (const r of runs) startsPerHorse.set(r.horseId, (startsPerHorse.get(r.horseId) ?? 0) + 1);
const sph = [...startsPerHorse.values()];
const player = Object.values(g.horses).filter((h) => h.stableId === 'player');
const playerRuns = runs.filter((r) => r.stableId === 'player');

// Siegerzeiten 6f und 12f auf gutem Rasen
const win = (dist: number) =>
  runRaces
    .filter((r) => g.templates[r.templateId]!.distanceM === dist && r.going === 'good' && g.templates[r.templateId]!.surface === 'turf')
    .map((r) => r.winningTimeS!)
    .sort((a, b) => a - b);
const w6 = win(1207);
const w12 = win(2414);
const med = (xs: number[]) => (xs.length ? formatTime(xs[Math.floor(xs.length / 2)]!) : '–');

const fmt = (x: number) => x.toFixed(1);
console.log(`\nSilks & Stamina – Saisonsimulation (Seed ${seed}, randomness ${randomness})`);
console.log(`Zeitraum: ${startSeason}/W${startWeek} bis ${g.season}/W${g.week} (${weeks} Wochen)`);
console.log('');
console.log('| Kennzahl | Wert |');
console.log('|---|---|');
console.log(`| Rennen gelaufen | ${runRaces.length} |`);
console.log(`| ausgefallen (zu wenige Starter) | ${voidRaces.length} |`);
console.log(`| Starts gesamt | ${runs.length} |`);
console.log(`| Durchschnittsfeldgröße | ${fmt(avgField)} |`);
console.log(`| Starts je eingesetztem Pferd | ${fmt(sph.reduce((a, b) => a + b, 0) / Math.max(1, sph.length))} |`);
console.log(`| aktive Pferde | ${active.length} |`);
console.log(`| Official Ratings P10/P50/P90/max | ${q(0.1)} / ${q(0.5)} / ${q(0.9)} / ${q(1)} |`);
console.log(`| aktuell verletzt | ${injuries} |`);
console.log(`| Siegerzeit-Median 6f / 12f (guter Rasen) | ${med(w6)} (${w6.length}) / ${med(w12)} (${w12.length}) |`);
console.log(`| Spieler: Pferde / Starts / Siege | ${player.length} / ${playerRuns.length} / ${playerRuns.filter((r) => r.position === 1).length} |`);
console.log(`| Laufzeit gesamt (inkl. Spielerstellung ${fmt(tCreate / 1000)} s) | ${fmt(total / 1000)} s |`);
console.log(`| Laufzeit je Woche Ø / max | ${fmt(weekTimes.reduce((a, b) => a + b, 0) / weekTimes.length)} ms / ${fmt(Math.max(...weekTimes))} ms |`);
console.log('');
console.log('| Klasse | Rennen | Ø Feld |');
console.log('|---|---|---|');
for (const [k, v] of [...byClass.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`| ${k} | ${v.n} | ${fmt(v.field / v.n)} |`);
