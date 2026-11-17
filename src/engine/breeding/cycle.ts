import { Rng } from '../rng';
import type { Horse, Pregnancy, Stable, Stallion } from '../types';
import { NameRegistry } from '../world/names';
import { stableEffects } from '../staff/staff';
import {
  addInbox,
  book,
  formatMoney,
  type GameState,
  horsesOfStable,
  MARKET_STABLE_ID,
  sortedById,
  touch,
  usedHorseNames,
} from '../game/state';
import { broodmareValue } from '../economy/value';
import { conceive, dropLoci, ensureGenotype, inbreedingOf, setCropOffsets } from './genetics';
import {
  activeStallions,
  addFounderMare,
  aiMareTarget,
  BREEDERS_MARES,
  feeForRating,
  foalFromConception,
  inOwnStud,
  MARE_MAX_AGE,
  pensionStallion,
  raceRecordLevel,
  STALLION_MAX_AGE,
  standStallion,
  startTraining,
  studHorses,
} from './stud';

/**
 * Jahreszyklus der Zucht (Konzept: Decksaison Jan–Feb, Fohlengeburten Feb–Mai):
 *  Woche 1: KI-Ställe und Züchter legen ihren Deckplan fest
 *  Woche 1–10: Bedeckungen; jede Woche nimmt eine Stute mit einer gewissen Wahrscheinlichkeit auf
 *  Woche 10: Abschluss der Decksaison (güst gebliebene Stuten, Jahrgangsausgleich der Genetik)
 *  Folgesaison Woche 6–20: Geburten
 *  Jahreswechsel: Nachwuchs wird älter; Zweijährige gehen ins Training
 */

export const COVER_FIRST_WEEK = 1;
export const COVER_LAST_WEEK = 10;
/** Wahrscheinlichkeit je Woche, dass eine Stute aufnimmt (bei durchschnittlichem Gestütsleiter) */
export const CONCEPTION_PER_WEEK = 0.16;
export const FOAL_LOSS = 0.06;

export function isCoveringSeason(week: number): boolean {
  return week >= COVER_FIRST_WEEK && week <= COVER_LAST_WEEK;
}

export function pregnancyKey(mareId: string, coverSeason: number): string {
  return `${mareId}:${coverSeason}`;
}

/** Trächtigkeit einer Stute aus der laufenden oder vorigen Decksaison. */
export function pregnancyOf(g: GameState, mareId: string, coverSeason?: number): Pregnancy | null {
  if (coverSeason !== undefined) return g.breeding.pregnancies[pregnancyKey(mareId, coverSeason)] ?? null;
  return g.breeding.pregnancies[pregnancyKey(mareId, g.season)] ?? g.breeding.pregnancies[pregnancyKey(mareId, g.season - 1)] ?? null;
}

/** Qualität der Gestütsarbeit (0–1) für eine Stute. */
export function studManagerQuality(g: GameState, mare: Horse): number {
  const st = g.stables[mare.stableId];
  if (!st || st.kind === 'market') return 0.5;
  if (st.kind === 'ai') return st.staffQuality;
  // Spieler: eigenes Gestüt mit Gestütsleiter, ohne Leiter schwächer; in Pension arbeitet ein Profi-Gestüt
  if (!inOwnStud(g, mare)) return 0.5;
  return stableEffects(g, st.id).studManager ?? 0.3;
}

export function mareAge(g: GameState, h: Horse): number {
  return g.season - h.foalYear;
}

export function conceptionChance(g: GameState, mare: Horse): number {
  const age = mareAge(g, mare);
  const ageF = age <= 12 ? 1 : Math.max(0.35, 1 - 0.06 * (age - 12));
  const sm = studManagerQuality(g, mare);
  return CONCEPTION_PER_WEEK * ageF * (0.8 + 0.4 * sm);
}

function bookCovers(g: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of Object.values(g.stallions)) m.set(s.id, s.covers);
  return m;
}

// ------------------------------------------------------------------ Hengstwahl der KI

