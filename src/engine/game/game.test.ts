import { describe, expect, it } from 'vitest';
import { bundledWorld } from '../world/bundled';
import { loadWorld, WorldValidationError } from '../world/load';
import tracks from '../../../data/world/tracks.json';
import races from '../../../data/world/races.json';
import stables from '../../../data/world/stables.json';
import trainers from '../../../data/world/trainers.json';
import jockeys from '../../../data/world/jockeys.json';
import horses from '../../../data/world/horses.json';
import { createGame } from './newGame';
import { advanceWeek } from './week';
import { canEnter, enterRace, GameError, setTraining } from './commands';
import type { GameState } from './state';

function newGame(seed = 7, config = {}): GameState {
  return createGame({ id: 'test', name: 'Test', createdAt: '2026-11-17', seed, world: bundledWorld(), config: { aiStables: 8, horsesPerStable: 30, ...config } });
}

describe('Weltdaten', () => {
  it('die mitgelieferten Daten sind gültig', () => {
    const w = bundledWorld();
    expect(w.tracks.length).toBeGreaterThan(20);
    expect(w.features.find((f) => f.id === 'derby')!.trackId).toBe('epsom');
    expect(w.stables.every((s) => s.placeholder)).toBe(true);
  });

  it('meldet Schemafehler und kaputte Querverweise', () => {
    const badTracks = { tracks: [{ ...tracks.tracks[0], direction: 'diagonal' }] };
    expect(() => loadWorld({ tracks: badTracks, races, stables, trainers, jockeys, horses })).toThrow(WorldValidationError);
    const badHorses = { horses: [{ ...horses.horses[0], stableId: 'gibt_es_nicht' }] };
    expect(() => loadWorld({ tracks, races, stables, trainers, jockeys, horses: badHorses })).toThrow(/unbekannter Stall/);
    const longName = { horses: [{ ...horses.horses[0], name: 'Ein viel zu langer Pferdename' }] };
    expect(() => loadWorld({ tracks, races, stables, trainers, jockeys, horses: longName })).toThrow(WorldValidationError);
  });
});

describe('Neues Spiel und Wochenschleife', () => {
  it('legt Ställe, Pferde, Jockeys und Kalender an', () => {
    const g = newGame();
    const ai = Object.values(g.stables).filter((s) => !s.isPlayer);
    expect(ai.length).toBe(8);
    expect(Object.values(g.horses).filter((h) => h.stableId === 'player').length).toBe(6);
    expect(Object.values(g.templates).some((t) => t.name === 'The Derby')).toBe(true);
    // Platzhalter aus der Weltdatei sind übernommen und markiert
    expect(g.horses.ph_horse_1!.placeholder).toBe(true);
  });

  it('ist deterministisch: gleicher Seed = gleiche Saison', () => {
    const a = newGame(11);
    const b = newGame(11);
    for (let i = 0; i < 6; i++) {
      advanceWeek(a);
      advanceWeek(b);
    }
    const sig = (g: GameState) => Object.values(g.runs).map((r) => `${r.horseId}:${r.position}:${r.timeS}`).join('|');
    expect(Object.keys(a.runs).length).toBeGreaterThan(50);
    expect(sig(a)).toBe(sig(b));
    const c = newGame(12);
    for (let i = 0; i < 6; i++) advanceWeek(c);
    expect(sig(c)).not.toBe(sig(a));
  });

  it('Alterung zum 1. Januar und neue Zweijährige', () => {
    const g = newGame(3, { aiStables: 4 });
    const season = g.season;
    const someHorse = Object.values(g.horses)[0]!;
    const ageBefore = g.season - someHorse.foalYear;
    while (g.season === season) advanceWeek(g);
    expect(g.week).toBe(1);
    expect(g.season - someHorse.foalYear).toBe(ageBefore + 1);
    const crop = Object.values(g.horses).filter((h) => h.foalYear === g.season - 2 && h.stableId === 'player');
    expect(crop.length).toBeGreaterThanOrEqual(2);
  });

  it('eine Woche in der Hochsaison dauert unter 2 Sekunden', () => {
    const g = createGame({ id: 'perf', name: 'Perf', createdAt: '', seed: 5, world: bundledWorld(), startWeek: 22 });
    const times: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      advanceWeek(g);
      times.push(performance.now() - t0);
    }
    expect(Math.max(...times)).toBeLessThan(2000);
  });
});

describe('Befehle des Spielers', () => {
  it('Nennung prüft Nennschluss, Startberechtigung und zieht die Gebühr ab', () => {
    const g = newGame(21);
    const player = g.stables.player!;
    const mine = Object.values(g.horses).filter((h) => h.stableId === 'player');
    const target = Object.values(g.races).find(
      (r) => r.status === 'open' && r.weekIndex === g.weekIndex + 1 && mine.some((h) => canEnter(g, r.id, h.id).ok),
    )!;
    expect(target).toBeDefined();
    const horse = mine.find((h) => canEnter(g, target.id, h.id).ok)!;
    const before = player.balance;
    enterRace(g, target.id, horse.id);
    expect(player.balance).toBe(before - g.templates[target.templateId]!.entryFee);
    expect(() => enterRace(g, target.id, horse.id)).toThrow(GameError);
    // Nennschluss vorbei: Rennen der laufenden Woche
    const closed = Object.values(g.races).find((r) => r.weekIndex === g.weekIndex)!;
    expect(canEnter(g, closed.id, horse.id).ok).toBe(false);
    // Rennen läuft beim Wochenabschluss der Folgewoche
    advanceWeek(g);
    advanceWeek(g);
    expect(g.races[target.id]!.status === 'run' || g.races[target.id]!.status === 'void').toBe(true);
    // lief das Pferd (nicht wegen Überzeichnung ausgeschieden), hat es genau einen Start
    const ran = g.races[target.id]!.runners?.some((x) => x.horseId === horse.id);
    expect(horse.runIds.length).toBe(g.races[target.id]!.status === 'run' && ran ? 1 : 0);
  });

  it('Trainingsvorlagen setzen den Wochenplan', () => {
    const g = newGame(2);
    const h = Object.values(g.horses).find((x) => x.stableId === 'player')!;
    setTraining(g, h.id, 'hard');
    expect(h.training).toEqual(['gallop', 'hill', 'canter', 'sprints', 'gallop', 'hill']);
    const foreign = Object.values(g.horses).find((x) => x.stableId !== 'player')!;
    expect(() => setTraining(g, foreign.id, 'hard')).toThrow(GameError);
  });
});
