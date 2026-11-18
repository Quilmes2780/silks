/* global fetch, Buffer, console */
// Lädt die generierten Bilder (assets/generated.json) als WebP nach public/.
// Aufruf: npm run assets:fetch  (vorhandene Dateien werden übersprungen)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const { images } = JSON.parse(readFileSync('assets/generated.json', 'utf8'));
let n = 0;
for (const [id, img] of Object.entries(images)) {
  const target = join('public', img.file);
  if (existsSync(target)) continue;
  const res = await fetch(img.source);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  n++;
}
console.log(`${n} Bilder geladen, ${Object.keys(images).length} insgesamt.`);
