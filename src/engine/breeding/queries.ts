import type { Going, Horse, Stallion } from '../types';
import { COLOUR_LABEL, sexLabel } from '../game/format';
import { type GameState, sortedById, staffOfStable } from '../game/state';
import { stableEffects, stars } from '../staff/staff';
import { marketValue } from '../economy/value';
import { freeBoxes } from '../market/transfer';
import { partnerShare, shareListings, type ShareListing } from '../market/partnership';
import { inbreedingOf, lineName } from './genetics';
import {
  inOwnStud,
  MARE_MAX_AGE,
  publicSireQuality,
  raceRecordLevel,
  stallionsOf,
  studHorses,
  studLevel,
  studPlaces,
  studWeeklyCost,
} from './stud';
import { blackTypeWins, conceptionChance, COVER_LAST_WEEK, isCoveringSeason, progenyStats, type ProgenyStats } from './cycle';
import { planSeason } from './commands';

/**
 * Abfragen rund um die Zucht. Alles hier ist öffentlich (Rennleistung, Decktaxen, Nachkommen,
 * Abstammung); verborgene Gene erscheinen nie. Die Paarungsprognose schätzt aus öffentlichen
 * Daten; ein guter Gestütsleiter macht sie genauer.
 */

const GOING_SCALE: Partial<Record<Going, number>> = { firm: -1, good_to_firm: -0.5, good: 0, good_to_soft: 0.5, soft: 1, heavy: 1.5 };

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Öffentliche Qualitätseinschätzung (Attributskala) einer Stute: Rennleistung, sonst ihr Vater. */
function publicMareQuality(g: GameState, h: Horse): number {
  const lv = raceRecordLevel(h);
  if (lv !== null) return (lv + 55) / 2;
  const sire = h.sireId ? g.stallions[h.sireId] : undefined;
  return sire ? publicSireQuality(sire) - 4 : 60;
}

/** Weltmittel der Klasse und wirksame Erblichkeit für die öffentliche Prognose. */
const PROGNOSIS_MEAN = 60.5;
const PROGNOSIS_H2 = 0.45;

const PROGNOSIS_SHIFT = -0.6;

/** Beitrag eines Elternteils zur Klasse des Fohlens: aus der eigenen Leistung, mit wachsender Zahl gerateter Nachkommen aus deren Leistung. */
function halfEffect(g: GameState, parentId: string, field: 'sireId' | 'damId', publicQ: number, popClass: number): number {
  const fromRecord = (PROGNOSIS_H2 * (publicQ - PROGNOSIS_MEAN)) / 2;
  const ps = progenyStats(g, parentId, field);
  if (ps.rated < 2 || ps.avgRating === null) return fromRecord;
  const fromProgeny = (ps.avgRating + 55) / 2 - popClass;
  const w = ps.rated / (ps.rated + 6);
  return (1 - w) * fromRecord + w * fromProgeny;
}

/** Erwartetes Niveau eines Fohlens auf der Rating-Skala. */
const levelOf = (q: number) => Math.round(2 * q - 55);

export interface SireTendency {
  /** mittlere Siegdistanz der Nachkommen (m) */
  winDistanceM: number | null;
  /** −1 fest … +1 weich (aus Siegen nach Boden) */
  going: number | null;
  wins: number;
}

/** Distanz- und Bodenvererbung aus den Siegen der Nachkommen. */
export function sireTendency(g: GameState, parentId: string, field: 'sireId' | 'damId' = 'sireId'): SireTendency {
  let n = 0;
  let dist = 0;
  let gn = 0;
  let going = 0;
  for (const h of Object.values(g.horses)) {
    if (h[field] !== parentId) continue;
    for (const id of h.runIds) {
      const run = g.runs[id];
      if (!run || run.position !== 1) continue;
      n++;
      dist += run.distanceM;
      const gv = GOING_SCALE[run.going];
      if (gv !== undefined) {
        gn++;
        going += gv;
      }
    }
  }
  return { winDistanceM: n ? Math.round(dist / n / 50) * 50 : null, going: gn >= 3 ? round1(going / gn) : null, wins: n };
}

