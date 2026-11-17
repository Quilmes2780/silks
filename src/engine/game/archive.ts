import type { GameState } from './state';

/**
 * Archiv: Detaildaten von Rennen älterer Saisons werden verkleinert, damit Spielstände über viele
 * Saisons handhabbar bleiben. Ergebnisse, Zeiten und Speed Figures bleiben erhalten, Sectionals für eigene Starts;
 * Replays (Neusimulation), Geschwindigkeitskurven und Nennlisten nur für die letzten zwei Saisons.
 */

export const DETAIL_SEASONS = 2;

/** Liefert die IDs der geänderten Rennen und Starts (für die Persistenz). */
export function compactOldRecords(g: GameState): { races: string[]; runs: string[] } {
  const limit = g.season - DETAIL_SEASONS;
  const races: string[] = [];
  const runs: string[] = [];
  for (const race of Object.values(g.races)) {
    if (race.season > limit || race.status !== 'run') continue;
    if (!race.replayInput && race.entries.length === 0) continue;
    delete race.replayInput;
    race.entries = [];
    races.push(race.id);
  }
  for (const run of Object.values(g.runs)) {
    if (run.season > limit) continue;
    const mine = run.stableId === g.playerStableId;
    if (run.speedCurve.length === 0 && run.events.length === 0 && (mine || run.sectionals.length === 0)) continue;
    run.speedCurve = [];
    run.events = [];
    // Sectionals der Konkurrenz nur zwei Saisons; eigene Starts behalten sie
    if (!mine) run.sectionals = [];
    runs.push(run.id);
  }
  return { races, runs };
}
