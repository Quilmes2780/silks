import { Rng } from '../rng';
import type { Horse, LedgerEntry, RaceInstance, Stable, Staff, Stallion } from '../types';
import { conformationOf } from '../horse/generate';
import { NameRegistry, PersonNameRegistry } from '../world/names';
import { generateStaff, refreshStaffPool, salaryDemand, signContract } from '../staff/staff';
import { assignPedigree, createFounderMares, createFounderStallions } from '../breeding/stud';
import { initGenetics } from '../breeding/genetics';
import { aiPlanMatings, COVER_LAST_WEEK, seedPregnancies } from '../breeding/cycle';
import { recordBalance } from '../economy/finance';
import { updateValues } from '../economy/value';
import { auctionWeek } from '../market/auction';
import { aiFacilities, hireStarterTeam, marketStable, PLAYER_FACILITIES } from './newGame';
import { addInbox, DEFAULT_CONFIG, type GameState, horseAccount, MARKET_STABLE_ID, sortedById, usedHorseNames, weekIndexOf } from './state';

/**
 * Spielstände aus Phase 2 (Version 1) auf Version 2 heben:
 * Trainer und Jockeys werden zu Personal, Pferde und Ställe erhalten die neuen Felder,
 * Deckhengst-Register, Bewerberpool und Startteam werden angelegt.
 * Die IDs von Trainern und Jockeys bleiben erhalten, damit alle Verweise gültig bleiben.
 */

interface V1Trainer {
  id: string;
  name: string;
  skill: number;
  insight: number;
  specialty: 'none' | 'sprint' | 'staying';
  source: 'world' | 'generated';
  placeholder: boolean;
}

interface V1Jockey {
  id: string;
  name: string;
  tactics: number;
  pace: number;
  finishing: number;
  weightLb: number;
  fee: number;
  source: 'world' | 'generated';
  placeholder: boolean;
}

export const SAVE_VERSION = 3;

/** Liefert true, wenn migriert wurde. */
export function migrateGame(raw: Record<string, unknown>): boolean {
  const version = raw.version as number;
  if (version === SAVE_VERSION) return false;
  if (version !== 1 && version !== 2) throw new Error(`Spielstand-Version ${version} wird nicht unterstützt.`);
  if (version === 1) migrateV1(raw);
  migrateV2(raw);
  return true;
}

