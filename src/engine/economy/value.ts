import type { Horse } from '../types';
import { PAR_FIGURE, PAR_QUALITY } from '../stats/speedFigure';
import { publicSireQuality, raceRecordLevel } from '../breeding/stud';
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
  // Mutter mit Rennleistung: ihr Niveau fließt mit ein (Rating-Skala → Attributskala)
  const dam = h.damId ? g.horses[h.damId] : undefined;
  const damLevel = dam ? raceRecordLevel(dam) : null;
  const q =
    damLevel !== null
      ? 0.4 * sireQ + 0.2 * ((damLevel + 55) / 2) + 0.4 * h.conformation + extraQuality
      : 0.5 * sireQ + 0.5 * h.conformation + extraQuality;
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

const round = (v: number) => {
  const step = v < 20000 ? 250 : v < 100000 ? 1000 : v < 1000000 ? 5000 : 25000;
  return Math.round(v / step) * step;
};

/** Bestes Official Rating der Nachkommen je Mutterstute (pro Woche einmal berechnet). */
let progenyCache: { g: GameState; weekIndex: number; n: number; map: Map<string, number> } | null = null;
function bestProgeny(g: GameState): Map<string, number> {
  const n = g.counters.horse;
  if (progenyCache && progenyCache.g === g && progenyCache.weekIndex === g.weekIndex && progenyCache.n === n) return progenyCache.map;
  const map = new Map<string, number>();
  for (const x of Object.values(g.horses)) {
    if (!x.damId || x.officialRating === null) continue;
    if (x.officialRating > (map.get(x.damId) ?? 0)) map.set(x.damId, x.officialRating);
  }
  progenyCache = { g, weekIndex: g.weekIndex, n, map };
  return map;
}

/** Zuchtstute: Rennleistung, Nachkommen, Alter und Trächtigkeit. */
export function broodmareValue(g: GameState, h: Horse): number {
  const level = raceRecordLevel(h) ?? 62;
  const age = g.season - h.foalYear;
  let v = 6000 * Math.exp((level - 70) / 14);
  // beste Nachkommen erhöhen den Wert
  const best = bestProgeny(g).get(h.id) ?? 0;
  if (best >= 80) v *= 1 + (best - 75) / 25;
  v *= age <= 10 ? 1 : Math.max(0.15, 1 - 0.09 * (age - 10));
  const preg = g.breeding.pregnancies[`${h.id}:${g.season}`] ?? g.breeding.pregnancies[`${h.id}:${g.season - 1}`];
  if (preg) v += 0.6 * (g.stallions[preg.sireId]?.fee ?? 0);
  return round(Math.max(1500, v));
}

/** Deckhengst: Decktaxe mal erwarteter Buchgröße über die restlichen Deckjahre. */
export function stallionValue(g: GameState, h: Horse): number {
  const s = g.stallions[h.id];
  if (!s || !s.active) return 0;
  const age = g.season - h.foalYear;
  const ageF = Math.max(0.15, Math.min(1, 1 - (age - 6) / 16));
  return round(Math.max(5000, s.fee * 45 * ageF));
}

export function marketValue(g: GameState, h: Horse): number {
  const age = g.season - h.foalYear;
  switch (h.status) {
    case 'active':
      return valueFromLevel(h, publicLevel(g, h), age);
    case 'young':
      return round(valueFromLevel(h, unracedLevel(g, h), age) * (age === 0 ? 0.6 : 1));
    case 'broodmare':
      return broodmareValue(g, h);
    case 'stud':
      return stallionValue(g, h);
    default:
      return 0;
  }
}

/** Werte aller aktiven Pferde aktualisieren; Verlaufspunkt alle 4 Wochen oder bei deutlicher Änderung. */
export function updateValues(g: GameState): void {
  for (const h of sortedById(Object.values(g.horses))) {
    if (h.status === 'retired') continue;
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
