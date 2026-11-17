import { Rng } from '../rng';
import type { Horse, Stable, Staff, StaffRole } from '../types';
import { STAFF_ROLES } from '../types';
import { PersonNameRegistry } from '../world/names';
import { addInbox, book, formatMoney, type GameState, horsesOfStable, sortedById, staffOfStable } from '../game/state';

/**
 * Personal: Rollen, Gehaltsforderungen, Wirkung auf Training und Gesundheit, Moral, Verträge.
 * Fachkönnen (skill) ist verborgen; der Spieler sieht eine Einstufung in halben Sternen.
 * Das Wirkungsmodell ist so normiert, dass Personal mittlerer Qualität (0,5) die
 * Kalibrierung aus Phase 2 unverändert lässt.
 */

export const ROLE_LABEL: Record<StaffRole, string> = {
  head_trainer: 'Cheftrainer',
  assistant_trainer: 'Assistenztrainer',
  jockey: 'Jockey',
  work_rider: 'Arbeitsreiter',
  groom: 'Pfleger',
  vet: 'Tierarzt',
  farrier: 'Hufschmied',
  agent: 'Bloodstock-Agent',
  analyst: 'Datenanalyst',
};

export const ROLE_EFFECT: Record<StaffRole, string> = {
  head_trainer: 'Trainingseffizienz, Genauigkeit der Einschätzungen',
  assistant_trainer: 'entlastet den Cheftrainer ab 20 Pferden (je Assistent +20 Pferde)',
  jockey: 'Stalljockey: reitet die eigenen Pferde zuerst, keine Reitgebühr',
  work_rider: 'Qualität der täglichen Arbeit (8 Pferde je Reiter)',
  groom: 'Erholung und Temperament der zugeteilten Pferde (4 Pferde je Pfleger)',
  vet: 'Heilungsdauer, Früherkennung, genaue Risikowerte',
  farrier: 'Verletzungsvorbeugung, besonders an den Hufen',
  agent: 'Genauigkeit der Auktionsgutachten',
  analyst: 'Speed Figures und Sectional Times; Können bestimmt die Genauigkeit',
};

/** Grundgehalt je Woche in £ für Personal mittlerer Qualität. */
export const BASE_SALARY: Record<StaffRole, number> = {
  head_trainer: 600,
  assistant_trainer: 340,
  jockey: 380,
  work_rider: 220,
  groom: 200,
  vet: 460,
  farrier: 260,
  agent: 340,
  analyst: 280,
};

export const GROOM_CAPACITY = 4;
export const RIDER_CAPACITY = 8;
export const TRAINER_CAPACITY = 20;
export const ASSISTANT_CAPACITY = 20;
/** Übliche Erfolgsbeteiligung für Trainer und Jockeys */
export const DEFAULT_PRIZE_SHARE = 0.1;
/** Freie Jockeys erhalten diesen Anteil am Preisgeld ihrer Ritte */
export const FREELANCE_JOCKEY_SHARE = 0.08;
export const RIDING_FEE = 160;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------- Erzeugung

export interface StaffOptions {
  skill?: number;
  age?: number;
  apprentice?: boolean;
}

export function generateStaff(r: Rng, role: StaffRole, id: string, name: string, o: StaffOptions = {}): Staff {
  const apprentice = role === 'jockey' && (o.apprentice ?? r.chance(0.3));
  const age =
    o.age ??
    (role === 'jockey'
      ? apprentice
        ? r.int(17, 23)
        : r.int(23, 40)
      : role === 'head_trainer'
        ? r.int(34, 62)
        : r.int(21, 58));
  const mean = role === 'jockey' ? (apprentice ? 0.48 : 0.6) : 0.5;
  const skill = clamp(o.skill ?? r.normal(mean, role === 'jockey' ? 0.13 : 0.15), 0.08, 0.95);
  const youth = role === 'jockey' ? clamp((30 - age) / 12, 0, 1) : clamp((40 - age) / 18, 0, 1);
  const potential = clamp(skill + Math.abs(r.normal(0, 0.12)) * (0.3 + youth), skill, 0.97);
  const experience = clamp((age - 18) * 2.4 + r.normal(0, 8), 0, 100);
  const s: Staff = {
    id,
    name,
    role,
    age,
    skill: r2(skill),
    potential: r2(potential),
    experience: Math.round(experience),
    morale: 65,
    contract: null,
    leaving: null,
    blockedUntilWeekIndex: null,
    source: 'generated',
    placeholder: false,
  };
  if (role === 'jockey') {
    const comp = () => r2(clamp(skill + r.normal(0, 0.07), 0.05, 0.98));
    s.jockey = {
      tactics: comp(),
      pace: comp(),
      finishing: comp(),
      weightLb: Math.round(r.range(108, 120)),
      fee: RIDING_FEE,
      careerWins: apprentice ? r.int(0, 90) : Math.round(100 + (age - 22) * r.range(15, 60) * (0.5 + skill)),
      suspendedUntilWeekIndex: null,
      suspensions: 0,
    };
  }
  if (role === 'head_trainer' || role === 'assistant_trainer') {
    s.trainer = {
      insight: r2(clamp(r.normal(skill, 0.12), 0.05, 0.98)),
      specialty: r.weighted(['none', 'sprint', 'staying'] as const, [3, 1, 1]),
    };
  }
  return s;
}

