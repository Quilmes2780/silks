import type { AttrKey, Horse } from '../types';
import { ATTR_KEYS } from '../types';

/**
 * Geschätzte Attribute aus Sicht des Spielers.
 * Der Spieler sieht nie die echten Werte. Die Schätzung = echter Wert + fester Fehler × Unsicherheit.
 * Die Unsicherheit (Band) wird mit jedem Start schmaler und hängt von der Einsicht des Trainers ab.
 * Für fremde Pferde gibt es keine Trainerberichte, daher ein breiteres Band.
 */

export interface AttrEstimate {
  value: number;
  low: number;
  high: number;
}

export type Estimates = Record<AttrKey, AttrEstimate>;

export function uncertainty(starts: number, insight: number, own: boolean): number {
  const base = own ? 16 * (1.25 - 0.6 * insight) : 20;
  return base / Math.sqrt(1 + starts * 0.5);
}

export function estimateAttributes(h: Horse, insight: number, own: boolean): Estimates {
  const sigma = uncertainty(h.stats.starts, insight, own);
  const out = {} as Estimates;
  for (const k of ATTR_KEYS) {
    const v = clampAttr(h.current[k] + h.estimateNoise[k] * sigma * 0.8);
    out[k] = {
      value: Math.round(v),
      low: Math.round(clampAttr(v - sigma)),
      high: Math.round(clampAttr(v + sigma)),
    };
  }
  return out;
}

function clampAttr(x: number): number {
  return Math.max(1, Math.min(100, x));
}

export const ATTR_LABEL: Record<AttrKey, string> = {
  speed: 'Grundschnelligkeit',
  acceleration: 'Beschleunigung',
  stamina: 'Ausdauer',
  kick: 'Speedreserve',
  fight: 'Kampfgeist',
  agility: 'Wendigkeit',
  temperament: 'Temperament',
  consistency: 'Konstanz',
};
