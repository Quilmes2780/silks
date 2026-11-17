import type { Rng } from '../rng';
import type { Horse, Stallion } from '../types';
import { generateHorse, type GenerateHorseOptions } from '../horse/generate';
import type { NameRegistry } from '../world/names';
import { type GameState, sortedById } from '../game/state';

/**
 * Generiertes Deckhengst-Register. Bis zur echten Genetik in Phase 4 bestimmt die verborgene
 * Vererbungsqualität des Hengsts zusammen mit der Stute das Potenzial der Nachkommen.
 * Öffentlich ist nur die Decktaxe; sie folgt der Qualität (der Markt kennt die Hengste gut).
 */

const FEE_BASE = 1500;

export function feeForQuality(q: number): number {
  return Math.max(1000, Math.round((FEE_BASE * Math.exp((q - 55) / 6)) / 500) * 500);
}

/** Aus der Decktaxe abgeleitete öffentliche Qualitätseinschätzung. */
export function publicSireQuality(s: Stallion): number {
  return 55 + 6 * Math.log(s.fee / FEE_BASE);
}

export function generateStallions(g: GameState, r: Rng, names: NameRegistry, n = 40): void {
  for (let i = 0; i < n; i++) {
    const quality = Math.round(Math.max(45, Math.min(84, r.normal(62, 6.5))) * 10) / 10;
    const id = `st${Object.keys(g.stallions).length + 1}`;
    g.stallions[id] = {
      id,
      name: names.horseName(r),
      foalYear: g.season - r.int(5, 19),
      fee: feeForQuality(quality),
      quality,
      distOptM: Math.round(Math.min(3200, Math.max(1100, 1600 * Math.pow(2, r.normal(0.1, 0.35)))) / 50) * 50,
      going: Math.round(Math.max(-1, Math.min(1, r.normal(0, 0.4))) * 100) / 100,
      active: true,
    };
  }
}

/** Hengst für eine gewünschte Qualität (ältere Pferde: Hengst muss mindestens 4 Jahre älter sein). */
export function pickSire(g: GameState, r: Rng, targetQ: number, foalYear: number): Stallion | null {
  const list = sortedById(Object.values(g.stallions)).filter((s) => s.foalYear <= foalYear - 4);
  const pool = list.length ? list : sortedById(Object.values(g.stallions));
  if (!pool.length) return null;
  return r.weighted(pool, pool.map((s) => Math.exp(-((s.quality - targetQ) ** 2) / (2 * 6 * 6))));
}

/** Abstammung für ein bereits erzeugtes Pferd (Spielstart). */
export function assignPedigree(g: GameState, h: Horse, r: Rng, names: NameRegistry): void {
  const p = h.potential;
  const q = (p.speed + p.stamina + p.kick + p.acceleration) / 4;
  const sire = pickSire(g, r, q + r.normal(0, 4), h.foalYear);
  if (sire) {
    h.sireId = sire.id;
    h.sireName = sire.name;
  }
  h.damName = names.horseName(r);
}

/**
 * Neues Pferd aus Hengst und Stute: Qualität = Mittel aus Hengst und Stute plus Streuung,
 * Distanzoptimum als geometrisches Mittel.
 */
export function breedHorse(
  g: GameState,
  r: Rng,
  o: Omit<GenerateHorseOptions, 'quality' | 'distOptM'> & { damQuality: number; sire?: Stallion | null },
  names: NameRegistry,
): Horse {
  const sire = o.sire ?? pickSire(g, r, o.damQuality + r.normal(0, 5), o.foalYear);
  const sireQ = sire?.quality ?? 60;
  const quality = 0.5 * sireQ + 0.5 * o.damQuality + r.normal(0, 5);
  const damDist = 1600 * Math.pow(2, r.normal(0.05, 0.35));
  const distOpt = Math.sqrt((sire?.distOptM ?? 1600) * damDist) * Math.pow(2, r.normal(0, 0.18));
  const h = generateHorse(r, {
    ...o,
    quality,
    distOptM: Math.round(Math.min(3400, Math.max(1000, distOpt)) / 50) * 50,
  });
  if (sire) {
    h.sireId = sire.id;
    h.sireName = sire.name;
    h.prefs.going = Math.round(Math.max(-1, Math.min(1, 0.5 * h.prefs.going + 0.5 * sire.going)) * 100) / 100;
  }
  h.damName = names.horseName(r);
  return h;
}
