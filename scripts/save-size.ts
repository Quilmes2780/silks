/**
 * Misst, welche Teile des Spielstands wie viel Platz belegen (nach N Saisons Autopilot).
 * Aufruf: npx tsx scripts/save-size.ts [Saisons]
 */
import { bundledWorld } from '../src/engine/world/bundled';
import { createGame } from '../src/engine/game/newGame';
import { advanceWeek } from '../src/engine/game/week';
import { compactOldRecords } from '../src/engine/game/archive';
import { exportJson } from '../src/worker/store';

const seasons = Number(process.argv[2] ?? 3);
const g = createGame({ id: 's', name: 'S', createdAt: '2026-11-18', seed: 7, world: bundledWorld() });
const start = g.season;
const exported = () => exportJson(g, '').length / 1e6;
console.log(`Start: Export ${exported().toFixed(1)} MB`);
while (g.season < start + seasons) {
  const before = g.season;
  advanceWeek(g);
  if (g.season !== before) {
    compactOldRecords(g);
    console.log(`Saison ${g.season}: Export (verdichtet) ${exported().toFixed(1)} MB, im Speicher ${(JSON.stringify(g).length / 1e6).toFixed(1)} MB`);
  }
}
const mb = (x: unknown) => (JSON.stringify(x).length / 1e6).toFixed(2);
const total = JSON.stringify(g).length / 1e6;
console.log(`Saisons: ${seasons}, gesamt ${total.toFixed(1)} MB`);
const parts = Object.entries(g as unknown as Record<string, unknown>)
  .map(([k, v]) => [k, JSON.stringify(v ?? null).length / 1e6] as const)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);
for (const [k, v] of parts) console.log(`  ${k}: ${v.toFixed(2)} MB`);
const runs = Object.values(g.runs);
console.log(`Starts: ${runs.length}, je Start ${((JSON.stringify(g.runs).length / runs.length) | 0)} Byte`);
const fields: Record<string, number> = {};
for (const r of runs.slice(0, 2000)) for (const [k, v] of Object.entries(r)) fields[k] = (fields[k] ?? 0) + JSON.stringify(v ?? null).length + k.length + 3;
console.log('  Felder je Start (Byte):', Object.entries(fields).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${(v / 2000) | 0}`).join(', '));
const races = Object.values(g.races);
console.log(`Rennen: ${races.length}, je Rennen ${((JSON.stringify(g.races).length / races.length) | 0)} Byte`);
const rf: Record<string, number> = {};
for (const r of races) for (const [k, v] of Object.entries(r)) rf[k] = (rf[k] ?? 0) + JSON.stringify(v ?? null).length;
console.log('  Felder je Rennen (Byte):', Object.entries(rf).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${(v / races.length) | 0}`).join(', '));
const horses = Object.values(g.horses);
console.log(`Pferde: ${horses.length}, je Pferd ${((JSON.stringify(g.horses).length / horses.length) | 0)} Byte; ${mb(g.horses)} MB`);
const hf: Record<string, number> = {};
for (const h of horses) for (const [k, v] of Object.entries(h)) hf[k] = (hf[k] ?? 0) + JSON.stringify(v ?? null).length;
console.log('  Felder je Pferd (Byte):', Object.entries(hf).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}=${(v / horses.length) | 0}`).join(', '));
// Verdichtete Form je Bereich
import { packAll } from '../src/engine/game/archive';
const p = packAll(g);
for (const [k, v] of Object.entries(p)) console.log(`verdichtet ${k}: ${mb(v)} MB`);
const ph = Object.values(p.horses);
const phf: Record<string, number> = {};
for (const h of ph) for (const [k, v] of Object.entries(h)) phf[k] = (phf[k] ?? 0) + JSON.stringify(v ?? null).length;
console.log('  verdichtet je Pferd (Byte):', Object.entries(phf).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}=${(v / ph.length) | 0}`).join(', '));
const pr = Object.values(p.races);
const prf: Record<string, number> = {};
for (const h of pr) for (const [k, v] of Object.entries(h)) prf[k] = (prf[k] ?? 0) + JSON.stringify(v ?? null).length;
console.log('  verdichtet je Rennen (Byte):', Object.entries(prf).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${(v / pr.length) | 0}`).join(', '));
const pru = Object.values(p.runs).slice(0, 3000);
console.log('  verdichteter alter Start:', JSON.stringify(pru[100]));
import { gzipSync } from 'zlib';
const ex = exportJson(g, '');
console.log(`Export-Datei: ${(ex.length / 1e6).toFixed(1)} MB JSON, gzip ${(gzipSync(ex).length / 1e6).toFixed(1)} MB`);
