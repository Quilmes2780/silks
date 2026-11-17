/** Formatierungen, die Engine und UI gemeinsam nutzen (rein, ohne DOM). */

const DAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

/** Kalenderdatum eines Renntags: Woche n = n-ter Samstag des Jahres. */
export function raceDate(season: number, week: number, day: 'sat' | 'sun' = 'sat'): { y: number; m: number; d: number; dow: number } {
  const jan1 = Date.UTC(season, 0, 1);
  const dow = new Date(jan1).getUTCDay();
  const firstSat = jan1 + ((6 - dow + 7) % 7) * 86400000;
  const t = firstSat + (week - 1) * 7 * 86400000 + (day === 'sun' ? 86400000 : 0);
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), dow: dt.getUTCDay() };
}

export function dateLabel(season: number, week: number, day: 'sat' | 'sun' = 'sat'): string {
  const r = raceDate(season, week, day);
  return `${DAYS[r.dow]} ${r.d}. ${MONTHS[r.m]} ${r.y}`;
}

export function weekLabel(season: number, week: number): string {
  const a = raceDate(season, week, 'sat');
  return `Woche ${week} · ${a.d}. ${MONTHS[a.m]} ${season}`;
}

/** Distanz in britischer Notation (z. B. 1m2f56y). */
export function furlongs(m: number): string {
  const yards = Math.round(m / 0.9144);
  const miles = Math.floor(yards / 1760);
  let rest = yards - miles * 1760;
  const f = Math.floor(rest / 220);
  rest -= f * 220;
  let s = '';
  if (miles) s += `${miles}m`;
  if (f) s += `${f}f`;
  if (rest >= 10) s += `${rest}y`;
  return s || `${yards}y`;
}

export function raceTime(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return m > 0 ? `${m}:${rest.toFixed(2).padStart(5, '0')}` : rest.toFixed(2);
}

/** Abstände wie im britischen Ergebnis: nse, shd, hd, nk, ½, ¾, 1¼ … */
export function lengthsLabel(l: number): string {
  if (l <= 0) return '';
  if (l < 0.05) return 'nse';
  if (l < 0.15) return 'shd';
  if (l < 0.3) return 'hd';
  if (l < 0.45) return 'nk';
  if (l >= 30) return 'dist';
  const whole = Math.floor(l);
  const frac = l - whole;
  const q = frac < 0.125 ? '' : frac < 0.375 ? '¼' : frac < 0.625 ? '½' : frac < 0.875 ? '¾' : '';
  const w = frac >= 0.875 ? whole + 1 : whole;
  return `${w > 0 ? w : ''}${q}` || '½';
}

export function sexLabel(sex: 'male' | 'female', gelded: boolean, age: number): string {
  if (sex === 'female') return age >= 5 ? 'Stute (m)' : 'Stute (f)';
  if (gelded) return 'Wallach (g)';
  return age >= 5 ? 'Hengst (h)' : 'Hengst (c)';
}

export const COLOUR_LABEL: Record<string, string> = {
  bay: 'Brauner',
  chestnut: 'Fuchs',
  black: 'Rappe',
  grey: 'Schimmel',
  brown: 'Dunkelbrauner',
};

export const RUNSTYLE_LABEL: Record<string, string> = {
  natural: 'natürlich',
  front: 'führen',
  prominent: 'vorne mit',
  midfield: 'Mitte',
  held_up: 'hinten',
};

export const ATTACK_LABEL: Record<string, string> = { early: 'früh', normal: 'normal', late: 'spät' };
export const PATH_LABEL: Record<string, string> = { rails: 'Rails', normal: 'normal', wide: 'außen' };

export const EVENT_LABEL: Record<string, string> = {
  slow_start: 'schlecht gestartet',
  stumbled: 'gestolpert',
  pulled_hard: 'hat gezerrt',
  boxed_in: 'eingeschlossen',
  hampered: 'behindert',
  wide: 'außen herum gelaufen',
  led: 'führte',
  faded: 'nachgelassen',
  finished_fast: 'stark im Finish',
  eased: 'aufgegeben',
  duel: 'Kopf-an-Kopf-Duell',
};

export function money(x: number): string {
  return `£${Math.round(x).toLocaleString('en-GB')}`;
}
