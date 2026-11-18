import { raceRecordLevel } from '../breeding/stud';
import { openVisitSteps, tutorialView, type TutorialView } from './tutorial';
import { sharesOffered } from '../market/partnership';
import type {
  AttrKey,
  ConditionCell,
  Going,
  Horse,
  HorseStats,
  InboxMessage,
  RaceClass,
  RaceEvent,
  RaceInstance,
  RatingEntry,
  Run,
  Sectional,
  Silks,
  Surface,
  Tactic,
  TrainingPlan,
} from '../types';
import { ATTR_KEYS } from '../types';
import { estimateAttributes, ATTR_LABEL } from '../stats/estimate';
import { DIST_BUCKETS, GOING_GROUPS } from '../stats/horseStats';
import { formLabel, INJURY_LABEL, TRAINING_TEMPLATES, BLOCKS } from '../horse/training';
import { checkEligibility, formatWeight } from '../season/rules';
import { GOING_LABEL } from '../season/calendar';
import { aiLevel } from '../ai/ai';
import { buildCourse, circuitOutline, pointOnCourse } from '../race/geometry';
import { canEnter } from './commands';
import { replayRace } from './raceDay';
import { dateLabel, furlongs, sexLabel, weekLabel, COLOUR_LABEL } from './format';
import { horsesWithStatus, type GameState, type WeekSummary } from './state';
import { activeJockeys, apprenticeAllowance, figurePrecision, isSuspended, stars } from '../staff/staff';
import { horseMarketInfo, type HorseMarketInfo, officeExtras, type OfficeExtras } from './econQueries';

/**
 * Lesesicht für die UI: fertige, serialisierbare DTOs.
 * Die UI rechnet nichts selbst nach; jede Kennzahl trägt die IDs der Starts, aus denen sie stammt.
 */

export interface StableRef {
  id: string;
  name: string;
  silks: Silks;
  isPlayer: boolean;
}

export interface HeaderView {
  saveId: string;
  saveName: string;
  season: number;
  week: number;
  weekIndex: number;
  weekLabel: string;
  balance: number;
  stable: StableRef;
  unread: number;
  runnersThisWeek: number;
  randomness: number;
  overdraftLimit: number;
  /** offene Angebote, Gegenangebote, laufende Auktion */
  marketAlerts: number;
  /** Abgänge und auslaufende Verträge */
  staffAlerts: number;
  /** Gestüt: Stuten ohne Deckplan (Dez.–Feb.), Zweijährige ohne Box */
  studAlerts: number;
  /** Erste Schritte: noch nicht besuchte Bildschirme */
  tutorialOpen: string[];
}

function stableRef(g: GameState, id: string): StableRef {
  const s = g.stables[id]!;
  return { id: s.id, name: s.name, silks: s.silks, isPlayer: s.isPlayer };
}

export function headerView(g: GameState): HeaderView {
  const runnersThisWeek = Object.values(g.races)
    .filter((r) => r.weekIndex === g.weekIndex && r.status === 'closed')
    .reduce((a, r) => a + (r.runners?.filter((x) => x.stableId === g.playerStableId).length ?? 0), 0);
  return {
    saveId: g.id,
    saveName: g.name,
    season: g.season,
    week: g.week,
    weekIndex: g.weekIndex,
    weekLabel: weekLabel(g.season, g.week),
    balance: g.stables[g.playerStableId]!.balance,
    stable: stableRef(g, g.playerStableId),
    unread: g.inbox.filter((m) => !m.read).length,
    runnersThisWeek,
    randomness: g.config.randomness,
    overdraftLimit: g.config.overdraftLimit,
    marketAlerts:
      g.offers.filter((o) => (o.sellerId === g.playerStableId && o.status === 'open') || (o.buyerId === g.playerStableId && o.status === 'countered')).length +
      Object.values(g.auctions).filter((a) => a.status === 'live').length +
      g.boardingOffers.length,
    staffAlerts: Object.values(g.staff).filter(
      (x) => x.contract?.stableId === g.playerStableId && (x.leaving !== null || (g.week >= 44 && x.contract.endSeason <= g.season)),
    ).length,
    studAlerts: studAlerts(g),
    tutorialOpen: openVisitSteps(g),
  };
}

function studAlerts(g: GameState): number {
  const planning = g.week >= 48 || g.week <= 9;
  const season = g.week <= 10 ? g.season : g.season + 1;
  let n = 0;
  for (const h of horsesWithStatus(g, g.playerStableId, 'broodmare', 'young')) {
    if (h.status === 'young' && season - h.foalYear >= 2 && g.week <= 10) n++;
    if (h.status === 'broodmare' && planning && season - h.foalYear <= 21 && !g.breeding.plans[h.id] && !g.breeding.pregnancies[`${h.id}:${season}`]) n++;
  }
  return n;
}

// ---------------------------------------------------------------- Büro

export interface UpcomingEntry {
  raceId: string;
  raceName: string;
  dateLabel: string;
  weekIndex: number;
  trackName: string;
  distance: string;
  raceClass: RaceClass;
  horseId: string;
  horseName: string;
  status: 'genannt' | 'Starter' | 'gelaufen' | 'abgesagt';
  thisWeek: boolean;
}

export interface FormRow {
  horseId: string;
  name: string;
  age: number;
  fitness: number;
  freshness: number;
  form: string;
  formScore: number;
  injury: string | null;
  officialRating: number | null;
  lastFigure: { value: number; runId: string } | null;
}

