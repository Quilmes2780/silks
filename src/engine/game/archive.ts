import type { GameState } from './state';
import type { Horse, RaceInstance as Race, RaceTemplate, Run, Runner, Sectional, Tactic } from '../types';
import { computeHorseStats } from '../stats/horseStats';

/**
 * Archiv: Detaildaten von Rennen älterer Saisons werden verkleinert, damit Spielstände über viele
 * Saisons handhabbar bleiben. Ergebnisse, Zeiten und Speed Figures bleiben erhalten, Sectionals für eigene Starts;
 * Replays (Neusimulation), Geschwindigkeitskurven und Nennlisten nur für die letzten zwei Saisons.
 */

export const DETAIL_SEASONS = 2;
/** Sectionals, Tempokurven und Rennereignisse der Konkurrenz: nur die laufende Saison */
export const COMPETITOR_DETAIL_SEASONS = 1;

/** Liefert die IDs der geänderten Rennen und Starts (für die Persistenz). */
export function compactOldRecords(g: GameState): { races: string[]; runs: string[] } {
  const limit = g.season - DETAIL_SEASONS;
  const otherLimit = g.season - COMPETITOR_DETAIL_SEASONS;
  const races: string[] = [];
  const runs: string[] = [];
  for (const race of Object.values(g.races)) {
    if (race.status !== 'run') continue;
    // Replays und Nennlisten: Rennen mit eigenen Startern zwei Saisons, sonst eine
    const mine = race.runners?.some((r) => r.stableId === g.playerStableId) ?? false;
    if (race.season > (mine ? limit : otherLimit)) continue;
    if (!race.replayInput && race.entries.length === 0) continue;
    delete race.replayInput;
    race.entries = [];
    races.push(race.id);
  }
  for (const run of Object.values(g.runs)) {
    const mine = run.stableId === g.playerStableId;
    if (run.season > (mine ? limit : otherLimit)) continue;
    if (run.speedCurve.length === 0 && run.events.length === 0 && (mine || run.sectionals.length === 0)) continue;
    run.speedCurve = [];
    run.events = [];
    // Sectionals der Konkurrenz nur eine Saison; eigene Starts behalten sie
    if (!mine) run.sectionals = [];
    runs.push(run.id);
  }
  return { races, runs };
}

/* ------------------------------------------------------------------------------------------------
 * Speicherform: Starts und Rennen werden für IndexedDB und Export verdichtet. Felder, die sich aus
 * Rennen und Ausschreibung ergeben, entfallen; Sectionals und Taktiken werden zu Zahlen- bzw.
 * Zeichenketten. Im Speicher bleibt alles in voller Form.
 * ---------------------------------------------------------------------------------------------- */

type Lookup = { races: Record<string, Race>; templates: Record<string, RaceTemplate> };
type Packed = Record<string, unknown> & { _p?: 1 };

const tacticStr = (t: Tactic) => `${t.position}|${t.attack}|${t.path}`;
const tacticObj = (s: string): Tactic => {
  const [position, attack, path] = s.split('|') as [Tactic['position'], Tactic['attack'], Tactic['path']];
  return { position, attack, path };
};

function derived(run: Pick<Run, 'raceId'>, l: Lookup): Partial<Run> | null {
  const race = l.races[run.raceId];
  if (!race) return null;
  const t = l.templates[race.templateId];
  const base: Partial<Run> = { templateId: race.templateId, season: race.season, week: race.week, weekIndex: race.weekIndex, fieldSize: race.resultRunIds.length };
  if (race.going) base.going = race.going;
  if (t) Object.assign(base, { raceName: t.name, trackId: t.trackId, surface: t.surface, distanceM: t.distanceM, raceClass: t.raceClass });
  return base;
}

export function packRun(run: Run, l: Lookup): Packed {
  const out: Packed = { ...run, _p: 1 };
  const d = derived(run, l);
  if (d) for (const [k, v] of Object.entries(d)) if (out[k] === v) delete out[k];
  out.tactic = tacticStr(run.tactic);
  // Sectionals flach: atM, splitS, cumS, position, gapL je Messpunkt
  out.sectionals = run.sectionals.flatMap((s) => [s.atM, s.splitS, s.cumS, s.position, s.gapL]);
  if (run.speedCurve.length === 0) delete out.speedCurve;
  if (run.events.length === 0) delete out.events;
  if (Number.isNaN(run.finishingSpeedPct)) out.finishingSpeedPct = null;
  // Feste Felder als Werteliste statt Objekt (spart die Schlüsselnamen)
  out.v = RUN_KEYS.map((k) => {
    const x = out[k];
    delete out[k];
    return x;
  });
  return out;
}

/** Felder, die jeder Start immer hat – Reihenfolge ist Teil des Speicherformats, nur hinten erweitern. */
const RUN_KEYS = [
  'id', 'raceId', 'horseId', 'stableId', 'jockeyId', 'stall', 'weightLb', 'tactic', 'ageAtRace', 'daysSinceLastRun',
  'position', 'timeS', 'beatenL', 'marginL', 'topSpeed', 'distanceRunM', 'speedFigure', 'finishingSpeedPct', 'officialRatingBefore', 'prize',
] as const;

