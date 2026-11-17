import { deriveSeed, Rng } from '../rng';
import { aiMakeEntries, aiSetTraining } from '../ai/ai';
import { generateHorse } from '../horse/generate';
import { weeklyTraining, INJURY_LABEL } from '../horse/training';
import { buildSeasonCalendar } from '../season/calendar';
import { NameRegistry } from '../world/names';
import type { RaceInstance } from '../types';
import { declareRace, runRace } from './raceDay';
import { addInbox, addLedger, formatMoney, type GameState, type WeekSummary, weekIndexOf } from './state';

/**
 * Wochenschleife:
 *  beginWeek: Kalender sicherstellen, KI-Nennungen zum Nennschluss, Startlisten der Rennwoche, KI-Training
 *  advanceWeek: Rennen laufen, Training, Kosten, nächste Woche (mit Alterung zum 1. Januar)
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
      };
      g.races[race.id] = race;
    }
    g.calendarSeasons.push(season);
  }
}

export function racesOfWeek(g: GameState, weekIndex: number): RaceInstance[] {
  return Object.values(g.races).filter((r) => r.weekIndex === weekIndex);
}

export function beginWeek(g: GameState): void {
  ensureCalendars(g);
  aiMakeEntries(g);
  const jockeyDay = new Map<string, string>();
  for (const race of racesOfWeek(g, g.weekIndex)) {
    if (race.status === 'open') declareRace(g, race, jockeyDay);
  }
  aiSetTraining(g);
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

export function advanceWeek(g: GameState, now: () => number = () => 0): WeekSummary {
  const t0 = now();
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
  let injuries = 0;
  for (const h of Object.values(g.horses)) {
    if (h.status !== 'active') continue;
    const trainer = g.trainers[g.stables[h.stableId]!.trainerId];
    const out = weeklyTraining(h, tr.fork(h.id), {
      season: g.season,
      week: g.week,
      weekIndex: g.weekIndex,
      trainerSkill: trainer?.skill ?? 0.5,
      racedDistanceM: raced.get(h.id) ?? null,
    });
    if (out.injury) {
      injuries++;
      if (h.stableId === g.playerStableId) {
        addInbox(g, {
          kind: 'injury',
          title: `Verletzung: ${h.name}`,
          body: `${h.name} hat ${INJURY_LABEL[out.injury.type]} und fällt voraussichtlich ${out.injury.weeks} Wochen aus.`,
          horseId: h.id,
        });
      }
    }
  }
  // Kosten des Spielerstalls
  const own = Object.values(g.horses).filter((h) => h.stableId === g.playerStableId && h.status === 'active');
  if (own.length) {
    addLedger(g, { amount: -own.length * g.config.trainingFeePerWeek, kind: 'training', text: `Trainingskosten (${own.length} Pferde)` });
  }
  const summary: WeekSummary = {
    season: g.season,
    week: g.week,
    racesRun: races.length,
    runners,
    playerRuns,
    injuries,
    durationMs: 0,
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

/** Jahreswechsel: Alterung (implizit über foalYear), Ruhestand, neue Zweijährige. */
export function seasonTurnover(g: GameState): void {
  const r = new Rng(g.seed).fork('turnover', g.season);
  const names = new NameRegistry(Object.values(g.horses).map((h) => h.name));
  let retired = 0;
  for (const h of Object.values(g.horses)) {
    if (h.status !== 'active') continue;
    const age = g.season - h.foalYear;
    const level = h.officialRating ?? 0;
    const retire =
      age >= 8 ||
      (age >= 6 && r.chance(0.5)) ||
      (age >= 5 && level < 50 && r.chance(0.5)) ||
      (age >= 4 && h.sex === 'female' && r.chance(0.3)) ||
      (h.condition.injury?.type === 'tendon' && age >= 5);
    if (retire && h.stableId !== g.playerStableId) {
      h.status = 'retired';
      retired++;
    }
    if (retire && h.stableId === g.playerStableId && age >= 8) {
      h.status = 'retired';
      addInbox(g, { kind: 'season', title: `${h.name} geht in den Ruhestand`, body: `${h.name} beendet mit ${age} Jahren die Rennkarriere.`, horseId: h.id });
    }
  }
  // Neue Zweijährige (bis Phase 4 generiert statt gezüchtet)
  for (const s of Object.values(g.stables)) {
    const active = Object.values(g.horses).filter((h) => h.stableId === s.id && h.status === 'active').length;
    const add = s.isPlayer ? 2 : Math.max(0, g.config.horsesPerStable - active);
    const sr = r.fork('crop', s.id);
    const avg = s.isPlayer ? 57 : 60;
    for (let i = 0; i < add; i++) {
      const h = generateHorse(sr, {
        id: `h${++g.counters.horse}`,
        name: names.horseName(sr),
        stableId: s.id,
        foalYear: g.season - 2,
        quality: sr.normal(avg, s.isPlayer ? 4 : 7),
        season: g.season,
        week: 1,
        trainedLevel: 0.9,
      });
      g.horses[h.id] = h;
    }
  }
  const player = g.stables[g.playerStableId]!;
  const prev = g.season - 1;
  const myRuns = Object.values(g.runs).filter((x) => x.season === prev && x.stableId === g.playerStableId);
  const wins = myRuns.filter((x) => x.position === 1).length;
  const prize = myRuns.reduce((a, x) => a + x.prize, 0);
  addInbox(g, {
    kind: 'season',
    title: `Saisonbilanz ${prev}`,
    body: `${myRuns.length} Starts, ${wins} Siege, Preisgeld ${formatMoney(prize)}. Kontostand ${formatMoney(player.balance)}. ${retired} Pferde der Konkurrenz gingen in den Ruhestand. Zwei neue Zweijährige sind in deinem Stall eingetroffen.`,
  });
}