export interface OfficeView {
  header: HeaderView;
  inbox: InboxMessage[];
  upcoming: UpcomingEntry[];
  form: FormRow[];
  finance: { balance: number; seasonPrize: number; seasonNet: number; seasonCosts: number; lastEntries: Array<{ text: string; amount: number; week: number; season: number }> };
  lastSummary: WeekSummary | null;
  leaders: Array<{ stable: StableRef; wins: number; prize: number }>;
  extras: OfficeExtras;
  tutorial: TutorialView;
}

export function upcomingEntries(g: GameState, horseId?: string): UpcomingEntry[] {
  const out: UpcomingEntry[] = [];
  for (const r of Object.values(g.races)) {
    if (r.weekIndex < g.weekIndex) continue;
    const t = g.templates[r.templateId]!;
    for (const e of r.entries) {
      if (e.stableId !== g.playerStableId) continue;
      if (horseId && e.horseId !== horseId) continue;
      const declared = r.runners?.some((x) => x.horseId === e.horseId);
      out.push({
        raceId: r.id,
        raceName: t.name,
        dateLabel: dateLabel(r.season, r.week, t.day),
        weekIndex: r.weekIndex,
        trackName: g.tracks[t.trackId]!.name,
        distance: furlongs(t.distanceM),
        raceClass: t.raceClass,
        horseId: e.horseId,
        horseName: g.horses[e.horseId]!.name,
        status: r.status === 'run' ? 'gelaufen' : r.status === 'void' ? 'abgesagt' : declared ? 'Starter' : 'genannt',
        thisWeek: r.weekIndex === g.weekIndex,
      });
    }
  }
  return out.sort((a, b) => a.weekIndex - b.weekIndex);
}

export function officeView(g: GameState): OfficeView {
  const mine = Object.values(g.horses).filter((h) => h.stableId === g.playerStableId && h.status === 'active');
  const form: FormRow[] = mine.map((h) => {
    const f = formLabel(h.condition.fitness, h.condition.freshness);
    const last = h.stats.lastFigures.at(-1) ?? null;
    return {
      horseId: h.id,
      name: h.name,
      age: g.season - h.foalYear,
      fitness: Math.round(h.condition.fitness),
      freshness: Math.round(h.condition.freshness),
      form: h.condition.injury ? `verletzt (${INJURY_LABEL[h.condition.injury.type]})` : f.label,
      formScore: f.score,
      injury: h.condition.injury ? `${INJURY_LABEL[h.condition.injury.type]}, noch ${h.condition.injury.weeksRemaining} Wo.` : null,
      officialRating: h.officialRating,
      lastFigure: last,
    };
  });
  const ledgerSeason = g.ledger.filter((l) => l.season === g.season);
  const byStable = new Map<string, { wins: number; prize: number }>();
  for (const r of Object.values(g.runs)) {
    if (r.season !== g.season) continue;
    const x = byStable.get(r.stableId) ?? { wins: 0, prize: 0 };
    if (r.position === 1) x.wins++;
    x.prize += r.prize;
    byStable.set(r.stableId, x);
  }
  const leaders = [...byStable.entries()]
    .sort((a, b) => b[1].prize - a[1].prize)
    .slice(0, 8)
    .map(([id, v]) => ({ stable: stableRef(g, id), ...v }));
  return {
    header: headerView(g),
    inbox: [...g.inbox].reverse().slice(0, 40),
    upcoming: upcomingEntries(g).filter((u) => u.status !== 'gelaufen').slice(0, 20),
    form: form.sort((a, b) => b.formScore - a.formScore),
    finance: {
      balance: g.stables[g.playerStableId]!.balance,
      seasonPrize: ledgerSeason.filter((l) => l.kind === 'prize').reduce((a, l) => a + l.amount, 0),
      seasonNet: ledgerSeason.reduce((a, l) => a + l.amount, 0),
      seasonCosts: ledgerSeason.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0),
      lastEntries: [...g.ledger].reverse().slice(0, 12).map((l) => ({ text: l.text, amount: l.amount, week: l.week, season: l.season })),
    },
    lastSummary: g.lastSummary,
    leaders,
    extras: officeExtras(g),
    tutorial: tutorialView(g),
  };
}

// ---------------------------------------------------------------- Stall

export interface StableRow {
  horseId: string;
  name: string;
  age: number;
  sex: string;
  colour: string;
  officialRating: number | null;
  starts: number;
  wins: number;
  places: number;
  earnings: number;
  lastFigure: { value: number; runId: string } | null;
  bestFigure: { value: number; runId: string } | null;
  form: string;
  fitness: number;
  freshness: number;
  injured: boolean;
  training: string;
  nextRace: { raceId: string; name: string; dateLabel: string } | null;
  placeholder: boolean;
}

