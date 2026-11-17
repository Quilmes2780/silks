import { createGame } from '../engine/game/newGame';
import { advanceWeek } from '../engine/game/week';
import * as cmd from '../engine/game/commands';
import * as q from '../engine/game/queries';
import type { GameState } from '../engine/game/state';
import { bundledWorld } from '../engine/world/bundled';
import type { Api, ApiType } from './protocol';
import { exportJson, metaOf, parseImport, SaveStore } from './store';

type Handlers = { [K in ApiType]: (req: Api[K]['req']) => Promise<Api[K]['res']> | Api[K]['res'] };

/**
 * Spieldienst im Worker: hält den aktuellen Spielstand im Speicher, führt Befehle aus
 * und speichert Änderungen in IndexedDB.
 */
export class GameService {
  private game: GameState | null = null;
  private savedRunCounter = 0;
  private savedSeasons = new Set<number>();

  constructor(
    private store: SaveStore,
    private clock: { now: () => string; perf: () => number } = { now: () => new Date().toISOString(), perf: () => performance.now() },
  ) {}

  private get g(): GameState {
    if (!this.game) throw new Error('Kein Spielstand geladen.');
    return this.game;
  }

  private markLoaded(g: GameState) {
    this.game = g;
    this.savedRunCounter = g.counters.run;
    this.savedSeasons = new Set(g.calendarSeasons);
  }

  /** Speichert Kern + angegebene Datensätze. */
  private async persist(extra: { horses?: string[]; races?: string[] } = {}) {
    const g = this.g;
    await this.store.save(g, { horses: extra.horses, races: extra.races }, this.clock.now());
  }

  private async persistWeek() {
    const g = this.g;
    const newRuns: string[] = [];
    for (let i = this.savedRunCounter + 1; i <= g.counters.run; i++) newRuns.push(`r${i}`);
    const newSeasons = g.calendarSeasons.filter((s) => !this.savedSeasons.has(s));
    const templates = newSeasons.length ? Object.values(g.templates).filter((t) => newSeasons.includes(Number(t.id.split('-')[0]))).map((t) => t.id) : [];
    const races = Object.values(g.races)
      .filter((r) => r.weekIndex >= g.weekIndex - 2 || newSeasons.includes(r.season))
      .map((r) => r.id);
    const horses = Object.values(g.horses)
      .filter((h) => h.status === 'active' || (h.lastRunWeekIndex ?? -99) >= g.weekIndex - 60)
      .map((h) => h.id);
    await this.store.save(g, { horses, runs: newRuns, races, templates }, this.clock.now());
    this.savedRunCounter = g.counters.run;
    for (const s of newSeasons) this.savedSeasons.add(s);
  }

  handlers: Handlers = {
    listSaves: () => this.store.list(),

    newGame: async (p) => {
      const now = this.clock.now();
      const id = `save-${now.replace(/[^0-9]/g, '').slice(0, 14)}-${(p.seed >>> 0).toString(36)}`;
      const g = createGame({
        id,
        name: p.name || 'Neues Spiel',
        createdAt: now,
        seed: p.seed,
        world: bundledWorld(),
        stableName: p.stableName,
        silks: p.silks,
        config: { randomness: p.randomness, playerHorses: p.playerHorses, aiStables: p.aiStables },
      });
      this.markLoaded(g);
      return this.store.saveFull(g, now);
    },

    loadGame: async ({ saveId }) => {
      const g = await this.store.load(saveId);
      if (!g) throw new Error('Spielstand nicht gefunden.');
      this.markLoaded(g);
      return metaOf(g, this.clock.now());
    },

    deleteSave: async ({ saveId }) => {
      await this.store.delete(saveId);
      if (this.game?.id === saveId) this.game = null;
      return null;
    },

    exportSave: async ({ saveId }) => {
      const g = this.game?.id === saveId ? this.game : await this.store.load(saveId);
      if (!g) throw new Error('Spielstand nicht gefunden.');
      const safe = g.name.replace(/[^A-Za-z0-9äöüÄÖÜß_-]+/g, '_');
      return { fileName: `silks-${safe}-${g.season}-W${g.week}.json`, json: exportJson(g, this.clock.now()) };
    },

    importSave: async ({ json }) => {
      const g = parseImport(json);
      const now = this.clock.now();
      g.id = `save-${now.replace(/[^0-9]/g, '').slice(0, 14)}-imp`;
      g.name = `${g.name} (Import)`;
      this.markLoaded(g);
      return this.store.saveFull(g, now);
    },

    advanceWeek: async () => {
      const g = this.g;
      const s = advanceWeek(g, this.clock.perf);
      await this.persistWeek();
      return s;
    },

    enterRace: async (p) => {
      cmd.enterRace(this.g, p.raceId, p.horseId, p.jockeyId ?? null, p.tactic);
      await this.persist({ races: [p.raceId] });
      return null;
    },

    withdrawEntry: async (p) => {
      cmd.withdrawEntry(this.g, p.raceId, p.horseId);
      await this.persist({ races: [p.raceId] });
      return null;
    },

    setRaceOrders: async (p) => {
      cmd.setRaceOrders(this.g, p.raceId, p.horseId, p.tactic, p.jockeyId);
      await this.persist({ races: [p.raceId] });
      return null;
    },

    setTraining: async (p) => {
      cmd.setTraining(this.g, p.horseId, p.plan);
      await this.persist({ horses: [p.horseId] });
      return null;
    },

    markInboxRead: async (p) => {
      cmd.markInboxRead(this.g, p.ids);
      await this.persist();
      return null;
    },

    renameStable: async (p) => {
      cmd.renameStable(this.g, p.name);
      await this.persist();
      return null;
    },

    setSilks: async (p) => {
      this.g.stables[this.g.playerStableId]!.silks = p.silks;
      await this.persist();
      return null;
    },

    header: () => q.headerView(this.g),
    office: () => q.officeView(this.g),
    stableList: (p) => q.stableRows(this.g, p?.stableId),
    horseProfile: (p) => q.horseProfile(this.g, p.horseId),
    calendar: (p) => q.calendarView(this.g, p),
    raceCard: (p) => q.raceCard(this.g, p.raceId),
    replay: (p) => q.replayView(this.g, p.raceId),
    jockeys: () => q.jockeyList(this.g),
    trainingInfo: () => q.trainingInfo(),
    runLinks: (p) => q.runLinks(this.g, p.runIds),
  };

  async handle<K extends ApiType>(type: K, payload: Api[K]['req']): Promise<Api[K]['res']> {
    const h = this.handlers[type] as (req: Api[K]['req']) => Promise<Api[K]['res']> | Api[K]['res'];
    if (!h) throw new Error(`Unbekannter Befehl: ${String(type)}`);
    return h(payload);
  }
}