export function unpackRun(p: Packed, l: Lookup): Run {
  if (!p._p) return p as unknown as Run;
  const { _p, ...rest } = p;
  void _p;
  const run = rest as unknown as Run & Record<string, unknown>;
  if (Array.isArray(run.v)) {
    const v = run.v as unknown[];
    const target = run as Record<string, unknown>;
    RUN_KEYS.forEach((k, i) => (target[k] = v[i] ?? null));
    delete run.v;
  }
  const d = derived(run, l);
  if (d) for (const [k, v] of Object.entries(d)) if (run[k] === undefined) run[k] = v;
  if (typeof run.tactic === 'string') run.tactic = tacticObj(run.tactic as unknown as string);
  const flat = run.sectionals as unknown as number[];
  if (flat.length && typeof flat[0] === 'number') {
    const secs: Sectional[] = [];
    for (let i = 0; i + 4 < flat.length; i += 5) secs.push({ atM: flat[i]!, splitS: flat[i + 1]!, cumS: flat[i + 2]!, position: flat[i + 3]!, gapL: flat[i + 4]! });
    run.sectionals = secs;
  }
  run.speedCurve ??= [];
  run.events ??= [];
  if (run.finishingSpeedPct === null) run.finishingSpeedPct = NaN;
  return run;
}

export function packRace(race: Race): Packed {
  const out: Packed = { ...race, _p: 1 };
  if (race.runners) out.runners = race.runners.map((r) => [r.horseId, r.stableId, r.jockeyId, r.stall, r.weightLb, r.allowanceLb, r.assignedLb, tacticStr(r.tactic)]);
  out.entries = race.entries.map((e) => ({ ...e, tactic: tacticStr(e.tactic) }));
  return out;
}

export function unpackRace(p: Packed): Race {
  if (!p._p) return p as unknown as Race;
  const { _p, ...rest } = p;
  void _p;
  const race = rest as unknown as Race;
  const fix = <T extends { tactic: Tactic }>(x: T): T => (typeof x.tactic === 'string' ? { ...x, tactic: tacticObj(x.tactic as unknown as string) } : x);
  if (race.runners)
    race.runners = (race.runners as unknown[]).map((x) => {
      if (!Array.isArray(x)) return fix(x as Runner);
      const [horseId, stableId, jockeyId, stall, weightLb, allowanceLb, assignedLb, tactic] = x as [string, string, string, number, number, number, number, string];
      return { horseId, stableId, jockeyId, stall, weightLb, allowanceLb, assignedLb, tactic: tacticObj(tactic) };
    });
  race.entries = race.entries.map(fix);
  return race;
}

/**
 * Pferde: Die Kennzahlen (stats) ergeben sich vollständig aus den Starts und werden beim Laden neu
 * berechnet. Sie entfallen nur, wenn alle Starts vorhanden sind.
 */
export function packHorse(h: Horse, runs: Record<string, Run>): Packed {
  const out: Packed = { ...h, _p: 1 };
  if (h.stats.starts === h.runIds.length && h.runIds.every((id) => runs[id])) delete out.stats;
  // Verläufe als flache Wertelisten
  out.valueHistory = h.valueHistory.flatMap((x) => [x.weekIndex, x.value]);
  out.ratingHistory = h.ratingHistory.flatMap((x) => [x.season, x.week, x.rating, x.runId]);
  return out;
}

export function unpackHorse(p: Packed, runs: Record<string, Run>): Horse {
  if (!p._p) return p as unknown as Horse;
  const { _p, ...rest } = p;
  void _p;
  const h = rest as unknown as Horse;
  if (!h.stats) h.stats = computeHorseStats(h.runIds.map((id) => runs[id]!));
  const vh = h.valueHistory as unknown[];
  if (vh.length && typeof vh[0] === 'number') {
    const out: Horse['valueHistory'] = [];
    for (let i = 0; i + 1 < vh.length; i += 2) out.push({ weekIndex: vh[i] as number, value: vh[i + 1] as number });
    h.valueHistory = out;
  }
  const rh = h.ratingHistory as unknown[];
  if (rh.length && typeof rh[0] === 'number') {
    const out: Horse['ratingHistory'] = [];
    for (let i = 0; i + 3 < rh.length; i += 4) out.push({ season: rh[i] as number, week: rh[i + 1] as number, rating: rh[i + 2] as number, runId: (rh[i + 3] as string | null) ?? null });
    h.ratingHistory = out;
  }
  return h;
}

/** Verdichtet alle Pferde, Starts und Rennen eines Spielstands (für den Export). */
export function packAll(g: Pick<GameState, 'horses' | 'runs' | 'races' | 'templates'>): { horses: Record<string, Packed>; runs: Record<string, Packed>; races: Record<string, Packed> } {
  const runs: Record<string, Packed> = {};
  for (const [id, r] of Object.entries(g.runs)) runs[id] = packRun(r, g);
  const races: Record<string, Packed> = {};
  for (const [id, r] of Object.entries(g.races)) races[id] = packRace(r);
  const horses: Record<string, Packed> = {};
  for (const [id, h] of Object.entries(g.horses)) horses[id] = packHorse(h, g.runs);
  return { horses, runs, races };
}

/** Gegenstück zu packAll; unverdichtete Einträge (alte Spielstände) bleiben unverändert. */
export function unpackAll(raw: { horses: Record<string, unknown>; runs: Record<string, unknown>; races: Record<string, unknown>; templates: Record<string, RaceTemplate> }): void {
  for (const [id, r] of Object.entries(raw.races)) raw.races[id] = unpackRace(r as Packed);
  const l = { races: raw.races as Record<string, Race>, templates: raw.templates };
  for (const [id, r] of Object.entries(raw.runs)) raw.runs[id] = unpackRun(r as Packed, l);
  const runs = raw.runs as Record<string, Run>;
  for (const [id, h] of Object.entries(raw.horses)) raw.horses[id] = unpackHorse(h as Packed, runs);
}
