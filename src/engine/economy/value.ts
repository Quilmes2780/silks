import type { Horse } from '../types';
import { PAR_FIGURE, PAR_QUALITY } from '../stats/speedFigure';
import { publicSireQuality } from './stallions';
import { type GameState, sortedById } from '../game/state';

/**
 * Marktwert-Modell: Was würde der Markt für ein Pferd bezahlen?
 * Grundlage ist das öffentlich erkennbare Leistungsniveau (Official Rating, Speed Figures,
 * bei Pferden ohne Rennleistung Abstammung und Exterieur), dazu Alter, Geschlecht,
 * Gesundheit und ein Aufschlag für Zuchtwert. Verborgene Werte fließen nicht ein.
 */

/** Öffentlich erkennbares Niveau auf der Rating-Skala. */
export function publicLevel(g: GameState, h: Horse): number {
  const lf = h.stats.lastFigures.slice(-3).map((f) => f.value);
  const recent = lf.length ? lf.reduce((a, b) => a + b, 0) / lf.length : null;
  if (h.officialRating !== null) {
    return recent !== null && recent > h.officialRating ? 0.7 * h.officialRating + 0.3 * recent : h.officialRating;
  }
  if (recent !== null && h.stats.bestFigure) return (recent + h.stats.bestFigure.value) / 2;
  return unracedLevel(g, h);
}

/** Erwartung für Pferde ohne Rennleistung aus Abstammung und Exterieur. */
export function unracedLevel(g: GameState, h: Horse, extraQuality = 0): number {
  const sire = h.sireId ? g.stallions[h.sireId] : undefined;
  const sireQ = sire ? publicSireQuality(sire) : 60;
  const q = 0.5 * sireQ + 0.5 * h.conformation + extraQuality;
  // Abschlag: ungeprüftes Pferd, Reife ungewiss
  return PAR_FIGURE + 2 * (q - PAR_QUALITY) - 8;
}

const AGE_FACTOR = [1, 0.95, 1.05, 1, 0.7, 0.5, 0.38, 0.3, 0.25];

/** Marktwert in £ aus Niveau und Eigenschaften. */
export function valueFromLevel(h: Horse, level: number, age: number): number {
  let v = 9000 * Math.exp((level - 55) / 11);
  v *= AGE_FACTOR[Math.min(AGE_FACTOR.length - 1, Math.max(0, age))]!;
  if (h.sex === 'male' && h.gelded && age >= 3) v *= 0.75;
  if (h.sex === 'male' && !h.gelded && level >= 100 && age <= 4) v *= 1 + (level - 100) / 10; // Deckhengst-Perspektive
  if (h.sex === 'female' && level >= 95) v *= 1.2; // Zuchtstute
  const inj = h.condition.injury;
  if (inj) v *= inj.type === 'tendon' ? 0.45 : 0.85;
  v = Math.max(1500, v);
  const step = v < 20000 ? 250 : v < 100000 ? 1000 : v < 1000000 ? 5000 : 25000;
  return Math.round(v / step) * step;
}

export function marketValue(g: GameState, h: Horse): number {
  if (h.status !== 'active') return 0;
  return valueFromLevel(h, publicLevel(g, h), g.season - h.foalYear);
}

/** Werte aller aktiven Pferde aktualisieren; Verlaufspunkt alle 4 Wochen oder bei deutlicher Änderung. */
export function updateValues(g: GameState): void {
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status !== 'active') continue;
    const v = marketValue(g, h);
    h.value = v;
    const last = h.valueHistory.at(-1);
    if (!last || g.week % 4 === 0 || Math.abs(v - last.value) > last.value * 0.08) {
      if (last && last.weekIndex === g.weekIndex) last.value = v;
      else h.valueHistory.push({ weekIndex: g.weekIndex, value: v });
      if (h.valueHistory.length > 120) h.valueHistory.splice(0, h.valueHistory.length - 120);
    }
  }
}