/** Hengstwahl für eine Stute (KI und Züchter): Decktaxe passend zur Stute, keine enge Inzucht. */
export function chooseSire(g: GameState, mare: Horse, owner: Stable, r: Rng, booked: Map<string, number>): Stallion | null {
  const level = raceRecordLevel(mare) ?? 68;
  const wealth = owner.kind === 'ai' ? Math.max(0.6, Math.min(2.5, 1 + (owner.reputation - 40) / 40)) : 1;
  const target = feeForRating(level + 10) * wealth;
  let best: Stallion | null = null;
  let bestScore = -Infinity;
  for (const s of activeStallions(g)) {
    if ((booked.get(s.id) ?? 0) >= s.bookLimit) continue;
    if (s.since > g.season) continue;
    if (s.id === mare.sireId) continue;
    const own = s.ownerId === owner.id;
    const fee = own ? Math.min(s.fee, target) : s.fee;
    const score = -1.2 * Math.abs(Math.log(fee / target)) + r.normal(0, 0.5) + (own ? 0.6 : 0);
    if (!own && s.fee > target * 2.5) continue;
    if (score <= bestScore) continue;
    if (inbreedingOf(g, s.id, mare.id) > 0.07) continue;
    bestScore = score;
    best = s;
  }
  return best;
}

/** Woche 1: Deckpläne aller KI-Ställe und der Züchter. */
export function aiPlanMatings(g: GameState): void {
  const r = new Rng(g.seed).fork('ai-matings', g.season);
  const booked = bookCovers(g);
  for (const p of Object.values(g.breeding.plans)) booked.set(p, (booked.get(p) ?? 0) + 1);
  const mares = sortedById(Object.values(g.horses)).filter((h) => {
    if (h.status !== 'broodmare' || mareAge(g, h) > MARE_MAX_AGE) return false;
    const st = g.stables[h.stableId];
    return !!st && st.kind !== 'player';
  });
  for (const mare of r.shuffle(mares)) {
    if (g.breeding.plans[mare.id]) continue;
    const s = chooseSire(g, mare, g.stables[mare.stableId]!, r.fork(mare.id), booked);
    if (!s) continue;
    g.breeding.plans[mare.id] = s.id;
    booked.set(s.id, (booked.get(s.id) ?? 0) + 1);
  }
}

// ------------------------------------------------------------------ Decksaison

function payStudFee(g: GameState, mare: Horse, s: Stallion): number {
  if (s.ownerId === mare.stableId) return 0;
  const fee = s.fee;
  book(g, mare.stableId, { amount: -fee, kind: 'stud_fee', text: `Decktaxe ${s.name} (${mare.name})`, horseId: mare.id });
  payStallionOwners(g, s, fee, `Decktaxe ${s.name}: ${mare.name}`);
  return fee;
}

/** Decktaxe an Besitzer und Teilhaber des Hengsts verteilen. */
export function payStallionOwners(g: GameState, s: Stallion, amount: number, text: string): void {
  const h = g.horses[s.id];
  const partners = h?.partners ?? [];
  let rest = amount;
  for (const p of partners) {
    const part = Math.round(amount * p.share);
    rest -= part;
    book(g, p.stableId, { amount: part, kind: 'stud_income', text: `${text} (Anteil ${Math.round(p.share * 100)} %)` });
  }
  book(g, s.ownerId, { amount: rest, kind: 'stud_income', text, horseId: s.ownerId === g.playerStableId ? s.id : undefined });
}

