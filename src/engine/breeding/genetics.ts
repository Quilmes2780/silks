import { deriveSeed, Rng } from '../rng';
import type { Attributes, Colour, Genotype, GeneKey, Horse, Markings, Preferences } from '../types';
import { GENE_KEYS } from '../types';
import { SPECIALISATION } from '../horse/generate';
import type { NameRegistry } from '../world/names';
import type { GameState } from '../game/state';

/**
 * Genetik (Phase 4).
 *
 * Jedes Merkmal wird durch L Gen-Paare mit additiver Wirkung plus Umweltrauschen bestimmt.
 * Ein Fohlen erbt an jedem Locus ein zufälliges Allel vom Hengst und eines von der Stute.
 *
 * Merkmale (GeneKey):
 *  - class: gemeinsame Klasse der vier Leistungsattribute (Grundschnelligkeit, Beschleunigung,
 *    Ausdauer, Speedreserve); sie trägt den Großteil der „Qualität“
 *  - dist: log2(Distanzoptimum / 1.600 m); verschiebt Grundschnelligkeit gegen Ausdauer
 *  - going: Bodenvorliebe
 *  - speed/acceleration/stamina/kick: Abweichung des einzelnen Attributs von der Klasse
 *  - fight/agility/temperament/consistency: direkt
 *
 * Damit die Welt kalibriert bleibt (Standardzeiten, Speed Figures, Preisgelder), wird der
 * mittlere Zuchtwert jedes Deckjahrgangs auf das Weltniveau zurückgesetzt. Zuchterfolg ist
 * damit relativ: Wer bessere Stuten zu besseren Hengsten bringt, liegt über dem Jahrgang.
 */

export const LOCI = 6;

export const TRAITS: Record<GeneKey, { mu: number; sd: number; h2: number }> = {
  class: { mu: 60.5, sd: 7.5, h2: 0.45 },
  dist: { mu: 0.05, sd: 0.42, h2: 0.55 },
  going: { mu: 0, sd: 0.45, h2: 0.4 },
  speed: { mu: 0, sd: 5, h2: 0.35 },
  acceleration: { mu: 0, sd: 7, h2: 0.35 },
  stamina: { mu: 0, sd: 5, h2: 0.35 },
  kick: { mu: 0, sd: 7, h2: 0.35 },
  fight: { mu: 55, sd: 15, h2: 0.3 },
  agility: { mu: 55, sd: 14, h2: 0.25 },
  temperament: { mu: 58, sd: 16, h2: 0.35 },
  consistency: { mu: 58, sd: 15, h2: 0.25 },
};

const PHYS = ['speed', 'acceleration', 'stamina', 'kick'] as const;

/** Wirkung des Inzuchtkoeffizienten F (Inzuchtdepression). */
export const INBREEDING = { class: 18, consistency: 50, temperament: 20, legRisk: 3 };

export const LINE_COUNT = 8;