function migrateV1(raw: Record<string, unknown>): void {
  const old = raw as Record<string, unknown> & { trainers: Record<string, V1Trainer>; jockeys: Record<string, V1Jockey>; config: Record<string, unknown> };
  const g = raw as unknown as GameState;
  const r = new Rng(g.seed).fork('migrate-v2');

  const trainers = old.trainers ?? {};
  const jockeys = old.jockeys ?? {};
  delete (raw as Record<string, unknown>).trainers;
  delete (raw as Record<string, unknown>).jockeys;
  const { trainingFeePerWeek: _fee, ...cfg } = old.config as Record<string, unknown>;
  void _fee;
  g.config = { ...DEFAULT_CONFIG, ...(cfg as Partial<GameState['config']>) };

  (g as { version: number }).version = 2;
  g.staff = {};
  g.stallions = {};
  g.auctions = {};
  g.offers = [];
  g.breeding = { plans: {}, pregnancies: {}, barren: [] };
  g.finance = { balanceHistory: [], overdraftWeeks: 0, horses: {} };
  g.counters = { ...g.counters, staff: 0, offer: 0, lot: 0 };
  g.touchedHorses = [];
  g.touchedRaces = [];

  // Ställe
  for (const st of Object.values(g.stables) as Array<Stable & { kind?: Stable['kind'] }>) {
    const isPlayer = st.id === g.playerStableId;
    st.kind = isPlayer ? 'player' : 'ai';
    const t = trainers[st.trainerId];
    const q = 55 + ((t?.skill ?? 0.5) - 0.45) * 30;
    st.reputation = isPlayer ? 25 : Math.round(Math.max(10, Math.min(90, 30 + (q - 55) * 2.5)));
    st.facilities = isPlayer ? { ...PLAYER_FACILITIES } : aiFacilities(q);
    st.staffQuality = isPlayer ? 0 : Math.round(Math.max(0.25, Math.min(0.85, 0.5 + (q - 64) / 20)) * 100) / 100;
  }
  g.stables[MARKET_STABLE_ID] = marketStable();

  // Trainer → Personal
  for (const t of sortedById(Object.values(trainers))) {
    const s = generateStaff(r.fork('t', t.id), 'head_trainer', t.id, t.name, { skill: t.skill });
    s.trainer = { insight: t.insight, specialty: t.specialty };
    s.source = t.source;
    s.placeholder = t.placeholder;
    g.staff[s.id] = s;
    const st = Object.values(g.stables).find((x) => x.trainerId === t.id);
    if (st) signContract(g, s, st.id, { weeklySalary: salaryDemand(s), years: st.kind === 'player' ? 2 : 1 + r.int(0, 2) });
  }
  // Jockeys → Personal (Siege aus der Startliste)
  const wins = new Map<string, number>();
  for (const run of Object.values(g.runs)) if (run.position === 1) wins.set(run.jockeyId, (wins.get(run.jockeyId) ?? 0) + 1);
  for (const j of sortedById(Object.values(jockeys))) {
    const s: Staff = generateStaff(r.fork('j', j.id), 'jockey', j.id, j.name, { skill: (j.tactics + j.pace + j.finishing) / 3, apprentice: false });
    s.jockey = {
      tactics: j.tactics,
      pace: j.pace,
      finishing: j.finishing,
      weightLb: Math.min(120, j.weightLb),
      fee: j.fee,
      careerWins: 150 + (wins.get(j.id) ?? 0),
      suspendedUntilWeekIndex: null,
      suspensions: 0,
    };
    s.source = j.source;
    s.placeholder = j.placeholder;
    g.staff[s.id] = s;
  }

  // Pferde
  for (const h of Object.values(g.horses) as Horse[]) {
    h.valueHistory = h.valueHistory ?? [];
    h.conformation = h.conformation ?? conformationOf(h.potential, new Rng(g.seed).fork('conformation', h.id));
    h.groomId = null;
    h.groomBond = 0;
    h.purchase = null;
    h.forSale = null;
    g.touchedHorses.push(h.id);
  }
  // Rennen und Ausschreibungen
  for (const race of Object.values(g.races) as RaceInstance[]) {
    race.claims = race.claims ?? [];
    for (const rn of race.runners ?? []) {
      rn.allowanceLb = rn.allowanceLb ?? 0;
      rn.assignedLb = rn.assignedLb ?? rn.weightLb;
    }
  }
  for (const t of Object.values(g.templates)) t.claimPrice = t.claimPrice ?? null;
  // Kontoauszug: Kategorie „Training“ heißt jetzt „Unterhalt“
  for (const l of g.ledger as Array<LedgerEntry & { kind: string }>) {
    l.weekIndex = weekIndexOf(g, l.season, l.week);
    if ((l.kind as string) === 'training') l.kind = 'upkeep';
  }

  // Register, Pool, Startteam
  const names = new NameRegistry(usedHorseNames(g));
  initGenetics(g, r.fork('genetics'), names);
  createFounderStallions(g, r.fork('stallions'), names);
  for (const h of sortedById(Object.values(g.horses))) if (!h.sireName && h.status === 'active') assignPedigree(g, h, r.fork('ped', h.id), names);
  const people = new PersonNameRegistry(Object.values(g.staff).map((s) => s.name));
  const team = hireStarterTeam(g, r.fork('team'), people);
  const groom = team.find((s) => s.role === 'groom')!;
  const mine = sortedById(Object.values(g.horses)).filter((h) => h.stableId === g.playerStableId && h.status === 'active');
  mine.slice(0, 4).forEach((h) => (h.groomId = groom.id));
  for (const h of mine) horseAccount(g, h.id);
  refreshStaffPool(g, r.fork('pool'), true);
  // Die stärksten KI-Ställe binden die besten freien Jockeys
  const top = sortedById(Object.values(g.stables))
    .filter((s) => s.kind === 'ai')
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 8);
  const bestJockeys = sortedById(Object.values(g.staff))
    .filter((s) => s.role === 'jockey' && !s.contract)
    .sort((a, b) => (b.jockey!.tactics + b.jockey!.pace + b.jockey!.finishing) - (a.jockey!.tactics + a.jockey!.pace + a.jockey!.finishing));
  top.forEach((st, i) => {
    const j = bestJockeys[i];
    if (j) signContract(g, j, st.id, { weeklySalary: salaryDemand(j), years: 1 + (i % 3) });
  });
  updateValues(g);
  recordBalance(g, g.weekIndex - 1);
  auctionWeek(g);
  addInbox(g, {
    kind: 'info',
    title: 'Neu: Wirtschaft und Personal',
    body:
      'Dein Spielstand wurde auf die neue Version gehoben. Neu sind Personal (Pfleger, Arbeitsreiter, Datenanalyst, Tierarzt …), ' +
      'Gehälter und Unterhalt statt der Trainingspauschale, Marktwerte, Transfermarkt, Auktionen und Claiming-Rennen. ' +
      'Ein Pfleger, ein Arbeitsreiter und ein junger Datenanalyst wurden für dich eingestellt.',
  });
}