// ------------------------------------------------------------------ Gestüt

export interface MareRow {
  id: string;
  name: string;
  age: number;
  colour: string;
  sire: string | null;
  rating: number | null;
  value: number;
  inOwnStud: boolean;
  pregnancy: { sireId: string; sireName: string; due: string; coverSeason: number } | null;
  plan: { stallionId: string; name: string; fee: number; own: boolean } | null;
  canPlan: boolean;
  conceptionPct: number;
  foals: number;
  bestProgeny: number | null;
  barren: boolean;
}

export interface YoungRow {
  id: string;
  name: string;
  age: number;
  sex: string;
  colour: string;
  sire: string | null;
  sireId: string | null;
  dam: string | null;
  conformation: string;
  value: number;
  canTrain: boolean;
}

export interface OwnStallionRow {
  id: string;
  name: string;
  age: number;
  fee: number;
  covers: number;
  bookLimit: number;
  since: number;
  line: string | null;
  progeny: ProgenyStats;
  partners: number;
}

export interface StudView {
  level: number;
  places: number;
  used: number;
  weeklyCost: { own: number; external: number; stallions: number; total: number };
  studManager: { name: string; stars: number } | null;
  planSeason: number;
  covering: boolean;
  coverWeeksLeft: number;
  freeBoxes: number;
  mares: MareRow[];
  young: YoungRow[];
  stallions: OwnStallionRow[];
  candidates: Array<{ id: string; name: string; age: number; sex: 'female' | 'male'; rating: number | null; canStud: boolean }>;
}

function conformationLabel(c: number): string {
  return c >= 72 ? 'hervorragend' : c >= 66 ? 'sehr gut' : c >= 60 ? 'gut' : c >= 54 ? 'ordentlich' : 'unauffällig';
}

function dueLabel(g: GameState, season: number, week: number): string {
  return `W${week}/${String(season).slice(2)}`;
}

