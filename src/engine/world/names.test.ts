import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { isValidHorseName, MAX_HORSE_NAME_LEN, NameRegistry, normaliseName } from './names';

describe('Namensgenerator (Weatherbys-Regeln)', () => {
  it('erzeugt 3.000 eindeutige, gültige Namen mit max. 18 Zeichen', () => {
    const reg = new NameRegistry();
    const rng = new Rng(1);
    const names = Array.from({ length: 3000 }, () => reg.horseName(rng));
    const norm = new Set(names.map(normaliseName));
    expect(norm.size).toBe(names.length);
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(MAX_HORSE_NAME_LEN);
      expect(isValidHorseName(n)).toBe(true);
    }
  });

  it('lehnt ungültige Namen ab', () => {
    expect(isValidHorseName('A Very Long Horse Name Indeed')).toBe(false);
    expect(isValidHorseName('Horse 2')).toBe(false);
    expect(isValidHorseName('A B')).toBe(false);
    expect(isValidHorseName('Silver Arrow')).toBe(true);
  });

  it('erkennt Duplikate unabhängig von Groß-/Kleinschreibung und Leerzeichen', () => {
    const reg = new NameRegistry(['Silver Arrow']);
    expect(reg.has('silverarrow')).toBe(true);
    expect(reg.has('Silver  Arrow')).toBe(true);
  });
});
