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

type Lookup = { races: Record<string, Race>; templates: Record<string, RaceTemplate>; /** Start-ID → Rennen (beim Laden aus resultRunIds) */ raceOf?: Record<string, string> };
type Packed = Record<string, unknown> & { _p?: 1 };

const DEFAULT_TACTIC = 'natural|normal|normal';
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
  out.tactic = tacticStr(run.tactic) === DEFAULT_TACTIC ? 0 : tacticStr(run.tactic);
  // Sectionals flach: atM, splitS, cumS, position, gapL je Messpunkt
  out.sectionals = run.sectionals.flatMap((s) => [s.atM, s.splitS, s.cumS, s.position, s.gapL]);
  if (run.sectionals.length === 0) delete out.sectionals;
  if (run.speedCurve.length === 0) delete out.speedCurve;
  if (run.events.length === 0) delete out.events;
  if (Number.isNaN(run.finishingSpeedPct)) out.finishingSpeedPct = null;
  // Das Rennen führt den Start in resultRunIds – die Rennen-ID ergibt sich daraus
  if (l.races[run.raceId]?.resultRunIds.includes(run.id)) out.raceId = 0;
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
  if ((run.raceId as unknown) === 0) run.raceId = l.raceOf?.[run.id] ?? '';
  const d = derived(run, l);
  if (d) for (const [k, v] of Object.entries(d)) if (run[k] === undefined) run[k] = v;
  if ((run.tactic as unknown) === 0) run.tactic = tacticObj(DEFAULT_TACTIC);
  else if (typeof run.tactic === 'string') run.tactic = tacticObj(run.tactic as unknown as string);
  run.sectionals ??= [];
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

/**
 * Starter eines gelaufenen Rennens stehen fast vollständig auch im Start-Datensatz. Passt der Start, bleibt
 * nur sein Index in resultRunIds (plus Erlaubnis und zugeteiltes Gewicht, wenn nicht trivial).
 */
export function packRace(race: Race, runs?: Record<string, Run>): Packed {
  const out: Packed = { ...race, _p: 1 };
  if (race.runners)
    out.runners = race.runners.map((r) => {
      const t = tacticStr(r.tactic);
      const k = runs ? race.resultRunIds.findIndex((id) => runs[id]?.horseId === r.horseId) : -1;
      const run = k >= 0 ? runs![race.resultRunIds[k]!] : undefined;
      if (run && run.stableId === r.stableId && run.jockeyId === r.jockeyId && run.stall === r.stall && run.weightLb === r.weightLb && tacticStr(run.tactic) === t)
        return r.allowanceLb === 0 && r.assignedLb === r.weightLb ? k : [k, r.allowanceLb, r.assignedLb];
      return [r.horseId, r.stableId, r.jockeyId, r.stall, r.weightLb, r.allowanceLb, r.assignedLb, t];
    });
  out.entries = race.entries.map((e) => ({ ...e, tactic: tacticStr(e.tactic) }));
  if (race.templateId === race.id) delete out.templateId;
  if (race.meetingId === meetingOf(race.id)) delete out.meetingId;
  return out;
}

const meetingOf = (raceId: string) => raceId.replace(/-\d+$/, '');

/** Erster Schritt: alles außer Verweisen auf Starts (die löst resolveRunners auf). */
export function unpackRace(p: Packed): Race {
  if (!p._p) return p as unknown as Race;
  const { _p, ...rest } = p;
  void _p;
  const race = rest as unknown as Race;
  race.templateId ??= race.id;
  race.meetingId ??= meetingOf(race.id);
  const fix = <T extends { tactic: Tactic }>(x: T): T => (typeof x.tactic === 'string' ? { ...x, tactic: tacticObj(x.tactic as unknown as string) } : x);
  if (race.runners)
    race.runners = (race.runners as unknown[]).map((x) => {
      if (typeof x === 'number' || (Array.isArray(x) && x.length === 3)) return x as unknown as Runner;
      if (!Array.isArray(x)) return fix(x as Runner);
      const [horseId, stableId, jockeyId, stall, weightLb, allowanceLb, assignedLb, tactic] = x as [string, string, string, number, number, number, number, string];
      return { horseId, stableId, jockeyId, stall, weightLb, allowanceLb, assignedLb, tactic: tacticObj(tactic) };
    });
  race.entries = race.entries.map(fix);
  return race;
}