export function studView(g: GameState): StudView {
  const st = g.stables[g.playerStableId]!;
  const ps = planSeason(g);
  const mgr = staffOfStable(g, st.id, 'stud_manager')[0];
  const horses = studHorses(g, st.id);
  const bestByDam = new Map<string, number>();
  const foalsByDam = new Map<string, number>();
  for (const x of Object.values(g.horses)) {
    if (!x.damId) continue;
    foalsByDam.set(x.damId, (foalsByDam.get(x.damId) ?? 0) + 1);
    if (x.officialRating !== null) bestByDam.set(x.damId, Math.max(bestByDam.get(x.damId) ?? 0, x.officialRating));
  }
  const mares = horses
    .filter((h) => h.status === 'broodmare')
    .map<MareRow>((h) => {
      const preg = g.breeding.pregnancies[`${h.id}:${ps}`] ?? g.breeding.pregnancies[`${h.id}:${ps - 1}`] ?? null;
      const planId = g.breeding.plans[h.id];
      const plan = planId ? g.stallions[planId] : undefined;
      const age = g.season - h.foalYear;
      return {
        id: h.id,
        name: h.name,
        age,
        colour: COLOUR_LABEL[h.colour] ?? h.colour,
        sire: h.sireName,
        rating: raceRecordLevel(h),
        value: marketValue(g, h),
        inOwnStud: inOwnStud(g, h),
        pregnancy: preg ? { sireId: preg.sireId, sireName: g.stallions[preg.sireId]?.name ?? g.horses[preg.sireId]?.name ?? '?', due: dueLabel(g, preg.coverSeason + 1, preg.dueWeek), coverSeason: preg.coverSeason } : null,
        plan: plan ? { stallionId: plan.id, name: plan.name, fee: plan.ownerId === st.id ? 0 : plan.fee, own: plan.ownerId === st.id } : null,
        canPlan: ps - h.foalYear <= MARE_MAX_AGE && !g.breeding.pregnancies[`${h.id}:${ps}`],
        conceptionPct: Math.round(conceptionChance(g, h) * 1000) / 10,
        foals: foalsByDam.get(h.id) ?? 0,
        bestProgeny: bestByDam.get(h.id) ?? null,
        barren: g.breeding.barren.includes(h.id),
      };
    });
  const young = horses
    .filter((h) => h.status === 'young')
    .map<YoungRow>((h) => {
      const age = g.season - h.foalYear;
      return {
        id: h.id,
        name: h.name,
        age,
        sex: sexLabel(h.sex, h.gelded, age),
        colour: COLOUR_LABEL[h.colour] ?? h.colour,
        sire: h.sireName,
        sireId: h.sireId,
        dam: h.damName,
        conformation: conformationLabel(h.conformation),
        value: marketValue(g, h),
        canTrain: age >= 2,
      };
    });
  const stallions = stallionsOf(g, st.id).map<OwnStallionRow>((s) => ownStallionRow(g, s));
  const candidates = sortedById(Object.values(g.horses))
    .filter((h) => h.stableId === st.id && h.status === 'active' && !h.boarding && g.season - h.foalYear >= 3 && (h.sex === 'female' || !h.gelded))
    .map((h) => {
      const rating = raceRecordLevel(h);
      return { id: h.id, name: h.name, age: g.season - h.foalYear, sex: h.sex, rating, canStud: h.sex === 'male' && rating !== null && rating >= 75 };
    });
  return {
    level: studLevel(st),
    places: studPlaces(st),
    used: horses.length,
    weeklyCost: studWeeklyCost(g, st),
    studManager: mgr ? { name: mgr.name, stars: stars(mgr) } : null,
    planSeason: ps,
    covering: isCoveringSeason(g.week),
    coverWeeksLeft: isCoveringSeason(g.week) ? COVER_LAST_WEEK - g.week + 1 : 0,
    freeBoxes: freeBoxes(g),
    mares,
    young,
    stallions,
    candidates,
  };
}

function ownStallionRow(g: GameState, s: Stallion): OwnStallionRow {
  const h = g.horses[s.id]!;
  return {
    id: s.id,
    name: s.name,
    age: g.season - h.foalYear,
    fee: s.fee,
    covers: s.covers,
    bookLimit: s.bookLimit,
    since: s.since,
    line: lineName(g, s.line),
    progeny: progenyStats(g, s.id),
    partners: (h.partners ?? []).reduce((a, p) => a + p.share, 0),
  };
}

// ------------------------------------------------------------------ Hengstsuche und Paarungsprognose

export interface StallionRow {
  id: string;
  name: string;
  age: number;
  colour: string;
  fee: number;
  owner: string;
  own: boolean;
  line: string | null;
  lineId: string;
  raceRating: number | null;
  sire: string | null;
  progeny: ProgenyStats;
  tendency: SireTendency;
  book: { covers: number; limit: number };
  since: number;
  /** nur mit gewählter Stute */
  match: {
    coi: number;
    expected: number;
    low: number;
    high: number;
    nick: { n: number; diff: number } | null;
    fee: number;
    /** Hengst ist der Vater der Stute (nicht wählbar) */
    isSire: boolean;
  } | null;
}

export interface NickCell {
  sireLine: string;
  damSireLine: string;
  n: number;
  avgRating: number;
  diff: number;
}

