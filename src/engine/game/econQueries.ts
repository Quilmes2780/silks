import type { Auction, Horse, LedgerKind, Lot, Silks, Staff, StaffRole } from '../types';
import { STAFF_ROLES } from '../types';
import {
  acceptThreshold,
  apprenticeAllowance,
  figurePrecision,
  GROOM_CAPACITY,
  isSuspended,
  ROLE_EFFECT,
  ROLE_LABEL,
  salaryDemand,
  stableEffects,
  stars,
} from '../staff/staff';
import { FACILITY_INFO, facilityUpkeep, type FacilityKey, MAX_BOXES, STUD_MAX_LEVEL } from '../economy/finance';
import { publicSireQuality, studHorses, studPlaces } from '../breeding/stud';
import { agentReport, AUCTION_SCHEDULE, consignable, increment, lotPublicValue } from '../market/auction';
import { freeBoxes } from '../market/transfer';
import { formLabel } from '../horse/training';
import { formatWeight } from '../season/rules';
import { COLOUR_LABEL, dateLabel, furlongs, raceDate, sexLabel, weekLabel } from './format';
import { type GameState, horsesOfStable, sortedById, staffOfStable } from './state';

/**
 * Lesesichten für Personal, Finanzen, Markt und Anlage (serialisierbare DTOs).
 */

export interface StableTag {
  id: string;
  name: string;
  silks: Silks;
  isPlayer: boolean;
}

function tag(g: GameState, id: string): StableTag {
  const s = g.stables[id]!;
  return { id: s.id, name: s.name, silks: s.silks, isPlayer: s.isPlayer };
}

function weekOf(g: GameState, weekIndex: number): { season: number; week: number } {
  return { season: g.startSeason + Math.floor(weekIndex / 52), week: (weekIndex % 52) + 1 };
}

function shortWeek(g: GameState, weekIndex: number): string {
  const w = weekOf(g, weekIndex);
  return `W${w.week}/${String(w.season).slice(2)}`;
}

// ---------------------------------------------------------------- Personal

export interface StaffRow {
  id: string;
  name: string;
  role: StaffRole;
  roleLabel: string;
  age: number;
  stars: number;
  experience: number;
  /** Moral nur beim eigenen Personal sichtbar */
  morale: number | null;
  salary: number | null;
  demand: number;
  prizeShare: number | null;
  contractEnd: number | null;
  leaving: { week: string; reason: string } | null;
  own: boolean;
  blocked: boolean;
  /** Pfleger: zugeteilte Pferde */
  horses: Array<{ id: string; name: string; bond: number }>;
  jockey: { weight: string; allowance: number; careerWins: number; suspended: boolean; fee: number } | null;
  specialty: string | null;
}

export interface StaffView {
  team: StaffRow[];
  candidates: StaffRow[];
  roles: Array<{ role: StaffRole; label: string; effect: string; count: number }>;
  payroll: number;
  horses: number;
  hints: string[];
  effects: { training: number; risk: number; heal: number; analystPrecision: number };
  reputation: number;
  grooms: Array<{ id: string; name: string; load: number }>;
  stableHorses: Array<{ id: string; name: string; groomId: string | null; bond: number }>;
}

const LEAVE_LABEL: Record<string, string> = { resign: 'Kündigung', poached: 'Abwerbung', retire: 'Ruhestand', contract_end: 'Vertragsende' };
const SPECIALTY_LABEL = { none: null, sprint: 'Sprinter', staying: 'Steher' } as const;