export function newStaffId(g: GameState): string {
  let id = `s${++g.counters.staff}`;
  while (g.staff[id]) id = `s${++g.counters.staff}`;
  return id;
}

export function nameRegistry(g: GameState): PersonNameRegistry {
  return new PersonNameRegistry(Object.values(g.staff).map((s) => s.name));
}

// ---------------------------------------------------------------- Einstufung und Gehalt

/** Jockeys: Können = Mittel der Reitwerte. */
export function staffSkill(s: Staff): number {
  if (s.jockey) return (s.jockey.tactics + s.jockey.pace + s.jockey.finishing) / 3;
  return s.skill;
}

/** Sichtbare Einstufung in halben Sternen (0,5–5). */
export function stars(s: Staff): number {
  return clamp(Math.round(staffSkill(s) * 10) / 2, 0.5, 5);
}

/** Gehaltsforderung je Woche (£). */
export function salaryDemand(s: Staff): number {
  const k = staffSkill(s);
  const raw = BASE_SALARY[s.role] * (0.45 + 1.6 * k * k) * (1 + s.experience / 250);
  return Math.round(raw / 10) * 10;
}

/** Gewichtserlaubnis für Nachwuchsjockeys (britische Regel, vereinfacht). */
export function apprenticeAllowance(s: Staff | undefined): number {
  if (!s?.jockey || s.age > 26) return 0;
  const w = s.jockey.careerWins;
  return w < 20 ? 7 : w < 50 ? 5 : w < 95 ? 3 : 0;
}

export function isSuspended(s: Staff, weekIndex: number): boolean {
  return !!s.jockey?.suspendedUntilWeekIndex && s.jockey.suspendedUntilWeekIndex >= weekIndex;
}

// ---------------------------------------------------------------- Wirkung

export interface StableEffects {
  trainerSkill: number;
  insight: number;
  specialty: 'none' | 'sprint' | 'staying';
  /** Faktor auf die Trainingseffizienz (Arbeitsreiter × Entlastung) */
  trainingFactor: number;
  /** Multiplikator auf das Verletzungsrisiko */
  riskFactor: number;
  /** Multiplikator auf die Ausfallzeit */
  healFactor: number;
  /** Erholungsbonus (Frische/Woche) für Pferde ohne einzeln modellierten Pfleger */
  defaultGroom: number;
  vet: number | null;
  farrier: number | null;
  agent: number | null;
  analyst: number | null;
  hill: boolean;
  pool: boolean;
  /** Zahl der Pferde und Kapazität für Hinweise */
  horses: number;
  trainerCapacity: number;
  riderCapacity: number;
}

function best(list: Staff[]): number | null {
  return list.length ? Math.max(...list.map(staffSkill)) : null;
}

