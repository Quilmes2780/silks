import { Rng } from '../rng';
import type { Horse, RaceInstance, Tactic, TrainingBlock, TrainingPlan } from '../types';
import { TRAINING_TEMPLATES } from '../horse/training';
import { checkEligibility, raceLevel } from '../season/rules';
import { book, sortedById, type GameState } from '../game/state';
import { PAR_FIGURE, PAR_QUALITY } from '../stats/speedFigure';

/**
 * KI-Ställe: nennen Pferde zum Nennschluss und stellen Trainingspläne ein.
 * Die KI kennt ihre Pferde (wie ein Trainer) über das geschätzte Leistungsniveau.
 */

export const DEFAULT_TACTIC: Tactic = { position: 'natural', attack: 'normal', path: 'normal' };

/** Erwartete Speed Figure eines Pferds auf seiner Idealdistanz (Faustformel, ca. 2 lb je Attributpunkt). */
export function estimateLevel(h: Horse): number {
  const c = h.current;
  const phys = (c.speed + c.stamina + c.kick + c.acceleration) / 4;
  // −5: im Feld (Verkehr, Tempo, Tagesform) bleibt ein Pferd im Mittel unter seiner Solo-Leistung
  return PAR_FIGURE + 2 * (phys - PAR_QUALITY) - 5;
}

/** Niveau aus Sicht der KI: Rating, sonst bestes Figure, sonst Schätzung des Trainers. */
export function aiLevel(h: Horse): number {
  if (h.officialRating !== null) return h.officialRating;
  if (h.stats.bestFigure) return (h.stats.bestFigure.value + estimateLevel(h)) / 2;
  return estimateLevel(h);
}

function weeksSince(h: Horse, weekIndex: number): number {
  return h.lastRunWeekIndex === null ? 99 : weekIndex - h.lastRunWeekIndex;
}

function wantsToRun(h: Horse, raceWeekIndex: number, season: number, week: number, r: Rng): boolean {
  if (h.condition.freshness < 45) return false;
  const ws = weeksSince(h, raceWeekIndex);
  const age = season - h.foalYear;
  if (ws === 99 && h.stats.starts === 0 && h.preRecord.starts === 0) {
    // Debütanten: Zweijährige ab dem Frühsommer, häufiger bei Frühreifen
    if (age === 2 && week < 16) return false;
    const p = age === 2 ? (h.maturity.type === 'early' ? 0.3 : h.maturity.type === 'normal' ? 0.18 : 0.08) : 0.35;
    return r.chance(p);
  }
  const p = ws >= 6 ? 0.9 : ws >= 4 ? 0.8 : ws === 3 ? 0.55 : ws === 2 ? 0.2 : 0;
  return r.chance(p);
}