export interface GeneticsState {
  /** Hengstlinien (väterliche Stämme) */
  lines: Array<{ id: string; name: string }>;
  /** verborgene Nick-Tabelle: Bonus auf die Klasse für Vaterlinie × Muttervaterlinie */
  nicks: Record<string, number>;
  /** mittlerer Zuchtwert je Deckjahrgang (wird bei der Ausprägung abgezogen) */
  offsets: Record<number, Partial<Record<GeneKey, number>>>;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const clampAttr = (x: number) => Math.max(5, Math.min(99, x));

// ------------------------------------------------------------------ Linien und Nicks

export function initGenetics(g: GameState, r: Rng, names: NameRegistry): void {
  const lines: GeneticsState['lines'] = [];
  for (let i = 1; i <= LINE_COUNT; i++) {
    const n = names.horseName(r);
    lines.push({ id: `L${i}`, name: n });
  }
  const nicks: Record<string, number> = {};
  for (const a of lines) {
    for (const b of lines) {
      // Die meisten Kombinationen sind neutral, einige harmonieren deutlich besser oder schlechter
      const strong = r.chance(0.35);
      const v = strong ? Math.max(-3.5, Math.min(3.5, r.normal(0, 2))) : r.normal(0, 0.4);
      nicks[`${a.id}|${b.id}`] = round2(v);
    }
  }
  g.genetics = { lines, nicks, offsets: {} };
}

export function nickValue(g: GameState, sireLine: string | null, damSireLine: string | null): number {
  if (!sireLine || !damSireLine) return 0;
  return g.genetics.nicks[`${sireLine}|${damSireLine}`] ?? 0;
}

export function lineName(g: GameState, lineId: string | null | undefined): string | null {
  if (!lineId) return null;
  return g.genetics.lines.find((l) => l.id === lineId)?.name ?? null;
}

// ------------------------------------------------------------------ Phänotyp ↔ Merkmale

/** Merkmalswerte eines Pferds aus Potenzial und Präferenzen (Umkehrung der Ausprägung). */
export function traitsOf(h: Pick<Horse, 'potential' | 'prefs'>): Record<GeneKey, number> {
  const p = h.potential;
  const s = Math.log2(h.prefs.distOptM / 1600);
  const adj = PHYS.map((k) => p[k] - SPECIALISATION[k] * s);
  const q = adj.reduce((a, b) => a + b, 0) / adj.length;
  return {
    class: q,
    dist: s,
    going: h.prefs.going,
    speed: adj[0]! - q,
    acceleration: adj[1]! - q,
    stamina: adj[2]! - q,
    kick: adj[3]! - q,
    fight: p.fight,
    agility: p.agility,
    temperament: p.temperament,
    consistency: p.consistency,
  };
}

/** Potenzial und Präferenzen aus Merkmalswerten. */
export function expressTraits(t: Record<GeneKey, number>): { potential: Attributes; distOptM: number; going: number } {
  const distOptM = Math.round(Math.min(3400, Math.max(1000, 1600 * Math.pow(2, t.dist))) / 50) * 50;
  const s = Math.log2(distOptM / 1600);
  const pot = {} as Attributes;
  for (const k of PHYS) pot[k] = clampAttr(t.class + SPECIALISATION[k] * s + t[k]);
  pot.fight = clampAttr(t.fight);
  pot.agility = clampAttr(t.agility);
  pot.temperament = clampAttr(t.temperament);
  pot.consistency = clampAttr(t.consistency);
  for (const k of Object.keys(pot) as Array<keyof Attributes>) pot[k] = Math.round(pot[k] * 10) / 10;
  return { potential: pot, distOptM, going: Math.round(Math.max(-1, Math.min(1, t.going)) * 100) / 100 };
}

/** Zuchtwert (Summe der Allele) eines Merkmals. */
export function breedingValue(gt: Genotype, key: GeneKey): number {
  const a = gt.loci[key];
  if (!a) return 0;
  let s = 0;
  for (const x of a) s += x;
  return s;
}

/** Zuchtwerte aller Merkmale (null, wenn die Allele nicht mehr gespeichert sind). */
export function breedingValues(gt: Genotype | null): Record<GeneKey, number> | null {
  if (!gt || !gt.loci.class) return null;
  const out = {} as Record<GeneKey, number>;
  for (const k of GENE_KEYS) out[k] = breedingValue(gt, k);
  return out;
}

// ------------------------------------------------------------------ Fellfarbe und Abzeichen

type Ext = 'E' | 'e';
type Ago = 'A' | 'At' | 'a';
type Grey = 'G' | 'g';

const EXT_FREQ: Array<[Ext, number]> = [
  ['E', 0.5],
  ['e', 0.5],
];
const AGO_FREQ: Array<[Ago, number]> = [
  ['A', 0.445],
  ['At', 0.31],
  ['a', 0.245],
];
const GREY_FREQ: Array<[Grey, number]> = [
  ['G', 0.046],
  ['g', 0.954],
];

function draw<T>(r: Rng, freq: Array<[T, number]>): T {
  return r.weighted(
    freq.map((f) => f[0]),
    freq.map((f) => f[1]),
  );
}

/** Fellfarbe aus den drei Genorten Extension, Agouti und Grey (echte Erbgänge). */
export function colourOf(c: Genotype['colour']): Colour {
  if (c.grey.includes('G')) return 'grey';
  if (!c.extension.includes('E')) return 'chestnut';
  if (c.agouti.includes('A')) return 'bay';
  if (c.agouti.includes('At')) return 'brown';
  return 'black';
}

function founderColour(colour: Colour, r: Rng): Genotype['colour'] {
  let last: Genotype['colour'] | null = null;
  for (let i = 0; i < 400; i++) {
    const c: Genotype['colour'] = {
      extension: [draw(r, EXT_FREQ), draw(r, EXT_FREQ)],
      agouti: [draw(r, AGO_FREQ), draw(r, AGO_FREQ)],
      grey: [draw(r, GREY_FREQ), draw(r, GREY_FREQ)],
    };
    last = c;
    if (colourOf(c) === colour) return c;
  }
  // Fallback: passende Minimal-Genotypen
  const fix: Record<Colour, Genotype['colour']> = {
    grey: { extension: ['E', 'e'], agouti: ['A', 'a'], grey: ['G', 'g'] },
    chestnut: { extension: ['e', 'e'], agouti: ['A', 'a'], grey: ['g', 'g'] },
    bay: { extension: ['E', 'e'], agouti: ['A', 'a'], grey: ['g', 'g'] },
    brown: { extension: ['E', 'e'], agouti: ['At', 'a'], grey: ['g', 'g'] },
    black: { extension: ['E', 'e'], agouti: ['a', 'a'], grey: ['g', 'g'] },
  };
  return last && colourOf(last) === colour ? last : fix[colour];
}

const FACE_SCORE: Record<Markings['face'], number> = { none: -0.8, star: 0, stripe: 0.5, blaze: 0.9 };

function founderWhite(m: Markings, r: Rng): number {
  const socks = m.socks.filter(Boolean).length;
  return round2(FACE_SCORE[m.face] + 0.15 * (socks - 1) + r.normal(0, 0.3));
}

/** Abzeichen aus der (teilweise erblichen) Weißneigung; Füchse zeigen mehr Weiß. */
export function expressMarkings(white: number, colour: Colour, r: Rng): Markings {
  const w = white + (colour === 'chestnut' ? 0.3 : 0);
  const z = w + r.normal(0, 0.3);
  const face: Markings['face'] = z < -0.4 ? 'none' : z < 0.3 ? 'star' : z < 0.7 ? 'stripe' : 'blaze';
  const p = (hind: boolean) => Math.max(0.02, Math.min(0.9, 0.2 + 0.25 * w + (hind ? 0.08 : 0)));
  return { face, socks: [r.chance(p(false)), r.chance(p(false)), r.chance(p(true)), r.chance(p(true))] };
}

// ------------------------------------------------------------------ Genotyp für Gründertiere

function splitAlleles(total: number, sdAllele: number, r: Rng): number[] {
  const n = 2 * LOCI;
  const a: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = r.normal(0, sdAllele);
    a.push(x);
    s += x;
  }
  const shift = (total - s) / n;
  return a.map((x) => round2(x + shift));
}

