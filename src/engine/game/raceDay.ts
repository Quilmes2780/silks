import { deriveSeed, Rng } from '../rng';
import { simulateRace, type SimOutput, type SimRunner } from '../race/sim';
import { assignWeights, checkEligibility } from '../season/rules';
import { meetingGoing } from '../season/calendar';
import { computeHorseStats } from '../stats/horseStats';
import { applyRating } from '../stats/rating';
import { finishingSpeedPct, speedFigure } from '../stats/speedFigure';
import type { Horse, RaceInstance, Run, Runner, Staff } from '../types';
import { aiLevel, DEFAULT_TACTIC } from '../ai/ai';
import { activeJockeys, apprenticeAllowance, FREELANCE_JOCKEY_SHARE, isSuspended, ROLE_LABEL, staffSkill } from '../staff/staff';
import { aiClaims, resolveClaims } from '../market/claiming';
import { addInbox, book, formatMoney, type GameState, runsOfHorse } from './state';

/** Preisgeldverteilung (Anteil am Gesamtpreisgeld) für Platz 1–6. */
export const PRIZE_SPLIT = [0.57, 0.22, 0.11, 0.055, 0.028, 0.017];

/** Jockeys dürfen in Group- und Listed-Rennen keine Nachwuchserlaubnis nutzen. */
export function allowanceApplies(raceClass: string): boolean {
  return !['G1', 'G2', 'G3', 'Listed'].includes(raceClass);
}

/** Stalljockey eines Stalls (Vertrag mit Rolle Jockey). */
export function retainedJockeys(g: GameState, stableId: string): Staff[] {
  return activeJockeys(g).filter((j) => j.contract?.stableId === stableId);
}

/**
 * Startliste erstellen (zu Beginn der Rennwoche): Boden, Starter, Boxen, Gewichte, Jockeys.
 */
