import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { bundledWorld } from '../world/bundled';
import { createGame } from '../game/newGame';
import { advanceWeek } from '../game/week';
import type { GameState } from '../game/state';
import type { Genotype, Horse } from '../types';
import { breedingValue, colourOf, conceive, ensureGenotype, founderGenotype, inbreedingOf, LOCI, traitsOf } from './genetics';
import { activeStallions } from './stud';
import { pregnancyOf } from './cycle';

function newGame(seed = 7): GameState {
  return createGame({ id: 'b', name: 'B', createdAt: '2026-11-17', seed, world: bundledWorld(), config: { aiStables: 8, horsesPerStable: 30 } });
}

function anyHorse(g: GameState, f: (h: Horse) => boolean): Horse {
  return Object.values(g.horses).find(f)!;
}

describe('Fellfarbe', () => {
  const c = (e: string, a: string, gr: string): Genotype['colour'] =>
    ({ extension: e.split(',') as never, agouti: a.split(',') as never, grey: gr.split(',') as never }) as Genotype['colour'];
  it('folgt Extension, Agouti und Grey', () => {
    expect(colourOf(c('e,e', 'A,A', 'g,g'))).toBe('chestnut');
    expect(colourOf(c('E,e', 'A,a', 'g,g'))).toBe('bay');
    expect(colourOf(c('E,E', 'At,a', 'g,g'))).toBe('brown');
    expect(colourOf(c('E,e', 'a,a', 'g,g'))).toBe('black');
    expect(colourOf(c('e,e', 'a,a', 'G,g'))).toBe('grey');
  });

  it('Fuchs × Fuchs ergibt immer Füchse', () => {
    const g = newGame(3);
    const chestnuts = Object.values(g.horses).filter((h) => h.colour === 'chestnut' && h.status === 'active');
    const sire = chestnuts.find((h) => h.sex === 'male')!;
    const dam = chestnuts.find((h) => h.sex === 'female')!;
    const r = new Rng(1);
    for (let i = 0; i < 40; i++) {
      const foal = conceive(g, sire, dam, r.fork(i));
      expect(colourOf(foal.genotype.colour)).not.toBe('bay');
      expect(foal.genotype.colour.extension).toEqual(['e', 'e']);
    }
  });
});

describe('Vererbung', () => {
  it('Gründer-Genotyp passt zum Phänotyp (Zuchtwert wächst mit der Klasse)', () => {
    const g = newGame(5);
    const horses = Object.values(g.horses).filter((h) => h.status === 'active');
    const pairs = horses.map((h) => [traitsOf(h).class, breedingValue(founderGenotype(h, 'L1', new Rng(h.foalYear).fork(h.id)), 'class')] as const);
    const lo = pairs.filter(([q]) => q < 58).map(([, a]) => a);
    const hi = pairs.filter(([q]) => q > 68).map(([, a]) => a);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(hi) - mean(lo)).toBeGreaterThan(3);
    expect(founderGenotype(horses[0]!, 'L1', new Rng(1)).loci.class!.length).toBe(2 * LOCI);
  });

  it('Fohlen erben im Mittel den Durchschnitt der Eltern', () => {
    const g = newGame(9);
    const sire = g.horses[activeStallions(g)[0]!.id]!;
    const dam = anyHorse(g, (h) => h.status === 'broodmare');
    const mid = (breedingValue(ensureGenotype(g, sire), 'class') + breedingValue(ensureGenotype(g, dam), 'class')) / 2;
    const r = new Rng(11);
    let sum = 0;
    const n = 600;
    for (let i = 0; i < n; i++) sum += breedingValue(conceive(g, sire, dam, r.fork(i)).genotype, 'class');
    expect(Math.abs(sum / n - mid)).toBeLessThan(0.6);
  });

  it('Inzuchtkoeffizient: Halbgeschwister 0,125, Vollgeschwister 0,25', () => {
    const g = newGame(4);
    const sire = g.horses[activeStallions(g)[0]!.id]!;
    const dam = anyHorse(g, (h) => h.status === 'broodmare');
    const base = anyHorse(g, (h) => h.status === 'active' && h.sex === 'male');
    const mk = (id: string, sireId: string, damId: string | null): Horse => {
      const h: Horse = { ...base, id, sireId, damId, foalYear: sire.foalYear + 6, genotype: null };
      g.horses[id] = h;
      return h;
    };
    const a = mk('x1', sire.id, dam.id);
    const b = mk('x2', sire.id, dam.id);
    const c = mk('x3', sire.id, null);
    expect(inbreedingOf(g, a.id, b.id)).toBeCloseTo(0.25, 4);
    expect(inbreedingOf(g, a.id, c.id)).toBeCloseTo(0.125, 4);
    expect(inbreedingOf(g, sire.id, dam.id)).toBe(0);
  });
});

describe('Spielstart und Zuchtzyklus', () => {
  it('Hengste sind Pferde, KI und Züchter haben Herden mit Trächtigkeiten', () => {
    const g = newGame(12);
    for (const s of activeStallions(g)) expect(g.horses[s.id]!.status).toBe('stud');
    const mares = Object.values(g.horses).filter((h) => h.status === 'broodmare');
    expect(mares.length).toBeGreaterThan(150);
    const preg = Object.values(g.breeding.pregnancies);
    expect(preg.length / mares.length).toBeGreaterThan(0.6);
    expect(g.genetics.offsets[g.season]).toBeDefined();
  });

  it('Stute des Spielers: Deckplan, Decktaxe, Geburt, Training mit zwei Jahren', () => {
    const g = newGame(17);
    // eine Stute der Züchter übernimmt der Spieler
    const mare = anyHorse(g, (h) => h.status === 'broodmare' && g.season - h.foalYear < 10 && !pregnancyOf(g, h.id));
    mare.stableId = g.playerStableId;
    delete g.breeding.plans[mare.id];
    const stallion = activeStallions(g).sort((a, b) => a.fee - b.fee)[0]!;
    while (g.week !== 1) advanceWeek(g);
    g.breeding.plans[mare.id] = stallion.id;
    const before = g.stables.player!.balance;
    while (g.week <= 10) advanceWeek(g);
    const p = pregnancyOf(g, mare.id, g.season);
    // Bei rund 80 % Aufnahmechance je Saison: Seed so gewählt, dass sie aufnimmt
    expect(p).not.toBeNull();
    expect(g.ledger.some((l) => l.kind === 'stud_fee' && l.horseId === mare.id)).toBe(true);
    expect(g.stables.player!.balance).toBeLessThan(before);
    const due = p!.dueWeek;
    while (!(g.season === p!.coverSeason + 1 && g.week > due)) advanceWeek(g);
    const foal = Object.values(g.horses).find((h) => h.damId === mare.id && h.foalYear === g.season);
    expect(foal).toBeDefined();
    expect(foal!.status).toBe('young');
    expect(foal!.sireId).toBe(stallion.id);
    expect(foal!.stableId).toBe(g.playerStableId);
    expect(foal!.genotype?.line).toBe(g.stallions[stallion.id]!.line);
    // zwei Jahre später im Training
    while (g.season < foal!.foalYear + 2) advanceWeek(g);
    expect(foal!.status).toBe('active');
  }, 120000);
});