/** Nachkommen-Statistik je Vaterlinie × Muttervaterlinie (öffentlich: Ratings). */
export function nickTable(g: GameState): { cells: NickCell[]; population: number } {
  const acc = new Map<string, { n: number; sum: number }>();
  let pn = 0;
  let ps = 0;
  for (const h of Object.values(g.horses)) {
    if (h.officialRating === null || !h.sireId || !h.damId) continue;
    const sire = g.horses[h.sireId];
    const dam = g.horses[h.damId];
    const sl = sire?.genotype?.line;
    const dl = dam?.genotype?.line;
    if (!sl || !dl) continue;
    pn++;
    ps += h.officialRating;
    const k = `${sl}|${dl}`;
    const a = acc.get(k) ?? { n: 0, sum: 0 };
    a.n++;
    a.sum += h.officialRating;
    acc.set(k, a);
  }
  const pop = pn ? ps / pn : 70;
  const cells: NickCell[] = [];
  for (const [k, a] of acc) {
    const [s, d] = k.split('|') as [string, string];
    cells.push({ sireLine: s, damSireLine: d, n: a.n, avgRating: round1(a.sum / a.n), diff: round1(a.sum / a.n - pop) });
  }
  return { cells: cells.sort((x, y) => (x.sireLine + x.damSireLine < y.sireLine + y.damSireLine ? -1 : 1)), population: round1(pop) };
}

export function stallionList(g: GameState, mareId?: string | null): { rows: StallionRow[]; mare: { id: string; name: string; line: string | null } | null; studManager: number | null } {
  const ps = planSeason(g);
  const mare = mareId ? g.horses[mareId] : undefined;
  const sm = stableEffects(g, g.playerStableId).studManager;
  const nicks = mare ? new Map(nickTable(g).cells.map((c) => [`${c.sireLine}|${c.damSireLine}`, c])) : null;
  const popClass = (nickTable(g).population + 55) / 2;
  const mareHalf = mare ? halfEffect(g, mare.id, 'damId', publicMareQuality(g, mare), popClass) : 0;
  const mareLine = mare?.genotype?.line ?? (mare?.sireId ? g.horses[mare.sireId]?.genotype?.line : undefined) ?? null;
  const rows = sortedById(Object.values(g.stallions))
    .filter((s) => s.active && s.since <= ps)
    .map<StallionRow>((s) => {
      const h = g.horses[s.id]!;
      const own = s.ownerId === g.playerStableId;
      let match: StallionRow['match'] = null;
      if (mare) {
        // Regression zum Mittel: Fohlen erben nur einen Teil der Leistung der Eltern;
        // gelaufene Nachkommen zeigen, was ein Elternteil tatsächlich vererbt
        const q = PROGNOSIS_MEAN + halfEffect(g, s.id, 'sireId', publicSireQuality(s), popClass) + mareHalf + PROGNOSIS_SHIFT;
        const sd = 3 + 4 * (1 - (sm ?? 0.3));
        const nick = nicks?.get(`${s.line}|${mareLine}`);
        match = {
          coi: inbreedingOf(g, s.id, mare.id),
          expected: levelOf(q),
          low: levelOf(q - 1.3 * sd),
          high: levelOf(q + 1.3 * sd),
          nick: nick && nick.n >= 3 ? { n: nick.n, diff: nick.diff } : null,
          fee: own ? 0 : s.fee,
          isSire: mare.sireId === s.id,
        };
      }
      return {
        id: s.id,
        name: s.name,
        age: g.season - h.foalYear,
        colour: COLOUR_LABEL[h.colour] ?? h.colour,
        fee: s.fee,
        owner: own ? 'du' : (g.stables[s.ownerId]?.name ?? 'Gestüt'),
        own,
        line: lineName(g, s.line),
        lineId: s.line,
        raceRating: s.raceRating,
        sire: h.sireName,
        progeny: progenyStats(g, s.id),
        tendency: sireTendency(g, s.id),
        book: { covers: s.covers, limit: s.bookLimit },
        since: s.since,
        match,
      };
    })
    .sort((a, b) => b.fee - a.fee);
  return { rows, mare: mare ? { id: mare.id, name: mare.name, line: lineName(g, mareLine) } : null, studManager: sm };
}

