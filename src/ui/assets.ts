import type { StaffRole, Surface } from '../engine/types';

/**
 * Bildbibliothek (Higgsfield, siehe assets/generated.json). Die Dateien liegen unter public/assets und
 * werden über die Basis-URL geladen. Fehlt ein Bild, zeigt die Oberfläche einen Platzhalter.
 */

const url = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export type Coat = 'bay' | 'chestnut' | 'black' | 'grey' | 'brown';
const COATS: readonly string[] = ['bay', 'chestnut', 'black', 'grey', 'brown'];

export function horseImage(coat: string, pose: 'profile' | 'gallop', age: 'foal' | 'adult', female = false): string {
  const c = COATS.includes(coat) ? coat : 'bay';
  // Stuten haben ein eigenes Standporträt; Fohlen und Galopp-Bilder sind neutral
  const sex = female && age === 'adult' && pose === 'profile' ? '_mare' : '';
  return url(`assets/horses/${c}_${pose}_${age}${sex}.webp`);
}

// ---- Personal: je Rolle Porträts für Männer und Frauen ----
const STAFF: Record<StaffRole, { m: string[]; f: string[] }> = {
  head_trainer: { m: ['trainer_1', 'trainer_4'], f: ['trainer_2'] },
  assistant_trainer: { m: ['assistant_m'], f: ['trainer_3'] },
  jockey: { m: ['jockey_1', 'jockey_3', 'jockey_4'], f: ['jockey_2'] },
  work_rider: { m: ['work_rider'], f: ['work_rider_f'] },
  groom: { m: ['groom_1'], f: ['groom_2'] },
  vet: { m: ['vet_m'], f: ['vet'] },
  farrier: { m: ['farrier'], f: ['farrier_f'] },
  agent: { m: ['bloodstock_agent'], f: ['agent_f'] },
  analyst: { m: ['analyst'], f: ['analyst_f'] },
  stud_manager: { m: ['stud_manager'], f: ['stud_manager_f'] },
};

/** Vornamen aus dem Namensgenerator (engine/world/names.ts); unbekannte Namen bekommen kein Porträt. */
const FEMALE = new Set(['Hollie', 'Megan', 'Saffie', 'Emily', 'Charlotte', 'Grace', 'Sophie', 'Lucy', 'Hannah', 'Alice', 'Isla', 'Niamh']);
const MALE = new Set([
  'James', 'William', 'Oliver', 'Harry', 'George', 'Thomas', 'Jack', 'Charlie', 'Daniel', 'Samuel', 'Edward', 'Joseph', 'Benjamin', 'Luke', 'Ryan',
  'Callum', 'Rory', 'Kieran', 'Declan', 'Sean', 'Liam', 'Patrick', 'Finn', 'Owen', 'Rhys', 'Ewan', 'Fraser', 'Hamish',
]);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Porträt für eine Person; gleiche ID ergibt immer dasselbe Bild. */
export function staffImage(role: StaffRole, name: string, id: string): string | null {
  const first = name.split(' ')[0] ?? '';
  const set = STAFF[role];
  if (!set) return null;
  const list = FEMALE.has(first) ? set.f : MALE.has(first) ? set.m : null;
  if (!list || list.length === 0) return null;
  return url(`assets/staff/${list[hash(id) % list.length]}.webp`);
}

// ---- Rennbahnen und Klassiker ----
const COURSES: Record<string, string> = {
  ascot: 'ascot',
  epsom: 'epsom',
  newmarket: 'newmarket',
  newmarket_july: 'newmarket',
  york: 'york',
  goodwood: 'goodwood',
  doncaster: 'doncaster',
  sandown: 'sandown',
  newbury: 'newbury',
};

export function courseImage(trackId: string, surface: Surface): string {
  const k = COURSES[trackId] ?? (surface === 'aw' ? 'allweather' : 'generic');
  return url(`assets/courses/${k}.webp`);
}

const CLASSICS: Array<[RegExp, string]> = [
  [/^2000 Guineas$/, '2000_guineas'],
  [/^1000 Guineas$/, '1000_guineas'],
  [/^The Derby$/, 'derby'],
  [/^The Oaks$/, 'oaks'],
  [/^St Leger$/, 'st_leger'],
  [/^King George VI and Queen Elizabeth Stakes$/, 'king_george'],
];

/** Plakat für die großen Klassiker (Hochformat), sonst null. */
export function classicPoster(raceName: string): string | null {
  const hit = CLASSICS.find(([re]) => re.test(raceName));
  return hit ? url(`assets/posters/${hit[1]}.webp`) : null;
}

// ---- Szenen ----
export type Scene = 'yard_level_1' | 'yard_level_2' | 'yard_level_3' | 'gallops' | 'equine_pool' | 'vet_clinic' | 'stud_paddocks' | 'ui_office';

export function sceneImage(s: Scene): string {
  return url(`assets/scenes/${s}.webp`);
}

/** Hofbild nach Boxenzahl. */
export function yardScene(boxes: number): Scene {
  return boxes >= 30 ? 'yard_level_3' : boxes >= 16 ? 'yard_level_2' : 'yard_level_1';
}
