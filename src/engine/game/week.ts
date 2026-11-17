import { deriveSeed, Rng } from '../rng';
import { aiLevel, aiMakeEntries, aiSetTraining } from '../ai/ai';
import { weeklyTraining, INJURY_LABEL } from '../horse/training';
import { buildSeasonCalendar } from '../season/calendar';
import { NameRegistry } from '../world/names';
import type { InjuryType, RaceInstance } from '../types';
import { groomEffect, stableEffects, staffTurnover, staffWeek, type StableEffects } from '../staff/staff';
import { financeWeek, recordBalance, updateReputation } from '../economy/finance';
import { updateValues } from '../economy/value';
import { activeStallions, importHorse } from '../breeding/stud';
import { breedingTurnover, breedingWeek, cullOldMares, mareCounts, retireRacehorse, studWorthy } from '../breeding/cycle';
import { dropLoci } from '../breeding/genetics';
import { partnershipWeek } from '../market/partnership';
import { boardingIncome, boardingTurnover, boardingWeek } from '../market/boarding';
import { auctionWeek, closeAuctions } from '../market/auction';
import { marketWeek, transferHorse } from '../market/transfer';
import { declareRace, runRace } from './raceDay';
import { addInbox, book, formatMoney, type GameState, horsesOfStable, sortedById, touch, type WeekSummary, usedHorseNames, weekIndexOf } from './state';

/**
 * Wochenschleife:
 *  beginWeek: Kalender, KI-Nennungen zum Nennschluss, Startlisten, KI-Training, Auktionskataloge
 *  advanceWeek: Rennen, Training und Gesundheit, Personal, Finanzen, Markt, nächste Woche
 */

export function ensureCalendars(g: GameState): void {
  const need = [g.season];
  if (g.week >= 46) need.push(g.season + 1);
  for (const season of need) {
    if (g.calendarSeasons.includes(season)) continue;
    const templates = buildSeasonCalendar(g.world, season, g.seed);
    for (const t of templates) {
      g.templates[t.id] = t;
      const weekIndex = weekIndexOf(g, season, t.week);
      const race: RaceInstance = {
        id: t.id,
        templateId: t.id,
        season,
        week: t.week,
        weekIndex,
        meetingId: t.id.split('-').slice(0, 4).join('-'),
        going: null,
        entries: [],
        runners: null,
        seed: deriveSeed(g.seed, 'race', t.id),
        randomness: g.config.randomness,
        status: weekIndex < g.weekIndex ? 'void' : 'open',
        resultRunIds: [],
        winningTimeS: null,
        claims: [],
      };
      g.races[race.id] = race;
    }
    g.calendarSeasons.push(season);
  }
}

export function racesOfWeek(g: GameState, weekIndex: number): RaceInstance[] {
  return sortedById(Object.values(g.races).filter((r) => r.weekIndex === weekIndex));
}

export function beginWeek(g: GameState): void {
  ensureCalendars(g);
  aiMakeEntries(g);
  const jockeyDay = new Map<string, string>();
  for (const race of racesOfWeek(g, g.weekIndex)) {
    if (race.status === 'open') declareRace(g, race, jockeyDay);
  }
  aiSetTraining(g);
  auctionWeek(g);
  // Hinweise für den Spieler: eigene Starter dieser Woche
  const mine = racesOfWeek(g, g.weekIndex).filter((r) => r.status === 'closed' && r.runners?.some((x) => x.stableId === g.playerStableId));
  if (mine.length) {
    addInbox(g, {
      kind: 'deadline',
      title: `Renntag: ${mine.length} Start${mine.length > 1 ? 's' : ''} diese Woche`,
      body: mine
        .map((r) => `${g.templates[r.templateId]!.name}: ${r.runners!.filter((x) => x.stableId === g.playerStableId).map((x) => g.horses[x.horseId]!.name).join(', ')}`)
        .join('\n'),
      raceId: mine[0]!.id,
    });
  }
}

/** Tierarztkosten je Verletzung (£), gesenkt durch eigenen Tierarzt und Klinik. */
const VET_COST: Record<InjuryType, number> = { cough: 300, sore_shins: 800, hoof: 600, muscle: 900, tendon: 4000 };

export function vetCost(type: InjuryType, eff: StableEffects, clinic: boolean): number {
  const own = eff.vet === null ? 1 : 0.75 - 0.3 * eff.vet;
  return Math.round(VET_COST[type] * own * (clinic ? 0.8 : 1));
}

