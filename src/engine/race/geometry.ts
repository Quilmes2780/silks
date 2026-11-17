import type { Track } from '../types';

/**
 * Vereinfachte Bahngeometrie: Jede Rundbahn ist ein Oval aus zwei Geraden und zwei
 * 180°-Bögen. Sprints bis zur Länge der geraden Bahn laufen auf einer Geraden,
 * die die Zielgerade nach hinten verlängert. Reale Bahnformen (Epsom-Hufeisen,
 * Chester-Kreis) werden über Bogencharakter, Gefälle und Zielgeradenlänge angenähert.
 */

export interface Segment {
  kind: 'straight' | 'bend';
  /** Beginn ab Start (m, auf der Innenkante gemessen) */
  startM: number;
  lengthM: number;
  /** Radius der Innenkante (nur Bögen) */
  radius: number;
}

export interface Course {
  distanceM: number;
  straight: boolean;
  direction: 'left' | 'right';
  segments: Segment[];
}

export function ovalDims(track: Track): { straightM: number; bendM: number; radius: number } {
  const straightM = Math.min(track.homeStraightM, track.circuitM * 0.32);
  const bendM = Math.max(200, (track.circuitM - 2 * straightM) / 2);
  return { straightM, bendM, radius: bendM / Math.PI };
}

export function buildCourse(track: Track, distanceM: number): Course {
  if (track.straightCourseM > 0 && distanceM <= track.straightCourseM + 1) {
    return {
      distanceM,
      straight: true,
      direction: track.direction,
      segments: [{ kind: 'straight', startM: 0, lengthM: distanceM, radius: 0 }],
    };
  }
  const { straightM, bendM, radius } = ovalDims(track);
  // Rückwärts ab Ziel aufbauen: Gerade, Bogen, Gerade, Bogen, ...
  const back: Array<{ kind: 'straight' | 'bend'; len: number }> = [];
  let covered = 0;
  let k = 0;
  while (covered < distanceM) {
    const kind = k % 2 === 0 ? 'straight' : 'bend';
    const full = kind === 'straight' ? straightM : bendM;
    const len = Math.min(full, distanceM - covered);
    back.push({ kind, len });
    covered += len;
    k++;
  }
  back.reverse();
  const segments: Segment[] = [];
  let s = 0;
  for (const b of back) {
    segments.push({ kind: b.kind, startM: s, lengthM: b.len, radius: b.kind === 'bend' ? radius : 0 });
    s += b.len;
  }
  return { distanceM, straight: false, direction: track.direction, segments };
}

/** Krümmung (1/Radius) an Position x; 0 auf Geraden. */
export function curvatureAt(course: Course, x: number): number {
  for (const seg of course.segments) {
    if (x < seg.startM + seg.lengthM) return seg.kind === 'bend' ? 1 / seg.radius : 0;
  }
  return 0;
}

export interface Point {
  x: number;
  y: number;
  heading: number;
}

/**
 * Punkt auf der Bahn (Draufsicht) in Metern. Das Ziel liegt bei (0,0), die Zielgerade
 * verläuft in +x-Richtung. laneM = Abstand von der Innenkante nach außen.
 */
export function pointOnCourse(course: Course, distM: number, laneM: number): Point {
  const raw = walk(course, distM, laneM);
  const end = walk(course, course.distanceM, 0);
  // so drehen, dass die Zielrichtung +x ist, und Ziel in den Ursprung legen
  const rot = -end.heading;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const dx = raw.x - end.x;
  const dy = raw.y - end.y;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos, heading: raw.heading + rot };
}

function walk(course: Course, distM: number, laneM: number): Point {
  const turn = course.direction === 'left' ? 1 : -1; // links = gegen den Uhrzeigersinn
  let x = 0;
  let y = 0;
  let h = 0;
  let remaining = Math.max(0, Math.min(distM, course.distanceM));
  for (const seg of course.segments) {
    const len = Math.min(seg.lengthM, remaining);
    if (seg.kind === 'straight') {
      x += Math.cos(h) * len;
      y += Math.sin(h) * len;
    } else {
      const ang = len / seg.radius;
      // Mittelpunkt liegt links (bei Linkskurs) der Fahrtrichtung
      const cx = x + Math.cos(h + (turn * Math.PI) / 2) * seg.radius;
      const cy = y + Math.sin(h + (turn * Math.PI) / 2) * seg.radius;
      const a0 = h - (turn * Math.PI) / 2;
      const a1 = a0 + turn * ang;
      x = cx + Math.cos(a1) * seg.radius;
      y = cy + Math.sin(a1) * seg.radius;
      h += turn * ang;
    }
    remaining -= len;
    if (remaining <= 0) break;
  }
  // Außenversatz: rechts der Fahrtrichtung bei Linkskurs
  const ox = Math.cos(h - (turn * Math.PI) / 2) * laneM;
  const oy = Math.sin(h - (turn * Math.PI) / 2) * laneM;
  return { x: x + ox, y: y + oy, heading: h };
}

/** Polylinie eines kompletten Ovals (für die Darstellung), endet im Ziel. */
export function circuitOutline(track: Track, laneM: number, stepM = 10): Array<[number, number]> {
  const loop = buildCourse({ ...track, straightCourseM: 0 }, track.circuitM);
  const pts: Array<[number, number]> = [];
  for (let d = 0; d <= track.circuitM; d += stepM) {
    const p = pointOnCourse(loop, d, laneM);
    pts.push([p.x, p.y]);
  }
  return pts;
}