export function stableEffects(g: GameState, stableId: string): StableEffects {
  const st = g.stables[stableId]!;
  const trainer = g.staff[st.trainerId];
  const horses = horsesOfStable(g, stableId).length;
  const f = st.facilities;
  const base = {
    trainerSkill: trainer?.skill ?? 0.4,
    insight: trainer?.trainer?.insight ?? 0.4,
    specialty: trainer?.trainer?.specialty ?? 'none',
    hill: f.hill,
    pool: f.pool,
    horses,
  };
  const facilityRisk = (f.pool ? 0.95 : 1) * (f.clinic ? 0.95 : 1);
  const clinicHeal = f.clinic ? 0.8 : 1;
  if (st.kind !== 'player') {
    const q = st.staffQuality;
    return {
      ...base,
      trainingFactor: 0.85 + 0.3 * q,
      riskFactor: (1 - 0.4 * (q - 0.5)) * facilityRisk,
      healFactor: (1 - 0.3 * (q - 0.5)) * clinicHeal,
      defaultGroom: 6 * (q * 0.8 - 0.3),
      vet: q,
      farrier: q,
      agent: q,
      analyst: q,
      trainerCapacity: 999,
      riderCapacity: 999,
    };
  }
  const team = staffOfStable(g, stableId).filter((s) => !s.leaving || s.leaving.weekIndex > g.weekIndex);
  const of = (role: StaffRole) => team.filter((s) => s.role === role);
  const assistants = of('assistant_trainer');
  const riders = of('work_rider');
  const trainerCapacity = TRAINER_CAPACITY + ASSISTANT_CAPACITY * assistants.length;
  const relief = horses > trainerCapacity ? Math.max(0.6, Math.sqrt(trainerCapacity / horses)) : 1;
  const riderCapacity = RIDER_CAPACITY * riders.length;
  const riderSkill = riders.length ? riders.reduce((a, s) => a + s.skill, 0) / riders.length : 0;
  const riderLoad = horses > riderCapacity && riderCapacity > 0 ? Math.sqrt(riderCapacity / horses) : 1;
  const riderFactor = riders.length ? (0.85 + 0.3 * riderSkill) * riderLoad : 0.7;
  const vet = best(of('vet'));
  const farrier = best(of('farrier'));
  const vetRisk = vet === null ? 1.08 : 1 - 0.2 * (vet - 0.5) - 0.02;
  const farrierRisk = farrier === null ? 1.08 : 1 - 0.2 * (farrier - 0.5) - 0.02;
  return {
    ...base,
    trainingFactor: riderFactor * relief,
    riskFactor: vetRisk * farrierRisk * facilityRisk,
    healFactor: (vet === null ? 1.1 : 1 - 0.3 * (vet - 0.5)) * clinicHeal,
    defaultGroom: -3,
    vet,
    farrier,
    agent: best(of('agent')),
    analyst: best(of('analyst')),
    trainerCapacity,
    riderCapacity,
  };
}

/** Wirkung des Pflegers auf ein einzelnes Pferd. */
export function groomEffect(g: GameState, h: Horse, eff: StableEffects): { fresh: number; temperament: number } {
  const st = g.stables[h.stableId]!;
  if (st.kind !== 'player') return { fresh: eff.defaultGroom, temperament: 0 };
  const groom = h.groomId ? g.staff[h.groomId] : undefined;
  if (!groom || groom.contract?.stableId !== h.stableId) return { fresh: -3, temperament: -0.003 };
  const load = Object.values(g.horses).filter((x) => x.groomId === groom.id && x.stableId === h.stableId && x.status === 'active').length;
  const quality = groom.skill * Math.min(1, GROOM_CAPACITY / Math.max(1, load));
  const bondF = 0.6 + 0.4 * (h.groomBond / 100);
  const q = quality * bondF;
  return { fresh: 6 * (q - 0.3), temperament: 0.012 * q };
}

/** Genauigkeit der Speed Figures: 0 = keine, sonst Rundung auf 5, 2 oder 1 lb. */
export function figurePrecision(g: GameState): 0 | 1 | 2 | 5 {
  const a = stableEffects(g, g.playerStableId).analyst;
  if (a === null) return 0;
  return a >= 0.72 ? 1 : a >= 0.45 ? 2 : 5;
}

// ---------------------------------------------------------------- Verträge

export interface ContractOffer {
  weeklySalary: number;
  years: number;
  prizeShare?: number;
}