/** Zweiter Schritt: Starter-Verweise aus den Start-Datensätzen auflösen. */
export function resolveRunners(race: Race, runs: Record<string, Run>): void {
  if (!race.runners) return;
  race.runners = race.runners.map((x) => {
    const ref = x as unknown as number | [number, number, number];
    if (typeof ref !== 'number' && !Array.isArray(ref)) return x;
    const [k, allowance, assigned] = typeof ref === 'number' ? [ref, 0, null] : ref;
    const run = runs[race.resultRunIds[k]!]!;
    return { horseId: run.horseId, stableId: run.stableId, jockeyId: run.jockeyId, stall: run.stall, weightLb: run.weightLb, allowanceLb: allowance, assignedLb: assigned ?? run.weightLb, tactic: { ...run.tactic } };
  });
}

/* Ausschreibungen: feste Felder als Werteliste */
const TPL_KEYS = ['name', 'trackId', 'surface', 'week', 'day', 'raceClass', 'bhaClass', 'distanceM', 'prize', 'entryDeadlineWeeks', 'entryFee', 'maxRunners', 'feature', 'claimPrice'] as const;
const COND_KEYS = ['ageMin', 'ageMax', 'sex', 'orMin', 'orMax', 'maidenOnly', 'maxWins'] as const;
const sameKeys = (o: object, keys: readonly string[]) => {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every((x) => x in o);
};

export function packTemplate(t: RaceTemplate): RaceTemplate | Packed {
  if (!sameKeys(t, ['id', 'conditions', ...TPL_KEYS]) || !sameKeys(t.conditions, COND_KEYS)) return t;
  const rec = t as unknown as Record<string, unknown>;
  const cond = t.conditions as unknown as Record<string, unknown>;
  return { _p: 1, id: t.id, v: TPL_KEYS.map((k) => rec[k]), c: COND_KEYS.map((k) => cond[k]) };
}

export function unpackTemplate(p: Packed | RaceTemplate): RaceTemplate {
  const q = p as Packed;
  if (!q._p) return p as RaceTemplate;
  const out: Record<string, unknown> = { id: q.id };
  const v = q.v as unknown[];
  const c = q.c as unknown[];
  TPL_KEYS.forEach((k, i) => (out[k] = v[i] ?? null));
  out.conditions = Object.fromEntries(COND_KEYS.map((k, i) => [k, c[i] ?? null]));
  return out as unknown as RaceTemplate;
}

/* Genotyp: Allelwerte (zwei Nachkommastellen) als Zeichenkette mit zwei Zeichen je Wert */
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const G_OFF = 1922; // 62² = 3844 Werte: -19,22 … +19,21

function encodeAlleles(a: number[]): string | null {
  let s = '';
  for (const x of a) {
    const n = Math.round(x * 100);
    if (n / 100 !== x || n < -G_OFF || n >= 3844 - G_OFF) return null;
    const m = n + G_OFF;
    s += B62[Math.floor(m / 62)]! + B62[m % 62]!;
  }
  return s;
}

function decodeAlleles(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push((B62.indexOf(s[i]!) * 62 + B62.indexOf(s[i + 1]!) - G_OFF) / 100);
  return out;
}

/**
 * Pferde: Die Kennzahlen (stats) ergeben sich vollständig aus den Starts und werden beim Laden neu
 * berechnet. Sie entfallen nur, wenn alle Starts vorhanden sind.
 */
