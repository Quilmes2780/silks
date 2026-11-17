import { Rng } from '../rng';
import { generateHorse, generateColour, generateMarkings } from '../horse/generate';
import { ageAt, ceilingAttributes, PEAK_AGE } from '../horse/maturity';
import type { Attributes, Facilities, Horse, Silks, SilksPattern, Stable, Staff } from '../types';
import { ATTR_KEYS } from '../types';
import { NameRegistry, PersonNameRegistry, stableName } from '../world/names';
import type { RawHorse, WorldData } from '../world/load';
import { addInbox, DEFAULT_CONFIG, type GameConfig, type GameState, horseAccount, MARKET_STABLE_ID, sortedById, weekIndexOf } from './state';
import { beginWeek, ensureCalendars } from './week';
import { aiMakeEntries, estimateLevel } from '../ai/ai';
import { clampOr } from '../stats/rating';
import { generateStaff, newStaffId, refreshStaffPool, salaryDemand, signContract, staffSkill } from '../staff/staff';
import { assignPedigree, createFounderMares, createFounderStallions } from '../breeding/stud';
import { initGenetics } from '../breeding/genetics';
import { seedPregnancies } from '../breeding/cycle';
import { recordBalance } from '../economy/finance';
import { updateValues } from '../economy/value';

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

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const PLAYER_FACILITIES: Facilities = { boxes: 12, pool: false, hill: false, clinic: false };

export function aiFacilities(q: number): Facilities {
  return { boxes: 60, pool: true, hill: true, clinic: q > 66 };
}

export function marketStable(): Stable {
  return {
    id: MARKET_STABLE_ID,
    name: 'Züchter und Verkäufer',
    kind: 'market',
    isPlayer: false,
    silks: { pattern: 'plain', body: '#9e9e9e', pattern2: '#9e9e9e', sleeves: '#9e9e9e', cap: '#9e9e9e' },
    trainerId: '',
    strategy: 'balanced',
    balance: 0,
    reputation: 0,
    facilities: { boxes: 0, pool: false, hill: false, clinic: false },
    staffQuality: 0.5,
    source: 'generated',
    placeholder: false,
  };
}

/** Startteam des Spielers neben dem Cheftrainer: ein Pfleger, ein Arbeitsreiter, ein junger Analyst. */
export function hireStarterTeam(g: GameState, r: Rng, people: PersonNameRegistry): Staff[] {
  const team: Staff[] = [];
  const spec: Array<[Staff['role'], number, number]> = [
    ['groom', 0.5, 34],
    ['work_rider', 0.5, 27],
    ['analyst', 0.36, 24],
  ];
  for (const [role, skill, age] of spec) {
    const s = generateStaff(r.fork(role), role, newStaffId(g), people.personName(r), { skill, age });
    s.potential = Math.max(s.potential, skill + 0.15);
    g.staff[s.id] = s;
    signContract(g, s, g.playerStableId, { weeklySalary: salaryDemand(s), years: 2 });
    team.push(s);
  }
  return team;
}

