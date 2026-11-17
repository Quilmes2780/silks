import type { StaffRole } from '../types';
import { canAfford, FACILITY_INFO, type FacilityKey, MAX_BOXES } from '../economy/finance';
import {
  acceptThreshold,
  type ContractOffer,
  ensureHeadTrainer,
  releaseStaff,
  ROLE_LABEL,
  salaryDemand,
  severance,
  signContract,
} from '../staff/staff';
import { addInbox, addLedger, formatMoney, type GameState, staffOfStable } from './state';
import { GameError } from './commands';

/**
 * Personal- und Anlagenbefehle des Spielers. Zusagen und Absagen sind deterministisch:
 * Ein Angebot ab der Schwelle wird angenommen (die Forderung ist bekannt, die Schwelle hängt
 * von Ruf und Moral ab).
 */

export interface HireResult {
  accepted: boolean;
  message: string;
}

const MAX_PER_ROLE: Partial<Record<StaffRole, number>> = { head_trainer: 1, jockey: 2, analyst: 2, agent: 2, vet: 2, farrier: 2 };

function validateOffer(o: ContractOffer): void {
  if (!(o.weeklySalary > 0)) throw new GameError('Ungültiges Gehalt.');
  if (!(o.years >= 1 && o.years <= 5)) throw new GameError('Laufzeit 1 bis 5 Jahre.');
  if (o.prizeShare !== undefined && (o.prizeShare < 0 || o.prizeShare > 0.15)) throw new GameError('Erfolgsbeteiligung 0 bis 15 %.');
}

/** Wert einer höheren Erfolgsbeteiligung: je Prozentpunkt über 10 % zählt 3 % der Forderung. */
function shareBonus(g: GameState, role: StaffRole, share: number | undefined): number {
  if (share === undefined || (role !== 'head_trainer' && role !== 'jockey')) return 0;
  return (share - 0.1) * 100 * 0.03;
}

export function hireStaff(g: GameState, staffId: string, offer: ContractOffer): HireResult {
  validateOffer(offer);
  const s = g.staff[staffId];
  if (!s) throw new GameError('Person nicht gefunden.');
  if (s.contract) throw new GameError(`${s.name} ist vertraglich gebunden.`);
  if ((s.blockedUntilWeekIndex ?? 0) > g.weekIndex) {
    throw new GameError(s.blockedUntilWeekIndex! >= 1e9 ? `${s.name} ist im Ruhestand.` : `${s.name} möchte vorerst nicht mit dir verhandeln.`);
  }
  const player = g.playerStableId;
  const max = MAX_PER_ROLE[s.role];
  const have = staffOfStable(g, player, s.role).length;
  if (max !== undefined && s.role !== 'head_trainer' && have >= max) throw new GameError(`Höchstens ${max} ${ROLE_LABEL[s.role]} gleichzeitig.`);
  if (!canAfford(g, player, offer.weeklySalary * 4)) throw new GameError('Das übersteigt deinen Kreditrahmen.');
  const threshold = acceptThreshold(g, s, player) * (1 - shareBonus(g, s.role, offer.prizeShare));
  if (offer.weeklySalary < threshold) {
    if (offer.weeklySalary < threshold * 0.8) s.blockedUntilWeekIndex = g.weekIndex + 4;
    return {
      accepted: false,
      message:
        offer.weeklySalary < threshold * 0.8
          ? `${s.name} fühlt sich unterbewertet und bricht die Gespräche für vier Wochen ab.`
          : `${s.name} lehnt ab – das Angebot reicht nicht.`,
    };
  }
  if (s.role === 'head_trainer') {
    const old = g.staff[g.stables[player]!.trainerId];
    if (old && old.contract?.stableId === player) fire(g, old.id, true);
    g.stables[player]!.trainerId = s.id;
  }
  signContract(g, s, player, offer);
  s.morale = Math.min(90, 60 + (offer.weeklySalary / salaryDemand(s) - 1) * 60);
  addInbox(g, { kind: 'staff', title: `Neu im Team: ${s.name}`, body: `${ROLE_LABEL[s.role]} ${s.name} unterschreibt bis Saisonende ${s.contract!.endSeason} für ${formatMoney(offer.weeklySalary)} pro Woche.`, staffId: s.id });
  return { accepted: true, message: `${s.name} sagt zu.` };
}

