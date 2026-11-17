import { deriveSeed, Rng } from '../rng';
import type { Horse, Stable, Stallion } from '../types';
import { ageAt, ceilingAttributes } from '../horse/maturity';
import { generateHorse } from '../horse/generate';
import { ATTR_KEYS } from '../types';
import { clampOr } from '../stats/rating';
import type { NameRegistry } from '../world/names';
import { type GameState, horsesWithStatus, invalidateHorseIndex, MARKET_STABLE_ID, sortedById, touch } from '../game/state';
import { conceive, dropLoci, ensureGenotype, express, LINE_COUNT, traitsOf, type Conception } from './genetics';

/**
 * Gestüt: Deckhengste und Zuchtstuten als echte Pferde, Decktaxen, Plätze und Kosten,
 * Gründertiere zu Spielbeginn und „Importe“ (sofort erzeugte Pferde mit echter Vaterseite).
 */

export const STUD_PLACES_PER_LEVEL = 6;
export const STUD_MAX_LEVEL = 5;
export const STUD_LEVEL_COST = 60000;
export const STUD_LEVEL_UPKEEP = 150;
/** Wochenkosten je Stute oder Nachwuchs: im eigenen Gestüt bzw. in Pension bei einem fremden Gestüt */
export const OWN_STUD_COST = 35;
export const EXTERNAL_STUD_COST = 90;
/** Hengsthaltung eines eigenen Deckhengsts (Deckstation, Versicherung) */
export const STALLION_UPKEEP = 150;
export const BOOK_LIMIT = 110;
/** Stuten werden bis zu diesem Alter gedeckt */
export const MARE_MAX_AGE = 21;
export const STALLION_MAX_AGE = 24;
export const BREEDERS_MARES = 150;

// ------------------------------------------------------------------ Decktaxe

/** Decktaxe aus öffentlicher Rennleistung (Official Rating). */
export function feeForRating(or: number): number {
  // bis OR 110 steil (£2.000 → £35.000), darüber flacher (OR 125 ≈ £120.000)
  const fee = or <= 110 ? 2000 * Math.exp((or - 90) / 7) : FEE_110 * Math.exp((or - 110) / 12);
  return Math.max(1000, Math.min(300000, Math.round(fee / 500) * 500));
}

const FEE_110 = 2000 * Math.exp(20 / 7);

export function ratingForFee(fee: number): number {
  return fee <= FEE_110 ? 90 + 7 * Math.log(fee / 2000) : 110 + 12 * Math.log(fee / FEE_110);
}

/** Aus der Decktaxe abgeleitete öffentliche Qualitätseinschätzung (Attributskala). */
export function publicSireQuality(s: Pick<Stallion, 'fee'>): number {
  return (ratingForFee(s.fee) + 55) / 2;
}

/** Öffentliches Niveau (Rating-Skala) einer Stute oder eines Hengsts aus der Rennkarriere. */
export function raceRecordLevel(h: Horse): number | null {
  if (h.officialRating !== null) return h.officialRating;
  return h.stats.bestFigure?.value ?? null;
}

// ------------------------------------------------------------------ Plätze und Kosten

export function studLevel(st: Stable): number {
  return st.facilities.stud ?? 0;
}

export function studPlaces(st: Stable): number {
  return studLevel(st) * STUD_PLACES_PER_LEVEL;
}

/** Stuten und Nachwuchs eines Stalls (zählen gegen die Gestütsplätze). */
export function studHorses(g: GameState, stableId: string): Horse[] {
  return horsesWithStatus(g, stableId, 'broodmare', 'young');
}

export function stallionsOf(g: GameState, stableId: string): Stallion[] {
  return sortedById(Object.values(g.stallions).filter((s) => s.active && s.ownerId === stableId));
}

/** Wöchentliche Gestütskosten eines Stalls. */
export function studWeeklyCost(g: GameState, st: Stable): { own: number; external: number; stallions: number; total: number } {
  const n = studHorses(g, st.id).length;
  const inside = Math.min(n, studPlaces(st));
  const outside = n - inside;
  const own = inside * OWN_STUD_COST;
  const external = outside * EXTERNAL_STUD_COST;
  const stallions = stallionsOf(g, st.id).length * STALLION_UPKEEP;
  return { own, external, stallions, total: own + external + stallions };
}

