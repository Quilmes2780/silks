import { createGame } from '../engine/game/newGame';
import { advanceWeek } from '../engine/game/week';
import * as cmd from '../engine/game/commands';
import * as staffCmd from '../engine/game/staffCommands';
import * as q from '../engine/game/queries';
import * as eq from '../engine/game/econQueries';
import * as transfer from '../engine/market/transfer';
import * as auction from '../engine/market/auction';
import { toggleClaim } from '../engine/market/claiming';
import { migrateGame } from '../engine/game/migrate';
import { compactOldRecords } from '../engine/game/archive';
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

  /** Speichert Kern, angegebene Datensätze und alles, was die Engine als geändert markiert hat. */
  private async persist(extra: { horses?: string[]; races?: string[] } = {}) {
    const g = this.g;
    const horses = [...(extra.horses ?? []), ...g.touchedHorses];
    const races = [...(extra.races ?? []), ...g.touchedRaces];
    await this.store.save(g, { horses, races }, this.clock.now());
    g.touchedHorses = [];
    g.touchedRaces = [];
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
      .filter((h) => h.status === 'active' || h.status === 'broodmare' || h.status === 'stud' || h.status === 'young' || (h.lastRunWeekIndex ?? -99) >= g.weekIndex - 60)
      .map((h) => h.id);
    // Jahreswechsel: Detaildaten älterer Saisons archivieren
    const archived = g.week === 1 ? compactOldRecords(g) : { races: [], runs: [] };
    await this.store.save(
      g,
      { horses: [...horses, ...g.touchedHorses], runs: [...newRuns, ...archived.runs], races: [...races, ...g.touchedRaces, ...archived.races], templates },
      this.clock.now(),
    );
    g.touchedHorses = [];
    g.touchedRaces = [];
    this.savedRunCounter = g.counters.run;
    for (const s of newSeasons) this.savedSeasons.add(s);
  }

  /** Befehl ausführen und speichern. */
  private async run<T>(fn: (g: GameState) => T, extra: { horses?: string[]; races?: string[] } = {}): Promise<T> {
    const res = fn(this.g);
    await this.persist(extra);
    return res;
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
      const migrated = migrateGame(g as unknown as Record<string, unknown>);
      // Detaildaten alter Saisons nur im Speicher verkleinern; gespeichert wird beim nächsten Jahreswechsel
      compactOldRecords(g);
      this.markLoaded(g);
      if (migrated) {
        g.touchedHorses = [];
        g.touchedRaces = [];
        return this.store.saveFull(g, this.clock.now());
      }
      return metaOf(g, this.clock.now());
    },

    deleteSave: async ({ saveId }) => {
      await this.store.delete(saveId);
      if (this.game?.id === saveId) this.game = null;
      return null;
    },

    exportSave: async ({ saveId }) => {
      let g = this.game?.id === saveId ? this.game : await this.store.load(saveId);
      if (!g) throw new Error('Spielstand nicht gefunden.');
      if (g !== this.game) migrateGame(g as unknown as Record<string, unknown>);
      g = g as GameState;
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

    enterRace: (p) => this.run((g) => (cmd.enterRace(g, p.raceId, p.horseId, p.jockeyId ?? null, p.tactic), null), { races: [p.raceId] }),
    withdrawEntry: (p) => this.run((g) => (cmd.withdrawEntry(g, p.raceId, p.horseId), null), { races: [p.raceId] }),
    setRaceOrders: (p) => this.run((g) => (cmd.setRaceOrders(g, p.raceId, p.horseId, p.tactic, p.jockeyId), null), { races: [p.raceId] }),
    setTraining: (p) => this.run((g) => (cmd.setTraining(g, p.horseId, p.plan), null), { horses: [p.horseId] }),
    markInboxRead: (p) => this.run((g) => (cmd.markInboxRead(g, p.ids), null)),
    renameStable: (p) => this.run((g) => (cmd.renameStable(g, p.name), null)),
    setSilks: (p) => this.run((g) => ((g.stables[g.playerStableId]!.silks = p.silks), null)),

    // Personal und Anlage
    hireStaff: (p) => this.run((g) => staffCmd.hireStaff(g, p.staffId, p), { horses: [] }),
    offerContract: (p) => this.run((g) => staffCmd.offerContract(g, p.staffId, p)),
    fireStaff: (p) => this.run((g) => staffCmd.fireStaff(g, p.staffId), { horses: this.ownHorses() }),
    assignGroom: (p) => this.run((g) => (staffCmd.assignGroom(g, p.horseId, p.groomId), null), { horses: [p.horseId] }),
    upgradeFacility: (p) => this.run((g) => (staffCmd.upgradeFacility(g, p.key), null)),

    // Markt
    makeOffer: (p) => this.run((g) => transfer.makeOffer(g, p.horseId, p.amount)),
    respondOffer: (p) => this.run((g) => transfer.respondOffer(g, p.offerId, p.action, p.amount)),
    listForSale: (p) => this.run((g) => (transfer.listForSale(g, p.horseId, p.askingPrice), null)),
    bid: (p) => this.run((g) => auction.bid(g, p.lotId, p.amount)),
    pass: (p) => this.run((g) => auction.pass(g, p.lotId)),
    setAutoBid: (p) => this.run((g) => (auction.setAutoBid(g, p.lotId, p.limit), null)),
    finishAuction: (p) => this.run((g) => (auction.finishAuction(g, p.auctionId), null)),
    consign: (p) => this.run((g) => (auction.consign(g, p.horseId, p.auctionId, p.reserve), null)),
    withdrawLot: (p) => this.run((g) => (auction.withdrawLot(g, p.horseId, p.auctionId), null)),
    claimHorse: (p) => this.run((g) => ({ claimed: toggleClaim(g, p.raceId, p.horseId) }), { races: [p.raceId] }),

    // Abfragen
    header: () => q.headerView(this.g),
    office: () => q.applyAnalyst(this.g, q.officeView(this.g)),
    stableList: (p) => q.applyAnalyst(this.g, q.stableRows(this.g, p?.stableId)),
    horseProfile: (p) => q.applyAnalyst(this.g, q.horseProfile(this.g, p.horseId)),
    calendar: (p) => q.calendarView(this.g, p),
    raceCard: (p) => q.applyAnalyst(this.g, q.raceCard(this.g, p.raceId)),
    replay: (p) => q.replayView(this.g, p.raceId),
    jockeys: () => q.jockeyList(this.g),
    trainingInfo: () => q.trainingInfo(),
    runLinks: (p) => q.applyAnalyst(this.g, q.runLinks(this.g, p.runIds)),
    staff: () => eq.staffView(this.g),
    staffOfferHint: (p) => eq.staffOfferHint(this.g, p.staffId),
    finance: (p) => eq.financeView(this.g, p?.season),
    facilities: () => eq.facilitiesView(this.g),
    market: () => q.applyAnalyst(this.g, eq.marketView(this.g)),
    auction: (p) => eq.auctionView(this.g, p.auctionId),
  };

  private ownHorses(): string[] {
    const g = this.game;
    if (!g) return [];
    return Object.values(g.horses)
      .filter((h) => h.stableId === g.playerStableId)
      .map((h) => h.id);
  }

  async handle<K extends ApiType>(type: K, payload: Api[K]['req']): Promise<Api[K]['res']> {
    const h = this.handlers[type] as (req: Api[K]['req']) => Promise<Api[K]['res']> | Api[K]['res'];
    if (!h) throw new Error(`Unbekannter Befehl: ${String(type)}`);
    return h(payload);
  }
}
