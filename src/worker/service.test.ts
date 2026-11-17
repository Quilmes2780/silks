import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { GameService } from './service';
import { SaveStore } from './store';
import type { NewGameParams } from './protocol';

const params: NewGameParams = {
  name: 'Testspiel',
  stableName: 'Teststall',
  silks: { pattern: 'hoops', body: '#123456', pattern2: '#ffffff', sleeves: '#123456', cap: '#ffffff' },
  seed: 42,
  randomness: 0.4,
  playerHorses: 6,
  aiStables: 6,
};

let clockN = 0;
const clock = { now: () => `2026-11-17T10:00:${String(clockN++ % 60).padStart(2, '0')}.000Z`, perf: () => 0 };

describe('Worker-Dienst mit IndexedDB', () => {
  it('speichert, lädt, exportiert, importiert und löscht Spielstände', async () => {
    const store = new SaveStore(`test-${Math.random()}`);
    const svc = new GameService(store, clock);
    const meta = await svc.handle('newGame', params);
    expect(meta.stableName).toBe('Teststall');
    expect((await svc.handle('listSaves', undefined)).length).toBe(1);

    // zwei Wochen spielen
    await svc.handle('advanceWeek', undefined);
    await svc.handle('advanceWeek', undefined);
    const office = await svc.handle('office', undefined);
    expect(office.header.week).toBe(meta.week + 2);
    const stable = await svc.handle('stableList', {});
    expect(stable.length).toBe(6);
    await svc.handle('setTraining', { horseId: stable[0]!.horseId, plan: 'hard' });

    // Frisch laden: Zustand identisch
    const svc2 = new GameService(store, clock);
    await svc2.handle('loadGame', { saveId: meta.id });
    const a = await svc.handle('horseProfile', { horseId: stable[0]!.horseId });
    const b = await svc2.handle('horseProfile', { horseId: stable[0]!.horseId });
    expect(b.training?.template).toBe('hard');
    expect(b.career.length).toBe(a.career.length);
    const office2 = await svc2.handle('office', undefined);
    expect(office2.header.week).toBe(office.header.week);

    // Determinismus nach dem Laden: beide spielen eine weitere Woche gleich
    await svc.handle('advanceWeek', undefined);
    await svc2.handle('advanceWeek', undefined);
    const cal1 = await svc.handle('calendar', { fromWeekIndex: 0, toWeekIndex: 10 });
    const cal2 = await svc2.handle('calendar', { fromWeekIndex: 0, toWeekIndex: 10 });
    expect(cal2.map((r) => `${r.raceId}:${r.status}:${r.entries}`)).toEqual(cal1.map((r) => `${r.raceId}:${r.status}:${r.entries}`));

    // Export/Import
    const exp = await svc.handle('exportSave', { saveId: meta.id });
    expect(exp.fileName).toMatch(/\.json$/);
    const imported = await svc.handle('importSave', { json: exp.json });
    expect(imported.id).not.toBe(meta.id);
    expect((await svc.handle('listSaves', undefined)).length).toBe(2);
    await expect(svc.handle('importSave', { json: '{"foo":1}' })).rejects.toThrow(/kein Spielstand/);

    // Rennansicht eines gelaufenen Rennens
    const ran = cal1.find((r) => r.status === 'run')!;
    const replay = await svc.handle('replay', { raceId: ran.raceId });
    expect(replay.frames.length).toBeGreaterThan(50);
    expect(replay.frames[0]!.xy.length).toBe(replay.runners.length * 2);
    const card = await svc.handle('raceCard', { raceId: ran.raceId });
    expect(card.result!.length).toBe(card.runners.length);

    await svc.handle('deleteSave', { saveId: meta.id });
    expect((await svc.handle('listSaves', undefined)).map((s) => s.id)).toEqual([imported.id]);
    store.close();
  });
});
