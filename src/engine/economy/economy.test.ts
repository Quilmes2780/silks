import { describe, expect, it } from 'vitest';
import { bundledWorld } from '../world/bundled';
import { createGame } from '../game/newGame';
import { advanceWeek } from '../game/week';
import { type GameState, horsesOfStable, staffOfStable } from '../game/state';
import { assignGroom, fireStaff, hireStaff, offerContract, upgradeFacility } from '../game/staffCommands';
import { GameError } from '../game/commands';
import { acceptThreshold, figurePrecision, salaryDemand, stableEffects } from '../staff/staff';
import { marketValue, valueFromLevel } from './value';
import { makeOffer, respondOffer, transferHorse } from '../market/transfer';
import { bid, createCatalogue, finishAuction, pass, setAutoBid } from '../market/auction';
import { toggleClaim } from '../market/claiming';
import { applyAnalyst, horseProfile } from '../game/queries';
import { financeView } from '../game/econQueries';

function newGame(seed = 7, config = {}): GameState {
  return createGame({ id: 'eco', name: 'Eco', createdAt: '2026-11-17', seed, world: bundledWorld(), config: { aiStables: 8, horsesPerStable: 30, ...config } });
}

const own = (g: GameState) => horsesOfStable(g, g.playerStableId);

describe('Personal', () => {
  it('Startteam: Cheftrainer, Pfleger, Arbeitsreiter, Analyst', () => {
    const g = newGame();
    const roles = staffOfStable(g, 'player').map((s) => s.role).sort();
    expect(roles).toEqual(['analyst', 'groom', 'head_trainer', 'work_rider']);
    expect(own(g).filter((h) => h.groomId).length).toBe(4);
    expect(figurePrecision(g)).toBe(5); // junger Analyst: Figures auf 5 lb gerundet
  });

  it('Einstellung ist deterministisch: ab der Schwelle Zusage, weit darunter Funkstille', () => {
    const g = newGame();
    const cand = Object.values(g.staff).find((s) => !s.contract && s.role === 'vet')!;
    const th = acceptThreshold(g, cand, 'player');
    const low = hireStaff(g, cand.id, { weeklySalary: Math.floor(th * 0.95), years: 2 });
    expect(low.accepted).toBe(false);
    expect(hireStaff(g, cand.id, { weeklySalary: Math.ceil(th) + 1, years: 2 }).accepted).toBe(true);
    expect(cand.contract?.stableId).toBe('player');
    const other = Object.values(g.staff).find((s) => !s.contract && s.role === 'farrier')!;
    expect(hireStaff(g, other.id, { weeklySalary: 10, years: 1 }).accepted).toBe(false);
    expect(() => hireStaff(g, other.id, { weeklySalary: 99999, years: 1 })).toThrow(GameError);
  });

  it('Analyst steuert die Sichtbarkeit der Speed Figures', () => {
    const g = newGame();
    for (let i = 0; i < 6; i++) advanceWeek(g);
    const analyst = staffOfStable(g, 'player', 'analyst')[0]!;
    const run = Object.values(g.runs)[0]!;
    const rounded = applyAnalyst(g, { speedFigure: run.speedFigure, sectionals: run.sectionals });
    expect(rounded.speedFigure! % 5).toBe(0);
    fireStaff(g, analyst.id);
    expect(figurePrecision(g)).toBe(0);
    const hidden = applyAnalyst(g, { speedFigure: run.speedFigure, sectionals: run.sectionals, bestFigure: { value: 80, runId: 'x' } });
    expect(hidden.speedFigure).toBeNull();
    expect(hidden.sectionals).toEqual([]);
    expect(hidden.bestFigure).toBeNull();
    // Profil bleibt abrufbar
    expect(applyAnalyst(g, horseProfile(g, own(g)[0]!.id)).name).toBeTruthy();
  });

  it('Pfleger verbessern die Erholung, fehlende Pfleger kosten Frische', () => {
    const g = newGame();
    const [a, b] = own(g);
    const groom = staffOfStable(g, 'player', 'groom')[0]!;
    assignGroom(g, a!.id, groom.id);
    assignGroom(g, b!.id, null);
    a!.condition.freshness = 50;
    b!.condition.freshness = 50;
    a!.training = b!.training = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest'];
    advanceWeek(g);
    expect(a!.condition.freshness).toBeGreaterThan(b!.condition.freshness);
  });

  it('Vertragsverlängerung und Abfindung', () => {
    const g = newGame();
    const rider = staffOfStable(g, 'player', 'work_rider')[0]!;
    expect(offerContract(g, rider.id, { weeklySalary: salaryDemand(rider) * 1.2, years: 3 }).accepted).toBe(true);
    expect(rider.contract!.endSeason).toBe(g.season + 2);
    const before = g.stables.player!.balance;
    const { severance } = fireStaff(g, rider.id);
    expect(severance).toBeGreaterThan(0);
    expect(g.stables.player!.balance).toBe(before - severance);
    expect(stableEffects(g, 'player').trainingFactor).toBeCloseTo(0.7, 5);
  });
});

