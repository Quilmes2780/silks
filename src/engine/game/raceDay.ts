import { deriveSeed, Rng } from '../rng';
import { simulateRace, type SimOutput, type SimRunner } from '../race/sim';
import { assignWeights, checkEligibility } from '../season/rules';
import { meetingGoing } from '../season/calendar';
import { computeHorseStats } from '../stats/horseStats';
import { applyRating } from '../stats/rating';
import { finishingSpeedPct, speedFigure } from '../stats/speedFigure';
import type { Horse, RaceInstance, Run, Runner } from '../types';
import { aiLevel, DEFAULT_TACTIC } from '../ai/ai';
import { addInbox, addLedger, formatMoney, type GameState, runsOfHorse } from './state';

/** Preisgeldverteilung (Anteil am Gesamtpreisgeld) für Platz 1–6. */
export const PRIZE_SPLIT = [0.57, 0.22, 0.11, 0.055, 0.028, 0.017];

/**
 * Startliste erstellen (zu Beginn der Rennwoche): Boden, Starter, Boxen, Gewichte, Jockeys.
 */
export function declareRace(g: GameState, race: RaceInstance, jockeyDay: Map<string, string>): void {
  const t = g.templates[race.templateId]!;
  race.going = meetingGoing(g.seed, race.meetingId, t.surface, t.week);
  const r = new Rng(race.seed).fork('declare');
  const eligible = race.entries.filter((e) => {
    const h = g.horses[e.horseId];
    if (!h || h.condition.injury) return false;
    return checkEligibility(h, t, race.season).ok;
  });
  const dropped = race.entries.filter((e) => !eligible.includes(e));
  for (const e of dropped) {
    if (e.stableId === g.playerStableId) {
      const h = g.horses[e.horseId];
      addInbox(g, {
        kind: 'deadline',
        title: `${h?.name ?? 'Pferd'} nicht startberechtigt`,
        body: `${h?.name ?? 'Das Pferd'} kann im Rennen „${t.name}“ nicht starten (verletzt oder nicht mehr startberechtigt).`,
        horseId: e.horseId,
        raceId: race.id,
      });
    }
  }
  // Überzeichnete Felder: Priorität nach Rating/Leistung
  let selected = eligible;
  if (eligible.length > t.maxRunners) {
    const scored = eligible.map((e) => ({ e, s: aiLevel(g.horses[e.horseId]!) + r.next() * 0.5 }));
    scored.sort((a, b) => b.s - a.s);
    selected = scored.slice(0, t.maxRunners).map((x) => x.e);
    for (const x of scored.slice(t.maxRunners)) {
      if (x.e.stableId === g.playerStableId) {
        addInbox(g, {
          kind: 'deadline',
          title: `${g.horses[x.e.horseId]!.name} ausgeschieden`,
          body: `Das Feld für „${t.name}“ war überzeichnet; ${g.horses[x.e.horseId]!.name} hat es nicht ins Starterfeld geschafft.`,
          horseId: x.e.horseId,
          raceId: race.id,
        });
      }
    }
  }
  if (selected.length < 2) {
    race.status = 'void';
    race.runners = [];
    for (const e of selected) {
      if (e.stableId === g.playerStableId) {
        addInbox(g, { kind: 'info', title: `Rennen abgesagt: ${t.name}`, body: 'Zu wenige Starter – das Rennen fällt aus.', raceId: race.id });
      }
    }
    return;
  }
  const horses = selected.map((e) => g.horses[e.horseId]!);
  const weights = assignWeights(t, horses, race.season);
  const stalls = r.shuffle(selected.map((_, i) => i + 1));
  // Jockeys: bessere Pferde buchen zuerst; ein Jockey reitet an einem Tag nur auf einem Meeting
  const dayKey = `${race.weekIndex}-${t.day}`;
  const order = selected.map((_, i) => i).sort((a, b) => aiLevel(horses[b]!) - aiLevel(horses[a]!));
  const jockeysByQuality = Object.values(g.jockeys).sort(
    (a, b) => b.tactics + b.pace + b.finishing - (a.tactics + a.pace + a.finishing),
  );
  const usedInRace = new Set<string>();
  const runnerJockey = new Array<string>(selected.length);
  // Vom Spieler gewählte Jockeys zuerst
  selected.forEach((e, i) => {
    if (e.jockeyId && g.jockeys[e.jockeyId]) {
      const where = jockeyDay.get(`${dayKey}|${e.jockeyId}`);
      if (!where || where === race.meetingId) {
        runnerJockey[i] = e.jockeyId;
        usedInRace.add(e.jockeyId);
        jockeyDay.set(`${dayKey}|${e.jockeyId}`, race.meetingId);
      }
    }
  });
  for (const i of order) {
    if (runnerJockey[i]) continue;
    // etwas Zufall, damit nicht immer derselbe Jockey das beste Pferd bekommt
    const skip = r.int(0, 2);
    let skipped = 0;
    for (const j of jockeysByQuality) {
      if (usedInRace.has(j.id)) continue;
      const where = jockeyDay.get(`${dayKey}|${j.id}`);
      if (where && where !== race.meetingId) continue;
      if (skipped < skip) {
        skipped++;
        continue;
      }
      runnerJockey[i] = j.id;
      usedInRace.add(j.id);
      jockeyDay.set(`${dayKey}|${j.id}`, race.meetingId);
      break;
    }
    if (!runnerJockey[i]) runnerJockey[i] = jockeysByQuality[i % jockeysByQuality.length]!.id;
  }
  race.runners = selected.map<Runner>((e, i) => ({
    horseId: e.horseId,
    stableId: e.stableId,
    jockeyId: runnerJockey[i]!,
    stall: stalls[i]!,
    weightLb: weights[i]!,
    tactic: e.tactic ?? { ...DEFAULT_TACTIC },
  }));
  race.status = 'closed';
}

