import type { GameState } from './state';

/**
 * „Erste Schritte“: eine kurze Checkliste im Büro, die neue Spieler durch die wichtigsten Bildschirme
 * führt. Besuchs-Schritte werden von der Oberfläche gemeldet, die übrigen ergeben sich aus dem Spielstand.
 */

export interface TutorialState {
  /** besuchte Bildschirme */
  seen: string[];
  dismissed: boolean;
  startWeekIndex: number;
}

/** Schritte, die durch einen Besuch des Bildschirms erledigt sind (Schlüssel = Routenname). */
export const VISIT_STEPS = ['stable', 'horse', 'race', 'staff', 'finance'] as const;

export interface TutorialStepView {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  /** Ziel in der Oberfläche (Routenname) */
  route: string;
}

export interface TutorialView {
  dismissed: boolean;
  done: number;
  total: number;
  steps: TutorialStepView[];
}

export function newTutorial(weekIndex: number): TutorialState {
  return { seen: [], dismissed: false, startWeekIndex: weekIndex };
}

/** Alte Spielstände ohne Checkliste: wer schon gespielt hat, bekommt sie nicht mehr angezeigt. */
export function tutorialOf(g: GameState): TutorialState {
  g.tutorial ??= { seen: [], dismissed: g.weekIndex > 4, startWeekIndex: g.weekIndex };
  return g.tutorial;
}

export function tutorialView(g: GameState): TutorialView {
  const t = tutorialOf(g);
  const seen = new Set(t.seen);
  const pid = g.playerStableId;
  const entered =
    Object.values(g.runs).some((r) => r.stableId === pid) ||
    Object.values(g.races).some((r) => r.entries.some((e) => e.stableId === pid) || (r.runners?.some((x) => x.stableId === pid) ?? false));
  const steps: TutorialStepView[] = [
    { id: 'stable', label: 'Stall ansehen', hint: 'Unter „Stall“ stehen deine Pferde mit Form, Fitness und Rating.', done: seen.has('stable'), route: 'stable' },
    { id: 'horse', label: 'Ein Pferdeprofil öffnen', hint: 'Ein Klick auf den Namen zeigt Werte, Statistik und Trainingsplan.', done: seen.has('horse'), route: 'stable' },
    { id: 'entry', label: 'Ein Pferd für ein Rennen nennen', hint: 'Im Rennkalender passende Rennen suchen und nennen – Nennschluss beachten.', done: entered, route: 'calendar' },
    { id: 'week', label: 'Eine Woche abschließen', hint: 'Der Knopf „Woche abschließen“ oben rechts spielt Training und Renntag ab (Strg+Enter).', done: g.weekIndex > t.startWeekIndex, route: 'office' },
    { id: 'race', label: 'Ein Rennergebnis ansehen', hint: 'Beim Rennen findest du Ergebnis, Rennansicht und Zwischenzeiten.', done: seen.has('race'), route: 'raceday' },
    { id: 'staff', label: 'Personal prüfen', hint: 'Trainer, Jockeys und Pfleger entscheiden mit, wie gut deine Pferde werden.', done: seen.has('staff'), route: 'staff' },
    { id: 'finance', label: 'Finanzen im Blick behalten', hint: 'Wochenkosten gegen Preisgeld: Hier siehst du, ob sich der Stall trägt.', done: seen.has('finance'), route: 'finance' },
  ];
  return { dismissed: t.dismissed, done: steps.filter((s) => s.done).length, total: steps.length, steps };
}

/** Offene Besuchs-Schritte (für die Oberfläche, die beim Besuch Bescheid gibt). */
export function openVisitSteps(g: GameState): string[] {
  const t = tutorialOf(g);
  if (t.dismissed) return [];
  return VISIT_STEPS.filter((s) => !t.seen.includes(s));
}

export function markTutorial(g: GameState, step: string): void {
  const t = tutorialOf(g);
  if (!t.seen.includes(step)) t.seen.push(step);
}

export function setTutorialDismissed(g: GameState, dismissed: boolean): void {
  tutorialOf(g).dismissed = dismissed;
}