/** Steht die Stute im eigenen Gestüt (sonst in Pension)? Wer zuerst kam, hat Platz. */
export function inOwnStud(g: GameState, h: Horse): boolean {
  const st = g.stables[h.stableId];
  if (!st || st.kind !== 'player') return true;
  const list = studHorses(g, st.id);
  const i = list.findIndex((x) => x.id === h.id);
  return i >= 0 && i < studPlaces(st);
}

// ------------------------------------------------------------------ Hengste

function stallionRecord(g: GameState, h: Horse, ownerId: string, since: number): Stallion {
  const rating = raceRecordLevel(h);
  return {
    id: h.id,
    name: h.name,
    foalYear: h.foalYear,
    fee: feeForRating(rating ?? 75),
    ownerId,
    line: ensureGenotype(g, h).line,
    bookLimit: BOOK_LIMIT,
    covers: 0,
    since,
    raceRating: rating,
    active: true,
  };
}

/** Hengst aufstellen: Pferd wechselt in den Status „stud“ und erscheint im Hengstregister. */
export function standStallion(g: GameState, h: Horse, ownerId: string): Stallion {
  h.status = 'stud';
  h.stableId = ownerId;
  h.forSale = null;
  h.groomId = null;
  const s = stallionRecord(g, h, ownerId, g.week <= 10 ? g.season : g.season + 1);
  g.stallions[h.id] = s;
  touch(g, h.id);
  return s;
}

export function pensionStallion(g: GameState, s: Stallion): void {
  s.active = false;
  const h = g.horses[s.id];
  if (h) {
    h.status = 'retired';
    dropLoci(h);
    touch(g, h.id);
  }
}

export function activeStallions(g: GameState): Stallion[] {
  return sortedById(Object.values(g.stallions)).filter((s) => s.active);
}

// ------------------------------------------------------------------ Gründertiere

function founderRecord(h: Horse, r: Rng, rating: number | null): void {
  if (rating === null) return;
  const starts = r.int(5, 18);
  const winP = Math.max(0.05, Math.min(0.5, 0.15 + (rating - 70) / 120));
  let wins = 0;
  let places = 0;
  for (let i = 0; i < starts; i++) {
    const u = r.next();
    if (u < winP) wins++;
    else if (u < winP * 2.6) places++;
  }
  h.preRecord = { starts, wins, places, earnings: Math.round((wins * 9000 + places * 2200) * (1 + Math.max(0, rating - 70) / 12)) };
  h.officialRating = clampOr(Math.round(rating));
  h.ratingHistory = [{ season: h.foalYear + 4, week: 40, rating: h.officialRating, runId: null }];
}

/** Rennpferd im Ruhestand: Gene aus dem Phänotyp, Rating aus der (gedachten) Karriere. */
function founderHorse(
  g: GameState,
  r: Rng,
  names: NameRegistry,
  o: { id: string; name?: string; sex: Horse['sex']; quality: number; foalYear: number; stableId: string; status: Horse['status']; raced: boolean },
): Horse {
  const h = generateHorse(r, {
    id: o.id,
    name: o.name ?? names.horseName(r),
    stableId: o.stableId,
    foalYear: o.foalYear,
    quality: o.quality,
    season: g.season,
    week: g.week,
    sex: o.sex,
  });
  h.gelded = false;
  h.status = o.status;
  const level = 2 * traitsOf(h).class - 55;
  founderRecord(h, r.fork('record'), o.raced ? level + r.normal(0, 4) : null);
  return h;
}

/** Vater für ein Gründertier: Hengst mit passender (verborgener) Klasse, mindestens 4 Jahre älter. */
export function pickFounderSire(g: GameState, r: Rng, targetQ: number, foalYear: number): Horse | null {
  const list = activeStallions(g)
    .map((s) => g.horses[s.id])
    .filter((h): h is Horse => !!h && h.foalYear <= foalYear - 4);
  const pool = list.length ? list : activeStallions(g).map((s) => g.horses[s.id]!).filter(Boolean);
  if (!pool.length) return null;
  return r.weighted(
    pool,
    pool.map((h) => Math.exp(-((traitsOf(h).class - targetQ) ** 2) / (2 * 6 * 6))),
  );
}