export function createGame(o: NewGameOptions): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, ...o.config };
  const rng = new Rng(o.seed);
  const season = o.season ?? 2027;
  const week = o.startWeek ?? 10;
  const world = o.world;
  const g: GameState = {
    version: 3,
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
    staff: {},
    stallions: {},
    auctions: {},
    offers: [],
    genetics: { lines: [], nicks: {}, offsets: {} },
    breeding: { plans: {}, pregnancies: {}, barren: [] },
    boardingOffers: [],
    finance: { balanceHistory: [], overdraftWeeks: 0, horses: {} },
    inbox: [],
    ledger: [],
    counters: { horse: 0, run: 0, msg: 0, staff: 0, offer: 0, lot: 0 },
    calendarSeasons: [],
    lastSummary: null,
    touchedHorses: [],
    touchedRaces: [],
  };
  g.weekIndex = weekIndexOf(g, season, week);

  const people = new PersonNameRegistry([...world.trainers.map((t) => t.name), ...world.jockeys.map((j) => j.name)]);
  const names = new NameRegistry(world.horses.map((h) => h.name));
  const usedStableNames = new Set<string>(world.stables.map((s) => s.name));
  const sr = rng.fork('stables');

  // ---- Trainer aus der Weltdatei ----
  for (const t of world.trainers) {
    const s = generateStaff(sr.fork('world-trainer', t.id), 'head_trainer', t.id, t.name, { skill: t.skill });
    s.trainer = { insight: t.insight, specialty: t.specialty ?? 'none' };
    s.source = 'world';
    s.placeholder = t.placeholder ?? false;
    g.staff[s.id] = s;
  }
  const newTrainer = (r: Rng, skill: number): Staff => {
    const s = generateStaff(r, 'head_trainer', newStaffId(g), people.personName(r), { skill: clamp(skill, 0.05, 0.98) });
    g.staff[s.id] = s;
    return s;
  };

  // ---- Spielerstall ----
  const pr = rng.fork('player');
  const playerTrainer = newTrainer(pr, 0.55);
  playerTrainer.trainer = { insight: 0.55, specialty: 'none' };
  g.stables.player = {
    id: 'player',
    name: o.stableName?.trim() || 'Mein Rennstall',
    kind: 'player',
    isPlayer: true,
    silks: o.silks ?? randomSilks(pr),
    trainerId: playerTrainer.id,
    strategy: 'player',
    balance: config.startBalance,
    reputation: 25,
    facilities: { ...PLAYER_FACILITIES },
    staffQuality: 0,
    source: 'generated',
    placeholder: false,
  };
  signContract(g, playerTrainer, 'player', { weeklySalary: salaryDemand(playerTrainer), years: 2 });
  g.stables[MARKET_STABLE_ID] = marketStable();

  // ---- KI-Ställe: zuerst aus der Weltdatei, Rest generiert ----
  const stableQuality: Record<string, number> = {};
  const aiStable = (id: string, name: string, silks: Silks, trainerId: string, strategy: Stable['strategy'], q: number, source: Stable['source'], placeholder: boolean): Stable => ({
    id,
    name,
    kind: 'ai',
    isPlayer: false,
    silks,
    trainerId,
    strategy,
    balance: 1_000_000 + Math.round(q * 20000),
    reputation: Math.round(clamp(30 + (q - 55) * 2.5, 10, 90)),
    facilities: aiFacilities(q),
    staffQuality: Math.round(clamp(0.5 + (q - 64) / 20 + sr.normal(0, 0.08), 0.25, 0.85) * 100) / 100,
    source,
    placeholder,
  });
  for (const s of world.stables) {
    const q = sr.normal(62, 4);
    g.stables[s.id] = aiStable(s.id, s.name, s.silks, s.trainerId, s.strategy ?? 'balanced', q, 'world', s.placeholder ?? false);
    g.stables[s.id]!.balance = 2_000_000;
    stableQuality[s.id] = q;
  }
  let k = 0;
  while (Object.values(g.stables).filter((s) => s.kind === 'ai').length < config.aiStables) {
    k++;
    const q = sr.normal(64, 4);
    const trainer = newTrainer(sr, 0.45 + (q - 55) / 30 + sr.normal(0, 0.08));
    const id = `ai${k}`;
    g.stables[id] = aiStable(
      id,
      stableName(sr, usedStableNames),
      randomSilks(sr),
      trainer.id,
      sr.weighted(['balanced', 'sprint', 'staying', 'trader'] as const, [4, 1, 1, 0.6]),
      q,
      'generated',
      false,
    );
    stableQuality[id] = q;
  }
  for (const st of Object.values(g.stables)) {
    if (st.kind !== 'ai') continue;
    const t = g.staff[st.trainerId];
    if (t && !t.contract) signContract(g, t, st.id, { weeklySalary: salaryDemand(t), years: 1 + sr.int(0, 2) });
  }

  // ---- Jockeys ----
  for (const j of world.jockeys) {
    const s = generateStaff(sr.fork('world-jockey', j.id), 'jockey', j.id, j.name, { skill: (j.tactics + j.pace + j.finishing) / 3, apprentice: false });
    s.jockey = { tactics: j.tactics, pace: j.pace, finishing: j.finishing, weightLb: j.weightLb ?? 116, fee: j.fee ?? 160, careerWins: 300, suspendedUntilWeekIndex: null, suspensions: 0 };
    s.source = 'world';
    s.placeholder = j.placeholder ?? false;
    g.staff[s.id] = s;
  }
  const jr = rng.fork('jockeys');
  let jn = 0;
  while (Object.values(g.staff).filter((s) => s.role === 'jockey').length < config.jockeys) {
    jn++;
    const apprentice = jr.chance(0.25);
    const s = generateStaff(jr.fork(jn), 'jockey', `j${jn}`, people.personName(jr), { skill: jr.normal(apprentice ? 0.5 : 0.62, 0.12), apprentice });
    g.staff[s.id] = s;
  }
  // Die stärksten KI-Ställe binden die besten Jockeys als Stalljockey
  const topStables = sortedById(Object.values(g.stables))
    .filter((s) => s.kind === 'ai')
    .sort((a, b) => (stableQuality[b.id] ?? 0) - (stableQuality[a.id] ?? 0))
    .slice(0, 8);
  const bestJockeys = sortedById(Object.values(g.staff))
    .filter((s) => s.role === 'jockey')
    .sort((a, b) => staffSkill(b) - staffSkill(a));
  topStables.forEach((st, i) => {
    const j = bestJockeys[i];
    if (j) signContract(g, j, st.id, { weeklySalary: salaryDemand(j), years: 1 + (i % 3) });
  });

  // ---- Deckhengste ----
  initGenetics(g, rng.fork('genetics'), names);
  createFounderStallions(g, rng.fork('stallions'), names);

  // ---- Pferde aus der Weltdatei ----
  const hr = rng.fork('horses');
  for (const raw of world.horses) {
    const h = horseFromWorld(raw, hr.fork(raw.id), season, week, names);
    g.horses[h.id] = h;
  }

  // ---- Generierte Pferde für KI-Ställe ----
  const ageMix = [2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
  for (const s of sortedById(Object.values(g.stables))) {
    if (s.kind !== 'ai') continue;
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

  // ---- Abstammung, Vorgeschichte und Start-Ratings ----
  const pedr = rng.fork('pedigree');
  for (const h of sortedById(Object.values(g.horses))) if (!h.sireName && h.status === 'active') assignPedigree(g, h, pedr.fork(h.id), names);
  const rr = rng.fork('records');
  for (const h of Object.values(g.horses)) if (h.status === 'active') seedRecord(h, rr.fork(h.id), season);

  // ---- Zuchtstuten von KI-Ställen und Züchtern, Trächtigkeiten aus der Decksaison ----
  createFounderMares(g, rng.fork('mares'), names, stableQuality);
  seedPregnancies(g);

  // ---- Personal des Spielers und Bewerberpool ----
  const team = hireStarterTeam(g, rng.fork('team'), people);
  const groom = team.find((s) => s.role === 'groom')!;
  const mine = sortedById(Object.values(g.horses)).filter((h) => h.stableId === 'player');
  mine.slice(0, 4).forEach((h) => {
    h.groomId = groom.id;
    h.groomBond = 40;
  });
  for (const h of mine) horseAccount(g, h.id);
  refreshStaffPool(g, rng.fork('pool'), true);

  updateValues(g);
  for (const h of Object.values(g.horses)) h.valueHistory = h.value ? [{ weekIndex: g.weekIndex, value: h.value }] : [];
  ensureCalendars(g);
  aiMakeEntries(g, true);
  beginWeek(g);
  recordBalance(g, g.weekIndex - 1);
  g.touchedHorses = [];
  addInbox(g, {
    kind: 'info',
    title: `Willkommen bei ${g.stables.player!.name}`,
    body:
      `Dein Stall hat ${config.playerHorses} Pferde im Training und ${PLAYER_FACILITIES.boxes} Boxen. So geht es los:\n` +
      '1. Im Stall die Pferde ansehen – die Werte sind Schätzungen deines Trainers.\n' +
      '2. Im Rennkalender passende Rennen suchen und nennen (Nennschluss beachten).\n' +
      '3. In der Rennwoche unter „Renntag“ Taktik und Jockey festlegen.\n' +
      '4. „Woche abschließen“ – danach Rennansicht, Ergebnis und Sectionals ansehen.\n' +
      'Erst nach drei Starts bekommt ein Pferd ein Official Rating und darf in Handicaps laufen.\n\n' +
      `Personal: Cheftrainer ${playerTrainer.name}, Pfleger ${groom.name} (betreut 4 Pferde), ein Arbeitsreiter und ein junger Datenanalyst. ` +
      'Zwei Pferde haben noch keinen Pfleger – unter „Personal“ kannst du weitere Leute einstellen. ' +
      'Gehälter und Unterhalt kosten jede Woche Geld; Einnahmen kommen aus Preisgeld und Verkäufen (Markt).',
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
