import { describe, expect, it } from 'vitest';
import { bundledWorld } from '../world/bundled';
import { createGame } from './newGame';
import { advanceWeek } from './week';
import { packAll, unpackAll } from './archive';

describe('Speicherform von Starts und Rennen', () => {
  it('verdichten und wiederherstellen ergibt dieselben Daten', () => {
    const g = createGame({ id: 'a', name: 'A', createdAt: '2026-11-18', seed: 41, world: bundledWorld(), config: { aiStables: 6, horsesPerStable: 20 } });
    for (let i = 0; i < 12; i++) advanceWeek(g);
    expect(Object.keys(g.runs).length).toBeGreaterThan(100);
    const before = JSON.parse(JSON.stringify({ horses: g.horses, runs: g.runs, races: g.races }));
    const packed = JSON.parse(JSON.stringify({ ...packAll(g), templates: g.templates }));
    const ratio = JSON.stringify(packed.runs).length / JSON.stringify(before.runs).length;
    expect(ratio).toBeLessThan(0.75);
    unpackAll(packed);
    // NaN wird in JSON zu null; der Vergleich läuft über die JSON-Form
    expect(JSON.parse(JSON.stringify(packed.runs))).toEqual(before.runs);
    expect(JSON.parse(JSON.stringify(packed.races))).toEqual(before.races);
    expect(JSON.parse(JSON.stringify(packed.horses))).toEqual(before.horses);
  }, 60000);
});
