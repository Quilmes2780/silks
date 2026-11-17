import { Rng } from '../rng';
import type {
  Attributes,
  Going,
  Preferences,
  RaceEvent,
  RaceEventType,
  RunStyle,
  Sectional,
  Surface,
  Tactic,
  Track,
} from '../types';
import { buildCourse, curvatureAt, type Course } from './geometry';
import { deriveParams, PHYS } from './physics';

/**
 * Rennsimulation in Zeitschritten von 0,1 s.
 * Jedes Pferd hat Position (m), Bahnspur (m von der Innenkante), Tempo (m/s) und Energievorrat.
 * Deterministisch: gleicher Seed + gleiche Eingaben = gleiches Ergebnis.
 */

export const DT = 0.1;
export const HORSE_LEN = 2.4; // m, entspricht einer Länge
export const LANE_W = 1.1; // m Breite einer Spur
export const FRAME_DT = 0.25;

export interface SimJockey {
  tactics: number;
  pace: number;
  finishing: number;
}

export interface SimRunner {
  horseId: string;
  attrs: Attributes;
  prefs: Preferences;
  fitness: number;
  freshness: number;
  weightLb: number;
  /** 1-basiert, 1 = innen */
  stall: number;
  tactic: Tactic;
  jockey: SimJockey;
}

export interface SimInput {
  seed: number;
  distanceM: number;
  track: Track;
  surface: Surface;
  going: Going;
  /** 0 = berechenbar … 1 = sehr zufällig */
  randomness: number;
  runners: SimRunner[];
  /** Positionen für die Rennansicht mitschreiben */
  record?: boolean;
}

export interface SimRunnerResult {
  horseId: string;
  position: number;
  timeS: number;
  beatenL: number;
  marginL: number;
  topSpeed: number;
  distanceRunM: number;
  sectionals: Sectional[];
  speedCurve: number[];
  events: RaceEvent[];
  dayForm: number;
}

export interface SimFrame {
  t: number;
  pos: number[];
  lane: number[];
}

export interface SimOutput {
  results: SimRunnerResult[];
  /** Indizes der Läufer in Zielreihenfolge */
  order: number[];
  course: Course;
  frames: SimFrame[] | null;
}

const DESIRED_RANK: Record<RunStyle, number> = {
  front: 0,
  prominent: 0.2,
  midfield: 0.5,
  held_up: 0.85,
};

const ATTACK_M = { early: 600, normal: 400, late: 250 } as const;

/** Messpunkte für Sectionals: alle 200 m, rückwärts vom Ziel gezählt. */
export function sectionalMarks(distanceM: number): number[] {
  const marks: number[] = [];
  for (let m = distanceM; m > 0.5; m -= 200) marks.push(Math.round(m * 10) / 10);
  marks.reverse();
  return marks;
}

interface HState {
  pos: number;
  lane: number;
  laneTarget: number;
  v: number;
  w: number;
  k: number;
  kickReleased: boolean;
  startDelay: number;
  finished: boolean;
  finishT: number;
  finishV: number;
  topSpeed: number;
  distRun: number;
  blockedS: number;
  blockedFinalS: number;
  pullUntil: number;
  pullFrom: number;
  hamperAt: number;
  easedAt: number;
  markT: number[];
  markV: number[];
  nextMark: number;
  curve: number[];
  nextCurve: number;
  bendLaneSum: number;
  bendSamples: number;
  fought: boolean;
  events: RaceEvent[];
}