export function packHorse(h: Horse, runs: Record<string, Run>): Packed {
  const out: Packed = { ...h, _p: 1 };
  if (h.stats.starts === h.runIds.length && h.runIds.every((id) => runs[id])) delete out.stats;
  // Verläufe als flache Wertelisten
  // Wertverlauf: erste Woche absolut, danach Abstände in Wochen
  out.valueHistory = { d: h.valueHistory.flatMap((x, i) => [i ? x.weekIndex - h.valueHistory[i - 1]!.weekIndex : x.weekIndex, x.value]) };
  out.ratingHistory = h.ratingHistory.flatMap((x) => [x.season, x.week, x.rating, x.runId]);
  if (h.genotype) {
    const loci: Record<string, number[] | string> = {};
    for (const [k, a] of Object.entries(h.genotype.loci)) if (a) loci[k] = encodeAlleles(a) ?? a;
    out.genotype = { ...h.genotype, loci };
  }
  return out;
}

export function unpackHorse(p: Packed, runs: Record<string, Run>): Horse {
  if (!p._p) return p as unknown as Horse;
  const { _p, ...rest } = p;
  void _p;
  const h = rest as unknown as Horse;
  if (!h.stats) h.stats = computeHorseStats(h.runIds.map((id) => runs[id]!));
  if (h.genotype) for (const [k, a] of Object.entries(h.genotype.loci)) if (typeof a === 'string') (h.genotype.loci as Record<string, number[]>)[k] = decodeAlleles(a);
  const vhd = (h.valueHistory as unknown as { d?: number[] }).d;
  if (vhd) {
    const out: Horse['valueHistory'] = [];
    let wi = 0;
    for (let i = 0; i + 1 < vhd.length; i += 2) {
      wi = i ? wi + vhd[i]! : vhd[i]!;
      out.push({ weekIndex: wi, value: vhd[i + 1]! });
    }
    h.valueHistory = out;
  }
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
export function packAll(g: Pick<GameState, 'horses' | 'runs' | 'races' | 'templates'>): { horses: Record<string, Packed>; runs: Record<string, Packed>; races: Record<string, Packed>; templates: Record<string, Packed | RaceTemplate> } {
  const runs: Record<string, Packed> = {};
  for (const [id, r] of Object.entries(g.runs)) runs[id] = packRun(r, g);
  const races: Record<string, Packed> = {};
  for (const [id, r] of Object.entries(g.races)) races[id] = packRace(r, g.runs);
  const horses: Record<string, Packed> = {};
  for (const [id, h] of Object.entries(g.horses)) horses[id] = packHorse(h, g.runs);
  const templates: Record<string, Packed | RaceTemplate> = {};
  for (const [id, t] of Object.entries(g.templates)) templates[id] = packTemplate(t);
  return { horses, runs, races, templates };
}

/** Gegenstück zu packAll; unverdichtete Einträge (alte Spielstände) bleiben unverändert. */
export function unpackAll(raw: { horses: Record<string, unknown>; runs: Record<string, unknown>; races: Record<string, unknown>; templates: Record<string, unknown> }): void {
  for (const [id, t] of Object.entries(raw.templates)) raw.templates[id] = unpackTemplate(t as Packed);
  for (const [id, r] of Object.entries(raw.races)) raw.races[id] = unpackRace(r as Packed);
  const races = raw.races as Record<string, Race>;
  const raceOf: Record<string, string> = {};
  for (const r of Object.values(races)) for (const id of r.resultRunIds) raceOf[id] = r.id;
  const l = { races, templates: raw.templates as Record<string, RaceTemplate>, raceOf };
  for (const [id, r] of Object.entries(raw.runs)) raw.runs[id] = unpackRun(r as Packed, l);
  const runs = raw.runs as Record<string, Run>;
  for (const r of Object.values(races)) resolveRunners(r, runs);
  for (const [id, h] of Object.entries(raw.horses)) raw.horses[id] = unpackHorse(h as Packed, runs);
}