function coverWeek(g: GameState): void {
  const r = new Rng(g.seed).fork('covering', g.weekIndex);
  for (const [mareId, sireId] of Object.entries(g.breeding.plans).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const mare = g.horses[mareId];
    const s = g.stallions[sireId];
    const sire = g.horses[sireId];
    if (!mare || mare.status !== 'broodmare') {
      delete g.breeding.plans[mareId];
      continue;
    }
    if (pregnancyOf(g, mareId, g.season)) {
      delete g.breeding.plans[mareId];
      continue;
    }
    const isPlayer = mare.stableId === g.playerStableId;
    if (!s || !s.active || !sire) {
      delete g.breeding.plans[mareId];
      if (isPlayer) addInbox(g, { kind: 'breeding', title: `Deckplan: ${mare.name}`, body: 'Der gewählte Hengst deckt nicht mehr. Bitte einen anderen Hengst wählen.', horseId: mareId });
      continue;
    }
    if (s.covers >= s.bookLimit) {
      delete g.breeding.plans[mareId];
      if (isPlayer) addInbox(g, { kind: 'breeding', title: `Buch voll: ${s.name}`, body: `${s.name} hat in dieser Saison keine freien Termine mehr. ${mare.name} braucht einen anderen Hengst.`, horseId: mareId });
      continue;
    }
    const mr = r.fork(mareId);
    if (!mr.chance(conceptionChance(g, mare))) continue;
    const c = conceive(g, sire, mare, mr.fork('conceive'));
    const due = Math.min(20, Math.round(6 + (g.week - 1) * 1.3 + mr.int(0, 4)));
    const p: Pregnancy = { mareId, sireId, ownerId: mare.stableId, coverSeason: g.season, coverWeek: g.week, dueWeek: due, genotype: c.genotype, sex: c.sex };
    g.breeding.pregnancies[pregnancyKey(mareId, g.season)] = p;
    s.covers++;
    delete g.breeding.plans[mareId];
    const fee = payStudFee(g, mare, s);
    if (isPlayer) {
      addInbox(g, {
        kind: 'breeding',
        title: `${mare.name} ist tragend`,
        body: `${mare.name} hat von ${s.name} aufgenommen. ${fee ? `Die Decktaxe von ${formatMoney(fee)} ist fällig. ` : ''}Das Fohlen wird um Woche ${due} der nächsten Saison erwartet.`,
        horseId: mareId,
      });
    }
  }
}

function closeCoveringSeason(g: GameState): void {
  const left = Object.keys(g.breeding.plans);
  const playerBarren: string[] = [];
  for (const mareId of left) {
    const mare = g.horses[mareId];
    if (mare && mare.stableId === g.playerStableId) playerBarren.push(mare.name);
  }
  g.breeding.barren = left;
  g.breeding.plans = {};
  if (playerBarren.length) {
    addInbox(g, {
      kind: 'breeding',
      title: 'Decksaison beendet',
      body: `Güst geblieben: ${playerBarren.join(', ')}. Sie können in der nächsten Decksaison (ab Januar) wieder gedeckt werden.`,
    });
  }
  const crop = Object.values(g.breeding.pregnancies).filter((p) => p.coverSeason === g.season);
  setCropOffsets(g, g.season, crop.map((p) => p.genotype));
}

// ------------------------------------------------------------------ Geburten

function births(g: GameState): void {
  const due = sortedById(
    Object.entries(g.breeding.pregnancies)
      .filter(([, p]) => p.coverSeason === g.season - 1 && p.dueWeek <= g.week)
      .map(([id, p]) => ({ id, p })),
  );
  if (!due.length) return;
  const r = new Rng(g.seed).fork('births', g.weekIndex);
  const names = new NameRegistry(usedHorseNames(g));
  for (const { id, p } of due) {
    delete g.breeding.pregnancies[id];
    const mare = g.horses[p.mareId];
    const sire = g.horses[p.sireId];
    if (!mare || !sire) continue;
    const owner = g.stables[mare.stableId] ? mare.stableId : MARKET_STABLE_ID;
    const fr = r.fork(id);
    const sm = studManagerQuality(g, mare);
    if (fr.chance(FOAL_LOSS * (1.4 - 0.8 * sm))) {
      if (owner === g.playerStableId) addInbox(g, { kind: 'breeding', title: `Fohlen verloren: ${mare.name}`, body: `Das Fohlen von ${mare.name} und ${sire.name} hat die Geburt nicht überlebt.`, horseId: mare.id });
      continue;
    }
    const foal = foalFromConception(
      g,
      { genotype: p.genotype, sex: p.sex },
      {
        id: `h${++g.counters.horse}`,
        name: names.horseName(fr),
        stableId: owner,
        foalYear: g.season,
        sire,
        dam: mare,
        damName: mare.name,
        damSireLine: ensureGenotype(g, mare).line,
        coverSeason: p.coverSeason,
        status: 'young',
        studManager: sm,
      },
      fr,
    );
    g.horses[foal.id] = foal;
    touch(g, foal.id);
    if (owner === g.playerStableId) {
      addInbox(g, {
        kind: 'breeding',
        title: `Fohlen geboren: ${foal.name}`,
        body: `${mare.name} hat ein ${foal.sex === 'male' ? 'Hengstfohlen' : 'Stutfohlen'} von ${sire.name} zur Welt gebracht: ${foal.name}.`,
        horseId: foal.id,
      });
    }
  }
}

