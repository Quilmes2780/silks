import type { ReplayView } from '../../engine/game/queries';
import type { RaceEventType } from '../../engine/types';
import { lengthsLabel, raceTime } from '../../engine/game/format';

/**
 * Rennkommentar aus den Replay-Daten: eine Liste von Zeilen mit Zeitpunkt. Die Rennansicht zeigt jeweils
 * die bis zum aktuellen Zeitpunkt fälligen Zeilen. Rein deterministisch, kein Zufall.
 */

export interface CommentLine {
  t: number;
  text: string;
  /** betrifft ein eigenes Pferd */
  mine?: boolean;
  /** Zielfoto oder Sieg */
  big?: boolean;
}

const EVENT_TEXT: Partial<Record<RaceEventType, (n: string) => string>> = {
  slow_start: (n) => `${n} kommt schlecht aus der Box.`,
  stumbled: (n) => `${n} stolpert!`,
  pulled_hard: (n) => `${n} zieht stark, der Jockey hält dagegen.`,
  boxed_in: (n) => `${n} ist eingeschlossen und findet keine Lücke.`,
  hampered: (n) => `${n} wird behindert.`,
  wide: (n) => `${n} muss weit außen laufen.`,
  faded: (n) => `${n} kann das Tempo nicht mehr halten.`,
  finished_fast: (n) => `${n} kommt mit großem Speed von hinten!`,
};

/** Abstand-Bezeichnung in Worten (Kopf, Hals, Längen). */
export function marginWords(l: number): string {
  const s = lengthsLabel(l);
  switch (s) {
    case 'nse':
      return 'eine Nase';
    case 'shd':
      return 'einen kurzen Kopf';
    case 'hd':
      return 'einen Kopf';
    case 'nk':
      return 'einen Hals';
    case 'dist':
      return 'eine Distanz';
    default:
      return `${s} ${s === '1' ? 'Länge' : 'Längen'}`;
  }
}

export function buildCommentary(data: ReplayView): CommentLine[] {
  const lines: CommentLine[] = [];
  const n = data.runners.length;
  const D = data.distanceM;
  const name = (i: number) => data.runners[i]!.name;
  const mine = (i: number) => data.runners[i]!.isPlayer;
  const orderAt = (f: ReplayView['frames'][number]) => [...Array(n).keys()].sort((a, b) => f.dist[b]! - f.dist[a]!);

  lines.push({ t: 0, text: `Und sie sind gestartet! ${n} Pferde über ${Math.round(D)} m.` });

  // Rennereignisse zum Zeitpunkt, an dem das Pferd die Stelle erreicht
  const pending = data.runners.flatMap((r, i) => r.events.filter((e) => EVENT_TEXT[e.type]).map((e) => ({ i, e })));
  for (const { i, e } of pending) {
    const f = data.frames.find((fr) => fr.dist[i]! >= Math.max(e.atM, 20));
    if (f) lines.push({ t: f.t, text: EVENT_TEXT[e.type]!(name(i)), mine: mine(i) });
  }

  // Führungswechsel (nur wenn die neue Führung mindestens 2 s hält) und Wegmarken
  let leader = -1;
  let candidate = -1;
  let candidateT = 0;
  let lastLeaderLine = -99;
  const marks = [
    { at: D / 2, done: false, text: (o: number[]) => `Halbzeit: ${name(o[0]!)} führt vor ${name(o[1]!)}${o[2] !== undefined ? ` und ${name(o[2])}` : ''}.` },
    { at: D - 400, done: false, text: (o: number[]) => `Noch 400 Meter – ${name(o[0]!)} vorn, ${name(o[1]!)} dahinter. Die Jockeys greifen an!` },
    { at: D - 200, done: false, text: (o: number[]) => `Die letzten 200 Meter! ${name(o[0]!)} vor ${name(o[1]!)}.` },
  ].filter((m) => m.at > 50);
  let playerNoted = false;
  for (const f of data.frames) {
    const o = orderAt(f);
    const lead = o[0]!;
    const leadDist = f.dist[lead]!;
    if (leadDist >= D) break;
    if (lead !== leader) {
      if (lead !== candidate) {
        candidate = lead;
        candidateT = f.t;
      } else if (f.t - candidateT >= 2 && f.t > 4) {
        if (leader >= 0 && f.t - lastLeaderLine > 5) {
          lines.push({ t: f.t, text: `${name(lead)} übernimmt die Führung!`, mine: mine(lead) });
          lastLeaderLine = f.t;
        }
        leader = lead;
      }
    } else candidate = -1;
    if (leader < 0 && f.t > 4) {
      leader = lead;
      lines.push({ t: f.t, text: `${name(lead)} geht an die Spitze.`, mine: mine(lead) });
      lastLeaderLine = f.t;
    }
    for (const m of marks) {
      if (!m.done && leadDist >= m.at) {
        m.done = true;
        lines.push({ t: f.t, text: m.text(o) });
        // eigenes Pferd 400 m vor dem Ziel einordnen
        if (m.at === D - 400 && !playerNoted) {
          playerNoted = true;
          for (const i of o) if (mine(i) && i !== o[0] && i !== o[1]) lines.push({ t: f.t + 0.01, text: `${name(i)} liegt an Position ${o.indexOf(i) + 1}.`, mine: true });
        }
      }
    }
  }

  // Ziel
  const winnerIdx = data.runners.findIndex((r) => r.position === 1);
  const secondIdx = data.runners.findIndex((r) => r.position === 2);
  const finishFrame = data.frames.find((f) => f.dist.some((d) => d >= D)) ?? data.frames.at(-1)!;
  if (winnerIdx >= 0) {
    const margin = secondIdx >= 0 ? data.runners[secondIdx]!.beatenL : 0;
    if (secondIdx >= 0 && margin < 0.3) lines.push({ t: finishFrame.t, text: `Zielfoto! ${name(winnerIdx)} und ${name(secondIdx)} gemeinsam über die Linie …`, big: true });
    const winText =
      secondIdx >= 0 ? `${name(winnerIdx)} gewinnt mit ${marginWords(margin)} vor ${name(secondIdx)}! Siegerzeit ${raceTime(finishFrame.t)}` : `${name(winnerIdx)} gewinnt! Siegerzeit ${raceTime(finishFrame.t)}`;
    lines.push({ t: finishFrame.t + (margin < 0.3 ? 1.5 : 0), text: winText, big: true, mine: mine(winnerIdx) });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/** Zielfoto: Abstand der ersten drei hinter dem Sieger (in Längen) in dem Moment, in dem er die Linie kreuzt. */
export function photoFinish(data: ReplayView): Array<{ idx: number; behindL: number }> | null {
  const second = data.runners.find((r) => r.position === 2);
  if (!second || second.beatenL >= 0.3) return null;
  return data.runners
    .map((r, idx) => ({ idx, pos: r.position, behindL: r.beatenL }))
    .filter((x) => x.pos <= 3)
    .sort((a, b) => a.pos - b.pos)
    .map(({ idx, behindL }) => ({ idx, behindL }));
}