export function staffRow(g: GameState, s: Staff): StaffRow {
  const own = s.contract?.stableId === g.playerStableId;
  const horses = s.role === 'groom' && own ? sortedById(Object.values(g.horses)).filter((h) => h.groomId === s.id && h.status === 'active') : [];
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    roleLabel: ROLE_LABEL[s.role],
    age: s.age,
    stars: stars(s),
    experience: Math.round(s.experience),
    morale: own ? Math.round(s.morale) : null,
    salary: own ? s.contract!.weeklySalary : null,
    demand: salaryDemand(s),
    prizeShare: own ? s.contract!.prizeShare : null,
    contractEnd: own ? s.contract!.endSeason : null,
    leaving: own && s.leaving ? { week: shortWeek(g, s.leaving.weekIndex), reason: LEAVE_LABEL[s.leaving.reason] ?? s.leaving.reason } : null,
    own,
    blocked: (s.blockedUntilWeekIndex ?? 0) > g.weekIndex,
    horses: horses.map((h) => ({ id: h.id, name: h.name, bond: h.groomBond })),
    jockey: s.jockey
      ? { weight: formatWeight(s.jockey.weightLb), allowance: apprenticeAllowance(s), careerWins: s.jockey.careerWins, suspended: isSuspended(s, g.weekIndex), fee: s.jockey.fee }
      : null,
    specialty: s.trainer ? SPECIALTY_LABEL[s.trainer.specialty] : null,
  };
}

export function staffView(g: GameState): StaffView {
  const player = g.playerStableId;
  const team = staffOfStable(g, player);
  const eff = stableEffects(g, player);
  const horses = horsesOfStable(g, player);
  const hints: string[] = [];
  const of = (r: StaffRole) => team.filter((s) => s.role === r);
  const grooms = of('groom');
  const noGroom = horses.filter((h) => !h.groomId || !grooms.some((x) => x.id === h.groomId));
  if (noGroom.length) hints.push(`${noGroom.length} Pferd${noGroom.length === 1 ? '' : 'e'} ohne Pfleger (weniger Erholung, unruhiger).`);
  for (const gr of grooms) {
    const load = horses.filter((h) => h.groomId === gr.id).length;
    if (load > GROOM_CAPACITY) hints.push(`${gr.name} betreut ${load} Pferde – mehr als ${GROOM_CAPACITY} senkt die Wirkung und die Moral.`);
  }
  if (!of('work_rider').length) hints.push('Kein Arbeitsreiter: Das Training wirkt nur zu 70 %.');
  else if (horses.length > eff.riderCapacity) hints.push(`Zu wenige Arbeitsreiter für ${horses.length} Pferde (je Reiter 8).`);
  if (horses.length > eff.trainerCapacity) hints.push(`Der Cheftrainer ist mit ${horses.length} Pferden überlastet – ein Assistenztrainer entlastet (je +20 Pferde).`);
  if (!of('analyst').length) hints.push('Kein Datenanalyst: Speed Figures und Sectional Times sind nicht sichtbar.');
  if (!of('vet').length) hints.push('Kein Tierarzt: Behandlungen sind teurer, Heilung dauert länger, Risiken sind nur grob bekannt.');
  if (!of('agent').length) hints.push('Kein Bloodstock-Agent: Auktionslose kannst du nur nach Katalog beurteilen.');
  const candidates = sortedById(Object.values(g.staff))
    .filter((s) => !s.contract && s.role !== 'jockey' && (s.blockedUntilWeekIndex ?? 0) < 1e9)
    .map((s) => staffRow(g, s))
    .sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role) || b.stars - a.stars);
  const jockeyCandidates = sortedById(Object.values(g.staff))
    .filter((s) => !s.contract && s.role === 'jockey' && (s.blockedUntilWeekIndex ?? 0) < 1e9)
    .map((s) => staffRow(g, s))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 15);
  return {
    team: team.map((s) => staffRow(g, s)).sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role)),
    candidates: [...candidates, ...jockeyCandidates],
    roles: STAFF_ROLES.map((role) => ({ role, label: ROLE_LABEL[role], effect: ROLE_EFFECT[role], count: of(role).length })),
    payroll: team.reduce((a, s) => a + s.contract!.weeklySalary, 0),
    horses: horses.length,
    hints,
    effects: {
      training: Math.round(eff.trainingFactor * 100),
      risk: Math.round(eff.riskFactor * 100),
      heal: Math.round(eff.healFactor * 100),
      analystPrecision: figurePrecision(g),
    },
    reputation: Math.round(g.stables[player]!.reputation),
    grooms: grooms.map((s) => ({ id: s.id, name: s.name, load: horses.filter((h) => h.groomId === s.id).length })),
    stableHorses: horses.map((h) => ({ id: h.id, name: h.name, groomId: h.groomId, bond: h.groomBond })),
  };
}

