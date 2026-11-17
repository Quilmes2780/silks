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

/** Phase-4-Daten entfernen: Zuchtpferde, Genetik, Deckpläne; Hengstregister im alten Format. */
function toV2(g: GameState): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(g)) as Record<string, unknown> & GameState;
  const stallions: Record<string, unknown> = {};
  for (const s of Object.values(raw.stallions)) {
    stallions[s.id] = { id: s.id, name: s.name, foalYear: s.foalYear, fee: s.fee, quality: 62, distOptM: 1600, going: 0, active: true };
  }
  for (const h of Object.values(raw.horses)) {
    if (h.status !== 'active') delete raw.horses[h.id];
    else {
      h.genotype = null;
      h.damId = null;
    }
  }
  delete (raw as Record<string, unknown>).genetics;
  delete (raw as Record<string, unknown>).breeding;
  for (const st of Object.values(raw.stables)) delete st.facilities.stud;
  raw.stallions = stallions as GameState['stallions'];
  raw.version = 2 as unknown as 3;
  return raw;
}

describe('Import älterer Spielstände', () => {
  it('Version-1-Spielstand wird migriert und läuft weiter', () => {
    const g = newGame(13);
    advanceWeek(g);
    // Version 1 nachbauen: Personal zurück in Trainer/Jockeys, neue Felder entfernen
    const v1 = toV2(g) as Record<string, unknown> & GameState;
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
    for (const h of Object.values(v1.horses)) {
      h.sireId = null;
      h.sireName = null;
    }
    raw.trainers = trainers;
    raw.jockeys = jockeys;
    raw.version = 1;
    (raw.config as Record<string, unknown>).trainingFeePerWeek = 450;
    const json = JSON.stringify({ format: 'silks-and-stamina-save', version: 1, exportedAt: '', game: raw });
    const m = parseImport(json);
    expect(m.version).toBe(3);
    expect(Object.values(m.staff).some((s) => s.role === 'jockey')).toBe(true);
    expect(m.stables.player!.kind).toBe('player');
    expect(m.staff[m.stables.player!.trainerId]?.role).toBe('head_trainer');
    for (let i = 0; i < 3; i++) advanceWeek(m);
    expect(m.week).toBe(g.week + 3);
    expect(migrateGame(m as unknown as Record<string, unknown>)).toBe(false);
  });

  it('Version-2-Spielstand: Hengste werden Pferde, Herden und Trächtigkeiten entstehen', () => {
    const g = newGame(21);
    advanceWeek(g);
    const raw = toV2(g);
    const json = JSON.stringify({ format: 'silks-and-stamina-save', version: 2, exportedAt: '', game: raw });
    const m = parseImport(json);
    expect(m.version).toBe(3);
    // Register-IDs bleiben, die Hengste sind jetzt Pferde
    for (const s of Object.values(m.stallions)) expect(m.horses[s.id]?.status).toBe('stud');
    for (const h of Object.values(m.horses)) if (h.sireId) expect(m.horses[h.sireId]).toBeDefined();
    expect(Object.values(m.horses).filter((h) => h.status === 'broodmare').length).toBeGreaterThan(100);
    expect(Object.keys(m.breeding.pregnancies).length).toBeGreaterThan(50);
    for (let i = 0; i < 3; i++) advanceWeek(m);
    expect(migrateGame(m as unknown as Record<string, unknown>)).toBe(false);
  });
});