describe('Finanzen', () => {
  it('Wochenkosten: Gehälter, Unterhalt, Anlage – und Kostenrechnung je Pferd', () => {
    const g = newGame();
    const before = g.stables.player!.balance;
    advanceWeek(g);
    const kinds = new Set(g.ledger.filter((l) => l.weekIndex === g.weekIndex - 1).map((l) => l.kind));
    expect(kinds.has('salary')).toBe(true);
    expect(kinds.has('upkeep')).toBe(true);
    expect(kinds.has('facility')).toBe(true);
    expect(g.stables.player!.balance).toBeLessThan(before);
    const fv = financeView(g);
    expect(fv.horses.length).toBe(own(g).length);
    expect(fv.horses.every((h) => h.running < 0)).toBe(true);
    expect(fv.history.length).toBeGreaterThanOrEqual(2);
  });

  it('Dispo: Zinsen, Mahnungen, Zwangsverkauf nach 8 Wochen', () => {
    const g = newGame();
    g.stables.player!.balance = -g.config.overdraftLimit - 50000;
    const n = own(g).length;
    for (let i = 0; i < 8; i++) advanceWeek(g);
    expect(g.ledger.some((l) => l.kind === 'interest')).toBe(true);
    expect(g.inbox.some((m) => m.title.startsWith('Mahnung'))).toBe(true);
    expect(g.inbox.some((m) => m.title.startsWith('Zwangsverkauf'))).toBe(true);
    expect(own(g).length).toBeLessThanOrEqual(n + 2);
    expect(Object.values(g.horses).some((h) => h.purchase?.via === 'forced_sale')).toBe(true);
  });

  it('Ausbau der Anlage', () => {
    const g = newGame();
    upgradeFacility(g, 'boxes');
    expect(g.stables.player!.facilities.boxes).toBe(16);
    upgradeFacility(g, 'pool');
    expect(() => upgradeFacility(g, 'pool')).toThrow(GameError);
    expect(stableEffects(g, 'player').pool).toBe(true);
  });
});

describe('Marktwert', () => {
  it('steigt mit dem Niveau, fällt mit dem Alter und bei Sehnenschaden', () => {
    const g = newGame();
    const h = own(g)[0]!;
    const v70 = valueFromLevel(h, 70, 3);
    expect(valueFromLevel(h, 90, 3)).toBeGreaterThan(v70 * 3);
    expect(valueFromLevel(h, 70, 6)).toBeLessThan(v70);
    h.condition.injury = { type: 'tendon', leg: 0, weeksRemaining: 20, sinceWeekIndex: 0 };
    expect(valueFromLevel(h, 70, 3)).toBeLessThan(v70 * 0.5);
    expect(marketValue(g, h)).toBeGreaterThan(0);
  });
});