/** Hinweis für Vertragsangebote: Forderung und grobe Erfolgsaussicht (ohne die genaue Schwelle). */
export function staffOfferHint(g: GameState, staffId: string): { demand: number; mood: string } {
  const s = g.staff[staffId];
  if (!s) throw new Error('Person nicht gefunden.');
  const th = acceptThreshold(g, s, g.playerStableId);
  const d = salaryDemand(s);
  const ratio = th / d;
  return { demand: d, mood: ratio < 0.9 ? 'würde gern für dich arbeiten' : ratio < 0.97 ? 'ist offen für Verhandlungen' : ratio <= 1 ? 'erwartet die volle Forderung' : 'ist schwer zu überzeugen' };
}

// ---------------------------------------------------------------- Finanzen

export const LEDGER_LABEL: Record<LedgerKind, string> = {
  prize: 'Preisgeld',
  sale: 'Verkäufe',
  purchase: 'Käufe',
  entry_fee: 'Nenngebühren',
  jockey_fee: 'Reitgebühren',
  prize_share: 'Erfolgsbeteiligungen',
  salary: 'Gehälter',
  upkeep: 'Unterhalt Pferde',
  stud_fee: 'Decktaxen',
  stud_income: 'Decktaxen-Einnahmen',
  stud_upkeep: 'Gestüt (Stuten, Nachwuchs)',
  boarding_fee: 'Einstellgebühren',
  partner: 'Teilhaberschaften',
  vet: 'Tierarzt',
  facility: 'Anlage',
  interest: 'Zinsen',
  other: 'Sonstiges',
};

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export interface FinanceView {
  balance: number;
  overdraftLimit: number;
  overdraftWeeks: number;
  weeklyFixed: { salaries: number; upkeep: number; facilities: number; total: number };
  history: Array<{ label: string; balance: number }>;
  seasons: number[];
  season: number;
  months: string[];
  /** Kategorien × Monate der gewählten Saison */
  table: Array<{ kind: LedgerKind; label: string; months: number[]; total: number }>;
  monthTotals: number[];
  seasonTotal: number;
  horses: Array<{
    horseId: string;
    name: string;
    active: boolean;
    weeks: number;
    /** Kaufpreis oder Einstandswert */
    purchase: number;
    bought: boolean;
    running: number;
    income: number;
    sale: number;
    value: number | null;
    net: number;
    roi: number | null;
  }>;
  entries: Array<{ label: string; text: string; amount: number; kind: string; raceId?: string; horseId?: string }>;
}

