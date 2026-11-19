/** Detailmessung für die Speichergröße. Aufruf: npx tsx scripts/save-detail.ts [Saisons] */
import { bundledWorld } from '../src/engine/world/bundled';
import { createGame } from '../src/engine/game/newGame';
import { advanceWeek } from '../src/engine/game/week';
import { compactOldRecords, packAll } from '../src/engine/game/archive';
const seasons = Number(process.argv[2] ?? 2);
const g = createGame({ id: 's', name: 'S', createdAt: '2026-11-18', seed: 7, world: bundledWorld() });
const start = g.season;
const size = (x: unknown) => JSON.stringify(x).length / 1e6;
const snap = () => {
  const p = packAll(g);
  return { horses: size(p.horses), runs: size(p.runs), races: size(p.races), templates: size(p.templates), rest: size({ ...g, horses: 0, runs: 0, races: 0, templates: 0 }) };
};
let last = snap();
console.log('Start', last);
while (g.season < start + seasons) {
  const before = g.season;
  advanceWeek(g);
  if (g.season !== before) {
    compactOldRecords(g);
    const s = snap();
    console.log(`Saison ${g.season}: Zuwachs`, Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +(v - last[k as keyof typeof s]).toFixed(2)])));
    last = s;
  }
}
const tpls = Object.values(g.templates);
console.log('Vorlagen', tpls.length, 'Byte je Vorlage', (size(g.templates) * 1e6 / tpls.length) | 0, JSON.stringify(tpls[0]).slice(0, 600));
const seasonsOfT: Record<string, number> = {};
for (const t of tpls) { const s = String((t as unknown as { season?: number }).season ?? t.id.slice(0, 4)); seasonsOfT[s] = (seasonsOfT[s] ?? 0) + 1; }
console.log('Vorlagen je Saison', seasonsOfT);
const hs = Object.values(g.horses);
const vh = hs.map((h) => h.valueHistory.length).sort((a, b) => a - b);
console.log('valueHistory Länge median/max', vh[vh.length >> 1], vh.at(-1), 'ratingHistory max', Math.max(...hs.map((h) => h.ratingHistory.length)));
const p = packAll(g);
const pr = Object.values(p.races).filter((r) => (r.runners as unknown[] | undefined)?.length);
console.log('Rennen mit runners', pr.length, 'runners Byte je Rennen', (pr.reduce((a, r) => a + JSON.stringify(r.runners).length, 0) / pr.length) | 0);
console.log('Beispiel Rennen', JSON.stringify(pr[0]).slice(0, 500));