/**
 * Genotyp für ein Pferd ohne bekannte Eltern-Gene (Spielstart, Migration, generierte Pferde):
 * Der Zuchtwert wird aus dem sichtbaren Phänotyp geschätzt (bedingte Verteilung bei Erblichkeit h²).
 */
export function founderGenotype(h: Pick<Horse, 'potential' | 'prefs' | 'colour' | 'markings'>, line: string, r: Rng): Genotype {
  const t = traitsOf(h);
  const loci = {} as Record<GeneKey, number[]>;
  for (const k of GENE_KEYS) {
    const { mu, sd, h2 } = TRAITS[k];
    const a = h2 * (t[k] - mu) + r.normal(0, sd * Math.sqrt(h2 * (1 - h2)));
    loci[k] = splitAlleles(a, (sd * Math.sqrt(h2)) / Math.sqrt(2 * LOCI), r);
  }
  return { loci, colour: founderColour(h.colour, r), white: founderWhite(h.markings, r), line, coi: 0 };
}

/** Vaterlinie eines Pferds: Linie des Vaters, sonst per Seed zugeordnet. */
export function lineFor(g: GameState, h: Horse): string {
  const sire = h.sireId ? g.horses[h.sireId] : undefined;
  if (sire?.genotype?.line) return sire.genotype.line;
  const r = new Rng(deriveSeed(g.seed, 'line', h.sireId ?? h.id));
  return `L${r.int(1, LINE_COUNT)}`;
}

