import { Rng } from '../rng';
import type { Going, RaceClass, RaceTemplate, Surface, Track } from '../types';
import type { FeatureRace, GenericRace, WorldData } from '../world/load';

/**
 * Erzeugt den Rennkalender einer Saison aus den Weltdaten:
 *  - Feature-Rennen (Group, Listed, Heritage) aus races.json in ihren Wochen
 *  - Meetings nach den Rotationsregeln, aufgefüllt mit generischen Rennen
 * Deterministisch aus Seed und Saison.
 */

export const WEEKS_PER_SEASON = 52;

export function entryDeadlineWeeks(c: RaceClass): number {
  switch (c) {
    case 'G1':
      return 3;
    case 'G2':
    case 'G3':
    case 'Heritage':
    case 'Listed':
      return 2;
    default:
      return 1;
  }
}

export function entryFee(prize: number): number {
  return Math.max(20, Math.round((prize * 0.007) / 5) * 5);
}

function maxRunnersFor(track: Track, raceClass: RaceClass, surface: Surface): number {
  let n = raceClass === 'Heritage' ? 22 : raceClass === 'G1' ? 18 : 14;
  if (surface === 'aw') n = Math.min(n, 14);
  if (track.bends === 'tight' && !track.straightCourseM) n = Math.min(n, 12);
  return n;
}

function bhaClassFor(c: RaceClass): number {
  return c === 'G1' || c === 'G2' || c === 'G3' || c === 'Listed' ? 1 : c === 'Heritage' ? 2 : 4;
}

interface Meeting {
  trackId: string;
  surface: Surface;
  day: 'sat' | 'sun';
  features: FeatureRace[];
}

export function buildSeasonCalendar(world: WorldData, season: number, seed: number): RaceTemplate[] {
  const rng = new Rng(seed).fork('calendar', season);
  const tracks = new Map(world.tracks.map((t) => [t.id, t]));
  const m = world.meetings;
  const out: RaceTemplate[] = [];
  let majorIdx = season * 3;
  let minorIdx = season * 5;
  let awIdx = season * 2;

  for (let week = 1; week <= WEEKS_PER_SEASON; week++) {
    const inSeason = week >= m.turfSeason.fromWeek && week <= m.turfSeason.toWeek;
    for (const day of ['sat', 'sun'] as const) {
      const meetings: Meeting[] = [];
      const feats = world.features.filter((f) => f.week === week && f.day === day);
      for (const f of feats) {
        const track = tracks.get(f.trackId)!;
        const surface: Surface = track.surfaces.includes('turf') ? 'turf' : 'aw';
        let meet = meetings.find((x) => x.trackId === f.trackId);
        if (!meet) {
          meet = { trackId: f.trackId, surface, day, features: [] };
          meetings.push(meet);
        }
        meet.features.push(f);
      }
      const used = new Set(meetings.map((x) => x.trackId));
      const turfCount = () => meetings.filter((x) => x.surface === 'turf').length;
      const awCount = () => meetings.filter((x) => x.surface === 'aw').length;
      const pickFrom = (list: string[], start: number): string | null => {
        for (let k = 0; k < list.length; k++) {
          const id = list[(start + k) % list.length]!;
          if (!used.has(id)) return id;
        }
        return null;
      };
      if (inSeason) {
        const wantTurf = day === 'sat' ? m.turfSaturday : m.turfSunday;
        while (turfCount() < wantTurf) {
          const useMajor = day === 'sat' && turfCount() === 0;
          const id = useMajor ? pickFrom(m.majorTurfRotation, majorIdx++) : pickFrom(m.minorTurfRotation, minorIdx++);
          if (!id) break;
          used.add(id);
          meetings.push({ trackId: id, surface: 'turf', day, features: [] });
        }
        const wantAw = day === 'sat' ? m.awSaturdayInSeason : 0;
        while (awCount() < wantAw) {
          const id = pickFrom(m.awRotation, awIdx++);
          if (!id) break;
          used.add(id);
          meetings.push({ trackId: id, surface: 'aw', day, features: [] });
        }
      } else {
        const wantAw = day === 'sat' ? m.awSaturdayWinter : m.awSundayWinter;
        while (awCount() < wantAw) {
          const id = pickFrom(m.awRotation, awIdx++);
          if (!id) break;
          used.add(id);
          meetings.push({ trackId: id, surface: 'aw', day, features: [] });
        }
      }

      for (const meet of meetings) {
        const track = tracks.get(meet.trackId)!;
        const meetingId = `${season}-${week}-${day}-${meet.trackId}`;
        let k = 0;
        for (const f of meet.features) {
          out.push(featureTemplate(f, track, meet.surface, season, meetingId, k++));
        }
        const fill = Math.max(0, m.racesPerMeeting - meet.features.length);
        const mr = rng.fork(meetingId);
        for (let i = 0; i < fill; i++) {
          const g = pickGeneric(world.generic, week, meet.surface, mr);
          if (!g) break;
          out.push(genericTemplate(g, track, meet.surface, season, week, day, meetingId, k++, mr));
        }
      }
    }
  }
  return out;
}