export function financeView(g: GameState, season?: number): FinanceView {
  const sel = season ?? g.season;
  const st = g.stables[g.playerStableId]!;
  const team = staffOfStable(g, g.playerStableId);
  const horses = horsesOfStable(g, g.playerStableId);
  const salaries = team.reduce((a, s) => a + s.contract!.weeklySalary, 0);
  const upkeep = horses.length * g.config.upkeepPerHorse;
  const facilities = facilityUpkeep(st.facilities);
  const kinds = Object.keys(LEDGER_LABEL) as LedgerKind[];
  const table = kinds.map((kind) => ({ kind, label: LEDGER_LABEL[kind], months: new Array<number>(12).fill(0), total: 0 }));
  for (const l of g.ledger) {
    if (l.season !== sel) continue;
    const m = raceDate(l.season, l.week).m;
    const row = table.find((x) => x.kind === l.kind)!;
    row.months[m]! += l.amount;
    row.total += l.amount;
  }
  const monthTotals = MONTHS.map((_, i) => table.reduce((a, r) => a + r.months[i]!, 0));
  const seasons = [...new Set(g.ledger.map((l) => l.season))].sort();
  if (!seasons.includes(g.season)) seasons.push(g.season);
  const accounts = Object.values(g.finance.horses).map((acc) => {
    const h = g.horses[acc.horseId];
    const k = acc.byKind;
    // Ohne Kauf (Startpferde, eigene Zucht) zählt der erste Marktwert als Einstandswert
    const opening = k.purchase ? 0 : (h?.valueHistory.find((p) => p.weekIndex >= acc.fromWeekIndex)?.value ?? h?.valueHistory.at(-1)?.value ?? 0);
    const purchase = -(k.purchase ?? 0) + opening;
    const sale = k.sale ?? 0;
    const income = (k.prize ?? 0) + (k.prize_share ?? 0);
    const running = (k.upkeep ?? 0) + (k.salary ?? 0) + (k.facility ?? 0) + (k.vet ?? 0) + (k.entry_fee ?? 0) + (k.jockey_fee ?? 0) + (k.other ?? 0);
    const active = acc.toWeekIndex === null && !!h && h.stableId === g.playerStableId && h.status === 'active';
    const value = active ? (h!.value ?? 0) : null;
    const net = income + sale + running - purchase + (value ?? 0);
    const invested = purchase - running;
    return {
      horseId: acc.horseId,
      name: acc.name,
      active,
      weeks: (acc.toWeekIndex ?? g.weekIndex) - acc.fromWeekIndex,
      purchase: Math.round(purchase),
      bought: !!k.purchase,
      running: Math.round(running),
      income: Math.round(income),
      sale: Math.round(sale),
      value,
      net: Math.round(net),
      roi: invested > 0 ? Math.round((net / invested) * 1000) / 10 : null,
    };
  });
  return {
    balance: st.balance,
    overdraftLimit: g.config.overdraftLimit,
    overdraftWeeks: g.finance.overdraftWeeks,
    weeklyFixed: { salaries, upkeep, facilities, total: salaries + upkeep + facilities },
    history: g.finance.balanceHistory.map((p) => ({ label: shortWeek(g, p.weekIndex), balance: Math.round(p.balance) })),
    seasons,
    season: sel,
    months: MONTHS,
    table: table.filter((r) => r.total !== 0 || r.months.some((x) => x !== 0)),
    monthTotals,
    seasonTotal: monthTotals.reduce((a, b) => a + b, 0),
    horses: accounts.sort((a, b) => Number(b.active) - Number(a.active) || b.net - a.net),
    entries: [...g.ledger]
      .reverse()
      .slice(0, 80)
      .map((l) => ({ label: `W${l.week}/${String(l.season).slice(2)}`, text: l.text, amount: l.amount, kind: LEDGER_LABEL[l.kind] ?? l.kind, raceId: l.raceId, horseId: l.horseId })),
  };
}

// ---------------------------------------------------------------- Anlage

export interface FacilitiesView {
  boxes: number;
  used: number;
  maxBoxes: number;
  upkeep: number;
  items: Array<{ key: FacilityKey; label: string; cost: number; upkeep: number; effect: string; owned: boolean; canBuild: boolean; level: number | null; maxLevel: number | null }>;
  stud: { level: number; places: number; used: number };
}

export function facilitiesView(g: GameState): FacilitiesView {
  const st = g.stables[g.playerStableId]!;
  const f = st.facilities;
  const keys: FacilityKey[] = ['boxes', 'pool', 'hill', 'clinic', 'stud'];
  return {
    boxes: f.boxes,
    used: horsesOfStable(g, st.id).length,
    maxBoxes: MAX_BOXES,
    upkeep: facilityUpkeep(f),
    items: keys.map((key) => {
      const info = FACILITY_INFO[key];
      const level = key === 'stud' ? (f.stud ?? 0) : null;
      const owned = key === 'boxes' ? false : key === 'stud' ? (f.stud ?? 0) >= STUD_MAX_LEVEL : !!f[key];
      return {
        key,
        label: info.label,
        cost: info.cost,
        upkeep: key === 'boxes' ? info.upkeep * 4 : info.upkeep,
        effect: info.effect,
        owned,
        canBuild: !owned && (key !== 'boxes' || f.boxes + 4 <= MAX_BOXES),
        level,
        maxLevel: key === 'stud' ? STUD_MAX_LEVEL : null,
      };
    }),
    stud: { level: f.stud ?? 0, places: studPlaces(st), used: studHorses(g, st.id).length },
  };
}

// ---------------------------------------------------------------- Markt

export interface HorseMarketRow {
  horseId: string;
  name: string;
  age: number;
  sex: string;
  stable: StableTag;
  officialRating: number | null;
  starts: number;
  wins: number;
  bestFigure: { value: number; runId: string } | null;
  distance: string;
  value: number | null;
  askingPrice: number | null;
  injured: boolean;
  sinceWeek: string | null;
}