/** Stellt sicher, dass ein Pferd einen vollständigen Genotyp hat. */
export function ensureGenotype(g: GameState, h: Horse): Genotype {
  if (h.genotype && h.genotype.loci.class) return h.genotype;
  const line = h.genotype?.line ?? lineFor(g, h);
  const coi = h.genotype?.coi ?? 0;
  const gt = founderGenotype(h, line, new Rng(deriveSeed(g.seed, 'founder-gt', h.id)));
  gt.coi = coi;
  // Fellfarbe eines bereits genotypisierten Pferds beibehalten
  if (h.genotype?.colour) gt.colour = h.genotype.colour;
  h.genotype = gt;
  return gt;
}

/** Allele eines Rennpferds im Ruhestand verwerfen (es wird nie mehr züchten). */
export function dropLoci(h: Horse): void {
  if (h.genotype) h.genotype = { ...h.genotype, loci: {} };
}

// ------------------------------------------------------------------ Inzucht

/**
 * Inzuchtkoeffizient nach Wright über die Verwandtschaft der Eltern (Coancestry),
 * begrenzt auf sechs Generationen.
 */
export function inbreedingOf(g: GameState, sireId: string | null, damId: string | null): number {
  const memo = new Map<string, number>();
  const gen = (id: string) => g.horses[id]?.foalYear ?? 0;
  const coa = (a: string | null, b: string | null, depth: number): number => {
    if (!a || !b || depth > 12) return 0;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let v: number;
    if (a === b) {
      const h = g.horses[a];
      v = (1 + (h?.genotype?.coi ?? 0)) / 2;
    } else {
      // jüngeres Tier in seine Eltern auflösen
      const [young, old] = gen(a) >= gen(b) ? [a, b] : [b, a];
      const y = g.horses[young];
      v = y ? (coa(y.sireId, old, depth + 1) + coa(y.damId, old, depth + 1)) / 2 : 0;
    }
    memo.set(key, v);
    return v;
  };
  return Math.round(coa(sireId, damId, 0) * 10000) / 10000;
}

// ------------------------------------------------------------------ Paarung und Ausprägung

export interface Conception {
  genotype: Genotype;
  sex: Horse['sex'];
}

function inherit(sire: number[] | undefined, dam: number[] | undefined, r: Rng): number[] {
  const out: number[] = [];
  for (let i = 0; i < LOCI; i++) {
    out.push(sire ? sire[2 * i + (r.chance(0.5) ? 1 : 0)]! : 0);
    out.push(dam ? dam[2 * i + (r.chance(0.5) ? 1 : 0)]! : 0);
  }
  return out;
}