/** Wöchentlicher Teil der Zucht. */
export function breedingWeek(g: GameState): void {
  if (g.week === COVER_FIRST_WEEK) aiPlanMatings(g);
  if (isCoveringSeason(g.week)) coverWeek(g);
  if (g.week === COVER_LAST_WEEK) closeCoveringSeason(g);
  births(g);
}

// ------------------------------------------------------------------ Jahreswechsel

/** Siege in Gruppe- und Listenrennen (Black Type). */
export function blackTypeWins(h: Horse): number {
  let n = 0;
  for (const k of ['G1', 'G2', 'G3', 'Listed']) n += h.stats.strikeByClass[k]?.wins ?? 0;
  return n;
}

/** Durchschnittliches Official Rating aller gerateten Pferde ab drei Jahren im Training. */
function populationRating(g: GameState): number {
  let s = 0;
  let n = 0;
  for (const h of Object.values(g.horses)) {
    if (h.officialRating === null || g.season - h.foalYear < 3) continue;
    if (h.status !== 'active' && h.status !== 'retired') continue;
    s += h.officialRating;
    n++;
  }
  return n ? s / n : 70;
}

export interface ProgenyStats {
  foals: number;
  runners: number;
  winners: number;
  rated: number;
  avgRating: number | null;
  bestRating: number | null;
  stakesWinners: number;
}

/** Nachkommen-Statistik eines Hengsts oder einer Stute (aus öffentlichen Daten). */
export function progenyStats(g: GameState, parentId: string, field: 'sireId' | 'damId' = 'sireId'): ProgenyStats {
  const out: ProgenyStats = { foals: 0, runners: 0, winners: 0, rated: 0, avgRating: null, bestRating: null, stakesWinners: 0 };
  let sum = 0;
  for (const h of Object.values(g.horses)) {
    if (h[field] !== parentId) continue;
    out.foals++;
    if (h.stats.starts + h.preRecord.starts > 0) out.runners++;
    if (h.stats.wins + h.preRecord.wins > 0) out.winners++;
    if (h.officialRating !== null) {
      out.rated++;
      sum += h.officialRating;
      out.bestRating = Math.max(out.bestRating ?? 0, h.officialRating);
    }
    if (blackTypeWins(h) > 0) out.stakesWinners++;
  }
  out.avgRating = out.rated ? Math.round((sum / out.rated) * 10) / 10 : null;
  return out;
}

/** Neue Decktaxen aus Rennleistung und Nachkommen; alte oder gefloppte Hengste gehen in Pension. */
function updateStallions(g: GameState): void {
  const pop = populationRating(g);
  for (const s of activeStallions(g)) {
    const h = g.horses[s.id];
    if (!h) continue;
    const age = g.season - h.foalYear;
    const lastCovers = s.covers;
    s.covers = 0;
    if (age >= STALLION_MAX_AGE || (s.ownerId !== g.playerStableId && s.since <= g.season - 4 && lastCovers < 6)) {
      pensionStallion(g, s);
      if (s.ownerId === g.playerStableId) addInbox(g, { kind: 'breeding', title: `${s.name} geht in Pension`, body: `${s.name} deckt ab dieser Saison nicht mehr.`, horseId: s.id });
      continue;
    }
    const raceFee = feeForRating(s.raceRating ?? 75);
    const ps = progenyStats(g, s.id);
    let target = raceFee;
    if (ps.rated >= 3 && ps.avgRating !== null) {
      const w = ps.rated / (ps.rated + 12);
      const progFee = raceFee * Math.exp((ps.avgRating - pop + 2 * ps.stakesWinners / Math.max(1, ps.rated)) / 5);
      target = Math.exp((1 - w) * Math.log(raceFee) + w * Math.log(progFee));
    }
    if (age > 18) target *= 0.85;
    const fee = Math.exp(0.5 * Math.log(s.fee) + 0.5 * Math.log(target));
    const old = s.fee;
    s.fee = Math.max(1000, Math.min(300000, Math.round(fee / 500) * 500));
    if (s.ownerId === g.playerStableId && s.fee !== old) {
      addInbox(g, { kind: 'breeding', title: `Decktaxe ${s.name}`, body: `Die Decktaxe von ${s.name} beträgt in der neuen Saison ${formatMoney(s.fee)} (bisher ${formatMoney(old)}).`, horseId: s.id });
    }
  }
}