/** Schwelle, ab der ein Bewerber zusagt (deterministisch, damit der Spieler planen kann). */
export function acceptThreshold(g: GameState, s: Staff, stableId: string): number {
  const demand = salaryDemand(s);
  const own = s.contract?.stableId === stableId;
  if (own) return Math.round(demand * (1.15 - s.morale / 200));
  const rep = g.stables[stableId]!.reputation;
  // Die volle Forderung reicht immer; ein guter Ruf bringt Rabatt
  return Math.round(demand * Math.min(1, 1.02 - rep / 350));
}

export function contractEndSeason(g: GameState, years: number): number {
  // Ab der Vertragsrunde (November) zählt die neue Saison als erstes Vertragsjahr
  return g.season + Math.max(1, Math.min(5, Math.round(years))) - (g.week >= 44 ? 0 : 1);
}

export function signContract(g: GameState, s: Staff, stableId: string, o: ContractOffer): void {
  s.contract = {
    stableId,
    weeklySalary: Math.round(o.weeklySalary),
    prizeShare: o.prizeShare ?? (s.role === 'head_trainer' || s.role === 'jockey' ? DEFAULT_PRIZE_SHARE : 0),
    startWeekIndex: g.weekIndex,
    endSeason: contractEndSeason(g, o.years),
  };
  s.leaving = null;
  s.blockedUntilWeekIndex = null;
}

/** Vertrag beenden: Personal geht zurück auf den Markt, Zuteilungen werden gelöst. */
export function releaseStaff(g: GameState, s: Staff): void {
  const stableId = s.contract?.stableId;
  s.contract = null;
  s.leaving = null;
  if (s.role === 'groom' && stableId) {
    for (const h of Object.values(g.horses)) if (h.groomId === s.id) h.groomId = null;
  }
}

/** Abfindung bei Entlassung: halbes Restgehalt, höchstens 26 Wochen. */
export function severance(g: GameState, s: Staff): number {
  if (!s.contract) return 0;
  const weeksLeft = Math.max(0, (s.contract.endSeason - g.season) * 52 + (52 - g.week));
  return Math.round(Math.min(26, weeksLeft) * s.contract.weeklySalary * 0.5);
}

// ---------------------------------------------------------------- Wochenschleife

/** Pool freier Bewerber je Rolle (ohne Jockeys, die über config.jockeys laufen). */
const POOL_TARGET: Record<StaffRole, number> = {
  head_trainer: 5,
  assistant_trainer: 6,
  jockey: 0,
  work_rider: 8,
  groom: 12,
  vet: 4,
  farrier: 4,
  agent: 4,
  analyst: 5,
};

export function refreshStaffPool(g: GameState, r: Rng, initial = false): void {
  const names = nameRegistry(g);
  const free = sortedById(Object.values(g.staff)).filter((s) => !s.contract);
  if (!initial) {
    // Ein Teil der Bewerber findet anderswo eine Stelle
    const referenced = new Set<string>();
    for (const h of Object.values(g.horses)) if (h.groomId) referenced.add(h.groomId);
    for (const st of Object.values(g.stables)) referenced.add(st.trainerId);
    for (const s of free) {
      if (s.role === 'jockey' || referenced.has(s.id)) continue;
      if (r.chance(0.2)) delete g.staff[s.id];
    }
  }
  for (const role of STAFF_ROLES) {
    const have = Object.values(g.staff).filter((s) => !s.contract && s.role === role).length;
    for (let i = have; i < POOL_TARGET[role]; i++) {
      const s = generateStaff(r, role, newStaffId(g), names.personName(r));
      g.staff[s.id] = s;
    }
  }
  // Freie Jockeys: Nachwuchs rückt nach
  const jockeys = Object.values(g.staff).filter((s) => s.role === 'jockey' && (s.blockedUntilWeekIndex ?? 0) < 1e9).length;
  for (let i = jockeys; i < g.config.jockeys; i++) {
    const s = generateStaff(r, 'jockey', newStaffId(g), names.personName(r), { apprentice: !initial || r.chance(0.3) });
    g.staff[s.id] = s;
  }
}

function recentStableWins(g: GameState, stableId: string, weeks: number): number {
  let n = 0;
  for (const race of Object.values(g.races)) {
    if (race.status !== 'run' || race.weekIndex < g.weekIndex - weeks) continue;
    const first = race.resultRunIds[0] ? g.runs[race.resultRunIds[0]] : undefined;
    if (first?.stableId === stableId) n++;
  }
  return n;
}