/** Befruchtung: Genotyp und Geschlecht des Fohlens stehen ab hier fest. */
export function conceive(g: GameState, sire: Horse, dam: Horse, r: Rng): Conception {
  const sg = ensureGenotype(g, sire);
  const dg = ensureGenotype(g, dam);
  const loci = {} as Record<GeneKey, number[]>;
  for (const k of GENE_KEYS) loci[k] = inherit(sg.loci[k], dg.loci[k], r);
  const pick = <T>(pair: [T, T]) => pair[r.chance(0.5) ? 1 : 0];
  const colour: Genotype['colour'] = {
    extension: [pick(sg.colour.extension), pick(dg.colour.extension)],
    agouti: [pick(sg.colour.agouti), pick(dg.colour.agouti)],
    grey: [pick(sg.colour.grey), pick(dg.colour.grey)],
  };
  const white = round2((sg.white + dg.white) / 2 + r.normal(0, 0.45));
  const coi = inbreedingOf(g, sire.id, dam.id);
  return { genotype: { loci, colour, white, line: sg.line, coi }, sex: r.chance(0.5) ? 'male' : 'female' };
}

/** Mittlere Zuchtwerte eines Deckjahrgangs festhalten (Kalibrierung des Weltniveaus). */
export function setCropOffsets(g: GameState, season: number, genotypes: Genotype[]): void {
  if (genotypes.length < 30) return;
  const off: Partial<Record<GeneKey, number>> = {};
  for (const k of GENE_KEYS) {
    off[k] = round2(genotypes.reduce((a, gt) => a + breedingValue(gt, k), 0) / genotypes.length);
  }
  g.genetics.offsets[season] = off;
}

/** Jüngster bekannter Jahrgangsausgleich bis einschließlich season. */
export function offsetFor(g: GameState, season: number): Partial<Record<GeneKey, number>> {
  let best: number | null = null;
  for (const s of Object.keys(g.genetics.offsets).map(Number)) if (s <= season && (best === null || s > best)) best = s;
  return best === null ? {} : g.genetics.offsets[best]!;
}

export interface Expression {
  potential: Attributes;
  prefs: Pick<Preferences, 'distOptM' | 'going'>;
  colour: Colour;
  markings: Markings;
  legRiskFactor: number;
}

/**
 * Ausprägung: Zuchtwert (abzüglich Jahrgangsmittel) plus Umwelt, Nick-Bonus der Linien und
 * Inzuchtdepression.
 */
export function express(g: GameState, gt: Genotype, damSireLine: string | null, coverSeason: number, r: Rng): Expression {
  const off = offsetFor(g, coverSeason);
  const t = {} as Record<GeneKey, number>;
  for (const k of GENE_KEYS) {
    const { mu, sd, h2 } = TRAITS[k];
    t[k] = mu + breedingValue(gt, k) - (off[k] ?? 0) + r.normal(0, sd * Math.sqrt(1 - h2));
  }
  t.class += nickValue(g, gt.line, damSireLine) - INBREEDING.class * gt.coi;
  t.consistency -= INBREEDING.consistency * gt.coi;
  t.temperament -= INBREEDING.temperament * gt.coi;
  const e = expressTraits(t);
  const colour = colourOf(gt.colour);
  return {
    potential: e.potential,
    prefs: { distOptM: e.distOptM, going: e.going },
    colour,
    markings: expressMarkings(gt.white, colour, r),
    legRiskFactor: 1 + INBREEDING.legRisk * gt.coi,
  };
}

/** Erwartete Klasse der Nachkommen (verborgen; für KI-Hengstwahl und Tests). */
export function expectedFoalClass(g: GameState, sire: Horse, dam: Horse, season: number): number {
  const off = offsetFor(g, season).class ?? 0;
  const sg = ensureGenotype(g, sire);
  const dg = ensureGenotype(g, dam);
  const coi = inbreedingOf(g, sire.id, dam.id);
  return (
    TRAITS.class.mu +
    (breedingValue(sg, 'class') + breedingValue(dg, 'class')) / 2 -
    off +
    nickValue(g, sg.line, dg.line) -
    INBREEDING.class * coi
  );
}

export { GENE_KEYS };