/** Eingaben für die Simulation – auch für Replays verwendet. */
export function simInputFor(g: GameState, race: RaceInstance) {
  const t = g.templates[race.templateId]!;
  const runners: SimRunner[] = race.runners!.map((rn) => {
    const h = g.horses[rn.horseId]!;
    const j = g.jockeys[rn.jockeyId]!;
    return {
      horseId: h.id,
      attrs: { ...h.current },
      prefs: { ...h.prefs },
      fitness: h.condition.fitness,
      freshness: h.condition.freshness,
      weightLb: rn.weightLb,
      stall: rn.stall,
      tactic: rn.tactic,
      jockey: { tactics: j.tactics, pace: j.pace, finishing: j.finishing },
    };
  });
  return {
    seed: race.seed,
    distanceM: t.distanceM,
    track: g.tracks[t.trackId]!,
    surface: t.surface,
    going: race.going!,
    randomness: race.randomness,
    runners,
  };
}

/** Rennen laufen lassen und alle Rohdaten + Kennzahlen speichern. */
export function runRace(g: GameState, race: RaceInstance): { runs: Run[]; sim: SimOutput } | null {
  if (race.status !== 'closed' || !race.runners || race.runners.length < 2) return null;
  const t = g.templates[race.templateId]!;
  const input = simInputFor(g, race);
  // Für Replays werden die Eingaben eingefroren
  race.replayInput = input;
  const sim = simulateRace(input);
  const track = g.tracks[t.trackId]!;
  const runs: Run[] = [];
  const fieldSize = race.runners.length;
  sim.results.forEach((res, i) => {
    const rn = race.runners![i]!;
    const h = g.horses[rn.horseId]!;
    const at400 = res.sectionals.find((s) => Math.abs(s.atM - (t.distanceM - 400)) < 0.6);
    const fig = speedFigure({ timeS: res.timeS, track, surface: t.surface, distanceM: t.distanceM, going: race.going!, weightLb: rn.weightLb });
    const prize = res.position <= PRIZE_SPLIT.length ? Math.round(t.prize * PRIZE_SPLIT[res.position - 1]!) : 0;
    const run: Run = {
      id: `r${++g.counters.run}`,
      raceId: race.id,
      templateId: t.id,
      raceName: t.name,
      horseId: h.id,
      stableId: rn.stableId,
      jockeyId: rn.jockeyId,
      season: race.season,
      week: race.week,
      weekIndex: race.weekIndex,
      trackId: t.trackId,
      surface: t.surface,
      going: race.going!,
      distanceM: t.distanceM,
      raceClass: t.raceClass,
      fieldSize,
      stall: rn.stall,
      weightLb: rn.weightLb,
      tactic: rn.tactic,
      ageAtRace: race.season - h.foalYear,
      daysSinceLastRun: h.lastRunWeekIndex === null ? null : (race.weekIndex - h.lastRunWeekIndex) * 7,
      position: res.position,
      timeS: res.timeS,
      beatenL: res.beatenL,
      marginL: res.marginL,
      topSpeed: res.topSpeed,
      distanceRunM: res.distanceRunM,
      sectionals: res.sectionals,
      speedCurve: res.speedCurve,
      events: res.events,
      speedFigure: fig,
      finishingSpeedPct: at400 ? finishingSpeedPct(res.timeS, t.distanceM, at400.cumS) : NaN,
      officialRatingBefore: h.officialRating,
      prize,
    };
    runs.push(run);
    g.runs[run.id] = run;
    h.runIds.push(run.id);
    h.lastRunWeekIndex = race.weekIndex;
    if (prize > 0) g.stables[rn.stableId]!.balance += rn.stableId === g.playerStableId ? 0 : prize;
  });
  // Kennzahlen beim Rennabschluss berechnen und speichern
  for (const run of runs) {
    const h = g.horses[run.horseId]!;
    const all = runsOfHorse(g, h);
    h.stats = computeHorseStats(all);
    applyRating(h, all, race.season, race.week);
  }
  race.status = 'run';
  race.resultRunIds = [...runs].sort((a, b) => a.position - b.position).map((r) => r.id);
  race.winningTimeS = Math.min(...runs.map((r) => r.timeS));

  // Spieler: Preisgeld, Reitgebühr, Nachricht
  for (const run of runs) {
    if (run.stableId !== g.playerStableId) continue;
    const h = g.horses[run.horseId]!;
    const j = g.jockeys[run.jockeyId]!;
    addLedger(g, { amount: -j.fee, kind: 'jockey_fee', text: `Reitgebühr ${j.name} (${h.name})`, raceId: race.id, horseId: h.id });
    if (run.prize > 0) addLedger(g, { amount: run.prize, kind: 'prize', text: `Preisgeld ${t.name}: ${h.name} (${run.position}.)`, raceId: race.id, horseId: h.id });
    addInbox(g, {
      kind: 'result',
      title: `${h.name}: ${run.position}. von ${fieldSize} – ${t.name}`,
      body: `${h.name} wurde ${run.position}. (${run.position === 1 ? 'Sieg' : `${run.beatenL.toFixed(1)} Längen zurück`}), Speed Figure ${run.speedFigure}.${run.prize ? ` Preisgeld ${formatMoney(run.prize)}.` : ''}`,
      horseId: h.id,
      raceId: race.id,
    });
  }
  return { runs, sim };
}

/** Replay eines gelaufenen Rennens: deterministische Neusimulation mit Positionsdaten. */
export function replayRace(g: GameState, raceId: string): SimOutput | null {
  const race = g.races[raceId];
  if (!race || race.status !== 'run' || !race.replayInput) return null;
  return simulateRace({ ...race.replayInput, record: true });
}

export function raceSeed(g: GameState, raceId: string): number {
  return deriveSeed(g.seed, 'race', raceId);
}

export function horseLabel(h: Horse): string {
  return h.name;
}