export function stableRows(g: GameState, stableId?: string): StableRow[] {
  const sid = stableId ?? g.playerStableId;
  const upcoming = upcomingEntries(g).filter((u) => u.status === 'genannt' || u.status === 'Starter');
  return Object.values(g.horses)
    .filter((h) => h.stableId === sid && h.status === 'active')
    .map((h) => {
      const age = g.season - h.foalYear;
      const tpl = Object.entries(TRAINING_TEMPLATES).find(([, v]) => v.plan.join() === h.training.join());
      const next = upcoming.find((u) => u.horseId === h.id);
      return {
        horseId: h.id,
        name: h.name,
        age,
        sex: sexLabel(h.sex, h.gelded, age),
        colour: COLOUR_LABEL[h.colour] ?? h.colour,
        officialRating: h.officialRating,
        starts: h.stats.starts,
        wins: h.stats.wins,
        places: h.stats.wins + h.stats.seconds + h.stats.thirds,
        earnings: h.stats.earnings,
        lastFigure: h.stats.lastFigures.at(-1) ?? null,
        bestFigure: h.stats.bestFigure,
        form: h.condition.injury ? 'verletzt' : formLabel(h.condition.fitness, h.condition.freshness).label,
        fitness: Math.round(h.condition.fitness),
        freshness: Math.round(h.condition.freshness),
        injured: !!h.condition.injury,
        training: tpl ? tpl[1].label : 'individuell',
        nextRace: next ? { raceId: next.raceId, name: next.raceName, dateLabel: next.dateLabel } : null,
        placeholder: h.placeholder,
      };
    })
    .sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- Pferdeprofil

export interface CareerRow {
  runId: string;
  raceId: string;
  dateLabel: string;
  season: number;
  raceName: string;
  trackName: string;
  raceClass: RaceClass;
  distance: string;
  distanceM: number;
  going: string;
  surface: Surface;
  position: number;
  fieldSize: number;
  beatenL: number;
  weight: string;
  stall: number;
  jockey: string;
  time: number;
  speedFigure: number;
  finishingSpeedPct: number;
  officialRatingBefore: number | null;
  prize: number;
  events: RaceEvent[];
}

export interface HeatCell {
  dist: string;
  going: string;
  n: number;
  meanFigure: number;
  bestFigure: number;
  runIds: string[];
}

export interface ConditionRow {
  key: string;
  label: string;
  cell: ConditionCell;
}

export interface HorseProfileView {
  horseId: string;
  name: string;
  age: number;
  sex: string;
  colour: string;
  colourKey: string;
  markings: Horse['markings'];
  sire: string | null;
  dam: string | null;
  foalYear: number;
  stable: StableRef;
  trainerName: string;
  own: boolean;
  placeholder: boolean;
  status: string;
  statusKey: Horse['status'];
  boarding: { ownerName: string; weeklyFee: number; satisfaction: number } | null;
  /** Aktionen des Spielers (Zucht) */
  actions: { toBroodmare: boolean; toStud: boolean; intoTraining: boolean; sellToBreeders: boolean; retire: boolean; sharesOffered: boolean };
  officialRating: number | null;
  ratingHistory: RatingEntry[];
  condition: {
    fitness: number;
    freshness: number;
    form: string;
    injury: string | null;
    legRisk: number[];
  } | null;
  training: { plan: TrainingPlan; template: string | null } | null;
  stats: HorseStats;
  preRecord: Horse['preRecord'];
  career: CareerRow[];
  estimates: Array<{ key: AttrKey; label: string; value: number; low: number; high: number }>;
  trainerOpinion: { distance: string; going: string; style: string } | null;
  heatmap: { dists: string[]; goings: string[]; cells: HeatCell[] };
  conditions: { distance: ConditionRow[]; going: ConditionRow[]; track: ConditionRow[]; stall: ConditionRow[]; jockey: ConditionRow[]; layoff: ConditionRow[]; surface: ConditionRow[] };
  upcoming: UpcomingEntry[];
  market: HorseMarketInfo;
  /** 0 = Speed Figures verborgen (kein Analyst), sonst Rundung in lb */
  figurePrecision: number;
  /** Verletzungsrisiko genau (mit Tierarzt) oder nur grob */
  riskExact: boolean;
}

function trainerOpinion(g: GameState, h: Horse): HorseProfileView['trainerOpinion'] {
  const insight = g.staff[g.stables[h.stableId]!.trainerId]?.trainer?.insight ?? 0.4;
  const fuzz = (1 - insight) * 0.5 / Math.sqrt(1 + h.stats.starts * 0.3);
  const opt = h.prefs.distOptM * Math.pow(2, h.estimateNoise.stamina * fuzz * 0.6);
  const lo = furlongs(opt / Math.pow(2, 0.25 * h.prefs.distRange), true);
  const hi = furlongs(opt * Math.pow(2, 0.25 * h.prefs.distRange), true);
  const gv = h.prefs.going + h.estimateNoise.kick * fuzz;
  const going = gv < -0.45 ? 'mag festen Boden' : gv > 0.45 ? 'mag weichen Boden' : 'kommt mit jedem Boden zurecht';
  const style = { front: 'läuft gern von vorn', prominent: 'läuft gern vorne mit', midfield: 'läuft gern im Mittelfeld', held_up: 'kommt gern von hinten' }[h.prefs.runStyle];
  return { distance: `${lo} bis ${hi}`, going, style };
}

function conditionRows(map: Record<string, ConditionCell>, labeler: (k: string) => string = (k) => k): ConditionRow[] {
  return Object.entries(map)
    .map(([key, cell]) => ({ key, label: labeler(key), cell }))
    .sort((a, b) => b.cell.n - a.cell.n);
}

export function careerRow(g: GameState, r: Run): CareerRow {
  const t = g.templates[r.templateId];
  return {
    runId: r.id,
    raceId: r.raceId,
    dateLabel: dateLabel(r.season, r.week, t?.day ?? 'sat'),
    season: r.season,
    raceName: r.raceName,
    trackName: g.tracks[r.trackId]?.name ?? r.trackId,
    raceClass: r.raceClass,
    distance: furlongs(r.distanceM),
    distanceM: r.distanceM,
    going: GOING_LABEL[r.going],
    surface: r.surface,
    position: r.position,
    fieldSize: r.fieldSize,
    beatenL: r.beatenL,
    weight: formatWeight(r.weightLb),
    stall: r.stall,
    jockey: g.staff[r.jockeyId]?.name ?? r.jockeyId,
    time: r.timeS,
    speedFigure: r.speedFigure,
    finishingSpeedPct: r.finishingSpeedPct,
    officialRatingBefore: r.officialRatingBefore,
    prize: r.prize,
    events: r.events,
  };
}

/** Status für die Anzeige (Training, Gestüt, Ruhestand). */
export function statusLabel(g: GameState, h: Horse): string {
  const age = g.season - h.foalYear;
  switch (h.status) {
    case 'active':
      return h.boarding ? `im Training (Einstellpferd von ${h.boarding.ownerName})` : 'im Training';
    case 'young':
      return age === 0 ? 'Fohlen im Gestüt' : age === 1 ? 'Jährling im Gestüt' : 'im Gestüt, noch nicht im Training';
    case 'broodmare':
      return 'Zuchtstute';
    case 'stud':
      return g.stallions[h.id]?.active ? 'Deckhengst' : 'im Ruhestand';
    default:
      return 'im Ruhestand';
  }
}

export function horseProfile(g: GameState, horseId: string): HorseProfileView {
  const h = g.horses[horseId];
  if (!h) throw new Error('Pferd nicht gefunden.');
  const own = h.stableId === g.playerStableId;
  const age = g.season - h.foalYear;
  const stable = g.stables[h.stableId]!;
  const trainer = g.staff[stable.trainerId];
  const est = estimateAttributes(h, own ? (trainer?.trainer?.insight ?? 0.4) : 0.3, own);
  const tpl = Object.entries(TRAINING_TEMPLATES).find(([, v]) => v.plan.join() === h.training.join());
  const cells: HeatCell[] = Object.entries(h.stats.heatmap).map(([k, c]) => {
    const [dist, going] = k.split('|') as [string, string];
    return { dist, going, n: c.n, meanFigure: Math.round(c.meanFigure), bestFigure: c.bestFigure, runIds: c.runIds };
  });
  return {
    horseId: h.id,
    name: h.name,
    age,
    sex: sexLabel(h.sex, h.gelded, age),
    colour: COLOUR_LABEL[h.colour] ?? h.colour,
    colourKey: h.colour,
    markings: h.markings,
    sire: h.sireName,
    dam: h.damName,
    foalYear: h.foalYear,
    stable: stableRef(g, h.stableId),
    trainerName: trainer?.name ?? '–',
    own,
    placeholder: h.placeholder,
    status: statusLabel(g, h),
    statusKey: h.status,
    boarding: h.boarding ? { ownerName: h.boarding.ownerName, weeklyFee: h.boarding.weeklyFee, satisfaction: Math.round(h.boarding.satisfaction) } : null,
    actions: {
      toBroodmare: own && !h.boarding && h.status === 'active' && h.sex === 'female' && g.season - h.foalYear >= 3,
      toStud: own && !h.boarding && h.status === 'active' && h.sex === 'male' && !h.gelded && g.season - h.foalYear >= 3 && (raceRecordLevel(h) ?? 0) >= 75,
      intoTraining: own && h.status === 'young' && g.season - h.foalYear >= 2,
      sellToBreeders: own && (h.status === 'young' || h.status === 'broodmare' || h.status === 'stud'),
      retire: own && !h.boarding && h.status !== 'retired',
      sharesOffered: !own && sharesOffered(g, h),
    },
    officialRating: h.officialRating,
    ratingHistory: h.ratingHistory,
    condition: own
      ? {
          fitness: Math.round(h.condition.fitness),
          freshness: Math.round(h.condition.freshness),
          form: h.condition.injury ? 'verletzt' : formLabel(h.condition.fitness, h.condition.freshness).label,
          injury: h.condition.injury ? `${INJURY_LABEL[h.condition.injury.type]}, noch ${h.condition.injury.weeksRemaining} Wochen` : null,
          legRisk: h.condition.legRisk,
        }
      : null,
    training: own ? { plan: h.training, template: tpl ? tpl[0] : null } : null,
    stats: h.stats,
    preRecord: h.preRecord,
    career: h.runIds.map((id) => careerRow(g, g.runs[id]!)).reverse(),
    estimates: ATTR_KEYS.map((k) => ({ key: k, label: ATTR_LABEL[k], ...est[k] })),
    trainerOpinion: own ? trainerOpinion(g, h) : null,
    heatmap: { dists: DIST_BUCKETS.map((d) => d.key), goings: [...GOING_GROUPS], cells },
    conditions: {
      distance: conditionRows(h.stats.byDistance),
      going: conditionRows(h.stats.byGoing),
      surface: conditionRows(h.stats.bySurface, (k) => (k === 'turf' ? 'Rasen' : 'Allwetter')),
      track: conditionRows(h.stats.byTrack, (k) => g.tracks[k]?.name ?? k),
      stall: conditionRows(h.stats.byStall),
      jockey: conditionRows(h.stats.byJockey, (k) => g.staff[k]?.name ?? k),
      layoff: conditionRows(h.stats.byLayoff),
    },
    upcoming: own ? upcomingEntries(g, h.id) : [],
    market: horseMarketInfo(g, h),
    figurePrecision: figurePrecision(g),
    riskExact: Object.values(g.staff).some((x) => x.role === 'vet' && x.contract?.stableId === g.playerStableId),
  };
}

// ---------------------------------------------------------------- Rennkalender

export interface CalendarFilter {
  fromWeekIndex?: number;
  toWeekIndex?: number;
  classes?: RaceClass[];
  surface?: Surface | 'all';
  distMin?: number;
  distMax?: number;
  age?: number | null;
  horseId?: string | null;
  onlyOpen?: boolean;
  search?: string;
}

export interface CalendarRow {
  raceId: string;
  weekIndex: number;
  season: number;
  week: number;
  dateLabel: string;
  trackName: string;
  name: string;
  raceClass: RaceClass;
  bhaClass: number;
  distance: string;
  distanceM: number;
  surface: Surface;
  conditions: string;
  prize: number;
  entryFee: number;
  deadlineLabel: string;
  deadlinePassed: boolean;
  entries: number;
  maxRunners: number;
  status: RaceInstance['status'];
  going: string | null;
  playerHorses: string[];
  eligible: Array<{ horseId: string; name: string; ok: boolean; reason?: string }>;
  feature: boolean;
}

export function conditionsLabel(g: GameState, raceId: string): string {
  const t = g.templates[g.races[raceId]!.templateId]!;
  const c = t.conditions;
  const parts: string[] = [];
  parts.push(c.ageMax === null ? `${c.ageMin}yo+` : c.ageMin === c.ageMax ? `${c.ageMin}yo` : `${c.ageMin}–${c.ageMax}yo`);
  if (c.sex === 'fillies') parts.push('Stuten');
  if (c.sex === 'colts_geldings') parts.push('Hengste/Wallache');
  if (c.sex === 'colts_fillies') parts.push('Hengste/Stuten');
  if (c.orMin !== null || c.orMax !== null) parts.push(`OR ${c.orMin ?? 0}–${c.orMax ?? 140}`);
  if (c.maidenOnly) parts.push('sieglos');
  if (c.maxWins !== null) parts.push(`max. ${c.maxWins} Sieg${c.maxWins === 1 ? '' : 'e'}`);
  return parts.join(', ');
}

export function calendarView(g: GameState, f: CalendarFilter): CalendarRow[] {
  const from = f.fromWeekIndex ?? g.weekIndex;
  const to = f.toWeekIndex ?? g.weekIndex + 8;
  const mine = Object.values(g.horses).filter((h) => h.stableId === g.playerStableId && h.status === 'active');
  const search = f.search?.trim().toLowerCase();
  const rows: CalendarRow[] = [];
  for (const r of Object.values(g.races)) {
    if (r.weekIndex < from || r.weekIndex > to) continue;
    const t = g.templates[r.templateId]!;
    if (f.classes?.length && !f.classes.includes(t.raceClass)) continue;
    if (f.surface && f.surface !== 'all' && t.surface !== f.surface) continue;
    if (f.distMin && t.distanceM < f.distMin) continue;
    if (f.distMax && t.distanceM > f.distMax) continue;
    if (f.age) {
      if (t.conditions.ageMin > f.age || (t.conditions.ageMax !== null && t.conditions.ageMax < f.age)) continue;
    }
    if (search && !t.name.toLowerCase().includes(search) && !g.tracks[t.trackId]!.name.toLowerCase().includes(search)) continue;
    const deadlineWeek = r.weekIndex - t.entryDeadlineWeeks;
    const deadlinePassed = g.weekIndex > deadlineWeek;
    if (f.onlyOpen && (deadlinePassed || r.status !== 'open')) continue;
    const eligible = mine.map((h) => {
      const c = canEnter(g, r.id, h.id);
      return { horseId: h.id, name: h.name, ok: c.ok, reason: c.reason };
    });
    if (f.horseId) {
      const h = g.horses[f.horseId];
      if (!h || !checkEligibility(h, t, r.season).ok) continue;
    }
    const dl = deadlineWeek - g.weekIndex;
    rows.push({
      raceId: r.id,
      weekIndex: r.weekIndex,
      season: r.season,
      week: r.week,
      dateLabel: dateLabel(r.season, r.week, t.day),
      trackName: g.tracks[t.trackId]!.name,
      name: t.name,
      raceClass: t.raceClass,
      bhaClass: t.bhaClass,
      distance: furlongs(t.distanceM),
      distanceM: t.distanceM,
      surface: t.surface,
      conditions: conditionsLabel(g, r.id),
      prize: t.prize,
      entryFee: t.entryFee,
      deadlineLabel: deadlinePassed ? 'geschlossen' : dl === 0 ? 'diese Woche' : `in ${dl} Wo.`,
      deadlinePassed,
      entries: r.runners ? r.runners.length : r.entries.length,
      maxRunners: t.maxRunners,
      status: r.status,
      going: r.going ? GOING_LABEL[r.going] : null,
      playerHorses: r.entries.filter((e) => e.stableId === g.playerStableId).map((e) => g.horses[e.horseId]!.name),
      eligible,
      feature: t.feature,
    });
  }
  return rows.sort((a, b) => a.weekIndex - b.weekIndex || a.dateLabel.localeCompare(b.dateLabel) || b.prize - a.prize || (a.raceId < b.raceId ? -1 : 1));
}

// ---------------------------------------------------------------- Renntag

export interface CardRunner {
  horseId: string;
  name: string;
  age: number;
  sex: string;
  stable: StableRef;
  jockeyId: string | null;
  jockeyName: string;
  stall: number | null;
  weight: string | null;
  weightLb: number | null;
  officialRating: number | null;
  form: string;
  lastFigures: Array<{ value: number; runId: string }>;
  bestFigure: { value: number; runId: string } | null;
  odds: string;
  isPlayer: boolean;
  tactic: Tactic;
  /** Gewichtserlaubnis des Nachwuchsjockeys */
  allowance: number;
  /** Marktwert (für Claiming-Entscheidungen) */
  value: number | null;
  claimedByMe: boolean;
}

export interface ResultRow {
  position: number;
  horseId: string;
  name: string;
  stable: StableRef;
  jockeyName: string;
  stall: number;
  weight: string;
  timeS: number;
  beatenL: number;
  marginL: number;
  speedFigure: number;
  finishingSpeedPct: number;
  prize: number;
  runId: string;
  events: RaceEvent[];
  sectionals: Sectional[];
  speedCurve: number[];
  topSpeed: number;
  distanceRunM: number;
  isPlayer: boolean;
  claimedBy: StableRef | null;
}

export interface RaceCardView {
  raceId: string;
  name: string;
  trackName: string;
  trackId: string;
  direction: string;
  dateLabel: string;
  weekIndex: number;
  isThisWeek: boolean;
  raceClass: RaceClass;
  distance: string;
  distanceM: number;
  surface: Surface;
  going: string | null;
  goingKey: Going | null;
  prize: number;
  entryFee: number;
  conditions: string;
  status: RaceInstance['status'];
  maxRunners: number;
  runners: CardRunner[];
  result: ResultRow[] | null;
  winningTime: number | null;
  sectionalMarks: number[];
  playerCanEnter: Array<{ horseId: string; name: string; ok: boolean; reason?: string }>;
  claimPrice: number | null;
  /** Claims sind jetzt möglich (Rennwoche, Starter stehen fest) */
  claimOpen: boolean;
}

function formString(g: GameState, h: Horse): string {
  const runs = h.runIds.slice(-6).map((id) => g.runs[id]!);
  if (!runs.length) return h.preRecord.starts ? '–' : 'Debüt';
  return runs.map((r) => (r.position >= 10 ? '0' : String(r.position))).join('');
}

/** Spielinterne Quoten als Marktmeinung (keine Wetten). */
function oddsFor(levels: number[]): string[] {
  const w = levels.map((l) => Math.exp(l / 7));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => {
    const p = (x / sum) * 0.85; // Buchmachermarge
    const frac = Math.max(0.2, 1 / p - 1);
    let best = UK_ODDS[0]!;
    for (const o of UK_ODDS) if (Math.abs(Math.log(o[0] / o[1]) - Math.log(frac)) < Math.abs(Math.log(best[0] / best[1]) - Math.log(frac))) best = o;
    return best[0] === best[1] ? 'Evens' : `${best[0]}/${best[1]}`;
  });
}