/** Nennungen aller KI-Ställe für Rennen, deren Nennschluss in dieser Woche liegt. */
export function aiMakeEntries(g: GameState, catchUp = false, kind: 'ai' | 'player' = 'ai'): number {
  const closing = sortedById(Object.values(g.races)).filter((race) => {
    const t = g.templates[race.templateId]!;
    if (race.status !== 'open') return false;
    const deadline = race.weekIndex - t.entryDeadlineWeeks;
    // catchUp: bei Spielstart bereits verstrichene Nennschlüsse nachholen
    return catchUp ? deadline < g.weekIndex && race.weekIndex >= g.weekIndex : deadline === g.weekIndex;
  });
  if (!closing.length) return 0;
  const r = new Rng(g.seed).fork('ai-entries', g.weekIndex);
  const horses = r.shuffle(sortedById(Object.values(g.horses)).filter((h) => h.status === 'active' && g.stables[h.stableId]!.kind === kind));
  // Wochen, in denen ein Pferd bereits genannt ist
  const enteredWeeks = new Map<string, number[]>();
  for (const race of Object.values(g.races)) {
    if (race.status === 'run' || race.status === 'void') continue;
    for (const e of race.entries) {
      const arr = enteredWeeks.get(e.horseId) ?? [];
      arr.push(race.weekIndex);
      enteredWeeks.set(e.horseId, arr);
    }
  }
  let count = 0;
  for (const h of horses) {
    const byWeek = new Map<number, RaceInstance[]>();
    for (const race of closing) {
      const arr = byWeek.get(race.weekIndex) ?? [];
      arr.push(race);
      byWeek.set(race.weekIndex, arr);
    }
    for (const [raceWeekIndex, races] of byWeek) {
      const taken = enteredWeeks.get(h.id) ?? [];
      if (taken.some((w) => Math.abs(w - raceWeekIndex) <= 1)) continue;
      const raceSeason = races[0]!.season;
      const raceWeek = races[0]!.week;
      // Verletzung bis zum Rennen ausgeheilt?
      if (h.condition.injury && h.condition.injury.weeksRemaining >= raceWeekIndex - g.weekIndex) continue;
      if (!wantsToRun(h, raceWeekIndex, raceSeason, raceWeek, r)) continue;
      const level = aiLevel(h);
      let best: RaceInstance | null = null;
      let bestScore = -Infinity;
      for (const race of races) {
        const t = g.templates[race.templateId]!;
        if (!checkEligibility(h, t, raceSeason).ok) continue;
        // Claiming: nur Pferde, deren Wert nicht deutlich über dem Claiming-Preis liegt
        if (t.claimPrice !== null && (h.value ?? 0) > t.claimPrice * 1.25) continue;
        const lv = raceLevel(t);
        const isGroup = t.raceClass === 'G1' || t.raceClass === 'G2' || t.raceClass === 'G3' || t.raceClass === 'Listed';
        const diff = level - lv;
        // Kein Trainer schickt ein chancenloses Pferd in ein Group-Rennen
        const minDiff = t.raceClass === 'Listed' ? -13 : -14;
        if (isGroup && diff < minDiff) continue;
        const dx = Math.log2(t.distanceM / h.prefs.distOptM) / h.prefs.distRange;
        let score = -4 * dx * dx;
        if (diff < -6) score += (diff + 6) * 0.35;
        if (diff > 18) score -= (diff - 18) * 0.06;
        score += Math.log10(Math.max(1000, t.prize)) * 0.8;
        const fill = race.entries.length / t.maxRunners;
        if (fill > 1) score -= 3 * (fill - 1);
        else if (fill < 0.6) score += 1.5 * (1 - fill / 0.6);
        score += r.normal(0, 0.6);
        if (score > bestScore) {
          bestScore = score;
          best = race;
        }
      }
      if (best && bestScore > -2) {
        const t = g.templates[best.templateId]!;
        best.entries.push({ horseId: h.id, stableId: h.stableId, enteredWeekIndex: g.weekIndex, jockeyId: null, tactic: { ...DEFAULT_TACTIC } });
        book(g, h.stableId, { amount: -t.entryFee, kind: 'entry_fee', text: `Nenngebühr ${t.name} (${h.name})`, raceId: best.id, horseId: h.id });
        taken.push(raceWeekIndex);
        enteredWeeks.set(h.id, taken);
        count++;
      }
    }
  }
  return count;
}

/** Trainingspläne der KI je nach Zustand und Distanztyp. */
export function aiTrainingPlan(h: Horse): TrainingPlan {
  const c = h.condition;
  let key = 'normal';
  if (c.freshness < 45) key = 'rest';
  else if (c.freshness < 65) key = 'light';
  else if (c.fitness < 75 && c.freshness > 80) key = 'hard';
  else if (h.prefs.distOptM < 1300) key = 'sprint';
  else if (h.prefs.distOptM > 2200) key = 'stayer';
  return [...TRAINING_TEMPLATES[key]!.plan] as TrainingPlan;
}

export function aiSetTraining(g: GameState, kind: 'ai' | 'player' = 'ai'): void {
  for (const h of Object.values(g.horses)) {
    if (h.status !== 'active' || g.stables[h.stableId]!.kind !== kind) continue;
    h.training = aiTrainingPlan(h);
  }
}

export type { TrainingBlock };

/** Autopilot für den Spielerstall (Kalibrierung, später als Assistenz denkbar): nennt und trainiert wie die KI. */
export function autopilot(g: GameState): void {
  aiMakeEntries(g, false, 'player');
  aiSetTraining(g, 'player');
}