/** Vertrag verlängern oder Gehalt erhöhen (hält auch abwanderungswillige Mitarbeiter). */
export function offerContract(g: GameState, staffId: string, offer: ContractOffer): HireResult {
  validateOffer(offer);
  const s = g.staff[staffId];
  if (!s || s.contract?.stableId !== g.playerStableId) throw new GameError('Die Person gehört nicht zu deinem Team.');
  const old = s.contract.weeklySalary;
  const threshold = acceptThreshold(g, s, g.playerStableId) * (1 - shareBonus(g, s.role, offer.prizeShare));
  const poached = s.leaving?.reason === 'poached' || s.leaving?.reason === 'resign';
  const keeps = poached ? offer.weeklySalary >= Math.min(old * 1.15, salaryDemand(s)) || offer.weeklySalary >= threshold * 1.05 : offer.weeklySalary >= threshold;
  if (!keeps) {
    return { accepted: false, message: poached ? `${s.name} bleibt bei der Entscheidung zu gehen.` : `${s.name} lehnt ab – mindestens ${formatMoney(Math.ceil(threshold / 10) * 10)} pro Woche.` };
  }
  signContract(g, s, g.playerStableId, offer);
  s.morale = Math.min(95, s.morale + Math.max(3, (offer.weeklySalary / old - 1) * 80));
  return { accepted: true, message: `${s.name} unterschreibt bis Saisonende ${s.contract!.endSeason}.` };
}

function fire(g: GameState, staffId: string, replacing = false): number {
  const s = g.staff[staffId]!;
  const pay = severance(g, s);
  if (pay > 0) addLedger(g, { amount: -pay, kind: 'salary', text: `Abfindung ${s.name}`, staffId });
  releaseStaff(g, s);
  s.blockedUntilWeekIndex = g.weekIndex + 26;
  for (const o of staffOfStable(g, g.playerStableId)) o.morale = Math.max(0, o.morale - 3);
  if (!replacing) ensureHeadTrainer(g, g.playerStableId);
  return pay;
}

export function fireStaff(g: GameState, staffId: string): { severance: number } {
  const s = g.staff[staffId];
  if (!s || s.contract?.stableId !== g.playerStableId) throw new GameError('Die Person gehört nicht zu deinem Team.');
  if (s.role === 'head_trainer') throw new GameError('Den Cheftrainer ersetzt du, indem du einen neuen Cheftrainer einstellst.');
  return { severance: fire(g, staffId) };
}

export function assignGroom(g: GameState, horseId: string, groomId: string | null): void {
  const h = g.horses[horseId];
  if (!h || h.stableId !== g.playerStableId || h.status !== 'active') throw new GameError('Das Pferd gehört nicht zu deinem Stall.');
  if (groomId !== null) {
    const s = g.staff[groomId];
    if (!s || s.role !== 'groom' || s.contract?.stableId !== g.playerStableId) throw new GameError('Kein Pfleger deines Teams.');
  }
  if (h.groomId !== groomId) h.groomBond = 0;
  h.groomId = groomId;
}

export function upgradeFacility(g: GameState, key: FacilityKey): void {
  const st = g.stables[g.playerStableId]!;
  const info = FACILITY_INFO[key];
  if (!info) throw new GameError('Unbekannter Ausbau.');
  if (key === 'boxes') {
    if (st.facilities.boxes + 4 > MAX_BOXES) throw new GameError(`Mehr als ${MAX_BOXES} Boxen sind nicht möglich.`);
  } else if (st.facilities[key]) {
    throw new GameError(`${info.label} ist bereits vorhanden.`);
  }
  if (!canAfford(g, st.id, info.cost)) throw new GameError('Das übersteigt deinen Kreditrahmen.');
  addLedger(g, { amount: -info.cost, kind: 'facility', text: `Ausbau: ${info.label}` });
  if (key === 'boxes') st.facilities.boxes += 4;
  else st.facilities[key] = true;
}