// ------------------------------------------------------------------ Stammbaum

export interface PedigreeNode {
  id: string | null;
  name: string | null;
  rating: number | null;
  stallion: boolean;
}

export interface PedigreeView {
  /** Generationen: [Vater, Mutter], [VV, VM, MV, MM], … (4 Generationen) */
  generations: PedigreeNode[][];
  coi: number | null;
  line: string | null;
  damSireLine: string | null;
  siblings: Array<{ id: string; name: string; age: number; sire: string | null; rating: number | null; wins: number; starts: number }>;
  progeny: { stats: ProgenyStats; tendency: SireTendency; mateLabel: string; list: Array<{ id: string; name: string; age: number; mate: string | null; rating: number | null; wins: number; starts: number }> } | null;
  stallion: { fee: number; covers: number; since: number; active: boolean; owner: string } | null;
  pregnancy: { sire: string; due: string } | null;
  partners: Array<{ name: string; share: number }>;
  myShare: number;
}

export function pedigreeView(g: GameState, horseId: string): PedigreeView {
  const h = g.horses[horseId];
  if (!h) throw new Error('Pferd nicht gefunden.');
  const node = (id: string | null, name: string | null, male: boolean): PedigreeNode => {
    const x = id ? g.horses[id] : undefined;
    return { id: x ? x.id : null, name: x?.name ?? name, rating: x ? raceRecordLevel(x) : null, stallion: male && !!(x && g.stallions[x.id]) };
  };
  const generations: PedigreeNode[][] = [];
  let level: Array<{ id: string | null; name: string | null }> = [{ id: h.id, name: h.name }];
  for (let gen = 0; gen < 4; gen++) {
    const next: Array<{ id: string | null; name: string | null }> = [];
    const row: PedigreeNode[] = [];
    for (const p of level) {
      const x = p.id ? g.horses[p.id] : undefined;
      const sire = { id: x?.sireId ?? null, name: x?.sireName ?? null };
      const dam = { id: x?.damId ?? null, name: x?.damName ?? null };
      row.push(node(sire.id, sire.name, true), node(dam.id, dam.name, false));
      next.push(sire, dam);
    }
    generations.push(row);
    level = next;
  }
  const dam = h.damId ? g.horses[h.damId] : undefined;
  const sib = (x: Horse) => ({
    id: x.id,
    name: x.name,
    age: g.season - x.foalYear,
    sire: x.sireName,
    rating: x.officialRating,
    wins: x.stats.wins + x.preRecord.wins,
    starts: x.stats.starts + x.preRecord.starts,
  });
  const siblings = h.damId ? sortedById(Object.values(g.horses).filter((x) => x.damId === h.damId && x.id !== h.id)).map(sib) : [];
  const isParent = h.status === 'stud' || h.status === 'broodmare' || Object.values(g.stallions).some((s) => s.id === h.id);
  const field = h.sex === 'male' ? 'sireId' : 'damId';
  let progeny: PedigreeView['progeny'] = null;
  if (isParent || Object.values(g.horses).some((x) => x[field] === h.id)) {
    const list = sortedById(Object.values(g.horses).filter((x) => x[field] === h.id))
      .sort((a, b) => b.foalYear - a.foalYear)
      .slice(0, 60)
      .map((x) => ({ ...sib(x), mate: field === 'sireId' ? x.damName : x.sireName }));
    progeny = { stats: progenyStats(g, h.id, field), tendency: sireTendency(g, h.id, field), mateLabel: field === 'sireId' ? 'Mutter' : 'Vater', list };
  }
  const s = g.stallions[h.id];
  const preg = h.status === 'broodmare' ? (g.breeding.pregnancies[`${h.id}:${g.season}`] ?? g.breeding.pregnancies[`${h.id}:${g.season - 1}`]) : undefined;
  const line = h.genotype?.line ?? (h.sireId ? g.horses[h.sireId]?.genotype?.line : undefined) ?? null;
  const dsl = dam?.genotype?.line ?? (dam?.sireId ? g.horses[dam.sireId]?.genotype?.line : undefined) ?? null;
  return {
    generations,
    coi: h.genotype ? h.genotype.coi : null,
    line: lineName(g, line),
    damSireLine: lineName(g, dsl),
    siblings,
    progeny,
    stallion: s ? { fee: s.fee, covers: s.covers, since: s.since, active: s.active, owner: s.ownerId === g.playerStableId ? 'du' : (g.stables[s.ownerId]?.name ?? 'Gestüt') } : null,
    pregnancy: preg ? { sire: g.horses[preg.sireId]?.name ?? '?', due: dueLabel(g, preg.coverSeason + 1, preg.dueWeek) } : null,
    partners: (h.partners ?? []).map((p) => ({ name: g.stables[p.stableId]?.name ?? p.stableId, share: p.share })),
    myShare: partnerShare(h, g.playerStableId),
  };
}