describe('Transfermarkt', () => {
  it('Angebot: Ablehnung, Gegenangebot, Kauf mit Buchungen', () => {
    const g = newGame();
    const target = Object.values(g.horses).find((h) => g.stables[h.stableId]!.kind === 'ai' && h.status === 'active' && (h.value ?? 0) > 5000 && (h.value ?? 0) < 60000)!;
    const sellerBefore = g.stables[target.stableId]!.balance;
    const sellerId = target.stableId;
    expect(makeOffer(g, target.id, Math.round((target.value ?? 0) * 0.3)).status).toBe('declined');
    const v = target.value!;
    let res = makeOffer(g, target.id, Math.round(v * 1.25));
    if (res.status === 'countered') res = respondOffer(g, res.offerId, 'accept');
    expect(res.status).toBe('accepted');
    expect(target.stableId).toBe('player');
    expect(target.purchase?.via).toBe('transfer');
    expect(g.stables[sellerId]!.balance).toBeGreaterThan(sellerBefore);
    expect(g.ledger.some((l) => l.kind === 'purchase' && l.horseId === target.id)).toBe(true);
  });

  it('KI macht Angebote für Pferde auf der Verkaufsliste', () => {
    const g = newGame();
    const h = own(g)[0]!;
    h.forSale = { askingPrice: Math.round((h.value ?? 10000) * 0.8), sinceWeekIndex: g.weekIndex };
    for (let i = 0; i < 12 && h.stableId === 'player'; i++) advanceWeek(g);
    expect(h.stableId).not.toBe('player');
    expect(g.ledger.some((l) => l.kind === 'sale' && l.horseId === h.id)).toBe(true);
  });
});

describe('Auktionen', () => {
  it('Katalog, Gebote, Zuschlag und Abschluss', () => {
    const g = newGame(9, { aiStables: 8, horsesPerStable: 20 });
    const a = createCatalogue(g, 'yearling', g.season);
    expect(a.lots.length).toBe(80);
    expect(a.lots.every((l) => g.horses[l.horseId]!.foalYear === g.season - 1)).toBe(true);
    a.status = 'live';
    // Ein Los, für das die KI wenig bietet
    const cheap = a.lots.find((l) => l.aiMax.length === 0)!;
    const r = bid(g, cheap.id);
    expect(r.status).toBe('sold');
    expect(g.horses[cheap.horseId]!.stableId).toBe('player');
    const contested = a.lots.find((l) => l.status === 'pending' && l.aiMax.length >= 1 && l.aiMax[0]!.max > l.reserve * 2)!;
    expect(pass(g, contested.id).status).toBe('sold');
    expect(g.stables[g.horses[contested.horseId]!.stableId]!.kind).toBe('ai');
    const auto = a.lots.find((l) => l.status === 'pending')!;
    setAutoBid(g, auto.id, 5_000_000);
    finishAuction(g, a.id);
    expect(a.status).toBe('done');
    expect(a.lots.every((l) => l.status !== 'pending')).toBe(true);
    expect(auto.buyerId).toBe('player');
  });
});

describe('Claiming', () => {
  it('Claim in der Rennwoche, Besitzerwechsel nach dem Rennen', () => {
    const g = newGame(4, { aiStables: 10, horsesPerStable: 30 });
    let race = undefined as GameState['races'][string] | undefined;
    for (let i = 0; i < 20 && !race; i++) {
      race = Object.values(g.races).find((r) => r.status === 'closed' && r.weekIndex === g.weekIndex && g.templates[r.templateId]!.claimPrice !== null);
      if (!race) advanceWeek(g);
    }
    expect(race).toBeDefined();
    const target = race!.runners!.find((x) => x.stableId !== 'player')!;
    expect(toggleClaim(g, race!.id, target.horseId)).toBe(true);
    advanceWeek(g);
    const h = g.horses[target.horseId]!;
    const run = Object.values(g.runs).find((r) => r.raceId === race!.id && r.horseId === h.id)!;
    expect(run.claimedBy).toBeDefined();
    if (run.claimedBy === 'player') expect(h.stableId).toBe('player');
  });
});

describe('Spielstände', () => {
  it('bleibt deterministisch mit Wirtschaft und Markt', () => {
    const a = newGame(31);
    const b = newGame(31);
    for (let i = 0; i < 10; i++) {
      advanceWeek(a);
      advanceWeek(b);
    }
    const sig = (g: GameState) =>
      Object.values(g.stables)
        .map((s) => `${s.id}:${Math.round(s.balance)}`)
        .join('|') + Object.values(g.horses).map((h) => h.stableId).join(',');
    expect(sig(a)).toBe(sig(b));
  });

  it('Spieler kann Pferde direkt übertragen (Zwangsverkauf-Pfad)', () => {
    const g = newGame();
    const h = own(g)[0]!;
    const ai = Object.values(g.stables).find((s) => s.kind === 'ai')!;
    transferHorse(g, h.id, ai.id, 10000, 'forced_sale');
    expect(h.stableId).toBe(ai.id);
    expect(g.finance.horses[h.id]!.toWeekIndex).toBe(g.weekIndex);
  });
});