/** Soll ein Hengst nach der Rennkarriere aufgestellt werden? (KI) */
export function studWorthy(h: Horse): boolean {
  if (h.sex !== 'male' || h.gelded) return false;
  const or = h.officialRating ?? 0;
  return or >= 98 || blackTypeWins(h) >= 2;
}

/**
 * Ruhestand eines Rennpferds: Stuten in die Zucht (eigene Herde, sonst an die Züchter),
 * gute Hengste ins Gestüt, alle anderen in den Ruhestand.
 */
export function retireRacehorse(g: GameState, h: Horse, r: Rng, mareCount: Map<string, number>, allowStud = true): 'broodmare' | 'stud' | 'retired' | 'sold' {
  const st = g.stables[h.stableId]!;
  h.forSale = null;
  h.groomId = null;
  touch(g, h.id);
  if (h.sex === 'female') {
    const level = raceRecordLevel(h) ?? 55;
    const have = mareCount.get(st.id) ?? 0;
    if (st.kind === 'player') {
      h.status = 'broodmare';
      ensureGenotype(g, h);
      return 'broodmare';
    }
    if (st.kind === 'ai' && have < aiMareTarget(g, st.id) && level >= 62) {
      h.status = 'broodmare';
      ensureGenotype(g, h);
      mareCount.set(st.id, have + 1);
      return 'broodmare';
    }
    const breeders = mareCount.get(MARKET_STABLE_ID) ?? 0;
    if (breeders < BREEDERS_MARES && level >= 55 && r.chance(0.8)) {
      const price = Math.round((4000 * Math.exp((level - 70) / 14)) / 500) * 500;
      book(g, st.id, { amount: price, kind: 'sale', text: `Verkauf an Züchter: ${h.name}` });
      h.stableId = MARKET_STABLE_ID;
      h.status = 'broodmare';
      ensureGenotype(g, h);
      mareCount.set(MARKET_STABLE_ID, breeders + 1);
      return 'sold';
    }
  } else if (st.kind === 'ai' && allowStud && studWorthy(h)) {
    standStallion(g, h, st.id);
    return 'stud';
  }
  h.status = 'retired';
  dropLoci(h);
  return 'retired';
}

/**
 * Vor dem Ruhestand der Rennpferde: KI-Ställe und Züchter mustern ältere Stuten aus, damit junge
 * Stuten aus dem Rennbetrieb nachrücken können (Herde verjüngt sich).
 */
export function cullOldMares(g: GameState, r: Rng): void {
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status !== 'broodmare' || g.stables[h.stableId]?.kind === 'player') continue;
    const age = mareAge(g, h);
    if (age < 16 || !r.fork(h.id).chance(Math.min(0.9, (age - 15) * 0.15))) continue;
    h.status = 'retired';
    dropLoci(h);
    touch(g, h.id);
  }
}

