import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed } from './rng';

describe('Rng', () => {
  it('liefert bei gleichem Seed die gleiche Folge', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('liefert Werte in [0,1) mit plausiblem Mittelwert', () => {
    const r = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });

  it('normal() hat Mittel 0 und Streuung 1', () => {
    const r = new Rng(3);
    const xs = Array.from({ length: 20000 }, () => r.normal());
    const mean = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });

  it('fork ist deterministisch und unabhängig vom Verbrauch des Eltern-Generators', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    b.next();
    b.next();
    expect(a.fork('x', 1).next()).toBe(b.fork('x', 1).next());
    expect(a.fork('x', 1).next()).not.toBe(a.fork('x', 2).next());
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'));
  });
});
