import type { Tactic, TrainingPlan } from '../types';
import { checkEligibility } from '../season/rules';
import { TRAINING_TEMPLATES } from '../horse/training';
import { DEFAULT_TACTIC } from '../ai/ai';
import { addLedger, type GameState } from './state';

/**
 * Befehle des Spielers. Jede Funktion prüft die Regeln und wirft bei Verstößen einen
 * GameError mit deutscher Meldung.
 */

export class GameError extends Error {}

function playerHorse(g: GameState, horseId: string) {
  const h = g.horses[horseId];
  if (!h) throw new GameError('Pferd nicht gefunden.');
  if (h.stableId !== g.playerStableId) throw new GameError('Das Pferd gehört nicht zu deinem Stall.');
  if (h.status !== 'active') throw new GameError('Das Pferd ist nicht mehr im Training.');
  return h;
}

export function canEnter(g: GameState, raceId: string, horseId: string): { ok: boolean; reason?: string } {
  const race = g.races[raceId];
  if (!race) return { ok: false, reason: 'Rennen nicht gefunden.' };
  const t = g.templates[race.templateId]!;
  if (race.status !== 'open') return { ok: false, reason: 'Nennungen sind geschlossen.' };
  if (g.weekIndex > race.weekIndex - t.entryDeadlineWeeks) return { ok: false, reason: 'Nennschluss ist vorbei.' };
  const h = g.horses[horseId];
  if (!h) return { ok: false, reason: 'Pferd nicht gefunden.' };
  if (race.entries.some((e) => e.horseId === horseId)) return { ok: false, reason: 'Bereits genannt.' };
  const clash = Object.values(g.races).find(
    (r) => r.id !== raceId && r.status !== 'run' && r.status !== 'void' && r.weekIndex === race.weekIndex && r.entries.some((e) => e.horseId === horseId),
  );
  if (clash) return { ok: false, reason: `In derselben Woche bereits für „${g.templates[clash.templateId]!.name}“ genannt.` };
  const el = checkEligibility(h, t, race.season);
  if (!el.ok) return { ok: false, reason: el.reason };
  return { ok: true };
}

export function enterRace(g: GameState, raceId: string, horseId: string, jockeyId: string | null = null, tactic: Tactic = DEFAULT_TACTIC): void {
  const h = playerHorse(g, horseId);
  const chk = canEnter(g, raceId, horseId);
  if (!chk.ok) throw new GameError(chk.reason);
  const race = g.races[raceId]!;
  const t = g.templates[race.templateId]!;
  race.entries.push({ horseId, stableId: g.playerStableId, enteredWeekIndex: g.weekIndex, jockeyId, tactic: { ...tactic } });
  addLedger(g, { amount: -t.entryFee, kind: 'entry_fee', text: `Nenngebühr ${t.name} (${h.name})`, raceId, horseId });
}

export function withdrawEntry(g: GameState, raceId: string, horseId: string): void {
  playerHorse(g, horseId);
  const race = g.races[raceId];
  if (!race) throw new GameError('Rennen nicht gefunden.');
  if (race.status === 'run') throw new GameError('Das Rennen ist bereits gelaufen.');
  race.entries = race.entries.filter((e) => e.horseId !== horseId);
  if (race.runners) race.runners = race.runners.filter((r) => r.horseId !== horseId);
  if (race.runners && race.runners.length < 2) race.status = 'void';
}

/** Taktik und Jockey für eine Nennung bzw. einen erklärten Starter setzen. */
export function setRaceOrders(g: GameState, raceId: string, horseId: string, tactic: Tactic, jockeyId?: string | null): void {
  playerHorse(g, horseId);
  const race = g.races[raceId];
  if (!race) throw new GameError('Rennen nicht gefunden.');
  if (race.status === 'run') throw new GameError('Das Rennen ist bereits gelaufen.');
  const entry = race.entries.find((e) => e.horseId === horseId);
  if (!entry) throw new GameError('Keine Nennung für dieses Pferd.');
  entry.tactic = { ...tactic };
  if (jockeyId !== undefined) entry.jockeyId = jockeyId;
  const runner = race.runners?.find((r) => r.horseId === horseId);
  if (runner) {
    runner.tactic = { ...tactic };
    if (jockeyId) {
      if (!g.jockeys[jockeyId]) throw new GameError('Jockey nicht gefunden.');
      if (race.runners!.some((r) => r.horseId !== horseId && r.jockeyId === jockeyId)) throw new GameError('Der Jockey reitet in diesem Rennen bereits ein anderes Pferd.');
      runner.jockeyId = jockeyId;
    }
  }
}

export function setTraining(g: GameState, horseId: string, plan: TrainingPlan | string): void {
  const h = playerHorse(g, horseId);
  if (typeof plan === 'string') {
    const tpl = TRAINING_TEMPLATES[plan];
    if (!tpl) throw new GameError('Unbekannte Trainingsvorlage.');
    h.training = [...tpl.plan] as TrainingPlan;
  } else {
    if (plan.length !== 6) throw new GameError('Ein Wochenplan hat 6 Tage.');
    h.training = [...plan] as TrainingPlan;
  }
}

export function markInboxRead(g: GameState, ids: string[] | 'all'): void {
  for (const m of g.inbox) if (ids === 'all' || ids.includes(m.id)) m.read = true;
}

export function renameStable(g: GameState, name: string): void {
  const s = g.stables[g.playerStableId]!;
  if (!name.trim()) throw new GameError('Name darf nicht leer sein.');
  s.name = name.trim().slice(0, 40);
}