function horseMarketRow(g: GameState, h: Horse): HorseMarketRow {
  const age = g.season - h.foalYear;
  const runs = h.stats.starts;
  return {
    horseId: h.id,
    name: h.name,
    age,
    sex: sexLabel(h.sex, h.gelded, age),
    stable: tag(g, h.stableId),
    officialRating: h.officialRating,
    starts: runs + h.preRecord.starts,
    wins: h.stats.wins + h.preRecord.wins,
    bestFigure: h.stats.bestFigure,
    distance: runs ? furlongs(bestDistance(g, h), true) : '–',
    value: h.value,
    askingPrice: h.forSale?.askingPrice ?? null,
    injured: !!h.condition.injury,
    sinceWeek: h.forSale ? shortWeek(g, h.forSale.sinceWeekIndex) : null,
  };
}

function bestDistance(g: GameState, h: Horse): number {
  const best = h.stats.bestFigure ? g.runs[h.stats.bestFigure.runId] : undefined;
  return best?.distanceM ?? 1600;
}

export interface OfferRow {
  offerId: string;
  horseId: string;
  horseName: string;
  buyer: StableTag;
  seller: StableTag;
  amount: number;
  counter: number | null;
  status: string;
  incoming: boolean;
  expires: string;
  value: number | null;
  rounds: number;
}

export interface AuctionSummary {
  id: string;
  name: string;
  kind: string;
  dateLabel: string;
  status: Auction['status'];
  lots: number;
  sold: number;
  mine: number;
  weekIndex: number;
}

export interface ClaimingRow {
  raceId: string;
  name: string;
  dateLabel: string;
  trackName: string;
  distance: string;
  claimPrice: number;
  runners: number;
  status: string;
  thisWeek: boolean;
  myClaims: number;
  myRunners: number;
}

export interface MarketView {
  freeBoxes: number;
  balance: number;
  spendable: number;
  auctions: AuctionSummary[];
  upcomingAuctions: Array<{ name: string; dateLabel: string }>;
  forSale: HorseMarketRow[];
  myListings: HorseMarketRow[];
  myHorses: HorseMarketRow[];
  offers: OfferRow[];
  claiming: ClaimingRow[];
}

export function offerRow(g: GameState, o: GameState['offers'][number]): OfferRow {
  const h = g.horses[o.horseId]!;
  const STATUS: Record<string, string> = { open: 'offen', countered: 'Gegenangebot', accepted: 'angenommen', declined: 'abgelehnt', expired: 'abgelaufen', withdrawn: 'zurückgezogen' };
  return {
    offerId: o.id,
    horseId: o.horseId,
    horseName: h.name,
    buyer: tag(g, o.buyerId),
    seller: tag(g, o.sellerId),
    amount: o.amount,
    counter: o.counter,
    status: STATUS[o.status] ?? o.status,
    incoming: o.sellerId === g.playerStableId,
    expires: shortWeek(g, o.expiresWeekIndex),
    value: h.value,
    rounds: o.rounds,
  };
}