/** Abstammung für ein Gründertier: Vater aus dem Register, Mutter nur mit Namen. */
export function assignPedigree(g: GameState, h: Horse, r: Rng, names: NameRegistry): void {
  const q = traitsOf(h).class;
  const sire = pickFounderSire(g, r, q + r.normal(0, 4), h.foalYear);
  if (sire) {
    h.sireId = sire.id;
    h.sireName = sire.name;
  }
  h.damName = h.damName ?? names.horseName(r);
}

/** Hengstregister zu Spielbeginn: 40 Hengste (Gründer der Hengstlinien), Besitzer sind die Gestüte der Züchter. */
export function createFounderStallions(g: GameState, r: Rng, names: NameRegistry, n = 40, preset?: Array<{ id: string; name: string; foalYear: number; quality: number }>): void {
  const list =
    preset ??
    Array.from({ length: n }, (_, i) => ({
      id: `st${i + 1}`,
      name: '',
      foalYear: g.season - r.int(5, 19),
      quality: Math.round(Math.max(62, Math.min(82, r.normal(71, 4))) * 10) / 10,
    }));
  list.forEach((p, i) => {
    const hr = r.fork('stallion', p.id);
    const h = founderHorse(g, hr, names, {
      id: p.id,
      name: p.name || stallionName(hr, names),
      sex: 'male',
      quality: p.quality,
      foalYear: p.foalYear,
      stableId: MARKET_STABLE_ID,
      status: 'stud',
      raced: true,
    });
    const gt = ensureGenotype(g, h);
    gt.line = `L${(i % LINE_COUNT) + 1}`;
    h.damName = names.horseName(hr);
    g.horses[h.id] = h;
    const s = stallionRecord(g, h, MARKET_STABLE_ID, h.foalYear + 4);
    g.stallions[s.id] = s;
  });
  invalidateHorseIndex(g);
}

const FEMALE_TITLE = /^(Lady|Queen|Miss|Princess|Duchess|Madame|Mrs|Dame|Countess|Mistress)(\s|$)/;

export function stallionName(r: Rng, names: NameRegistry): string {
  for (let i = 0; i < 50; i++) {
    const n = names.horseName(r);
    if (FEMALE_TITLE.test(n)) continue;
    return n;
  }
  return names.horseName(r);
}

/** Zuchtstuten der KI-Ställe und der Züchter zu Spielbeginn. */
export function createFounderMares(g: GameState, r: Rng, names: NameRegistry, stableQuality: Record<string, number>): void {
  for (const st of sortedById(Object.values(g.stables))) {
    if (st.kind === 'player') continue;
    const n = st.kind === 'market' ? BREEDERS_MARES : aiMareTarget(g, st.id);
    const sq = st.kind === 'market' ? 60 : (stableQuality[st.id] ?? 62) - 1;
    const sr = r.fork('mares', st.id);
    for (let i = 0; i < n; i++) addFounderMare(g, sr.fork(i), names, st.id, sr.normal(sq, 5));
  }
}

export function addFounderMare(g: GameState, r: Rng, names: NameRegistry, stableId: string, quality: number): Horse {
  const h = founderHorse(g, r, names, {
    id: `h${++g.counters.horse}`,
    sex: 'female',
    quality,
    foalYear: g.season - r.int(4, 16),
    stableId,
    status: 'broodmare',
    raced: r.chance(0.82),
  });
  assignPedigree(g, h, r.fork('ped'), names);
  ensureGenotype(g, h);
  g.horses[h.id] = h;
  touch(g, h.id);
  return h;
}

/** Zielgröße der Stutenherde eines KI-Stalls (6–12, je nach Stall). */
export function aiMareTarget(g: GameState, stableId: string): number {
  return 6 + new Rng(deriveSeed(g.seed, 'mare-target', stableId)).int(0, 6);
}

