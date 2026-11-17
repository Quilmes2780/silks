import Dexie, { type Table } from 'dexie';
import type { GameState } from '../engine/game/state';
import type { Horse, RaceInstance, RaceTemplate, Run } from '../engine/types';
import type { SaveMeta } from './protocol';
import { migrateGame, SAVE_VERSION } from '../engine/game/migrate';

/**
 * Persistenz in IndexedDB über Dexie. Mehrere Spielstände; große Sammlungen (Pferde, Starts,
 * Rennen, Ausschreibungen) liegen in eigenen Tabellen und werden inkrementell gespeichert.
 */

interface Row<T> {
  saveId: string;
  id: string;
  data: T;
}

type Core = Omit<GameState, 'horses' | 'runs' | 'races' | 'templates' | 'touchedHorses' | 'touchedRaces'>;

class SilksDb extends Dexie {
  saves!: Table<SaveMeta, string>;
  cores!: Table<{ id: string; data: Core }, string>;
  horses!: Table<Row<Horse>, [string, string]>;
  runs!: Table<Row<Run>, [string, string]>;
  races!: Table<Row<RaceInstance>, [string, string]>;
  templates!: Table<Row<RaceTemplate>, [string, string]>;

  constructor(name = 'silks-and-stamina') {
    super(name);
    this.version(1).stores({
      saves: 'id, updatedAt',
      cores: 'id',
      horses: '[saveId+id], saveId',
      runs: '[saveId+id], saveId',
      races: '[saveId+id], saveId',
      templates: '[saveId+id], saveId',
    });
  }
}

export interface SaveScope {
  horses?: string[] | 'all';
  races?: string[] | 'all';
  runs?: string[] | 'all';
  templates?: string[] | 'all';
}

export function metaOf(g: GameState, updatedAt: string): SaveMeta {
  const s = g.stables[g.playerStableId]!;
  return { id: g.id, name: g.name, stableName: s.name, silks: s.silks, season: g.season, week: g.week, createdAt: g.createdAt, updatedAt };
}

function coreOf(g: GameState): Core {
  const { horses: _h, runs: _r, races: _ra, templates: _t, touchedHorses: _th, touchedRaces: _tr, ...core } = g;
  void _th;
  void _tr;
  void _h;
  void _r;
  void _ra;
  void _t;
  return core;
}

export class SaveStore {
  private db: SilksDb;

  constructor(dbName?: string) {
    this.db = new SilksDb(dbName);
  }

  async list(): Promise<SaveMeta[]> {
    return (await this.db.saves.toArray()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async save(g: GameState, scope: SaveScope, now: string): Promise<SaveMeta> {
    const meta = metaOf(g, now);
    const pick = <T extends { id: string }>(all: Record<string, T>, sel: string[] | 'all' | undefined): Row<T>[] => {
      if (!sel) return [];
      const items = sel === 'all' ? Object.values(all) : sel.map((id) => all[id]).filter((x): x is T => !!x);
      return items.map((data) => ({ saveId: g.id, id: data.id, data }));
    };
    await this.db.transaction('rw', [this.db.saves, this.db.cores, this.db.horses, this.db.runs, this.db.races, this.db.templates], async () => {
      await this.db.saves.put(meta);
      await this.db.cores.put({ id: g.id, data: coreOf(g) });
      const h = pick(g.horses, scope.horses);
      if (h.length) await this.db.horses.bulkPut(h);
      const r = pick(g.runs, scope.runs);
      if (r.length) await this.db.runs.bulkPut(r);
      const ra = pick(g.races, scope.races);
      if (ra.length) await this.db.races.bulkPut(ra);
      const t = pick(g.templates, scope.templates);
      if (t.length) await this.db.templates.bulkPut(t);
    });
    return meta;
  }

  async saveFull(g: GameState, now: string): Promise<SaveMeta> {
    return this.save(g, { horses: 'all', runs: 'all', races: 'all', templates: 'all' }, now);
  }

  async load(id: string): Promise<GameState | null> {
    const core = await this.db.cores.get(id);
    if (!core) return null;
    const toMap = <T>(rows: Row<T>[]) => Object.fromEntries(rows.map((r) => [r.id, r.data]));
    const [horses, runs, races, templates] = await Promise.all([
      this.db.horses.where('saveId').equals(id).toArray(),
      this.db.runs.where('saveId').equals(id).toArray(),
      this.db.races.where('saveId').equals(id).toArray(),
      this.db.templates.where('saveId').equals(id).toArray(),
    ]);
    const g = { ...core.data, horses: toMap(horses), runs: toMap(runs), races: toMap(races), templates: toMap(templates), touchedHorses: [], touchedRaces: [] } as GameState;
    return g;
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.saves, this.db.cores, this.db.horses, this.db.runs, this.db.races, this.db.templates], async () => {
      await this.db.saves.delete(id);
      await this.db.cores.delete(id);
      await this.db.horses.where('saveId').equals(id).delete();
      await this.db.runs.where('saveId').equals(id).delete();
      await this.db.races.where('saveId').equals(id).delete();
      await this.db.templates.where('saveId').equals(id).delete();
    });
  }

  close(): void {
    this.db.close();
  }
}

export const EXPORT_FORMAT = 'silks-and-stamina-save';

export function exportJson(g: GameState, now: string): string {
  const { touchedHorses: _t, touchedRaces: _tr, ...rest } = g;
  void _t;
  void _tr;
  return JSON.stringify({ format: EXPORT_FORMAT, version: SAVE_VERSION, exportedAt: now, game: rest });
}

export function parseImport(json: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  const p = parsed as { format?: string; version?: number; game?: GameState };
  if (p.format !== EXPORT_FORMAT || !p.game) throw new Error('Die Datei ist kein Spielstand von Silks & Stamina.');
  const v = p.game.version as number;
  const known = (x: unknown) => x === 1 || x === 2 || x === SAVE_VERSION;
  if (!known(p.version) || !known(v)) throw new Error(`Spielstand-Version ${p.version} wird nicht unterstützt.`);
  const raw = p.game as unknown as Record<string, unknown>;
  const required = v === 1 ? ['horses', 'runs', 'races', 'templates', 'stables', 'jockeys', 'trainers', 'tracks'] : ['horses', 'runs', 'races', 'templates', 'stables', 'staff', 'tracks', 'finance'];
  for (const key of required) {
    if (typeof raw[key] !== 'object' || raw[key] === null) throw new Error(`Spielstand unvollständig: ${key} fehlt.`);
  }
  migrateGame(raw);
  const g = raw as unknown as GameState;
  g.touchedHorses = [];
  g.touchedRaces = [];
  return g;
}
