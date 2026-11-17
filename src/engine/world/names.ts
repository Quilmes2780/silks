import type { Rng } from '../rng';

/**
 * Namensgenerator für Pferde und Personal.
 * Pferdenamen folgen den Weatherbys-Grundregeln: max. 18 Zeichen inkl. Leerzeichen,
 * nur Buchstaben, Leerzeichen und Apostroph, keine Duplikate (case-insensitiv,
 * Leerzeichen und Satzzeichen ignoriert), keine reinen Initialen, keine Zahlen.
 */

export const MAX_HORSE_NAME_LEN = 18;

const ADJ = [
  'Silver', 'Golden', 'Royal', 'Noble', 'Gentle', 'Quiet', 'Bold', 'Brave', 'Swift', 'Lucky',
  'Distant', 'Hidden', 'Secret', 'Ancient', 'Crimson', 'Scarlet', 'Velvet', 'Midnight', 'Morning',
  'Evening', 'Wild', 'Proud', 'Grand', 'Little', 'Restless', 'Silent', 'Wandering', 'Highland',
  'Northern', 'Southern', 'Western', 'Eastern', 'Merry', 'Gallant', 'Dashing', 'Steady', 'Fair',
  'Copper', 'Amber', 'Emerald', 'Ivory', 'Misty', 'Stormy', 'Sunny', 'Frosty', 'Rustic', 'Faithful',
  'Clever', 'Dancing', 'Flying', 'Rolling', 'Rising', 'Falling', 'Shining', 'Burning', 'Final',
];

const NOUN = [
  'Arrow', 'Banner', 'Beacon', 'Bell', 'Breeze', 'Bridge', 'Castle', 'Comet', 'Crown', 'Dancer',
  'Dawn', 'Dream', 'Echo', 'Ember', 'Falcon', 'Fable', 'Flame', 'Gale', 'Guardian', 'Harbour',
  'Harvest', 'Hawk', 'Heart', 'Horizon', 'Island', 'Jester', 'Knight', 'Lantern', 'Legend', 'Meadow',
  'Melody', 'Mariner', 'Monarch', 'Orchard', 'Pilgrim', 'Piper', 'Poet', 'Prince', 'Ranger', 'Raven',
  'River', 'Rogue', 'Sailor', 'Sentinel', 'Shadow', 'Sonnet', 'Spirit', 'Star', 'Storm', 'Summit',
  'Tempest', 'Thistle', 'Thunder', 'Tide', 'Traveller', 'Valley', 'Voyager', 'Warden', 'Willow', 'Wren',
  'Spark', 'Charm', 'Rhythm', 'Verse', 'Promise', 'Quest', 'Rebel', 'Saga', 'Whisper', 'Glory',
];

const PLACE = [
  'Avalon', 'Kinsale', 'Galway', 'Tintagel', 'Brecon', 'Mendip', 'Malvern', 'Cotswold', 'Rydal',
  'Dunmore', 'Ashford', 'Kildare', 'Arundel', 'Hampton', 'Thornbury', 'Windermere', 'Lismore',
  'Ballydoyle', 'Shannon', 'Severn', 'Tweed', 'Mersey', 'Exmoor', 'Dartmoor', 'Glencoe', 'Skye',
  'Iona', 'Lundy', 'Harlech', 'Bamburgh', 'Rothbury', 'Alnwick', 'Lanark', 'Kelso', 'Melrose',
];