/** Zielmoral aus Gehalt, Erfolg, Ruf und Arbeitslast. */
export function moraleTarget(g: GameState, s: Staff, wins8: number, eff: StableEffects): number {
  const c = s.contract!;
  const pay = c.weeklySalary / Math.max(1, salaryDemand(s));
  let t = 58 + 18 * Math.tanh((pay - 1) * 3) + Math.min(14, wins8 * 2.5) + (g.stables[c.stableId]!.reputation - 40) / 8;
  if (s.role === 'groom') {
    const load = Object.values(g.horses).filter((h) => h.groomId === s.id && h.status === 'active').length;
    if (load > GROOM_CAPACITY) t -= 6 * (load - GROOM_CAPACITY);
  }
  if (s.role === 'work_rider' && eff.horses > eff.riderCapacity) t -= 10;
  if ((s.role === 'head_trainer' || s.role === 'assistant_trainer') && eff.horses > eff.trainerCapacity) t -= 10;
  return clamp(t, 5, 98);
}

export interface StaffWeekResult {
  salaries: number;
  departures: string[];
}

/**
 * Wöchentliche Personalabläufe: Gehälter, Erfahrung, Moral, Kündigungen und Abwerbungen,
 * Abgänge, Bindung der Pfleger, Vertragsrunde.
 */