export function advanceWeek(g: GameState, now: () => number = () => 0): WeekSummary {
  const t0 = now();
  const balanceBefore = g.stables[g.playerStableId]!.balance;
  const races = racesOfWeek(g, g.weekIndex).filter((r) => r.status === 'closed');
  const raced = new Map<string, number>();
  let runners = 0;
  const playerRuns: string[] = [];
  for (const race of races) {
    const res = runRace(g, race);
    if (!res) continue;
    for (const run of res.runs) {
      raced.set(run.horseId, run.distanceM);
      runners++;
      if (run.stableId === g.playerStableId) playerRuns.push(run.id);
    }
  }
  // Training und Gesundheit
  const tr = new Rng(g.seed).fork('training', g.weekIndex);
  const effects = new Map<string, StableEffects>();
  const effOf = (stableId: string) => {
    let e = effects.get(stableId);
    if (!e) {
      e = stableEffects(g, stableId);
      effects.set(stableId, e);
    }
    return e;
  };
  let injuries = 0;
  for (const h of Object.values(g.horses)) {
    if (h.status !== 'active') continue;
    const st = g.stables[h.stableId]!;
    const eff = effOf(h.stableId);
    const groom = groomEffect(g, h, eff);
    const out = weeklyTraining(h, tr.fork(h.id), {
      season: g.season,
      week: g.week,
      weekIndex: g.weekIndex,
      trainerSkill: eff.trainerSkill,
      racedDistanceM: raced.get(h.id) ?? null,
      trainingFactor: eff.trainingFactor,
      riskFactor: eff.riskFactor,
      healFactor: eff.healFactor,
      freshBonus: groom.fresh,
      temperamentBonus: groom.temperament,
      hill: eff.hill,
      pool: eff.pool,
      specialty: eff.specialty,
    });
    if (out.injury) {
      injuries++;
      if (st.kind !== 'market') {
        const cost = vetCost(out.injury.type, eff, st.facilities.clinic);
        book(g, st.id, { amount: -cost, kind: 'vet', text: `Tierarzt: ${h.name} (${INJURY_LABEL[out.injury.type]})`, horseId: h.id });
      }
      if (st.kind === 'player') {
        addInbox(g, {
          kind: 'injury',
          title: `Verletzung: ${h.name}`,
          body: `${h.name} hat ${INJURY_LABEL[out.injury.type]} und fällt voraussichtlich ${out.injury.weeks} Wochen aus.`,
          horseId: h.id,
        });
      }
    }
  }

  // Zucht: Decksaison und Geburten; Teilhaberschaften und Einstellpferde
  breedingWeek(g);
  partnershipWeek(g);
  boardingIncome(g);

  // Personal, Finanzen, Markt
  const staff = staffWeek(g);
  const fin = financeWeek(g, staff.salaries, (horseId, to, price) => transferHorse(g, horseId, to, price, 'forced_sale'));
  closeAuctions(g);
  marketWeek(g);
  boardingWeek(g);
  updateValues(g);
  updateReputation(g);
  recordBalance(g);

  const events: string[] = [];
  if (fin.forcedSale) events.push(`Zwangsverkauf: ${g.horses[fin.forcedSale]!.name}`);
  const summary: WeekSummary = {
    season: g.season,
    week: g.week,
    racesRun: races.length,
    runners,
    playerRuns,
    injuries,
    durationMs: 0,
    balanceDelta: g.stables[g.playerStableId]!.balance - balanceBefore,
    events,
  };

  // Nächste Woche
  g.week += 1;
  if (g.week > 52) {
    g.week = 1;
    g.season += 1;
    seasonTurnover(g);
  }
  g.weekIndex = weekIndexOf(g, g.season, g.week);
  // Nicht gelaufene alte Rennen schließen
  for (const r of Object.values(g.races)) if (r.weekIndex < g.weekIndex && (r.status === 'open' || r.status === 'closed')) r.status = 'void';
  beginWeek(g);
  summary.durationMs = now() - t0;
  g.lastSummary = summary;
  return summary;
}