const TITLE = ['Sir', 'Lady', 'Lord', 'Captain', 'Major', 'Duke of', 'Queen of', 'King of', 'Master', 'Miss'];
const GIVEN = [
  'Percy', 'Archie', 'Hector', 'Barnaby', 'Rupert', 'Alfie', 'Monty', 'Freddie', 'Teddy', 'Ollie',
  'Maisie', 'Rosie', 'Hattie', 'Lottie', 'Daisy', 'Pippa', 'Tilly', 'Florence', 'Matilda', 'Agatha',
];
const SUFFIXES = ['s Run', 's Gift', 's Pride', 's Choice', 's Lad', 's Lass', 's Folly', 's Song'];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export function isValidHorseName(name: string): boolean {
  if (name.length < 2 || name.length > MAX_HORSE_NAME_LEN) return false;
  if (!/^[A-Za-z][A-Za-z' ]*[A-Za-z]$/.test(name)) return false;
  if (/\s{2,}/.test(name)) return false;
  // keine reinen Initialen wie "A B C"
  if (/^([A-Za-z]\s?)+$/.test(name) && name.replace(/\s/g, '').length <= 3) return false;
  return true;
}

export class NameRegistry {
  private used = new Set<string>();

  constructor(existing: Iterable<string> = []) {
    for (const n of existing) this.used.add(normaliseName(n));
  }

  has(name: string): boolean {
    return this.used.has(normaliseName(name));
  }

  add(name: string): void {
    this.used.add(normaliseName(name));
  }

  get size(): number {
    return this.used.size;
  }

  /** Erzeugt einen neuen, gültigen und noch unbenutzten Pferdenamen. */
  horseName(rng: Rng): string {
    for (let attempt = 0; attempt < 500; attempt++) {
      const name = candidateHorseName(rng);
      if (isValidHorseName(name) && !this.has(name)) {
        this.add(name);
        return name;
      }
    }
    // Notfall: Kombination mit Ortsnamen, bis eindeutig
    for (let attempt = 0; attempt < 10000; attempt++) {
      const name = `${rng.pick(NOUN)} ${rng.pick(PLACE)}`.slice(0, MAX_HORSE_NAME_LEN).trim();
      if (isValidHorseName(name) && !this.has(name)) {
        this.add(name);
        return name;
      }
    }
    throw new Error('Namensraum erschöpft');
  }
}

function candidateHorseName(rng: Rng): string {
  const r = rng.next();
  if (r < 0.32) return `${rng.pick(ADJ)} ${rng.pick(NOUN)}`;
  if (r < 0.44) return `${rng.pick(NOUN)} of ${rng.pick(PLACE)}`;
  if (r < 0.56) return `${rng.pick(TITLE)} ${rng.pick(GIVEN)}`;
  if (r < 0.66) return `${rng.pick(GIVEN)}'${rng.pick(SUFFIXES)}`;
  if (r < 0.76) return `${rng.pick(PLACE)} ${rng.pick(NOUN)}`;
  if (r < 0.86) return `The ${rng.pick(NOUN)}`;
  if (r < 0.94) {
    const a = rng.pick(NOUN);
    let b = rng.pick(NOUN);
    while (b === a) b = rng.pick(NOUN);
    return cap(`${a}${b.toLowerCase()}`);
  }
  return `${rng.pick(ADJ)} ${rng.pick(PLACE)}`;
}

const FIRST = [
  'James', 'William', 'Oliver', 'Harry', 'George', 'Thomas', 'Jack', 'Charlie', 'Daniel', 'Samuel',
  'Edward', 'Joseph', 'Benjamin', 'Luke', 'Ryan', 'Callum', 'Rory', 'Hollie', 'Megan', 'Saffie',
  'Emily', 'Charlotte', 'Grace', 'Sophie', 'Lucy', 'Hannah', 'Kieran', 'Declan', 'Sean', 'Liam',
  'Patrick', 'Finn', 'Owen', 'Rhys', 'Ewan', 'Fraser', 'Hamish', 'Alice', 'Isla', 'Niamh',
];
const LAST = [
  'Ashworth', 'Blackwood', 'Carrington', 'Davenport', 'Ellison', 'Fairbairn', 'Gilchrist', 'Hartley',
  'Ingram', 'Jennings', 'Kingsley', 'Langford', 'Merriweather', 'Northcote', 'Oakley', 'Pemberton',
  'Quinlan', 'Radcliffe', 'Sutcliffe', 'Thornton', 'Underwood', 'Vance', 'Whitfield', 'Yardley',
  'Ainsworth', 'Brennan', 'Calloway', 'Doherty', 'Fitzgerald', 'Gallagher', 'Hennessy', 'Kavanagh',
  'MacLeod', 'McAllister', 'Montague', 'Prendergast', 'Rutherford', 'Stanhope', 'Treharne', 'Wyndham',
];

export class PersonNameRegistry {
  private used = new Set<string>();
  constructor(existing: Iterable<string> = []) {
    for (const n of existing) this.used.add(n.toLowerCase());
  }
  personName(rng: Rng): string {
    for (let i = 0; i < 2000; i++) {
      const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
      if (!this.used.has(name.toLowerCase())) {
        this.used.add(name.toLowerCase());
        return name;
      }
    }
    const name = `${rng.pick(FIRST)} ${rng.pick(FIRST)}-${rng.pick(LAST)}`;
    this.used.add(name.toLowerCase());
    return name;
  }
}

const STABLE_A = ['Ashgrove', 'Beechwood', 'Highclere', 'Kingswood', 'Oakmere', 'Larkhill', 'Hollybank',
  'Rookwood', 'Fernhill', 'Stonehaven', 'Wolds', 'Downland', 'Meadowcroft', 'Whitcombe', 'Elmstead',
  'Foxcote', 'Greystoke', 'Harewood', 'Lambourn Vale', 'Middleham Moor', 'Throckmorton', 'Westerleigh',
  'Brackenridge', 'Cold Harbour', 'Danebury', 'Ellesmere', 'Kilnsey', 'Penrose', 'Ravensworth', 'Shelbourne'];
const STABLE_B = ['Racing', 'Stables', 'Stud', 'Bloodstock', 'Partnership', 'Thoroughbreds', 'House', 'Park'];

export function stableName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 500; i++) {
    const n = `${rng.pick(STABLE_A)} ${rng.pick(STABLE_B)}`;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  const n = `${rng.pick(STABLE_A)} ${rng.pick(STABLE_B)} ${used.size}`;
  used.add(n);
  return n;
}
