import { Rng } from '../rng';
import { generateHorse, generateColour, generateMarkings } from '../horse/generate';
import { ageAt, ceilingAttributes, PEAK_AGE } from '../horse/maturity';
import type { Attributes, Horse, Jockey, Silks, SilksPattern, Stable, Trainer } from '../types';
import { ATTR_KEYS } from '../types';
import { NameRegistry, PersonNameRegistry, stableName } from '../world/names';
import type { RawHorse, WorldData } from '../world/load';
import { addInbox, DEFAULT_CONFIG, type GameConfig, type GameState, weekIndexOf } from './state';
import { beginWeek, ensureCalendars } from './week';
import { aiMakeEntries, estimateLevel } from '../ai/ai';
import { clampOr } from '../stats/rating';

export interface NewGameOptions {
  id: string;
  name: string;
  createdAt: string;
  seed: number;
  world: WorldData;
  season?: number;
  startWeek?: number;
  stableName?: string;
  silks?: Silks;
  config?: Partial<GameConfig>;
}

const PALETTE = ['#1f3a93', '#7b1e1e', '#0b6623', '#f2c94c', '#ffffff', '#111111', '#e67e22', '#8e44ad', '#16a085', '#c0392b', '#2c3e50', '#d35400', '#f5f0e1', '#5dade2', '#e91e63'];
const PATTERNS: SilksPattern[] = ['plain', 'hoops', 'stripes', 'sash', 'chevrons', 'quartered', 'diamond', 'cross_belts', 'spots', 'halved'];

export function randomSilks(rng: Rng): Silks {
  const body = rng.pick(PALETTE);
  let pattern2 = rng.pick(PALETTE);
  while (pattern2 === body) pattern2 = rng.pick(PALETTE);
  return {
    pattern: rng.pick(PATTERNS),
    body,
    pattern2,
    sleeves: rng.chance(0.5) ? body : pattern2,
    cap: rng.chance(0.5) ? pattern2 : body,
  };
}

const clamp01 = (x: number) => Math.max(0.05, Math.min(0.98, x));