function featureTemplate(f: FeatureRace, track: Track, surface: Surface, season: number, meetingId: string, k: number): RaceTemplate {
  const isHcp = f.raceClass === 'Heritage' || f.raceClass === 'Handicap';
  return {
    id: `${meetingId}-${k}`,
    name: f.name,
    trackId: f.trackId,
    surface,
    week: f.week,
    day: f.day,
    raceClass: f.raceClass,
    bhaClass: bhaClassFor(f.raceClass),
    distanceM: f.distanceM,
    conditions: {
      ageMin: f.ageMin,
      ageMax: f.ageMax,
      sex: f.sex,
      orMin: isHcp ? (f.orMin ?? 0) : null,
      orMax: isHcp ? (f.orMax ?? 140) : null,
      maidenOnly: false,
      maxWins: null,
    },
    prize: f.prize,
    entryDeadlineWeeks: entryDeadlineWeeks(f.raceClass),
    entryFee: entryFee(f.prize),
    maxRunners: f.maxRunners ?? maxRunnersFor(track, f.raceClass, surface),
    feature: true,
  };
  void season;
}

function pickGeneric(generic: GenericRace[], week: number, surface: Surface, rng: Rng): GenericRace | null {
  const pool = generic.filter((g) => {
    if (g.fromWeek !== undefined && week < g.fromWeek) return false;
    if (g.toWeek !== undefined && week > g.toWeek) return false;
    // Allwetter: keine Listed-/Conditions-Rennen im Winter-Alltag, aber erlaubt
    if (surface === 'aw' && g.raceClass === 'Listed') return false;
    return true;
  });
  if (!pool.length) return null;
  return rng.weighted(pool, pool.map((g) => g.weight));
}

function genericTemplate(
  g: GenericRace,
  track: Track,
  surface: Surface,
  season: number,
  week: number,
  day: 'sat' | 'sun',
  meetingId: string,
  k: number,
  rng: Rng,
): RaceTemplate {
  const distanceM = rng.pick(g.distances);
  const isHcp = g.raceClass === 'Handicap';
  const ageLabel = g.ageMax === 2 ? ' (2yo)' : g.ageMin === 3 && g.ageMax === 3 ? ' (3yo)' : '';
  const classLabel = isHcp ? ` (Class ${g.bhaClass})` : '';
  return {
    id: `${meetingId}-${k}`,
    name: `${track.name} ${g.name}${classLabel}${g.key === 'nursery' ? '' : ageLabel}`,
    trackId: track.id,
    surface,
    week,
    day,
    raceClass: g.raceClass,
    bhaClass: g.bhaClass,
    distanceM,
    conditions: {
      ageMin: g.ageMin,
      ageMax: g.ageMax,
      sex: 'open',
      orMin: isHcp ? (g.orMin ?? 0) : null,
      orMax: isHcp ? (g.orMax ?? 140) : null,
      maidenOnly: g.maidenOnly ?? false,
      maxWins: g.maxWins ?? null,
    },
    prize: g.prize,
    entryDeadlineWeeks: entryDeadlineWeeks(g.raceClass),
    entryFee: entryFee(g.prize),
    maxRunners: maxRunnersFor(track, g.raceClass, surface),
    feature: false,
  };
  void season;
}

/** Boden eines Meetings, abhängig von der Jahreszeit. */
export function meetingGoing(seed: number, meetingId: string, surface: Surface, week: number): Going {
  const r = new Rng(seed).fork('going', meetingId);
  if (surface === 'aw') return r.chance(0.88) ? 'standard' : 'standard_to_slow';
  const mu =
    week <= 18 ? 0.35 : week <= 24 ? 0.0 : week <= 34 ? -0.3 : week <= 40 ? 0.1 : 0.45;
  const g = r.normal(mu, 0.4);
  if (g < -0.75) return 'firm';
  if (g < -0.25) return 'good_to_firm';
  if (g < 0.2) return 'good';
  if (g < 0.5) return 'good_to_soft';
  if (g < 0.85) return 'soft';
  return 'heavy';
}

export const GOING_LABEL: Record<Going, string> = {
  firm: 'Fest (Firm)',
  good_to_firm: 'Gut bis fest (Good to Firm)',
  good: 'Gut (Good)',
  good_to_soft: 'Gut bis weich (Good to Soft)',
  soft: 'Weich (Soft)',
  heavy: 'Schwer (Heavy)',
  standard: 'Standard',
  standard_to_slow: 'Standard bis langsam',
};