/** Jahreswechsel der Zucht: Hengste, Stuten, Nachwuchs. Liefert die Zahl der neuen Zweijährigen je Stall. */
export function breedingTurnover(g: GameState, r: Rng): Map<string, number> {
  updateStallions(g);
  // Stuten: Altersgrenze
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status !== 'broodmare' || mareAge(g, h) <= MARE_MAX_AGE + 1) continue;
    h.status = 'retired';
    dropLoci(h);
    touch(g, h.id);
    if (h.stableId === g.playerStableId) addInbox(g, { kind: 'breeding', title: `${h.name} im Ruhestand`, body: `${h.name} wird mit ${mareAge(g, h)} Jahren nicht mehr gedeckt und genießt ihr Gnadenbrot.`, horseId: h.id });
  }
  // Nachwuchs: Zweijährige gehen ins Training (Züchter behalten sie für die Breeze-up-Auktion)
  const intake = new Map<string, number>();
  const tr = r.fork('training-start');
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status !== 'young' || g.season - h.foalYear < 2) continue;
    const st = g.stables[h.stableId]!;
    if (st.kind === 'market') {
      if (g.season - h.foalYear >= 3) {
        h.status = 'retired';
        dropLoci(h);
        touch(g, h.id);
      }
      continue;
    }
    if (st.kind === 'player') {
      const free = st.facilities.boxes - horsesOfStable(g, st.id).length;
      if (free <= 0) {
        addInbox(g, {
          kind: 'breeding',
          title: `Keine Box für ${h.name}`,
          body: `${h.name} ist jetzt zwei Jahre alt, aber dein Stall hat keine freie Box. Der Zweijährige bleibt im Gestüt, bis eine Box frei wird – oder du verkaufst ihn.`,
          horseId: h.id,
        });
        continue;
      }
    }
    startTraining(g, h, tr.fork(h.id));
    intake.set(st.id, (intake.get(st.id) ?? 0) + 1);
    if (st.kind === 'player') addInbox(g, { kind: 'breeding', title: `${h.name} geht ins Training`, body: `${h.name} aus eigener Zucht ist jetzt im Rennstall.`, horseId: h.id });
  }
  // Herden auffüllen: Züchter kaufen Stuten zu (Importe)
  const mr = r.fork('mares');
  const names = new NameRegistry(usedHorseNames(g));
  const breeders = studHorses(g, MARKET_STABLE_ID).filter((h) => h.status === 'broodmare').length;
  for (let i = breeders; i < BREEDERS_MARES; i++) addFounderMare(g, mr.fork(i), names, MARKET_STABLE_ID, mr.normal(60, 5));
  // KI-Ställe kaufen Stuten zu, wenn ihre Herde zu klein geworden ist
  for (const st of sortedById(Object.values(g.stables))) {
    if (st.kind !== 'ai') continue;
    const have = studHorses(g, st.id).filter((h) => h.status === 'broodmare').length;
    const target = aiMareTarget(g, st.id);
    const sr = mr.fork('ai', st.id);
    for (let i = have; i < target - 1; i++) {
      const h = addFounderMare(g, sr.fork(i), names, st.id, sr.normal(55 + (st.reputation - 30) / 2.5, 5));
      book(g, st.id, { amount: -broodmareValue(g, h), kind: 'purchase', text: `Zukauf Zuchtstute ${h.name}` });
    }
  }
  return intake;
}

/** Spieler: aktiven Zweijährigen aus dem Gestüt ins Training holen, sobald eine Box frei ist. */
export function bringIntoTraining(g: GameState, h: Horse): void {
  startTraining(g, h, new Rng(g.seed).fork('into-training', h.id, g.weekIndex));
}

/**
 * Spielstart (nach der Decksaison): Die Stuten von KI und Züchtern sind bereits gedeckt worden,
 * damit im nächsten Frühjahr Fohlen zur Welt kommen.
 */
export function seedPregnancies(g: GameState): void {
  const r = new Rng(g.seed).fork('seed-pregnancies', g.season);
  const booked = bookCovers(g);
  const mares = sortedById(Object.values(g.horses)).filter((h) => h.status === 'broodmare' && mareAge(g, h) <= MARE_MAX_AGE && g.stables[h.stableId]?.kind !== 'player');
  for (const mare of mares) {
    if (pregnancyOf(g, mare.id, g.season)) continue;
    const mr = r.fork(mare.id);
    const s = chooseSire(g, mare, g.stables[mare.stableId]!, mr, booked);
    const sire = s ? g.horses[s.id] : undefined;
    if (!s || !sire || !mr.chance(0.78)) continue;
    const c = conceive(g, sire, mare, mr.fork('conceive'));
    const week = mr.int(COVER_FIRST_WEEK, COVER_LAST_WEEK - 2);
    const due = Math.min(20, Math.round(6 + (week - 1) * 1.3 + mr.int(0, 4)));
    g.breeding.pregnancies[pregnancyKey(mare.id, g.season)] = { mareId: mare.id, sireId: s.id, ownerId: mare.stableId, coverSeason: g.season, coverWeek: week, dueWeek: due, genotype: c.genotype, sex: c.sex };
    s.covers++;
    booked.set(s.id, s.covers);
  }
  const crop = Object.values(g.breeding.pregnancies).filter((p) => p.coverSeason === g.season);
  setCropOffsets(g, g.season, crop.map((p) => p.genotype));
}

export function mareCounts(g: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of Object.values(g.horses)) if (h.status === 'broodmare') m.set(h.stableId, (m.get(h.stableId) ?? 0) + 1);
  return m;
}