export function createGame(o: NewGameOptions): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, ...o.config };
  const rng = new Rng(o.seed);
  const season = o.season ?? 2027;
  const week = o.startWeek ?? 10;
  const world = o.world;
  const g: GameState = {
    version: 1,
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    seed: o.seed >>> 0,
    config,
    startSeason: season,
    season,
    week,
    weekIndex: 0,
    playerStableId: 'player',
    world,
    tracks: Object.fromEntries(world.tracks.map((t) => [t.id, t])),
    templates: {},
    races: {},
    horses: {},
    runs: {},
    stables: {},
    jockeys: {},
    trainers: {},
    inbox: [],
    ledger: [],
    counters: { horse: 0, run: 0, msg: 0 },
    calendarSeasons: [],
    lastSummary: null,
  };
  g.weekIndex = weekIndexOf(g, season, week);

  const people = new PersonNameRegistry([
    ...world.trainers.map((t) => t.name),
    ...world.jockeys.map((j) => j.name),
  ]);
  const names = new NameRegistry(world.horses.map((h) => h.name));
  const usedStableNames = new Set<string>(world.stables.map((s) => s.name));

  // ---- Trainer ----
  for (const t of world.trainers) {
    g.trainers[t.id] = {
      id: t.id,
      name: t.name,
      skill: t.skill,
      insight: t.insight,
      specialty: t.specialty ?? 'none',
      source: 'world',
      placeholder: t.placeholder ?? false,
    };
  }
  const newTrainer = (r: Rng, skill: number): Trainer => {
    const t: Trainer = {
      id: `t${Object.keys(g.trainers).length + 1}`,
      name: people.personName(r),
      skill: clamp01(skill),
      insight: clamp01(r.normal(0.55, 0.15)),
      specialty: r.weighted(['none', 'sprint', 'staying'] as const, [3, 1, 1]),
      source: 'generated',
      placeholder: false,
    };
    g.trainers[t.id] = t;
    return t;
  };

  // ---- Spielerstall ----
  const pr = rng.fork('player');
  const playerTrainer = newTrainer(pr, 0.55);
  playerTrainer.insight = 0.55;
  g.stables.player = {
    id: 'player',
    name: o.stableName?.trim() || 'Mein Rennstall',
    isPlayer: true,
    silks: o.silks ?? randomSilks(pr),
    trainerId: playerTrainer.id,
    strategy: 'player',
    balance: config.startBalance,
    source: 'generated',
    placeholder: false,
  };

  // ---- KI-Ställe: zuerst aus der Weltdatei, Rest generiert ----
  const stableQuality: Record<string, number> = {};
  const sr = rng.fork('stables');
  for (const s of world.stables) {
    g.stables[s.id] = {
      id: s.id,
      name: s.name,
      isPlayer: false,
      silks: s.silks,
      trainerId: s.trainerId,
      strategy: s.strategy ?? 'balanced',
      balance: 2_000_000,
      source: 'world',
      placeholder: s.placeholder ?? false,
    };
    stableQuality[s.id] = sr.normal(62, 4);
  }
  let k = 0;
  while (Object.values(g.stables).filter((s) => !s.isPlayer).length < config.aiStables) {
    k++;
    const q = sr.normal(64, 4);
    const trainer = newTrainer(sr, 0.45 + (q - 55) / 30 + sr.normal(0, 0.08));
    const id = `ai${k}`;
    g.stables[id] = {
      id,
      name: stableName(sr, usedStableNames),
      isPlayer: false,
      silks: randomSilks(sr),
      trainerId: trainer.id,
      strategy: sr.weighted(['balanced', 'sprint', 'staying'] as const, [4, 1, 1]),
      balance: 1_000_000 + Math.round(q * 20000),
      source: 'generated',
      placeholder: false,
    };
    stableQuality[id] = q;
  }

  // ---- Jockeys ----
  for (const j of world.jockeys) {
    g.jockeys[j.id] = {
      id: j.id,
      name: j.name,
      tactics: j.tactics,
      pace: j.pace,
      finishing: j.finishing,
      weightLb: j.weightLb ?? 118,
      fee: j.fee ?? 160,
      source: 'world',
      placeholder: j.placeholder ?? false,
    };
  }
  const jr = rng.fork('jockeys');
  let jn = 0;
  while (Object.keys(g.jockeys).length < config.jockeys) {
    jn++;
    const base = jr.normal(0.6, 0.13);
    const jk: Jockey = {
      id: `j${jn}`,
      name: people.personName(jr),
      tactics: clamp01(base + jr.normal(0, 0.07)),
      pace: clamp01(base + jr.normal(0, 0.07)),
      finishing: clamp01(base + jr.normal(0, 0.07)),
      weightLb: Math.round(jr.range(112, 124)),
      fee: 160,
      source: 'generated',
      placeholder: false,
    };
    g.jockeys[jk.id] = jk;
  }

  // ---- Pferde aus der Weltdatei ----
  const hr = rng.fork('horses');
  for (const raw of world.horses) {
    const h = horseFromWorld(raw, hr.fork(raw.id), season, week, names);
    g.horses[h.id] = h;
  }

  // ---- Generierte Pferde für KI-Ställe ----
  const ageMix = [2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
  for (const s of Object.values(g.stables)) {
    if (s.isPlayer) continue;
    const have = Object.values(g.horses).filter((h) => h.stableId === s.id).length;
    const sq = stableQuality[s.id] ?? 60;
    const r = hr.fork('stable', s.id);
    for (let i = have; i < config.horsesPerStable; i++) {
      const age = r.pick(ageMix);
      const distOpt =
        s.strategy === 'sprint' ? 1600 * Math.pow(2, r.normal(-0.5, 0.3)) : s.strategy === 'staying' ? 1600 * Math.pow(2, r.normal(0.5, 0.35)) : undefined;
      const h = generateHorse(r, {
        id: `h${++g.counters.horse}`,
        name: names.horseName(r),
        stableId: s.id,
        foalYear: season - age,
        quality: r.normal(sq, 9),
        season,
        week,
        distOptM: distOpt ? Math.round(Math.min(3400, Math.max(1000, distOpt)) / 50) * 50 : undefined,
      });
      g.horses[h.id] = h;
    }
  }

  // ---- Spielerpferde: mittelmäßig ----
  const playerAges = [2, 3, 4, 2, 3, 4, 3, 2, 5, 3];
  for (let i = 0; i < config.playerHorses; i++) {
    const age = playerAges[i % playerAges.length]!;
    const h = generateHorse(pr, {
      id: `h${++g.counters.horse}`,
      name: names.horseName(pr),
      stableId: 'player',
      foalYear: season - age,
      quality: pr.normal(57, 3),
      season,
      week,
    });
    g.horses[h.id] = h;
  }

  // ---- Bilanz vor Spielbeginn und Start-Ratings ----
  const rr = rng.fork('records');
  for (const h of Object.values(g.horses)) seedRecord(h, rr.fork(h.id), season);

  ensureCalendars(g);
  aiMakeEntries(g, true);
  beginWeek(g);
  addInbox(g, {
    kind: 'info',
    title: `Willkommen bei ${g.stables.player!.name}`,
    body:
      `Dein Stall hat ${config.playerHorses} Pferde im Training. So geht es los:\n` +
      '1. Im Stall die Pferde ansehen – die Werte sind Schätzungen deines Trainers.\n' +
      '2. Im Rennkalender passende Rennen suchen und nennen (Nennschluss beachten).\n' +
      '3. In der Rennwoche unter „Renntag“ Taktik und Jockey festlegen.\n' +
      '4. „Woche abschließen“ – danach Rennansicht, Ergebnis und Sectionals ansehen.\n' +
      'Erst nach drei Starts bekommt ein Pferd ein Official Rating und darf in Handicaps laufen.',
  });
  return g;
}

