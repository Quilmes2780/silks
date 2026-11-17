import { describe, expect, it } from 'vitest';
import { bundledWorld } from '../world/bundled';
import { createGame } from '../game/newGame';
import { advanceWeek } from '../game/week';
import type { GameState } from '../game/state';
import { horseProfile } from '../game/queries';
import { breedingStatsView, partnershipsView, pedigreeView, stallionList, studView } from './queries';
import { setMating, standAsStallion, toBroodmare } from './commands';
import { buyShare, sellShare, shareListings } from '../market/partnership';
import { acceptBoarding, boardingWeek, endBoarding } from '../market/boarding';
import { activeStallions, importHorse } from './stud';
import { NameRegistry } from '../world/names';
import { Rng } from '../rng';
import { usedHorseNames } from '../game/state';

function newGame(seed = 31): GameState {
  return createGame({ id: 'm', name: 'M', createdAt: '2026-11-17', seed, world: bundledWorld(), config: { aiStables: 8, horsesPerStable: 30 } });
}

describe('Abfragen für alle Pferde-Status', () => {
  it('Profil, Stammbaum und Gestüt funktionieren für Training, Nachwuchs, Stuten und Hengste', () => {
    const g = newGame();
    const names = new NameRegistry(usedHorseNames(g));
    const foal = importHorse(g, new Rng(1), names, { stableId: g.playerStableId, foalYear: g.season, damQuality: 60, status: 'young' });
    const mare = Object.values(g.horses).find((h) => h.status === 'broodmare')!;
    const stallion = g.horses[activeStallions(g)[0]!.id]!;
    const racer = Object.values(g.horses).find((h) => h.status === 'active' && h.stableId === g.playerStableId)!;
    for (const h of [foal, mare, stallion, racer]) {
      expect(() => horseProfile(g, h.id)).not.toThrow();
      const p = pedigreeView(g, h.id);
      expect(p.generations.map((x) => x.length)).toEqual([2, 4, 8, 16]);
    }
    expect(pedigreeView(g, stallion.id).progeny).not.toBeNull();
    const sv = studView(g);
    expect(sv.young.map((y) => y.id)).toContain(foal.id);
    expect(stallionList(g, mare.id).rows[0]!.match).not.toBeNull();
    const bs = breedingStatsView(g);
    expect(bs.sires.length).toBeGreaterThan(30);
    expect(() => partnershipsView(g)).not.toThrow();
  });
});

describe('Zucht-Befehle', () => {
  it('Stute in die Zucht, Deckplan, Hengst aufstellen', () => {
    const g = newGame(33);
    const filly = Object.values(g.horses).find((h) => h.stableId === g.playerStableId && h.sex === 'female' && g.season - h.foalYear >= 3);
    if (filly) {
      toBroodmare(g, filly.id);
      expect(filly.status).toBe('broodmare');
      const s = activeStallions(g).find((x) => x.id !== filly.sireId)!;
      setMating(g, filly.id, s.id);
      expect(g.breeding.plans[filly.id]).toBe(s.id);
      expect(() => setMating(g, filly.id, filly.sireId!)).toThrow();
    }
    const colt = Object.values(g.horses).find((h) => h.stableId === g.playerStableId && h.sex === 'male' && !h.gelded && g.season - h.foalYear >= 3);
    if (colt) {
      colt.officialRating = 90;
      standAsStallion(g, colt.id);
      expect(colt.status).toBe('stud');
      expect(g.stallions[colt.id]!.ownerId).toBe(g.playerStableId);
    }
  });
});

describe('Teilhaberschaften', () => {
  it('Anteil kaufen, Preisgeld und Unterhalt anteilig, Anteil zurückverkaufen', () => {
    const g = newGame(35);
    const listing = shareListings(g).find((l) => l.kind === 'racehorse')!;
    expect(listing).toBeDefined();
    const before = g.stables.player!.balance;
    const price = buyShare(g, listing.horseId, 0.25);
    expect(g.stables.player!.balance).toBe(before - price);
    const h = g.horses[listing.horseId]!;
    expect(h.partners).toEqual([{ stableId: g.playerStableId, share: 0.25 }]);
    expect(() => buyShare(g, listing.horseId, 0.5)).toThrow();
    // eine Woche: Unterhaltsanteil wird gebucht
    advanceWeek(g);
    expect(g.ledger.some((l) => l.kind === 'partner' && l.text.startsWith('Unterhaltsanteil'))).toBe(true);
    if (h.partners?.length) {
      const back = sellShare(g, h.id);
      expect(back).toBeGreaterThan(0);
      expect(h.partners).toEqual([]);
    }
  });
});

describe('Einstellpferde', () => {
  it('Anfrage annehmen, Pauschale kassieren, Nenngebühr zahlt der Besitzer, zurückgeben', () => {
    const g = newGame(37);
    g.stables.player!.reputation = 90;
    // bis eine Anfrage kommt (alle vier Wochen, hohe Chance bei gutem Ruf)
    for (let i = 0; i < 40 && g.boardingOffers.length === 0; i++) advanceWeek(g);
    expect(g.boardingOffers.length).toBeGreaterThan(0);
    const o = g.boardingOffers[0]!;
    acceptBoarding(g, o.id);
    const h = g.horses[o.horseId]!;
    expect(h.stableId).toBe(g.playerStableId);
    expect(h.boarding?.ownerName).toBe(o.ownerName);
    advanceWeek(g);
    expect(g.ledger.some((l) => l.kind === 'boarding_fee' && l.horseId === h.id)).toBe(true);
    boardingWeek(g);
    endBoarding(g, h.id, 'player');
    expect(h.stableId).not.toBe(g.playerStableId);
    expect(h.boarding).toBeNull();
  }, 60000);
});