// ------------------------------------------------------------------ Fohlen aus einer Befruchtung

export interface FoalOptions {
  id: string;
  name: string;
  stableId: string;
  foalYear: number;
  sire: Horse;
  dam: Horse | null;
  damName: string;
  damSireLine: string | null;
  coverSeason: number;
  status: Horse['status'];
  /** Gestütsleiter (0–1): Exterieur */
  studManager?: number;
  trainedLevel?: number;
}

export function foalFromConception(g: GameState, c: Conception, o: FoalOptions, r: Rng): Horse {
  const e = express(g, c.genotype, o.damSireLine, o.coverSeason, r.fork('express'));
  const h = generateHorse(r, {
    id: o.id,
    name: o.name,
    stableId: o.stableId,
    foalYear: o.foalYear,
    quality: 0,
    season: g.season,
    week: g.week,
    sex: c.sex,
    potential: e.potential,
    distOptM: e.prefs.distOptM,
    going: e.prefs.going,
    colour: e.colour,
    markings: e.markings,
    legRiskFactor: e.legRiskFactor,
    trainedLevel: o.trainedLevel,
  });
  h.sireId = o.sire.id;
  h.sireName = o.sire.name;
  h.damId = o.dam?.id ?? null;
  h.damName = o.damName;
  h.genotype = c.genotype;
  h.breederId = o.stableId;
  h.status = o.status;
  if (o.studManager !== undefined) h.conformation = Math.round(Math.max(1, Math.min(100, h.conformation + 4 * (o.studManager - 0.5))));
  return h;
}

/** Ein Pferd beginnt mit zwei Jahren das Training (Stand: angeritten, noch nicht fit). */
export function startTraining(g: GameState, h: Horse, r: Rng): void {
  h.status = 'active';
  const ceiling = ceilingAttributes(h.potential, h.maturity, ageAt(h.foalYear, g.season, g.week));
  const lvl = r.range(0.86, 0.93);
  for (const k of ATTR_KEYS) h.current[k] = Math.round(ceiling[k] * lvl * 10) / 10;
  h.condition.fitness = Math.round(r.range(55, 70));
  h.condition.freshness = 100;
  touch(g, h.id);
}

/**
 * „Import“: sofort erzeugtes Pferd mit echtem Vater aus dem Register und einer Mutter aus dem
 * Ausland (nur Name). Füllt Auktionen und KI-Ställe, solange die eigene Zucht nicht reicht.
 */
export function importHorse(
  g: GameState,
  r: Rng,
  names: NameRegistry,
  o: { stableId: string; foalYear: number; damQuality: number; status: Horse['status']; trainedLevel?: number },
): Horse {
  const id = `h${++g.counters.horse}`;
  const damName = names.horseName(r);
  const dam = generateHorse(r.fork('dam'), {
    id: `${id}-dam`,
    name: damName,
    stableId: MARKET_STABLE_ID,
    foalYear: o.foalYear - r.int(5, 12),
    quality: o.damQuality,
    season: g.season,
    week: g.week,
    sex: 'female',
  });
  const damSire = pickFounderSire(g, r.fork('damsire'), o.damQuality + 3, dam.foalYear);
  dam.sireId = damSire?.id ?? null;
  const sire = pickFounderSire(g, r.fork('sire'), o.damQuality + 6 + r.normal(0, 4), o.foalYear - 1);
  if (!sire) throw new Error('Kein Deckhengst im Register.');
  dam.genotype = null;
  ensureGenotype(g, dam);
  const c = conceive(g, sire, dam, r.fork('conceive'));
  c.genotype.coi = 0;
  const h = foalFromConception(
    g,
    c,
    {
      id,
      name: names.horseName(r),
      stableId: o.stableId,
      foalYear: o.foalYear,
      sire,
      dam: null,
      damName,
      damSireLine: dam.genotype!.line,
      coverSeason: o.foalYear - 1,
      status: o.status,
      trainedLevel: o.trainedLevel,
    },
    r.fork('foal'),
  );
  h.breederId = MARKET_STABLE_ID;
  g.horses[h.id] = h;
  touch(g, h.id);
  return h;
}