export function marketView(g: GameState): MarketView {
  const player = g.playerStableId;
  const st = g.stables[player]!;
  const forSale = sortedById(Object.values(g.horses))
    .filter((h) => h.status === 'active' && h.forSale && g.stables[h.stableId]!.kind === 'ai')
    .map((h) => horseMarketRow(g, h))
    .sort((a, b) => (b.officialRating ?? 0) - (a.officialRating ?? 0));
  const mine = horsesOfStable(g, player).map((h) => horseMarketRow(g, h));
  const auctions = sortedById(Object.values(g.auctions))
    .sort((a, b) => b.weekIndex - a.weekIndex)
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      dateLabel: dateLabel(a.season, a.week),
      status: a.status,
      lots: a.lots.filter((l) => l.status !== 'withdrawn').length,
      sold: a.lots.filter((l) => l.status === 'sold').length,
      mine: a.lots.filter((l) => l.buyerId === player).length,
      weekIndex: a.weekIndex,
    }));
  const upcoming: MarketView['upcomingAuctions'] = [];
  for (const season of [g.season, g.season + 1]) {
    for (const s of AUCTION_SCHEDULE) {
      const id = `${season}-${s.kind}`;
      const wi = (season - g.startSeason) * 52 + s.week - 1;
      if (wi < g.weekIndex || g.auctions[id] || upcoming.length >= 4) continue;
      upcoming.push({ name: `${s.name} ${season}`, dateLabel: `${weekLabel(season, s.week)} (Katalog 3 Wochen vorher)` });
    }
  }
  const claiming: ClaimingRow[] = [];
  for (const r of sortedById(Object.values(g.races))) {
    const t = g.templates[r.templateId]!;
    if (t.claimPrice === null || r.weekIndex < g.weekIndex || r.weekIndex > g.weekIndex + 3) continue;
    if (r.status === 'void') continue;
    claiming.push({
      raceId: r.id,
      name: t.name,
      dateLabel: dateLabel(r.season, r.week, t.day),
      trackName: g.tracks[t.trackId]!.name,
      distance: furlongs(t.distanceM),
      claimPrice: t.claimPrice,
      runners: r.runners?.length ?? r.entries.length,
      status: r.status === 'closed' ? 'Starter stehen fest' : r.status === 'run' ? 'gelaufen' : 'Nennungsphase',
      thisWeek: r.weekIndex === g.weekIndex,
      myClaims: r.claims.filter((c) => c.stableId === player).length,
      myRunners: (r.runners ?? r.entries).filter((x) => x.stableId === player).length,
    });
  }
  return {
    freeBoxes: freeBoxes(g),
    balance: st.balance,
    spendable: st.balance + g.config.overdraftLimit,
    auctions,
    upcomingAuctions: upcoming,
    forSale,
    myListings: mine.filter((x) => x.askingPrice !== null),
    myHorses: mine,
    offers: g.offers
      .filter((o) => o.buyerId === player || o.sellerId === player)
      .slice()
      .reverse()
      .slice(0, 40)
      .map((o) => offerRow(g, o)),
    claiming: claiming.sort((a, b) => Number(b.thisWeek) - Number(a.thisWeek)),
  };
}

// ---------------------------------------------------------------- Auktion

export interface LotRow {
  lotId: string;
  /** Zuchtstuten: tragend von … */
  note: string | null;
  horseId: string;
  name: string;
  age: number;
  sex: string;
  colour: string;
  consignor: StableTag;
  sire: { name: string; fee: number; runners: number; winners: number; bestRating: number | null } | null;
  dam: string | null;
  conformation: string;
  breezeTimeS: number | null;
  officialRating: number | null;
  starts: number;
  catalogueValue: number;
  report: { low: number; high: number; mid: number; valueLow: number; valueHigh: number; grade: string } | null;
  status: Lot['status'];
  currentBid: number;
  nextBid: number;
  leader: 'du' | 'KI' | null;
  leaderName: string | null;
  price: number | null;
  buyer: StableTag | null;
  playerLimit: number | null;
  mine: boolean;
}

export interface AuctionView {
  id: string;
  name: string;
  kind: Auction['kind'];
  dateLabel: string;
  status: Auction['status'];
  isLive: boolean;
  freeBoxes: number;
  spendable: number;
  hasAgent: boolean;
  lots: LotRow[];
  canConsign: Array<{ horseId: string; name: string; value: number | null }>;
}

function sireStats(g: GameState, sireId: string): { runners: number; winners: number; bestRating: number | null } {
  let runners = 0;
  let winners = 0;
  let best: number | null = null;
  for (const h of Object.values(g.horses)) {
    if (h.sireId !== sireId) continue;
    if (h.stats.starts > 0 || h.preRecord.starts > 0) runners++;
    if (h.stats.wins + h.preRecord.wins > 0) winners++;
    if (h.officialRating !== null && (best === null || h.officialRating > best)) best = h.officialRating;
  }
  return { runners, winners, bestRating: best };
}

function grade(q: number): string {
  return q >= 74 ? 'A+' : q >= 70 ? 'A' : q >= 66 ? 'B+' : q >= 62 ? 'B' : q >= 58 ? 'C+' : q >= 54 ? 'C' : 'D';
}