/** Jahreswechsel: Alterung (implizit über foalYear), Ruhestand, Zucht, neue Zweijährige, Personal. */
export function seasonTurnover(g: GameState): void {
  const r = new Rng(g.seed).fork('turnover', g.season);
  const names = new NameRegistry(usedHorseNames(g));
  boardingTurnover(g);
  cullOldMares(g, r.fork('cull'));
  const mares = mareCounts(g);
  let retired = 0;
  let newStuds = 0;
  const studRoom = () => newStuds < 8 && activeStallions(g).length < 70;
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status !== 'active') continue;
    const age = g.season - h.foalYear;
    const level = h.officialRating ?? 0;
    const st = g.stables[h.stableId]!;
    if (st.kind === 'market') {
      // Unverkaufte Ware der Züchter verschwindet vom Markt
      h.status = 'retired';
      dropLoci(h);
      touch(g, h.id);
      continue;
    }
    if (h.boarding) continue;
    const retire =
      age >= 8 ||
      (age >= 6 && r.chance(0.5)) ||
      (age >= 5 && level < 50 && r.chance(0.5)) ||
      (age >= 4 && h.sex === 'female' && r.chance(0.3)) ||
      (h.condition.injury?.type === 'tendon' && age >= 5) ||
      // Spitzenhengste der KI gehen früh ins Gestüt
      (st.kind === 'ai' && age >= 4 && studWorthy(h) && level >= 108 && studRoom());
    if (retire && st.kind === 'ai') {
      const out = retireRacehorse(g, h, r.fork('retire', h.id), mares, studRoom());
      if (out === 'stud') newStuds++;
      retired++;
    }
    if (retire && st.kind === 'player' && age >= 8) {
      const out = retireRacehorse(g, h, r.fork('retire', h.id), mares, false);
      addInbox(g, {
        kind: 'season',
        title: `${h.name} beendet die Rennkarriere`,
        body:
          out === 'broodmare'
            ? `${h.name} geht mit ${age} Jahren als Zuchtstute in dein Gestüt (Gestüt → Stuten).`
            : `${h.name} geht mit ${age} Jahren in den Ruhestand.`,
        horseId: h.id,
      });
    }
  }
  // Zucht: Hengste, Stuten, Nachwuchs aus eigener Zucht geht ins Training
  breedingTurnover(g, r.fork('breeding'));
  // Fehlende Pferde: Zukäufe (Importe mit Vater aus dem Register); der Spieler erhält in den
  // ersten Jahren noch Zweijährige aus der Zucht seines Besitzers, bis die eigene Zucht greift
  const gift = g.season <= g.startSeason + 2;
  for (const s of sortedById(Object.values(g.stables))) {
    if (s.kind === 'market') continue;
    const active = Object.values(g.horses).filter((h) => h.stableId === s.id && h.status === 'active').length;
    const add = s.kind === 'player' ? (gift ? Math.max(0, Math.min(2, s.facilities.boxes - active)) : 0) : Math.max(0, g.config.horsesPerStable - active);
    const sr = r.fork('crop', s.id);
    const avg = s.kind === 'player' ? 57 : 60;
    // KI: zu große Lots (eigene Zucht plus Zukäufe) – die schwächsten Älteren gehen
    const cap = g.config.horsesPerStable + 3;
    if (s.kind === 'ai' && active > cap) {
      const extra = horsesOfStable(g, s.id)
        .filter((h) => g.season - h.foalYear >= 3)
        .sort((a, b) => aiLevel(a) - aiLevel(b))
        .slice(0, active - cap);
      for (const h of extra) retireRacehorse(g, h, sr.fork('surplus', h.id), mares, false);
    }
    for (let i = 0; i < add; i++) {
      importHorse(g, sr.fork(i), names, {
        stableId: s.id,
        foalYear: g.season - 2,
        damQuality: sr.normal(avg, s.kind === 'player' ? 4 : 7),
        status: 'active',
        trainedLevel: 0.9,
      });
    }
  }
  staffTurnover(g);
  const player = g.stables[g.playerStableId]!;
  const prev = g.season - 1;
  const myRuns = Object.values(g.runs).filter((x) => x.season === prev && x.stableId === g.playerStableId);
  const wins = myRuns.filter((x) => x.position === 1).length;
  const prize = myRuns.reduce((a, x) => a + x.prize, 0);
  const net = g.ledger.filter((l) => l.season === prev).reduce((a, l) => a + l.amount, 0);
  addInbox(g, {
    kind: 'season',
    title: `Saisonbilanz ${prev}`,
    body:
      `${myRuns.length} Starts, ${wins} Siege, Preisgeld ${formatMoney(prize)}. Ergebnis der Saison ${formatMoney(net)}, Kontostand ${formatMoney(player.balance)}. ${retired} Pferde der Konkurrenz gingen in den Ruhestand. ` +
      (gift
        ? 'Neue Zweijährige aus der Zucht deines Besitzers sind eingetroffen (soweit Boxen frei waren). '
        : '') +
      'Die Decksaison beginnt: Im Gestüt kannst du für jede Stute einen Hengst wählen.',
  });
}
