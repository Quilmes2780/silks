import type { Horse, Run } from '../types';

/**
 * Official Rating nach britischem Vorbild:
 *  - Erst nach drei Starts vergeben (bzw. früher nach einem Sieg wäre real möglich – hier bewusst nur nach 3 Starts).
 *  - Erstrating aus den Speed Figures der ersten Starts (Gewicht auf die beste Leistung).
 *  - Danach Anpassung nach jedem Start: deutliche Verbesserungen schnell, Verschlechterungen langsam.
 */

export const OR_MIN = 20;
export const OR_MAX = 140;

/** Nur aussagekräftige Starts zählen (nicht aufgegeben, nicht weit geschlagen ohne Grund). */
function reliable(run: Run): boolean {
  return !run.events.some((e) => e.type === 'eased');
}

export function initialRating(runs: Run[]): number {
  const figs = runs.filter(reliable).map((r) => r.speedFigure);
  if (figs.length === 0) return OR_MIN;
  const best = Math.max(...figs);
  const avg = figs.reduce((a, b) => a + b, 0) / figs.length;
  return clampOr(Math.round(0.6 * best + 0.4 * avg));
}

/** Neues Rating nach einem Start. Gibt null zurück, solange kein Rating fällig ist. */
export function updateRating(current: number | null, runsIncludingThis: Run[]): number | null {
  const run = runsIncludingThis[runsIncludingThis.length - 1]!;
  if (current === null) {
    if (runsIncludingThis.length < 3) return null;
    return initialRating(runsIncludingThis);
  }
  if (!reliable(run)) return current;
  const fig = run.speedFigure;
  const diff = fig - current;
  let change = 0;
  if (diff > 2) {
    // Verbesserung: Sieger stärker, Platzierte etwas weniger
    change = Math.round(diff * (run.position === 1 ? 0.65 : 0.45));
    change = Math.min(change, 14);
  } else if (diff < -4) {
    change = -Math.min(5, Math.round(-diff * 0.25));
  }
  // Sieger werden mindestens um 1–3 lb erhöht
  if (run.position === 1 && change < 2 && run.raceClass === 'Handicap') change = 2;
  return clampOr(current + change);
}

export function clampOr(x: number): number {
  return Math.max(OR_MIN, Math.min(OR_MAX, x));
}

export function applyRating(h: Horse, runs: Run[], season: number, week: number): void {
  const next = updateRating(h.officialRating, runs);
  if (next !== null && next !== h.officialRating) {
    h.officialRating = next;
    h.ratingHistory.push({ season, week, rating: next, runId: runs[runs.length - 1]?.id ?? null });
  }
}