// ------------------------------------------------------------------ Zucht-Statistik

export interface SireTableRow {
  id: string;
  name: string;
  active: boolean;
  fee: number | null;
  line: string | null;
  owner: string;
  progeny: ProgenyStats;
  winnerPct: number | null;
  tendency: SireTendency;
}

export interface BreedingStatsView {
  sires: SireTableRow[];
  dams: Array<{ id: string; name: string; owner: string; foals: number; runners: number; winners: number; best: number | null; stakesWinners: number }>;
  nicks: { cells: Array<NickCell & { sireLineName: string; damSireLineName: string }>; population: number; lines: Array<{ id: string; name: string }> };
  breeders: Array<{ id: string; name: string; isPlayer: boolean; bred: number; runners: number; winners: number; stakesWinners: number; earnings: number }>;
}

export function breedingStatsView(g: GameState): BreedingStatsView {
  const sires = sortedById(Object.values(g.stallions))
    .map<SireTableRow>((s) => {
      const ps = progenyStats(g, s.id);
      return {
        id: s.id,
        name: s.name,
        active: s.active,
        fee: s.active ? s.fee : null,
        line: lineName(g, s.line),
        owner: s.ownerId === g.playerStableId ? 'du' : (g.stables[s.ownerId]?.name ?? 'Gestüt'),
        progeny: ps,
        winnerPct: ps.runners ? Math.round((1000 * ps.winners) / ps.runners) / 10 : null,
        tendency: sireTendency(g, s.id),
      };
    })
    .filter((r) => r.active || r.progeny.foals > 0)
    .sort((a, b) => (b.progeny.avgRating ?? 0) - (a.progeny.avgRating ?? 0) || (b.fee ?? 0) - (a.fee ?? 0));

  const damAcc = new Map<string, { foals: number; runners: number; winners: number; best: number | null; sw: number }>();
  const breederAcc = new Map<string, { bred: number; runners: number; winners: number; sw: number; earnings: number }>();
  for (const h of Object.values(g.horses)) {
    const raced = h.stats.starts + h.preRecord.starts > 0;
    const won = h.stats.wins + h.preRecord.wins > 0;
    const sw = blackTypeWins(h) > 0;
    if (h.damId && g.horses[h.damId]) {
      const a = damAcc.get(h.damId) ?? { foals: 0, runners: 0, winners: 0, best: null, sw: 0 };
      a.foals++;
      if (raced) a.runners++;
      if (won) a.winners++;
      if (sw) a.sw++;
      if (h.officialRating !== null) a.best = Math.max(a.best ?? 0, h.officialRating);
      damAcc.set(h.damId, a);
    }
    if (h.breederId && h.damId) {
      const b = breederAcc.get(h.breederId) ?? { bred: 0, runners: 0, winners: 0, sw: 0, earnings: 0 };
      b.bred++;
      if (raced) b.runners++;
      if (won) b.winners++;
      if (sw) b.sw++;
      b.earnings += h.stats.earnings;
      breederAcc.set(h.breederId, b);
    }
  }
  const dams = [...damAcc.entries()]
    .filter(([, a]) => a.runners > 0)
    .map(([id, a]) => {
      const d = g.horses[id]!;
      return { id, name: d.name, owner: g.stables[d.stableId]?.name ?? '', foals: a.foals, runners: a.runners, winners: a.winners, best: a.best, stakesWinners: a.sw };
    })
    .sort((a, b) => b.stakesWinners - a.stakesWinners || (b.best ?? 0) - (a.best ?? 0))
    .slice(0, 50);
  const nt = nickTable(g);
  const ln = (id: string) => lineName(g, id) ?? id;
  const breeders = [...breederAcc.entries()]
    .map(([id, b]) => {
      const st = g.stables[id];
      return { id, name: st ? (st.kind === 'market' ? 'Gestüte der Züchter' : st.name) : id, isPlayer: id === g.playerStableId, bred: b.bred, runners: b.runners, winners: b.winners, stakesWinners: b.sw, earnings: b.earnings };
    })
    .sort((a, b) => b.earnings - a.earnings);
  return {
    sires,
    dams,
    nicks: { cells: nt.cells.filter((c) => c.n >= 3).map((c) => ({ ...c, sireLineName: ln(c.sireLine), damSireLineName: ln(c.damSireLine) })), population: nt.population, lines: g.genetics.lines },
    breeders,
  };
}