function conformationLabel(c: number): string {
  return c >= 72 ? 'hervorragend' : c >= 66 ? 'sehr gut' : c >= 60 ? 'gut' : c >= 54 ? 'ordentlich' : 'unauffällig';
}

export function auctionView(g: GameState, auctionId: string): AuctionView {
  const a = g.auctions[auctionId];
  if (!a) throw new Error('Auktion nicht gefunden.');
  const agent = stableEffects(g, g.playerStableId).agent;
  const lots = a.lots
    .filter((l) => l.status !== 'withdrawn')
    .map<LotRow>((lot) => {
      const h = g.horses[lot.horseId]!;
      const age = a.season - h.foalYear;
      const sire = h.sireId ? g.stallions[h.sireId] : undefined;
      const rep = lot.consignorId === g.playerStableId ? null : agentReport(g, lot, agent);
      const preg = h.status === 'broodmare' ? (g.breeding.pregnancies[`${h.id}:${g.season}`] ?? g.breeding.pregnancies[`${h.id}:${g.season - 1}`]) : undefined;
      return {
        lotId: lot.id,
        note: h.status === 'broodmare' ? (preg ? `tragend von ${g.horses[preg.sireId]?.name ?? '?'}` : 'nicht tragend') : null,
        horseId: h.id,
        name: h.name,
        age,
        sex: sexLabel(h.sex, h.gelded, age),
        colour: COLOUR_LABEL[h.colour] ?? h.colour,
        consignor: tag(g, lot.consignorId),
        sire: sire ? { name: sire.name, fee: sire.fee, ...sireStats(g, sire.id) } : null,
        dam: h.damName,
        conformation: conformationLabel(h.conformation),
        breezeTimeS: lot.breezeTimeS,
        officialRating: h.officialRating,
        starts: h.stats.starts + h.preRecord.starts,
        catalogueValue: lotPublicValue(g, lot),
        report: rep ? { ...rep, grade: grade(rep.mid) } : null,
        status: lot.status,
        currentBid: lot.status === 'sold' ? lot.price! : lot.currentBid,
        nextBid: lot.leaderId === null ? lot.currentBid : lot.currentBid + increment(lot.currentBid),
        leader: lot.leaderId === null ? null : lot.leaderId === g.playerStableId ? 'du' : 'KI',
        leaderName: lot.leaderId ? (g.stables[lot.leaderId]?.name ?? null) : null,
        price: lot.price,
        buyer: lot.buyerId ? tag(g, lot.buyerId) : null,
        playerLimit: lot.playerLimit,
        mine: lot.consignorId === g.playerStableId,
      };
    });
  const canConsign =
    a.kind !== 'breeze_up' && a.status === 'catalogue'
      ? sortedById(Object.values(g.horses))
          .filter((h) => h.stableId === g.playerStableId && consignable(g, a.kind, h))
          .filter((h) => !a.lots.some((l) => l.horseId === h.id && l.status === 'pending'))
          .map((h) => ({ horseId: h.id, name: h.name, value: h.value }))
      : [];
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    dateLabel: dateLabel(a.season, a.week),
    status: a.status,
    isLive: a.status === 'live',
    freeBoxes: freeBoxes(g),
    spendable: g.stables[g.playerStableId]!.balance + g.config.overdraftLimit,
    hasAgent: agent !== null,
    lots,
    canConsign,
  };
}

// ---------------------------------------------------------------- Pferdeprofil: Markt und Pflege

export interface HorseMarketInfo {
  value: number | null;
  valueHistory: Array<{ label: string; value: number }>;
  purchase: { price: number; label: string; from: string | null; via: string } | null;
  forSale: { askingPrice: number } | null;
  groom: { id: string; name: string; bond: number } | null;
  grooms: Array<{ id: string; name: string; load: number }>;
  sire: { id: string; name: string; fee: number; publicQuality: number } | null;
  account: { costs: number; income: number; net: number } | null;
  offers: OfferRow[];
  canConsign: Array<{ auctionId: string; name: string }>;
  claimable: boolean;
}

const VIA_LABEL = { auction: 'Auktion', transfer: 'Transfermarkt', claim: 'Claiming-Rennen', forced_sale: 'Zwangsverkauf' } as const;