export function staffWeek(g: GameState): StaffWeekResult {
  const r = new Rng(g.seed).fork('staff', g.weekIndex);
  const player = g.playerStableId;
  const playerEff = stableEffects(g, player);
  const wins8 = recentStableWins(g, player, 8);
  const out: StaffWeekResult = { salaries: 0, departures: [] };

  // Gehälter
  const payroll = new Map<string, number>();
  for (const s of sortedById(Object.values(g.staff))) {
    if (!s.contract) continue;
    payroll.set(s.contract.stableId, (payroll.get(s.contract.stableId) ?? 0) + s.contract.weeklySalary);
  }
  for (const st of sortedById(Object.values(g.stables))) {
    if (st.kind === 'market') continue;
    let amount = payroll.get(st.id) ?? 0;
    if (st.kind === 'ai') {
      // nicht einzeln modelliertes Personal der KI-Ställe
      amount += horsesOfStable(g, st.id).length * AI_STAFF_COST_PER_HORSE * (0.7 + 0.6 * st.staffQuality);
    }
    if (amount > 0) {
      const n = staffOfStable(g, st.id).length;
      book(g, st.id, { amount: -Math.round(amount), kind: 'salary', text: `Gehälter (${n} Mitarbeiter)` });
      if (st.id === player) out.salaries = Math.round(amount);
    }
  }

  for (const s of sortedById(Object.values(g.staff))) {
    // Erfahrung und Entwicklung
    if (s.contract) s.experience = Math.min(100, s.experience + 0.25);
    const youngEnough = s.role === 'jockey' ? s.age < 32 : s.age < 45;
    if (youngEnough && s.skill < s.potential) {
      const step = (s.potential - s.skill) * 0.004 * (1 + s.experience / 100) * (s.contract ? 1 : 0.5);
      s.skill = r2(s.skill + step);
      if (s.jockey) {
        s.jockey.tactics = r2(Math.min(0.98, s.jockey.tactics + step));
        s.jockey.pace = r2(Math.min(0.98, s.jockey.pace + step));
        s.jockey.finishing = r2(Math.min(0.98, s.jockey.finishing + step));
      }
      if (s.trainer) s.trainer.insight = r2(Math.min(0.98, s.trainer.insight + step * 0.5));
    }
    if (!s.contract || s.contract.stableId !== player) continue;

    // Moral des eigenen Personals
    const target = moraleTarget(g, s, wins8, playerEff);
    s.morale = Math.round((s.morale + (target - s.morale) * 0.15) * 10) / 10;
    if (!s.leaving) {
      const sr = r.fork(s.id);
      if (s.morale < 30 && sr.chance(0.05)) {
        s.leaving = { weekIndex: g.weekIndex + 2, reason: 'resign', toStableId: null };
        addInbox(g, {
          kind: 'staff',
          title: `${s.name} hat gekündigt`,
          body: `${ROLE_LABEL[s.role]} ${s.name} ist unzufrieden (Moral ${Math.round(s.morale)}) und verlässt den Stall in zwei Wochen. Ein besseres Angebot (Personal → Vertrag) kann ihn halten.`,
          staffId: s.id,
        });
      } else if (staffSkill(s) > 0.58 && s.morale < 55 && sr.chance(0.012 + (55 - s.morale) / 2500)) {
        const rivals = sortedById(Object.values(g.stables)).filter((x) => x.kind === 'ai');
        const to = sr.pick(rivals);
        s.leaving = { weekIndex: g.weekIndex + 2, reason: 'poached', toStableId: to.id };
        addInbox(g, {
          kind: 'staff',
          title: `${to.name} wirbt ${s.name} ab`,
          body: `${to.name} hat ${ROLE_LABEL[s.role]} ${s.name} ein Angebot gemacht. Ohne Gehaltserhöhung (mindestens +15 % oder die volle Forderung von ${formatMoney(salaryDemand(s))}) wechselt ${s.name} in zwei Wochen.`,
          staffId: s.id,
        });
      }
    }
  }

  // Abgänge ausführen
  for (const s of sortedById(Object.values(g.staff))) {
    if (!s.leaving || s.leaving.weekIndex > g.weekIndex) continue;
    const from = s.contract?.stableId ?? null;
    const to = s.leaving.toStableId;
    const reason = s.leaving.reason;
    releaseStaff(g, s);
    if (from === player) {
      out.departures.push(s.id);
      addInbox(g, {
        kind: 'staff',
        title: `${s.name} hat den Stall verlassen`,
        body: `${ROLE_LABEL[s.role]} ${s.name} ist gegangen${to ? ` und arbeitet jetzt für ${g.stables[to]!.name}` : ''}.`,
        staffId: s.id,
      });
    }
    if (reason === 'retire') {
      if (s.role !== 'jockey') delete g.staff[s.id];
      else s.blockedUntilWeekIndex = 1e9;
      continue;
    }
    if (to && g.stables[to]) joinAiStable(g, s, to);
    ensureHeadTrainer(g, from);
  }

  // Bindung der Pfleger
  for (const h of Object.values(g.horses)) {
    if (h.status !== 'active' || !h.groomId) continue;
    h.groomBond = Math.min(100, h.groomBond + 2);
  }

  // Vertragsrunde im November
  if (g.week === 44) {
    const expiring = staffOfStable(g, player).filter((s) => s.contract!.endSeason <= g.season);
    if (expiring.length) {
      addInbox(g, {
        kind: 'staff',
        title: `Vertragsrunde: ${expiring.length} Vertr${expiring.length === 1 ? 'ag läuft' : 'äge laufen'} aus`,
        body:
          'Bis zum Saisonende verlängern, sonst gehen diese Mitarbeiter:\n' +
          expiring.map((s) => `${ROLE_LABEL[s.role]} ${s.name} – fordert ${formatMoney(salaryDemand(s))}/Woche`).join('\n'),
      });
    }
  }

  if (g.week % 4 === 0) refreshStaffPool(g, r.fork('pool'));
  return out;
}

/** Nicht einzeln modelliertes Personal der KI-Ställe, je Pferd und Woche. */
export const AI_STAFF_COST_PER_HORSE = 150;

/** Personal wechselt zu einem KI-Stall. */
export function joinAiStable(g: GameState, s: Staff, stableId: string): void {
  const st = g.stables[stableId]!;
  if (s.role === 'head_trainer') {
    const old = g.staff[st.trainerId];
    if (old && staffSkill(old) >= staffSkill(s)) return;
    if (old) releaseStaff(g, old);
    signContract(g, s, stableId, { weeklySalary: salaryDemand(s), years: 3 });
    st.trainerId = s.id;
    return;
  }
  if (s.role === 'jockey') {
    for (const j of staffOfStable(g, stableId, 'jockey')) releaseStaff(g, j);
    signContract(g, s, stableId, { weeklySalary: salaryDemand(s), years: 2 });
    return;
  }
  signContract(g, s, stableId, { weeklySalary: salaryDemand(s), years: 2 });
  st.staffQuality = r2(Math.min(0.9, st.staffQuality + 0.015));
}