interface V2Stallion {
  id: string;
  name: string;
  foalYear: number;
  fee: number;
  quality: number;
  active: boolean;
}

/**
 * Version 2 → 3 (Phase 4, Zucht): Hengste des Registers werden Pferde (gleiche IDs, damit die
 * Abstammung gültig bleibt), KI-Ställe und Züchter erhalten Stutenherden, Genetik und Deckpläne
 * werden angelegt.
 */
function migrateV2(raw: Record<string, unknown>): void {
  const g = raw as unknown as GameState;
  const r = new Rng(g.seed).fork('migrate-v3');
  g.version = 3;
  g.breeding = { plans: {}, pregnancies: {}, barren: [] };
  const names = new NameRegistry(usedHorseNames(g));
  if (!g.genetics) initGenetics(g, r.fork('genetics'), names);
  const old = Object.values(g.stallions as unknown as Record<string, V2Stallion | Stallion>);
  const isOld = old.length > 0 && 'quality' in old[0]!;
  if (isOld) {
    const preset = sortedById(old as V2Stallion[]).map((x) => ({ id: x.id, name: x.name, foalYear: x.foalYear, quality: x.quality }));
    g.stallions = {};
    createFounderStallions(g, r.fork('stallions'), names, preset.length, preset);
  } else if (!old.length) {
    createFounderStallions(g, r.fork('stallions'), names);
  }
  for (const st of Object.values(g.stables)) st.facilities.stud = st.facilities.stud ?? 0;
  const quality: Record<string, number> = {};
  for (const st of Object.values(g.stables)) if (st.kind === 'ai') quality[st.id] = 55 + (st.reputation - 30) / 2.5;
  createFounderMares(g, r.fork('mares'), names, quality);
  if (g.week > COVER_LAST_WEEK) seedPregnancies(g);
  else aiPlanMatings(g);
  refreshStaffPool(g, r.fork('pool'), true);
  for (const h of Object.values(g.horses)) if (!g.touchedHorses.includes(h.id)) g.touchedHorses.push(h.id);
  updateValues(g);
  addInbox(g, {
    kind: 'info',
    title: 'Neu: Zucht und Generationen',
    body:
      'Dein Spielstand wurde auf die neue Version gehoben. Neu sind Genetik, Deckhengste als echte Pferde, ein eigenes Gestüt ' +
      '(Anlage → Gestüt, Stuten können auch in Pension stehen), der Deckplan in der Decksaison (Januar bis Anfang März), ' +
      'Fohlen, Jährlinge, eine Zuchtstutenauktion im Dezember, die Zucht-Statistik sowie Teilhaberschaften und Einstellpferde. ' +
      'Die Decktaxen richten sich jetzt nach der Rennleistung der Hengste und dem Erfolg ihrer Nachkommen.',
  });
}