export function horseMarketInfo(g: GameState, h: Horse): HorseMarketInfo {
  const own = h.stableId === g.playerStableId;
  const sire = h.sireId ? g.stallions[h.sireId] : undefined;
  const acc = own ? g.finance.horses[h.id] : undefined;
  const k = acc?.byKind ?? {};
  const income = (k.prize ?? 0) + (k.prize_share ?? 0) + (k.sale ?? 0);
  const costs = Object.entries(k).reduce((a, [kind, v]) => (kind === 'prize' || kind === 'prize_share' || kind === 'sale' ? a : a + (v ?? 0)), 0);
  const groom = h.groomId ? g.staff[h.groomId] : undefined;
  return {
    value: h.value,
    valueHistory: h.valueHistory.map((p) => ({ label: shortWeek(g, p.weekIndex), value: p.value })),
    purchase: h.purchase
      ? { price: h.purchase.price, label: shortWeek(g, h.purchase.weekIndex), from: h.purchase.fromStableId ? (g.stables[h.purchase.fromStableId]?.name ?? null) : null, via: VIA_LABEL[h.purchase.via] }
      : null,
    forSale: h.forSale ? { askingPrice: h.forSale.askingPrice } : null,
    groom: own && groom ? { id: groom.id, name: groom.name, bond: h.groomBond } : null,
    grooms: own
      ? staffOfStable(g, g.playerStableId, 'groom').map((s) => ({ id: s.id, name: s.name, load: horsesOfStable(g, g.playerStableId).filter((x) => x.groomId === s.id).length }))
      : [],
    sire: sire ? { id: sire.id, name: sire.name, fee: sire.fee, publicQuality: Math.round(publicSireQuality(sire)) } : null,
    account: acc ? { costs: Math.round(costs), income: Math.round(income), net: Math.round(income + costs) } : null,
    offers: g.offers.filter((o) => o.horseId === h.id && (o.status === 'open' || o.status === 'countered')).map((o) => offerRow(g, o)),
    canConsign: own
      ? sortedById(Object.values(g.auctions))
          .filter((a) => a.status === 'catalogue' && consignable(g, a.kind, h))
          .map((a) => ({ auctionId: a.id, name: a.name }))
      : [],
    claimable: !own && g.stables[h.stableId]?.kind === 'ai',
  };
}

// ---------------------------------------------------------------- Büro

export interface OfficeExtras {
  weeklyFixed: number;
  openOffers: number;
  expiringContracts: Array<{ id: string; name: string; role: string }>;
  leaving: Array<{ id: string; name: string; role: string; week: string; reason: string }>;
  liveAuction: { id: string; name: string } | null;
  freeBoxes: number;
  overdraft: boolean;
  form: Array<{ horseId: string; form: string }>;
}

export function officeExtras(g: GameState): OfficeExtras {
  const st = g.stables[g.playerStableId]!;
  const team = staffOfStable(g, st.id);
  const horses = horsesOfStable(g, st.id);
  const live = sortedById(Object.values(g.auctions)).find((a) => a.status === 'live');
  return {
    weeklyFixed: team.reduce((a, s) => a + s.contract!.weeklySalary, 0) + horses.length * g.config.upkeepPerHorse + facilityUpkeep(st.facilities),
    openOffers: g.offers.filter((o) => o.sellerId === st.id && o.status === 'open').length,
    expiringContracts: g.week >= 40 ? team.filter((s) => s.contract!.endSeason <= g.season).map((s) => ({ id: s.id, name: s.name, role: ROLE_LABEL[s.role] })) : [],
    leaving: team.filter((s) => s.leaving).map((s) => ({ id: s.id, name: s.name, role: ROLE_LABEL[s.role], week: shortWeek(g, s.leaving!.weekIndex), reason: LEAVE_LABEL[s.leaving!.reason] ?? '' })),
    liveAuction: live ? { id: live.id, name: live.name } : null,
    freeBoxes: freeBoxes(g),
    overdraft: st.balance < -g.config.overdraftLimit,
    form: horses.map((h) => ({ horseId: h.id, form: formLabel(h.condition.fitness, h.condition.freshness).label })),
  };
}
