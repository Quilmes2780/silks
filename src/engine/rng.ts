/**
 * Seedbarer, deterministischer Zufallsgenerator (mulberry32).
 * Im Engine-Code ist Math.random verboten – alle Zufallszahlen kommen von hier.
 */

/** 32-bit-Hash eines Strings (cyrb53-Variante, auf 32 bit gekürzt). */
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Leitet aus einem Basis-Seed und Labels einen neuen Seed ab. */
export function deriveSeed(seed: number, ...labels: (string | number)[]): number {
  return hashString(labels.join('|'), seed >>> 0);
}

export class Rng {
  private state: number;
  readonly seed: number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** Gleichverteilt in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Gleichverteilt in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Ganzzahl in [min, max] (inklusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Standardnormalverteilt (Box-Muller). */
  normal(mean = 0, sd = 1): number {
    if (this.spareNormal !== null) {
      const s = this.spareNormal;
      this.spareNormal = null;
      return mean + sd * s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spareNormal = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  }

  /** Normalverteilt, auf [min, max] begrenzt. */
  normalClamped(mean: number, sd: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, this.normal(mean, sd)));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick aus leerem Array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  /** Gewichtete Auswahl. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i] ?? 0;
      if (r < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
    return arr;
  }

  /** Neuer, unabhängiger Generator für ein Teilsystem. */
  fork(...labels: (string | number)[]): Rng {
    return new Rng(deriveSeed(this.seed, ...labels));
  }
}