export function declareRace(g: GameState, race: RaceInstance, jockeyDay: Map<string, string>): void {
  const t = g.templates[race.templateId]!;
  race.going = meetingGoing(g.seed, race.meetingId, t.surface, t.week);
  const r = new Rng(race.seed).fork('declare');
  const eligible = race.entries.filter((e) => {
    const h = g.horses[e.horseId];
    if (!h || h.condition.injury || h.stableId !== e.stableId) return false;
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
  // Jockeys: Spielerwunsch, dann Stalljockeys, dann freie Jockeys (bessere Pferde buchen zuerst).
  // Ein Jockey reitet an einem Tag nur auf einem Meeting.
  const dayKey = `${race.weekIndex}-${t.day}`;
  const order = selected.map((_, i) => i).sort((a, b) => aiLevel(horses[b]!) - aiLevel(horses[a]!));
  const pool = activeJockeys(g).filter((j) => !isSuspended(j, race.weekIndex));
  const free = pool.filter((j) => !j.contract).sort((a, b) => staffSkill(b) - staffSkill(a));
  const usedInRace = new Set<string>();
  const runnerJockey = new Array<string>(selected.length);
  const available = (j: Staff) => {
    if (usedInRace.has(j.id)) return false;
    const where = jockeyDay.get(`${dayKey}|${j.id}`);
    return !where || where === race.meetingId;
  };
  const take = (i: number, j: Staff) => {
    runnerJockey[i] = j.id;
    usedInRace.add(j.id);
    jockeyDay.set(`${dayKey}|${j.id}`, race.meetingId);
  };
  selected.forEach((e, i) => {
    const j = e.jockeyId ? g.staff[e.jockeyId] : undefined;
    if (j?.jockey && pool.includes(j) && available(j) && (!j.contract || j.contract.stableId === e.stableId)) take(i, j);
  });
  for (const i of order) {
    if (runnerJockey[i]) continue;
    const own = pool.find((j) => j.contract?.stableId === selected[i]!.stableId && available(j));
    if (own) take(i, own);
  }
  for (const i of order) {
    if (runnerJockey[i]) continue;
    // etwas Zufall, damit nicht immer derselbe Jockey das beste Pferd bekommt; Gewicht muss passen
    const skip = r.int(0, 2);
    let skipped = 0;
    for (const j of free) {
      if (!available(j) || j.jockey!.weightLb > weights[i]! + 2) continue;
      if (skipped < skip) {
        skipped++;
        continue;
      }
      take(i, j);
      break;
    }
    if (!runnerJockey[i]) {
      const any = free.find((j) => available(j)) ?? free[i % Math.max(1, free.length)] ?? pool[0]!;
      take(i, any);
    }
  }
  race.runners = selected.map<Runner>((e, i) => {
    const j = g.staff[runnerJockey[i]!]!;
    const allowance = allowanceApplies(t.raceClass) ? apprenticeAllowance(j) : 0;
    const carried = Math.max(weights[i]! - allowance, j.jockey!.weightLb);
    return {
      horseId: e.horseId,
      stableId: e.stableId,
      jockeyId: j.id,
      stall: stalls[i]!,
      weightLb: carried,
      allowanceLb: allowance,
      assignedLb: weights[i]!,
      tactic: e.tactic ?? { ...DEFAULT_TACTIC },
    };
  });
  race.claims = [];
  race.status = 'closed';
  aiClaims(g, race);
}

/** Eingaben für die Simulation – auch für Replays verwendet. */
export function simInputFor(g: GameState, race: RaceInstance) {
  const t = g.templates[race.templateId]!;
  const runners: SimRunner[] = race.runners!.map((rn) => {
    const h = g.horses[rn.horseId]!;
    const j = g.staff[rn.jockeyId]!.jockey!;
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

  settleRace(g, race, runs);
  resolveClaims(g, race, runs);
  return { runs, sim };
}

/**
 * Abrechnung: Preisgeld an den Besitzer, Erfolgsbeteiligung für Trainer und Jockey,
 * Reitgebühr für freie Jockeys. Jockeys sammeln Siege und Erfahrung; Regelverstöße führen zu Sperren.
 */
function settleRace(g: GameState, race: RaceInstance, runs: Run[]): void {
  const t = g.templates[race.templateId]!;
  const sr = new Rng(race.seed).fork('stewards');
  for (const run of [...runs].sort((a, b) => a.position - b.position)) {
    const h = g.horses[run.horseId]!;
    const stable = g.stables[run.stableId]!;
    const j = g.staff[run.jockeyId]!;
    const jp = j.jockey!;
    const retained = j.contract?.stableId === run.stableId;
    if (!retained) book(g, run.stableId, { amount: -jp.fee, kind: 'jockey_fee', text: `Reitgebühr ${j.name} (${h.name})`, raceId: race.id, horseId: h.id });
    if (run.prize > 0) {
      book(g, run.stableId, { amount: run.prize, kind: 'prize', text: `Preisgeld ${t.name}: ${h.name} (${run.position}.)`, raceId: race.id, horseId: h.id });
      const trainer = g.staff[stable.trainerId];
      const tShare = trainer?.contract?.stableId === stable.id ? trainer.contract.prizeShare : 0;
      const jShare = retained ? j.contract!.prizeShare : FREELANCE_JOCKEY_SHARE;
      const share = Math.round(run.prize * (tShare + jShare));
      if (share > 0) {
        book(g, run.stableId, { amount: -share, kind: 'prize_share', text: `Erfolgsbeteiligung Trainer/Jockey (${h.name})`, raceId: race.id, horseId: h.id });
      }
    }
    if (run.position === 1) jp.careerWins += 1;
    j.experience = Math.min(100, j.experience + 0.15);
    // Sperre nach Regelverstoß (Peitsche, Behinderung)
    const p = 0.004 + 0.012 * (1 - jp.tactics) + (run.tactic.attack === 'early' ? 0.003 : 0);
    if (sr.chance(p)) {
      jp.suspendedUntilWeekIndex = race.weekIndex + sr.int(1, 3);
      jp.suspensions += 1;
      if (run.stableId === g.playerStableId || j.contract?.stableId === g.playerStableId) {
        addInbox(g, {
          kind: 'staff',
          title: `Sperre: ${j.name}`,
          body: `Die Rennleitung hat ${j.name} nach dem Ritt auf ${h.name} bis einschließlich Woche ${((jp.suspendedUntilWeekIndex % 52) + 1)} gesperrt.`,
          staffId: j.id,
          raceId: race.id,
        });
      }
    }
  }

  // Nachrichten für den Spieler
  for (const run of runs) {
    if (run.stableId !== g.playerStableId) continue;
    const h = g.horses[run.horseId]!;
    const groom = h.groomId ? g.staff[h.groomId] : undefined;
    const honour =
      run.position === 1 && (t.raceClass === 'G1' || t.raceClass === 'G2' || t.raceClass === 'G3') && groom
        ? ` Bei der Siegerehrung wird ${ROLE_LABEL.groom} ${groom.name} für die Betreuung von ${h.name} geehrt.`
        : '';
    addInbox(g, {
      kind: 'result',
      title: `${h.name}: ${run.position}. von ${run.fieldSize} – ${t.name}`,
      body: `${h.name} wurde ${run.position}. (${run.position === 1 ? 'Sieg' : `${run.beatenL.toFixed(1)} Längen zurück`}).${run.prize ? ` Preisgeld ${formatMoney(run.prize)}.` : ''}${honour}`,
      horseId: h.id,
      raceId: race.id,
    });
  }
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