const UK_ODDS: Array<[number, number]> = [
  [1, 5], [1, 4], [2, 7], [1, 3], [2, 5], [1, 2], [4, 7], [4, 6], [4, 5], [10, 11], [1, 1], [11, 10], [5, 4], [6, 4], [7, 4],
  [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
  [12, 1], [14, 1], [16, 1], [20, 1], [25, 1], [33, 1], [40, 1], [50, 1], [66, 1], [100, 1],
];

export function raceCard(g: GameState, raceId: string): RaceCardView {
  const r = g.races[raceId];
  if (!r) throw new Error('Rennen nicht gefunden.');
  const t = g.templates[r.templateId]!;
  const track = g.tracks[t.trackId]!;
  const list = r.runners ?? r.entries.map((e) => ({ horseId: e.horseId, stableId: e.stableId, jockeyId: e.jockeyId, stall: null, weightLb: null, allowanceLb: 0, tactic: e.tactic }));
  const horses = list.map((x) => g.horses[x.horseId]!);
  // Marktmeinung: öffentliche Daten (Rating, Figures), bei Debütanten ein grober Eindruck
  const odds = oddsFor(
    horses.map((h) => {
      const lf = h.stats.lastFigures.slice(-3).map((f) => f.value);
      const recent = lf.length ? lf.reduce((a, b) => a + b, 0) / lf.length : null;
      return recent !== null ? 0.6 * recent + 0.4 * (h.officialRating ?? recent) : (h.officialRating ?? aiLevel(h) - 8);
    }),
  );
  const runners: CardRunner[] = list.map((x, i) => {
    const h = horses[i]!;
    const age = r.season - h.foalYear;
    const j = x.jockeyId ? g.staff[x.jockeyId] : null;
    return {
      horseId: h.id,
      name: h.name,
      age,
      sex: sexLabel(h.sex, h.gelded, age),
      stable: stableRef(g, h.stableId),
      jockeyId: x.jockeyId,
      jockeyName: j?.name ?? 'wird gebucht',
      stall: x.stall,
      weight: x.weightLb !== null ? formatWeight(x.weightLb) : null,
      weightLb: x.weightLb,
      officialRating: h.officialRating,
      form: formString(g, h),
      lastFigures: h.stats.lastFigures.slice(-5),
      bestFigure: h.stats.bestFigure,
      odds: odds[i]!,
      isPlayer: h.stableId === g.playerStableId,
      tactic: x.tactic,
      allowance: x.allowanceLb,
      value: t.claimPrice !== null ? h.value : null,
      claimedByMe: r.claims.some((c) => c.horseId === h.id && c.stableId === g.playerStableId),
    };
  });
  let result: ResultRow[] | null = null;
  if (r.status === 'run') {
    result = r.resultRunIds.map((id) => {
      const run = g.runs[id]!;
      return {
        position: run.position,
        horseId: run.horseId,
        name: g.horses[run.horseId]!.name,
        stable: stableRef(g, run.stableId),
        jockeyName: g.staff[run.jockeyId]?.name ?? '',
        stall: run.stall,
        weight: formatWeight(run.weightLb),
        timeS: run.timeS,
        beatenL: run.beatenL,
        marginL: run.marginL,
        speedFigure: run.speedFigure,
        finishingSpeedPct: run.finishingSpeedPct,
        prize: run.prize,
        runId: run.id,
        events: run.events,
        sectionals: run.sectionals,
        speedCurve: run.speedCurve,
        topSpeed: run.topSpeed,
        distanceRunM: run.distanceRunM,
        isPlayer: run.stableId === g.playerStableId,
        claimedBy: run.claimedBy ? stableRef(g, run.claimedBy) : null,
      };
    });
  }
  const mine = Object.values(g.horses).filter((h) => h.stableId === g.playerStableId && h.status === 'active');
  return {
    raceId: r.id,
    name: t.name,
    trackName: track.name,
    trackId: track.id,
    direction: track.direction === 'left' ? 'linksherum' : 'rechtsherum',
    dateLabel: dateLabel(r.season, r.week, t.day),
    weekIndex: r.weekIndex,
    isThisWeek: r.weekIndex === g.weekIndex,
    raceClass: t.raceClass,
    distance: furlongs(t.distanceM),
    distanceM: t.distanceM,
    surface: t.surface,
    going: r.going ? GOING_LABEL[r.going] : null,
    goingKey: r.going,
    prize: t.prize,
    entryFee: t.entryFee,
    conditions: conditionsLabel(g, r.id),
    status: r.status,
    maxRunners: t.maxRunners,
    runners: r.status === 'run' ? runners : runners.sort((a, b) => (a.stall ?? 99) - (b.stall ?? 99)),
    result,
    winningTime: r.winningTimeS,
    sectionalMarks: result?.[0]?.sectionals.map((s) => s.atM) ?? [],
    playerCanEnter: mine.map((h) => ({ horseId: h.id, name: h.name, ...canEnter(g, r.id, h.id) })),
    claimPrice: t.claimPrice,
    claimOpen: t.claimPrice !== null && r.status === 'closed' && r.weekIndex === g.weekIndex,
  };
}

// ---------------------------------------------------------------- Rennansicht (Replay)

export interface ReplayView {
  raceId: string;
  distanceM: number;
  straight: boolean;
  /** Bahn-Umrisse innen/außen in Metern (Draufsicht) */
  outlineInner: Array<[number, number]>;
  outlineOuter: Array<[number, number]>;
  /** Rennstrecke (Innenkante) vom Start zum Ziel */
  coursePath: Array<[number, number]>;
  finish: [number, number];
  start: [number, number];
  frameDt: number;
  runners: Array<{ horseId: string; name: string; silks: Silks; isPlayer: boolean; position: number; beatenL: number; events: RaceEvent[] }>;
  /** frames[k] = [x0, y0, x1, y1, …] und Distanz je Pferd */
  frames: Array<{ t: number; xy: number[]; dist: number[] }>;
  sectionalMarks: number[];
}

export function replayView(g: GameState, raceId: string): ReplayView {
  const r = g.races[raceId];
  if (!r) throw new Error('Rennen nicht gefunden.');
  const sim = replayRace(g, raceId);
  if (!sim || !sim.frames) throw new Error('Für dieses Rennen gibt es keine Aufzeichnung.');
  const t = g.templates[r.templateId]!;
  const track = g.tracks[t.trackId]!;
  const course = buildCourse(track, t.distanceM);
  const trackWidth = 16;
  const outlineInner = course.straight ? [] : circuitOutline(track, -1, 15);
  const outlineOuter = course.straight ? [] : circuitOutline(track, trackWidth, 15);
  const coursePath: Array<[number, number]> = [];
  for (let d = 0; d <= t.distanceM; d += 10) {
    const p = pointOnCourse(course, d, 0);
    coursePath.push([round1(p.x), round1(p.y)]);
  }
  const frames = sim.frames.map((f) => {
    const xy: number[] = [];
    f.pos.forEach((dist, i) => {
      const lane = f.lane[i]!;
      if (dist <= t.distanceM) {
        const p = pointOnCourse(course, dist, lane);
        xy.push(round1(p.x), round1(p.y));
      } else {
        // nach dem Ziel geradeaus auslaufen
        xy.push(round1(dist - t.distanceM), round1(-lane));
      }
    });
    return { t: f.t, xy, dist: f.pos };
  });
  const startP = pointOnCourse(course, 0, 0);
  return {
    raceId,
    distanceM: t.distanceM,
    straight: course.straight,
    outlineInner,
    outlineOuter,
    coursePath,
    finish: [0, 0],
    start: [round1(startP.x), round1(startP.y)],
    frameDt: sim.frames.length > 1 ? sim.frames[1]!.t - sim.frames[0]!.t : 0.25,
    runners: r.replayInput!.runners.map((x) => {
      const h = g.horses[x.horseId]!;
      const res = sim.results.find((y) => y.horseId === x.horseId)!;
      return { horseId: h.id, name: h.name, silks: g.stables[h.stableId]!.silks, isPlayer: h.stableId === g.playerStableId, position: res.position, beatenL: res.beatenL, events: res.events };
    }),
    frames,
    sectionalMarks: sim.results[0]!.sectionals.map((s) => s.atM),
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// ---------------------------------------------------------------- Sonstiges

export interface JockeyView {
  id: string;
  name: string;
  /** Einstufung in halben Sternen */
  rating: number;
  fee: number;
  weightLb: number;
  weight: string;
  /** Gewichtserlaubnis als Nachwuchsjockey (lb) */
  allowance: number;
  age: number;
  careerWins: number;
  rides: number;
  wins: number;
  stable: StableRef | null;
  suspendedUntilWeek: number | null;
  placeholder: boolean;
}

export function jockeyList(g: GameState): JockeyView[] {
  const stats = new Map<string, { rides: number; wins: number }>();
  for (const r of Object.values(g.runs)) {
    if (r.season !== g.season) continue;
    const x = stats.get(r.jockeyId) ?? { rides: 0, wins: 0 };
    x.rides++;
    if (r.position === 1) x.wins++;
    stats.set(r.jockeyId, x);
  }
  return activeJockeys(g)
    .map((j) => {
      const jp = j.jockey!;
      return {
        id: j.id,
        name: j.name,
        // Spieler sieht eine gerundete Gesamteinschätzung, nicht die Einzelwerte
        rating: stars(j),
        fee: jp.fee,
        weightLb: jp.weightLb,
        weight: formatWeight(jp.weightLb),
        allowance: apprenticeAllowance(j),
        age: j.age,
        careerWins: jp.careerWins,
        rides: stats.get(j.id)?.rides ?? 0,
        wins: stats.get(j.id)?.wins ?? 0,
        stable: j.contract ? stableRef(g, j.contract.stableId) : null,
        suspendedUntilWeek: isSuspended(j, g.weekIndex) ? (jp.suspendedUntilWeekIndex! % 52) + 1 : null,
        placeholder: j.placeholder,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.rating - a.rating);
}

export interface TrainingInfo {
  blocks: Array<{ key: string; label: string; intensity: string; trains: string }>;
  templates: Array<{ key: string; label: string; plan: string[] }>;
}

export function trainingInfo(): TrainingInfo {
  return {
    blocks: Object.entries(BLOCKS).map(([key, b]) => ({
      key,
      label: b.label,
      intensity: b.intensity,
      trains: Object.keys(b.gain).length ? Object.keys(b.gain).map((k) => ATTR_LABEL[k as AttrKey]).join(', ') : key === 'canter' ? 'Grundfitness' : key === 'swim' ? 'Erholung' : '–',
    })),
    templates: Object.entries(TRAINING_TEMPLATES).map(([key, v]) => ({ key, label: v.label, plan: v.plan })),
  };
}

export interface RunLink {
  runId: string;
  raceId: string;
  horseId: string;
  horseName: string;
  raceName: string;
  dateLabel: string;
  position: number;
  speedFigure: number;
}

export function runLinks(g: GameState, runIds: string[]): RunLink[] {
  return runIds
    .map((id) => g.runs[id])
    .filter((r): r is Run => !!r)
    .map((r) => ({
      runId: r.id,
      raceId: r.raceId,
      horseId: r.horseId,
      horseName: g.horses[r.horseId]!.name,
      raceName: r.raceName,
      dateLabel: dateLabel(r.season, r.week, g.templates[r.templateId]?.day ?? 'sat'),
      position: r.position,
      speedFigure: r.speedFigure,
    }));
}

// ---------------------------------------------------------------- Datenanalyst

const FIG_NUM_KEYS = new Set(['speedFigure', 'meanFigure', 'figureSd', 'formTrend', 'consistencyIndex']);

/**
 * Sicht des Spielers auf Speed Figures und Sectionals: ohne Datenanalyst verborgen,
 * mit schwachem Analysten gerundet (5 oder 2 lb), mit gutem Analysten exakt.
 */
export function applyAnalyst<T>(g: GameState, dto: T): T {
  const p = figurePrecision(g);
  if (p === 1) return dto;
  const round = (v: number) => Math.round(v / p) * p;
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if ((FIG_NUM_KEYS.has(k) || k === 'bestFigure') && typeof v === 'number') out[k] = p === 0 ? null : round(v);
      else if ((k === 'bestFigure' || k === 'lastFigure') && v && typeof v === 'object' && 'value' in v) {
        out[k] = p === 0 ? null : { ...(v as object), value: round((v as { value: number }).value) };
      } else if (k === 'lastFigures' && Array.isArray(v)) {
        out[k] = p === 0 ? [] : v.map((f: { value: number }) => ({ ...f, value: round(f.value) }));
      } else if ((k === 'sectionals' || k === 'speedCurve') && Array.isArray(v)) out[k] = p === 0 ? [] : v;
      else if ((k === 'finishingSpeedPct' || k === 'avgFinishingSpeed') && typeof v === 'number') out[k] = p === 0 ? null : v;
      else out[k] = walk(v);
    }
    return out;
  };
  return walk(dto) as T;
}