/** Jeder Stall braucht einen Cheftrainer; fällt er weg, springt ein Assistent oder ein Interimstrainer ein. */
export function ensureHeadTrainer(g: GameState, stableId: string | null): void {
  if (!stableId) return;
  const st = g.stables[stableId];
  if (!st || st.kind === 'market') return;
  const cur = g.staff[st.trainerId];
  if (cur && cur.contract?.stableId === stableId) return;
  const assistant = staffOfStable(g, stableId, 'assistant_trainer').sort((a, b) => b.skill - a.skill)[0];
  let next: Staff | undefined;
  if (assistant) {
    next = assistant;
    next.role = 'head_trainer';
    next.contract!.weeklySalary = Math.max(next.contract!.weeklySalary, salaryDemand(next));
  } else {
    const free = sortedById(Object.values(g.staff)).filter((s) => !s.contract && s.role === 'head_trainer');
    const budget = st.kind === 'player' ? 0.5 : 0.9;
    next = free.filter((s) => s.skill <= budget + 0.1).sort((a, b) => b.skill - a.skill)[0] ?? free[0];
    if (!next) {
      const r = new Rng(g.seed).fork('interim', stableId, g.weekIndex);
      next = generateStaff(r, 'head_trainer', newStaffId(g), nameRegistry(g).personName(r), { skill: 0.4 });
      g.staff[next.id] = next;
    }
    signContract(g, next, stableId, { weeklySalary: salaryDemand(next), years: 1 });
  }
  st.trainerId = next.id;
  if (st.kind === 'player') {
    addInbox(g, {
      kind: 'staff',
      title: `Neuer Cheftrainer: ${next.name}`,
      body: `${next.name} übernimmt vorläufig das Training (Vertrag bis Saisonende ${next.contract!.endSeason}). Unter Personal kannst du einen anderen Trainer einstellen.`,
      staffId: next.id,
    });
  }
}

/** Saisonwechsel: Alter, auslaufende Verträge, Ruhestand. */
export function staffTurnover(g: GameState): void {
  const r = new Rng(g.seed).fork('staff-turnover', g.season);
  for (const s of sortedById(Object.values(g.staff))) {
    s.age += 1;
    const retireAge = s.role === 'jockey' ? 44 : 64;
    if (s.age >= retireAge && r.chance(0.5)) {
      const from = s.contract?.stableId ?? null;
      if (from === g.playerStableId) {
        addInbox(g, { kind: 'staff', title: `${s.name} geht in den Ruhestand`, body: `${ROLE_LABEL[s.role]} ${s.name} hört mit ${s.age} Jahren auf.`, staffId: s.id });
      }
      releaseStaff(g, s);
      if (s.role === 'jockey') s.blockedUntilWeekIndex = 1e9;
      else if (!Object.values(g.stables).some((st) => st.trainerId === s.id)) delete g.staff[s.id];
      ensureHeadTrainer(g, from);
      continue;
    }
    if (!s.contract || s.contract.endSeason >= g.season) continue;
    const st = g.stables[s.contract.stableId];
    if (st?.kind === 'ai' && (s.role === 'head_trainer' || s.role === 'jockey')) {
      // KI verlängert ihre Schlüsselpersonen
      s.contract.endSeason = g.season + r.int(1, 3);
      s.contract.weeklySalary = salaryDemand(s);
      continue;
    }
    const from = s.contract.stableId;
    if (from === g.playerStableId) {
      addInbox(g, { kind: 'staff', title: `Vertrag ausgelaufen: ${s.name}`, body: `Der Vertrag von ${ROLE_LABEL[s.role]} ${s.name} ist ausgelaufen.`, staffId: s.id });
    }
    releaseStaff(g, s);
    ensureHeadTrainer(g, from);
  }
  // Jockeys im Ruhestand reiten nicht mehr; sie bleiben nur für die Statistik erhalten
  refreshStaffPool(g, r.fork('pool'));
}

/** Jockeys, die gebucht werden können (nicht gesperrt, nicht im Ruhestand). */
export function activeJockeys(g: GameState): Staff[] {
  return sortedById(Object.values(g.staff)).filter((s) => s.role === 'jockey' && (s.blockedUntilWeekIndex ?? 0) < 1e9);
}

export function stableOf(g: GameState, s: Staff): Stable | null {
  return s.contract ? (g.stables[s.contract.stableId] ?? null) : null;
}
