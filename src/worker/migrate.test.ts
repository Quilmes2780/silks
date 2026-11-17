import { describe, expect, it } from 'vitest';
import { bundledWorld } from '../engine/world/bundled';
import { createGame } from '../engine/game/newGame';
import { advanceWeek } from '../engine/game/week';
import type { GameState } from '../engine/game/state';
import { migrateGame } from '../engine/game/migrate';
import { parseImport } from './store';

function newGame(seed = 7, config = {}): GameState {
  return createGame({ id: 'eco', name: 'Eco', createdAt: '2026-11-17', seed, world: bundledWorld(), config: { aiStables: 8, horsesPerStable: 30, ...config } });
}

describe('Import älterer Spielstände', () => {
  it('Version-1-Spielstand wird migriert und läuft weiter', () => {
    const g = newGame(13);
    advanceWeek(g);
    // Version 1 nachbauen: Personal zurück in Trainer/Jockeys, neue Felder entfernen
    const v1 = JSON.parse(JSON.stringify(g)) as Record<string, unknown> & GameState;
    const trainers: Record<string, unknown> = {};
    const jockeys: Record<string, unknown> = {};
    for (const s of Object.values(v1.staff)) {
      if (s.role === 'head_trainer' && Object.values(v1.stables).some((st) => st.trainerId === s.id)) {
        trainers[s.id] = { id: s.id, name: s.name, skill: s.skill, insight: s.trainer!.insight, specialty: s.trainer!.specialty, source: s.source, placeholder: s.placeholder };
      }
      if (s.role === 'jockey') jockeys[s.id] = { id: s.id, name: s.name, tactics: s.jockey!.tactics, pace: s.jockey!.pace, finishing: s.jockey!.finishing, weightLb: s.jockey!.weightLb, fee: s.jockey!.fee, source: s.source, placeholder: s.placeholder };
    }
    const raw = v1 as unknown as Record<string, unknown>;
    for (const k of ['staff', 'stallions', 'auctions', 'offers', 'finance', 'touchedHorses', 'touchedRaces']) delete raw[k];
    delete (raw.stables as Record<string, unknown>).breeders;
    raw.trainers = trainers;
    raw.jockeys = jockeys;
    raw.version = 1;
    (raw.config as Record<string, unknown>).trainingFeePerWeek = 450;
    const json = JSON.stringify({ format: 'silks-and-stamina-save', version: 1, exportedAt: '', game: raw });
    const m = parseImport(json);
    expect(m.version).toBe(2);
    expect(Object.values(m.staff).some((s) => s.role === 'jockey')).toBe(true);
    expect(m.stables.player!.kind).toBe('player');
    expect(m.staff[m.stables.player!.trainerId]?.role).toBe('head_trainer');
    for (let i = 0; i < 3; i++) advanceWeek(m);
    expect(m.week).toBe(g.week + 3);
    expect(migrateGame(m as unknown as Record<string, unknown>)).toBe(false);
  });

});