// ------------------------------------------------------------------ Markt: Teilhaberschaften und Einstellpferde

export interface PartnershipsView {
  listings: ShareListing[];
  mine: Array<{ horseId: string; name: string; owner: string; share: number; kind: 'stallion' | 'racehorse'; value: number; rating: number | null; fee: number | null }>;
  boardingOffers: Array<{ id: string; horseId: string; name: string; age: number; sex: string; sire: string | null; owner: string; weeklyFee: number; expires: string }>;
  boarders: Array<{ horseId: string; name: string; owner: string; weeklyFee: number; satisfaction: number; since: string; starts: number; wins: number }>;
  freeBoxes: number;
}

export function partnershipsView(g: GameState): PartnershipsView {
  const me = g.playerStableId;
  const mine = sortedById(Object.values(g.horses))
    .filter((h) => partnerShare(h, me) > 0)
    .map((h) => ({
      horseId: h.id,
      name: h.name,
      owner: g.stables[h.stableId]?.name ?? '',
      share: partnerShare(h, me),
      kind: (h.status === 'stud' ? 'stallion' : 'racehorse') as 'stallion' | 'racehorse',
      value: marketValue(g, h),
      rating: h.officialRating,
      fee: g.stallions[h.id]?.fee ?? null,
    }));
  const wk = (wi: number) => `W${(wi % 52) + 1}`;
  return {
    listings: shareListings(g),
    mine,
    boardingOffers: g.boardingOffers.map((o) => {
      const h = g.horses[o.horseId]!;
      const age = g.season - h.foalYear;
      return { id: o.id, horseId: h.id, name: h.name, age, sex: sexLabel(h.sex, h.gelded, age), sire: h.sireName, owner: o.ownerName, weeklyFee: o.weeklyFee, expires: wk(o.expiresWeekIndex) };
    }),
    boarders: sortedById(Object.values(g.horses).filter((h) => h.boarding && h.stableId === me)).map((h) => ({
      horseId: h.id,
      name: h.name,
      owner: h.boarding!.ownerName,
      weeklyFee: h.boarding!.weeklyFee,
      satisfaction: Math.round(h.boarding!.satisfaction),
      since: wk(h.boarding!.sinceWeekIndex),
      starts: h.stats.starts,
      wins: h.stats.wins,
    })),
    freeBoxes: freeBoxes(g),
  };
}