/** Erzeugt eine plausible Vorgeschichte (Starts, Siege, Rating) für ältere Pferde. */
function seedRecord(h: Horse, r: Rng, season: number): void {
  const age = season - h.foalYear;
  if (age <= 2) return;
  const starts = age === 3 ? (r.chance(0.65) ? r.int(2, 5) : r.int(0, 1)) : r.int(4, 6 + (age - 4) * 5);
  if (starts === 0) return;
  const level = estimateLevel(h);
  const winP = Math.max(0.03, Math.min(0.45, 0.12 + (level - 70) / 150));
  let wins = 0;
  let places = 0;
  for (let i = 0; i < starts; i++) {
    const u = r.next();
    if (u < winP) wins++;
    else if (u < winP * 2.8) places++;
  }
  h.preRecord = { starts, wins, places, earnings: Math.round((wins * 8000 + places * 2000) * (1 + Math.max(0, level - 70) / 15)) };
  if (starts >= 3) {
    h.officialRating = clampOr(Math.round(level + r.normal(0, 4)));
    h.ratingHistory.push({ season: season - 1, week: 45, rating: h.officialRating, runId: null });
  }
}

function horseFromWorld(raw: RawHorse, r: Rng, season: number, week: number, names: NameRegistry): Horse {
  names.add(raw.name);
  const h = generateHorse(r, {
    id: raw.id,
    name: raw.name,
    stableId: raw.stableId,
    foalYear: raw.foalYear,
    quality: raw.quality ?? 65,
    season,
    week,
    sex: raw.sex,
    distOptM: raw.prefs?.distOptM ?? raw.distOptM,
  });
  if (raw.potential) {
    h.potential = { ...raw.potential };
    const ceiling = ceilingAttributes(h.potential, h.maturity, ageAt(raw.foalYear, season, week));
    const cur = {} as Attributes;
    for (const k of ATTR_KEYS) cur[k] = Math.round(ceiling[k] * 0.96 * 10) / 10;
    h.current = cur;
  }
  if (raw.prefs) h.prefs = { ...raw.prefs };
  if (raw.maturity) h.maturity = { type: raw.maturity, peakAge: PEAK_AGE[raw.maturity] };
  h.gelded = raw.gelded ?? false;
  h.colour = raw.colour ?? generateColour(r);
  h.markings = generateMarkings(r);
  h.sireName = raw.sireName ?? null;
  h.damName = raw.damName ?? null;
  h.source = 'world';
  h.placeholder = raw.placeholder ?? false;
  return h;
}

export type { Stable };
