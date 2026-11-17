/**
 * Phase 4: simuliert viele Saisons mit Zucht und prüft, ob die Welt stabil bleibt.
 *  - keine Abstürze
 *  - stabile Pferdepopulation (im Training, Stuten, Hengste, Nachwuchs)
 *  - mittlere Qualität der neuen Jahrgänge ohne Drift
 *  - Laufzeit je Woche und Größe des Spielstands
 * Aufruf: npm run simulate:generations [-- seed=123 seasons=10]
 */
import { bundledWorld } from '../src/engine/world/bundled';
import { createGame } from '../src/engine/game/newGame';
import { advanceWeek } from '../src/engine/game/week';
import { autopilot } from '../src/engine/ai/ai';
import { formatMoney, type GameState } from '../src/engine/game/state';
import type { Horse } from '../src/engine/types';
import { traitsOf } from '../src/engine/breeding/genetics';
import { activeStallions } from '../src/engine/breeding/stud';
import { compactOldRecords } from '../src/engine/game/archive';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const seed = Number(args.seed ?? 20261117);
const seasons = Number(args.seasons ?? 10);

const g: GameState = createGame({ id: 'gen', name: 'Generationen', createdAt: new Date().toISOString(), seed, world: bundledWorld() });
const quality = (h: Horse) => traitsOf(h).class;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');

console.log(`Seed ${seed}, ${seasons} Saisons ab ${g.season} Woche ${g.week}\n`);
console.log('Saison | Training | Stuten | Hengste | Nachwuchs | Ruhestand | Jahrgang (n, Ø Klasse, sd) | Ø COI | Bedeckt | Woche Ø/max ms | Spielstand MB');

const durations: number[] = [];
const endSeason = g.season + seasons;
let lastSeason = g.season;
const report = () => {
  const hs = Object.values(g.horses);
  const count = (st: Horse['status']) => hs.filter((h) => h.status === st).length;
  const crop = hs.filter((h) => h.foalYear === lastSeason && h.damId);
  const q = crop.map(quality);
  const coi = mean(crop.map((h) => h.genotype?.coi ?? 0));
  const covered = Object.values(g.breeding.pregnancies).filter((p) => p.coverSeason === lastSeason).length;
  const size = JSON.stringify(g).length / 1e6;
  const dur = durations.splice(0);
  console.log(
    `${lastSeason} | ${count('active')} | ${count('broodmare')} | ${activeStallions(g).length} | ${count('young')} | ${count('retired')} | ${crop.length}, ${f1(mean(q))}, ${f1(sd(q))} | ${coi.toFixed(4)} | ${covered} | ${f1(mean(dur))}/${f1(Math.max(...dur))} | ${size.toFixed(1)}`,
  );
};

while (g.season < endSeason) {
  autopilot(g);
  const t = performance.now();
  advanceWeek(g, () => performance.now());
  durations.push(performance.now() - t);
  if (g.season !== lastSeason) {
    compactOldRecords(g);
    report();
    lastSeason = g.season;
  }
}

const p = g.stables[g.playerStableId]!;
console.log(`\nSpielerstall (Autopilot): Kontostand ${formatMoney(p.balance)}`);
const top = activeStallions(g)
  .sort((a, b) => b.fee - a.fee)
  .slice(0, 8)
  .map((s) => `${s.name} ${formatMoney(s.fee)} (${s.ownerId})`);
console.log('Teuerste Hengste:', top.join(', '));
const ai = Object.values(g.stables).filter((s) => s.kind === 'ai');
console.log('KI-Kontostände Ø', formatMoney(mean(ai.map((s) => s.balance))), 'min', formatMoney(Math.min(...ai.map((s) => s.balance))));