export function simulateRace(input: SimInput): SimOutput {
  const { distanceM: D, track, randomness: rnd } = input;
  const rng = new Rng(input.seed);
  const course = buildCourse(track, D);
  const n = input.runners.length;
  const marks = sectionalMarks(D);
  const tight = track.bends === 'tight' ? 1 : 0;

  // ---- Vorbereitung je Pferd ----
  const params = input.runners.map((r, i) => {
    const hr = rng.fork('horse', i, r.horseId);
    const cons = r.attrs.consistency / 100;
    const temp = r.attrs.temperament / 100;
    const sigma = rnd * PHYS.dayFormSigma * (1.3 - cons);
    const dayForm = hr.normal(0, sigma);
    const p = deriveParams(r.attrs, r.prefs, {
      dayForm,
      fitness: r.fitness,
      freshness: r.freshness,
      weightLb: r.weightLb,
      going: input.going,
      distanceM: D,
      track,
    });
    const style: RunStyle = r.tactic.position === 'natural' ? r.prefs.runStyle : r.tactic.position;
    // Abweichung vom Wunschstil kostet etwas Effizienz
    const styleMismatch = style === r.prefs.runStyle ? 0 : 1;
    const planErr = hr.normal(0, rnd * 0.07 * (1.15 - r.jockey.pace));
    const slowStart = hr.chance(rnd * (0.02 + 0.14 * (1 - temp) ** 2));
    const startDelay = 0.15 + hr.next() * 0.25 * (1.1 - temp) + (slowStart ? hr.range(0.4, 1.4) : 0);
    const pulls = hr.chance(rnd * (0.03 + 0.3 * (1 - temp) ** 2) * (0.6 + n / 25));
    const pullFrom = hr.range(0.05, 0.35) * D;
    const pullLen = hr.range(6, 16);
    const hamper = hr.chance(rnd * 0.05);
    const hamperAt = hamper ? hr.range(0.2, 0.9) * D : -1;
    const eased = hr.chance(rnd * 0.006);
    const easedAt = eased ? hr.range(0.4, 0.9) * D : -1;
    const fightBonus = (r.attrs.fight / 100 - 0.5) * 0.22;
    const lateral = 0.5 + 0.6 * (r.attrs.agility / 100) + 0.3 * r.jockey.tactics;
    const gapSense = 0.04 + 0.1 * (r.attrs.agility / 100 + r.jockey.tactics) / 2;
    const prefLane = r.tactic.path === 'rails' ? 0 : r.tactic.path === 'wide' ? 3.3 : 0.4;
    const kickEff = 0.92 + 0.12 * r.jockey.finishing;
    return {
      ...p,
      style,
      styleEff: 1 - 0.004 * styleMismatch,
      desired: DESIRED_RANK[style],
      attackM: ATTACK_M[r.tactic.attack] * (D > 2000 ? 1.25 : 1),
      planErr,
      slowStart,
      startDelay,
      pulls,
      pullFrom,
      pullLen,
      hamperAt,
      easedAt,
      fightBonus,
      lateral,
      gapSense,
      prefLane,
      kickEff,
      /** Wie gut der Jockey ungenutzte Reserven erkennt (Taktik "spät" wartet bewusst länger) */
      readFactor: (0.7 + 0.3 * r.jockey.pace) * (r.tactic.attack === 'late' ? 0.8 : r.tactic.attack === 'early' ? 1.1 : 1),
      dayForm,
      rng: hr,
    };
  });

  const st: HState[] = input.runners.map((r, i) => {
    const p = params[i]!;
    return {
      pos: 0,
      lane: (r.stall - 1) * LANE_W * 0.95,
      laneTarget: (r.stall - 1) * LANE_W * 0.95,
      v: 0,
      w: p.w0 * p.styleEff,
      k: p.k0 * p.kickEff,
      kickReleased: false,
      startDelay: p.startDelay,
      finished: false,
      finishT: 0,
      finishV: 0,
      topSpeed: 0,
      distRun: 0,
      blockedS: 0,
      blockedFinalS: 0,
      pullUntil: -1,
      pullFrom: p.pulls ? p.pullFrom : -1,
      hamperAt: p.hamperAt,
      easedAt: p.easedAt,
      markT: new Array<number>(marks.length).fill(NaN),
      markV: new Array<number>(marks.length).fill(0),
      nextMark: 0,
      curve: [],
      nextCurve: 50,
      bendLaneSum: 0,
      bendSamples: 0,
      fought: false,
      events: [],
    };
  });

  const addEvent = (s: HState, type: RaceEventType, atM: number) => {
    if (!s.events.some((e) => e.type === type)) s.events.push({ type, atM: Math.round(atM) });
  };
  for (let i = 0; i < n; i++) {
    if (params[i]!.slowStart) addEvent(st[i]!, 'slow_start', 0);
  }

  const frames: SimFrame[] | null = input.record ? [] : null;
  let nextFrameT = 0;
  let t = 0;
  const maxT = D / 8 + 60;
  let finishedCount = 0;
  let rankAtHalf: number[] | null = null;
  let rankAt400: number[] | null = null;

  const prevPos = new Float64Array(n);
  const prevLane = new Float64Array(n);
  const prevV = new Float64Array(n);
  const order = Array.from({ length: n }, (_, i) => i);
  const rankOf = new Int32Array(n);

  while (finishedCount < n && t < maxT) {
    for (let i = 0; i < n; i++) {
      prevPos[i] = st[i]!.pos;
      prevLane[i] = st[i]!.lane;
      prevV[i] = st[i]!.v;
    }
    // Ränge nach aktueller Position
    insertionSortDesc(order, prevPos);
    for (let r = 0; r < n; r++) rankOf[order[r]!] = r;
    const leaderPos = prevPos[order[0]!]!;
    if (!rankAtHalf && leaderPos >= D / 2) rankAtHalf = [...rankOf];
    if (!rankAt400 && leaderPos >= D - 400) rankAt400 = [...rankOf];

    if (frames && t >= nextFrameT - 1e-9) {
      frames.push({
        t: Math.round(t * 100) / 100,
        pos: Array.from(prevPos, (x) => Math.round(Math.min(x, D + 30) * 10) / 10),
        lane: Array.from(prevLane, (x) => Math.round(x * 100) / 100),
      });
      nextFrameT += FRAME_DT;
    }

    for (let i = 0; i < n; i++) {
      const s = st[i]!;
      const p = params[i]!;
      if (s.finished) {
        // nach dem Ziel auslaufen lassen (nur für die Darstellung)
        s.v = Math.max(8, s.v - 0.8 * DT);
        s.pos += s.v * DT;
        continue;
      }
      if (t < s.startDelay) continue;

      const x = prevPos[i]!;
      const R = D - x;
      const kappa = curvatureAt(course, x);
      const onBend = kappa > 0;

      // ---- Endkampf: Speedreserve freigeben ----
      // Angriff zum geplanten Punkt – oder früher, wenn der Vorrat bis ins Ziel für Spitzentempo reicht
      const sprintHomeNeed = ((p.vTop - p.cs) / p.vTop) * R;
      if (!s.kickReleased && (R <= p.attackM || (s.w + s.k) * p.readFactor >= sprintHomeNeed)) {
        s.kickReleased = true;
        s.w += s.k;
        s.k = 0;
      }

      // ---- Geplantes Tempo nach Energiehaushalt ----
      let vT: number;
      if (s.kickReleased) {
        const wPlan = Math.max(0, s.w) * (1 + p.planErr * 0.5);
        vT = R > wPlan + 1 ? p.cs / (1 - wPlan / R) : p.vTop;
      } else {
        // Bis zum Angriffspunkt nur so viel verbrauchen, dass das Finale im Spitzentempo möglich bleibt
        const A = Math.min(p.attackM, R);
        const finalNeed = ((p.vTop - p.cs) / p.vTop) * A;
        const wPre = Math.max(0, s.w - Math.max(0, finalNeed - s.k)) * (1 + p.planErr);
        const Rp = R - A;
        vT = Rp > wPre + 1 ? p.cs / (1 - wPre / Rp) : p.vTop;
      }

      // Laufposition (nur vor dem Endkampf)
      if (!s.kickReleased && n > 1) {
        const rankFrac = rankOf[i]! / (n - 1);
        const settle = x < 150 ? 2.0 : 1.0;
        const adj = Math.max(-0.015, Math.min(0.03, (rankFrac - p.desired) * 0.09 * settle));
        vT *= 1 + adj;
      }
      // Zerren
      if (s.pullFrom >= 0 && x >= s.pullFrom && s.pullUntil < 0) {
        s.pullUntil = t + p.pullLen;
        addEvent(s, 'pulled_hard', x);
      }
      const pulling = s.pullUntil > 0 && t < s.pullUntil;
      if (pulling) vT *= 1.035;

      // Ermüdung
      if (s.w <= 0) vT = Math.min(vT, p.cs * (1 - Math.min(0.06, -s.w / 400)));
      vT = Math.min(vT, p.vTop);
      if (onBend) vT = Math.min(vT, p.vTop * p.bendFactor);
      if (track.uphillFinish && R < 400) vT *= 0.992;

      // Kampfgeist im Kopf-an-Kopf-Duell
      if (R < 300 && s.kickReleased) {
        for (let j = 0; j < n; j++) {
          if (j === i || st[j]!.finished) continue;
          if (Math.abs(prevPos[j]! - x) < 1.5 && Math.abs(prevLane[j]! - prevLane[i]!) < 2.5) {
            vT += p.fightBonus;
            if (!s.fought) {
              s.fought = true;
              addEvent(s, 'duel', x);
            }
            break;
          }
        }
      }
      // Zwischenfälle
      if (s.hamperAt >= 0 && x >= s.hamperAt) {
        s.v = Math.max(5, s.v - 2.2);
        s.hamperAt = -1;
        addEvent(s, 'hampered', x);
      }
      if (s.easedAt >= 0 && x >= s.easedAt) {
        vT = Math.min(vT, p.cs * 0.85);
        addEvent(s, 'eased', x);
      }

      // ---- Verkehr ----
      let blocker = -1;
      let blockGap = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = prevPos[j]! - x;
        if (dx > 0 && dx < HORSE_LEN + 0.6 && Math.abs(prevLane[j]! - prevLane[i]!) < LANE_W * 0.9) {
          if (dx < blockGap) {
            blockGap = dx;
            blocker = j;
          }
        }
      }
      if (blocker >= 0 && vT > prevV[blocker]! + 0.05) {
        const vb = prevV[blocker]! + (blockGap > HORSE_LEN ? 0.3 : 0);
        vT = Math.min(vT, vb);
        s.blockedS += DT;
        if (R < 600) s.blockedFinalS += DT;
        if (R < 600 && s.blockedFinalS > 1.5) addEvent(s, 'boxed_in', x);
        // Lücke suchen
        if (p.rng.chance(p.gapSense) && Math.abs(s.laneTarget - s.lane) < 0.2) {
          const out = prevLane[i]! + LANE_W * 1.05;
          const inn = prevLane[i]! - LANE_W * 1.05;
          if (laneFree(i, x, prevPos, prevLane, n, out)) s.laneTarget = out;
          else if (laneFree(i, x, prevPos, prevLane, n, inn)) s.laneTarget = inn;
        }
      } else if (Math.abs(s.laneTarget - s.lane) < 0.2) {
        // Richtung Wunschspur driften, wenn frei (in Bögen stärker zur Innenkante)
        const want = onBend || R > 500 ? p.prefLane : Math.max(p.prefLane, s.lane);
        if (s.lane > want + 0.3) {
          const inner = Math.max(want, s.lane - LANE_W * 0.5);
          if (laneFree(i, x, prevPos, prevLane, n, inner)) s.laneTarget = inner;
        } else if (s.lane < want - 0.3 && laneFree(i, x, prevPos, prevLane, n, s.lane + LANE_W * 0.5)) {
          s.laneTarget = s.lane + LANE_W * 0.5;
        }
      }

      // ---- Seitwärtsbewegung ----
      const dl = s.laneTarget - s.lane;
      if (Math.abs(dl) > 1e-3) {
        const step = Math.sign(dl) * Math.min(Math.abs(dl), p.lateral * DT);
        s.lane = Math.max(0, s.lane + step);
      }

      // ---- Beschleunigung ----
      const dv = vT - s.v;
      let acc: number;
      if (s.v < 0.8 * p.vTop && x < 300) acc = p.aStart * Math.max(0.15, 1 - s.v / p.vTop);
      else acc = p.aRace;
      if (dv > 0) s.v += Math.min(dv, acc * DT);
      else s.v += Math.max(dv, -1.5 * DT);
      s.v = Math.max(0, s.v);

      // ---- Energie ----
      let mult = pulling ? 1.6 : 1;
      // Windschatten: knapp hinter einem anderen Pferd
      if (blockGap < 4 || (blocker < 0 && hasCover(i, x, prevPos, prevLane, n))) mult *= 0.96;
      if (s.v > p.cs) s.w -= (s.v - p.cs) * DT * mult;
      else if (s.w < p.w0) s.w = Math.min(p.w0, s.w + 0.15 * (p.cs - s.v) * DT);

      // ---- Fortschritt (Außenspur kostet Meter im Bogen) ----
      const ground = s.v * DT;
      const progress = ground / (1 + s.lane * kappa);
      s.pos = x + progress;
      s.distRun += ground;
      if (s.v > s.topSpeed) s.topSpeed = s.v;
      if (onBend) {
        s.bendLaneSum += s.lane;
        s.bendSamples++;
      }

      // Messpunkte
      while (s.nextMark < marks.length && s.pos >= marks[s.nextMark]!) {
        const m = marks[s.nextMark]!;
        const frac = progress > 0 ? (m - x) / progress : 0;
        s.markT[s.nextMark] = t + frac * DT;
        s.markV[s.nextMark] = s.v;
        s.nextMark++;
      }
      while (s.nextCurve <= D && s.pos >= s.nextCurve) {
        s.curve.push(Math.round(s.v * 100) / 100);
        s.nextCurve += 50;
      }
      if (s.pos >= D) {
        const frac = progress > 0 ? (D - x) / progress : 0;
        s.finished = true;
        s.finishT = t + frac * DT;
        s.finishV = s.v;
        finishedCount++;
      }
    }
    t += DT;
  }

  // Nicht angekommene (sollte nicht passieren) hinten einsortieren
  for (const s of st) {
    if (!s.finished) {
      s.finished = true;
      s.finishT = t + (D - s.pos) / Math.max(1, s.v);
      s.finishV = s.v;
    }
  }
  if (frames) {
    // Schlussbild
    frames.push({
      t: Math.round(t * 100) / 100,
      pos: st.map((s) => Math.round(Math.min(s.pos, D + 30) * 10) / 10),
      lane: st.map((s) => Math.round(s.lane * 100) / 100),
    });
  }

  // ---- Auswertung ----
  const finishOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => st[a]!.finishT - st[b]!.finishT);
  const winner = st[finishOrder[0]!]!;
  const beaten = new Array<number>(n).fill(0);
  finishOrder.forEach((idx) => {
    const s = st[idx]!;
    beaten[idx] = ((s.finishT - winner.finishT) * Math.max(10, s.finishV)) / HORSE_LEN;
  });

  // Sectionals: Position und Abstand an jedem Messpunkt
  const sectionals: Sectional[][] = st.map(() => []);
  marks.forEach((m, k) => {
    const crossing = Array.from({ length: n }, (_, i) => i)
      .filter((i) => Number.isFinite(st[i]!.markT[k]))
      .sort((a, b) => st[a]!.markT[k]! - st[b]!.markT[k]!);
    const leadT = crossing.length ? st[crossing[0]!]!.markT[k]! : 0;
    crossing.forEach((i, r) => {
      const s = st[i]!;
      const cum = s.markT[k]!;
      const prev = k === 0 ? 0 : s.markT[k - 1]!;
      sectionals[i]!.push({
        atM: m,
        splitS: round3(cum - prev),
        cumS: round3(cum),
        position: r + 1,
        gapL: round2(((cum - leadT) * Math.max(10, s.markV[k]!)) / HORSE_LEN),
      });
    });
  });

  // Ereignisse aus dem Verlauf
  finishOrder.forEach((idx, place) => {
    const s = st[idx]!;
    if (rankAtHalf && rankAtHalf[idx] === 0) addEvent(s, 'led', D / 2);
    if (rankAt400) {
      const r400 = rankAt400[idx]!;
      if (r400 <= 2 && place >= r400 + 4) addEvent(s, 'faded', D - 400);
      if (place + 4 <= r400) addEvent(s, 'finished_fast', D - 400);
    }
    if (s.bendSamples > 0 && s.bendLaneSum / s.bendSamples > 3.2) addEvent(s, 'wide', 0);
  });

  const results: SimRunnerResult[] = st.map((s, i) => {
    const place = finishOrder.indexOf(i);
    const prevIdx = place > 0 ? finishOrder[place - 1]! : -1;
    return {
      horseId: input.runners[i]!.horseId,
      position: place + 1,
      timeS: round3(s.finishT),
      beatenL: round2(beaten[i]!),
      marginL: round2(prevIdx >= 0 ? beaten[i]! - beaten[prevIdx]! : 0),
      topSpeed: round2(s.topSpeed),
      distanceRunM: Math.round(s.distRun * 10) / 10,
      sectionals: sectionals[i]!,
      speedCurve: s.curve,
      events: s.events.sort((a, b) => a.atM - b.atM),
      dayForm: params[i]!.dayForm,
    };
  });

  return { results, order: finishOrder, course, frames };
}

function laneFree(i: number, x: number, pos: Float64Array, lane: Float64Array, n: number, target: number): boolean {
  if (target < 0) return false;
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    if (Math.abs(pos[j]! - x) < HORSE_LEN * 1.05 && Math.abs(lane[j]! - target) < LANE_W * 0.9) return false;
  }
  return true;
}

function insertionSortDesc(order: number[], key: Float64Array): void {
  for (let a = 1; a < order.length; a++) {
    const v = order[a]!;
    const kv = key[v]!;
    let b = a - 1;
    while (b >= 0 && key[order[b]!]! < kv) {
      order[b + 1] = order[b]!;
      b--;
    }
    order[b + 1] = v;
  }
}

function hasCover(i: number, x: number, pos: Float64Array, lane: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const dx = pos[j]! - x;
    if (dx > 0.5 && dx < 4.5 && Math.abs(lane[j]! - lane[i]!) < 1.6) return true;
  }
  return false;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
