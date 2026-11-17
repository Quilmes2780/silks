/**
 * Erzeugt assets/manifest.json und assets/prompts.json für die Higgsfield-Grafikpipeline.
 * Aufruf: npm run assets:lists
 * Das Manifest ordnet später Fellfarbe, Pose und Altersstufe einer Datei zu (file = null, bis Bilder da sind).
 */
import { writeFileSync } from 'node:fs';

const HORSE_STYLE =
  'classical English equestrian portrait, oil on canvas, in the manner of 18th and 19th century British sporting art, warm brown tones, calm muted landscape background, soft natural light, fine visible brushwork, aged varnish, museum quality';
const POSTER_STYLE =
  'vintage 1930s British railway and racing poster, bold flat colours, art deco lithograph, strong simple shapes, limited palette, textured paper, elegant serif lettering area left blank';
const PERSON_STYLE =
  'classical British portrait, oil on canvas, warm brown tones, muted background, soft window light, dignified, half-length, period-neutral modern racing attire, no logos';
const NEG = 'no text, no watermark, no logos, no sponsor branding, no real person likeness, anatomically correct horse, four legs';

const COATS = [
  { key: 'bay', en: 'bay thoroughbred with black mane, tail and lower legs' },
  { key: 'chestnut', en: 'chestnut thoroughbred with copper-red coat and matching mane' },
  { key: 'black', en: 'black thoroughbred with glossy jet coat' },
  { key: 'grey', en: 'grey thoroughbred with dappled silver-white coat' },
  { key: 'brown', en: 'dark brown thoroughbred, almost black with brown muzzle' },
];
const POSES = [
  { key: 'profile', en: 'standing in strict side profile facing right, full body visible, conformation portrait' },
  { key: 'gallop', en: 'in full gallop facing right, all four legs extended in the classic flying gallop of sporting art' },
];
const AGES = [
  { key: 'foal', en: 'young foal with long legs and fluffy short mane, in a paddock' },
  { key: 'adult', en: 'mature racehorse in peak condition, muscular and lean' },
];

interface Prompt {
  id: string;
  group: string;
  file: string;
  size: string;
  prompt: string;
  negative: string;
  tool: string;
  notes?: string;
}

const prompts: Prompt[] = [];
const add = (p: Prompt) => prompts.push(p);

// 1. Stilfindung und Testlauf (9)
const tests = [
  'bay racehorse in side profile in a green paddock',
  'grey racehorse with a groom holding the bridle',
  'chestnut racehorse galloping on a grass gallop at dawn',
  'two racehorses at the start of a race, jockeys in neutral grey silks',
  'racehorse being led around a parade ring',
  'mare and foal in an English paddock with oak trees',
  'racehorse head study, three-quarter view',
];
tests.forEach((t, i) =>
  add({ id: `style_test_${i + 1}`, group: 'Stilfindung', file: `assets/style/test_${i + 1}.webp`, size: '1024x1024', prompt: `${t}, ${HORSE_STYLE}`, negative: NEG, tool: 'Bildgenerierung (Kosten pro Bild messen)' }),
);
add({ id: 'style_test_poster_1', group: 'Stilfindung', file: 'assets/style/poster_1.webp', size: '1536x1024', prompt: `English racecourse grandstand with horses racing past the winning post, ${POSTER_STYLE}`, negative: NEG, tool: 'Bildgenerierung' });
add({ id: 'style_test_poster_2', group: 'Stilfindung', file: 'assets/style/poster_2.webp', size: '1024x1536', prompt: `a single racehorse and jockey in silhouette against a large setting sun, ${POSTER_STYLE}`, negative: NEG, tool: 'Bildgenerierung' });

// 2. Pferde-Basisporträts: 5 Fellfarben × 2 Posen × Fohlen/erwachsen (20)
const manifestHorses: Array<{ coat: string; pose: string; age: string; file: string | null; promptId: string }> = [];
for (const c of COATS)
  for (const p of POSES)
    for (const a of AGES) {
      const id = `horse_${c.key}_${p.key}_${a.key}`;
      const file = `assets/horses/${c.key}_${p.key}_${a.key}.webp`;
      add({
        id,
        group: 'Pferde-Basisporträts',
        file,
        size: '1024x1024',
        prompt: `${c.en}, ${a.en}, ${p.key === 'gallop' && a.key === 'foal' ? 'playfully cantering in a paddock facing right' : p.en}, no white markings, no saddle, no rider, ${HORSE_STYLE}`,
        negative: `${NEG}, white face markings, white socks, saddle, rider`,
        tool: 'Bildgenerierung mit Referenzbildern',
        notes: 'Ohne Abzeichen generieren; Abzeichen kommen als Ebenen darüber.',
      });
      manifestHorses.push({ coat: c.key, pose: p.key, age: a.key, file: null, promptId: id });
    }

// 3. Abzeichen-Ebenen und Jockey mit Graustufen-Silks (8)
const markings = [
  ['marking_star', 'small white star on the forehead'],
  ['marking_blaze', 'broad white blaze running down the face'],
  ['marking_stripe', 'narrow white stripe down the face'],
  ['marking_sock_front', 'white sock on a front leg up to the fetlock'],
  ['marking_sock_hind', 'white sock on a hind leg up to the fetlock'],
] as const;
for (const [id, en] of markings) {
  add({
    id,
    group: 'Abzeichen und Silks',
    file: `assets/markings/${id.replace('marking_', '')}.webp`,
    size: '1024x1024',
    prompt: `isolated ${en} painted as an overlay layer for a bay horse in side profile facing right, matching the oil painting style, transparent background, ${HORSE_STYLE}`,
    negative: NEG,
    tool: 'Bildgenerierung, Hintergrund entfernen',
    notes: 'Freistellen; muss passgenau über den Profil-Basisporträts liegen.',
  });
}
add({ id: 'jockey_silks_profile', group: 'Abzeichen und Silks', file: 'assets/jockey/silks_profile.webp', size: '1024x1024', prompt: `jockey seated on a racehorse in side profile facing right, jockey wearing plain neutral mid-grey racing silks and grey cap, white breeches, black boots, silks evenly lit so they can be recoloured, ${HORSE_STYLE}`, negative: `${NEG}, coloured silks, patterns, numbers`, tool: 'Bildgenerierung, Hintergrund entfernen', notes: 'Graustufen-Silks; Einfärbung im Browser über Maske (siehe src/ui/silks/colorize.ts).' });
add({ id: 'jockey_silks_gallop', group: 'Abzeichen und Silks', file: 'assets/jockey/silks_gallop.webp', size: '1024x1024', prompt: `jockey crouched in racing position on a galloping racehorse facing right, plain neutral mid-grey racing silks and grey cap, ${HORSE_STYLE}`, negative: `${NEG}, coloured silks, patterns, numbers`, tool: 'Bildgenerierung, Hintergrund entfernen', notes: 'Graustufen-Silks für die Einfärbung.' });
add({ id: 'jockey_silks_mask', group: 'Abzeichen und Silks', file: 'assets/jockey/silks_mask.png', size: '1024x1024', prompt: 'flat region mask derived from jockey_silks_profile: body 25% grey, pattern area 50% grey, sleeves 75% grey, cap white, everything else black (manually prepared from the generated image)', negative: '', tool: 'manuell aus dem generierten Bild erstellen (kein Credit)', notes: 'Grauwerte 64/128/192/255 entsprechen body/pattern/sleeves/cap.' });

// 4. Personal-Porträts (16)
const staff = [
  ['trainer_1', 'head trainer, weathered man in his sixties in a tweed jacket and flat cap, holding binoculars'],
  ['trainer_2', 'head trainer, woman in her forties in a waxed jacket, confident expression, stable yard behind'],
  ['trainer_3', 'young assistant trainer in a quilted gilet with a clipboard'],
  ['trainer_4', 'elderly trainer with grey moustache in a three-piece tweed suit'],
  ['jockey_1', 'flat jockey in neutral grey silks holding a helmet, slight build, determined'],
  ['jockey_2', 'female flat jockey in neutral grey silks, smiling, helmet under arm'],
  ['jockey_3', 'veteran jockey with lined face in neutral grey silks'],
  ['jockey_4', 'apprentice jockey, teenager, in neutral grey silks, nervous smile'],
  ['work_rider', 'work rider in a skull cap and body protector on the gallops at dawn'],
  ['groom_1', 'stable groom with a horse brush and rolled-up sleeves'],
  ['groom_2', 'young female groom leading a horse, wearing a stable jacket'],
  ['vet', 'equine veterinary surgeon with a stethoscope in a stable'],
  ['farrier', 'farrier in a leather apron holding a horseshoe and hammer'],
  ['stud_manager', 'stud manager in a paddock with mares in the background'],
  ['bloodstock_agent', 'bloodstock agent in a sharp suit holding a sales catalogue'],
  ['analyst', 'racing data analyst with spectacles studying charts in a wood-panelled office'],
] as const;
for (const [id, en] of staff) {
  add({ id: `staff_${id}`, group: 'Personal-Porträts', file: `assets/staff/${id}.webp`, size: '1024x1024', prompt: `${en}, ${PERSON_STYLE}`, negative: NEG, tool: 'Bildgenerierung im Stapel', notes: 'Generisch, mehrfach verwendbar; keine realen Personen.' });
}

// 5. Rennbahnen als Vintage-Rennplakate (8)
const courses = [
  ['ascot', 'Ascot racecourse with its long modern grandstand and royal procession of carriages on the straight mile'],
  ['epsom', 'Epsom Downs with the field sweeping around Tattenham Corner on the downs'],
  ['newmarket', 'Newmarket heath with the wide Rowley Mile and windswept open sky'],
  ['york', 'York Knavesmire racecourse with the city minster on the horizon'],
  ['goodwood', 'Glorious Goodwood high on the South Downs with sweeping views to the sea'],
  ['cheltenham', 'Cheltenham racecourse in a natural amphitheatre below Cleeve Hill'],
  ['doncaster', 'Doncaster Town Moor with the long flat straight and grandstand'],
  ['sandown', 'Sandown Park with the stiff uphill finish and Esher hills'],
] as const;
for (const [id, en] of courses) {
  add({ id: `course_${id}`, group: 'Rennbahnen', file: `assets/courses/${id}.webp`, size: '1536x1024', prompt: `${en}, horses racing, ${POSTER_STYLE}`, negative: NEG, tool: 'Bildgenerierung im Breitformat', notes: 'Platz für Titel links oben frei lassen (Schrift kommt im Code).' });
}

// 6. Stall-Ausbaustufen, UI-Hintergründe, Plakate der Klassiker (15)
const misc: Array<[string, string, string]> = [
  ['yard_level_1', 'a small humble racing yard with six wooden loose boxes and a muddy courtyard', HORSE_STYLE],
  ['yard_level_2', 'a tidy brick racing yard with twenty boxes around a clock-tower courtyard', HORSE_STYLE],
  ['yard_level_3', 'a grand historic racing stables with a lawned quadrangle, clock tower and fifty boxes', HORSE_STYLE],
  ['gallops', 'string of racehorses cantering up a long grass gallop on misty downs at dawn', HORSE_STYLE],
  ['equine_pool', 'racehorse being exercised in an equine swimming pool inside a timber barn', HORSE_STYLE],
  ['vet_clinic', 'equine veterinary clinic with a horse in examination stocks', HORSE_STYLE],
  ['stud_paddocks', 'stud farm paddocks with post-and-rail fencing, mares and foals grazing under oaks', HORSE_STYLE],
  ['ui_office', "trainer's office interior with leather chair, oak desk, form books and racing pictures, no people", HORSE_STYLE],
  ['ui_parchment', 'seamless subtle parchment texture with faint tweed weave, very low contrast, for user interface background', 'texture, flat, even lighting, tileable'],
  ['poster_2000_guineas', 'two-year-old colts racing on the Rowley Mile at Newmarket, celebration of the 2000 Guineas', POSTER_STYLE],
  ['poster_1000_guineas', 'fillies racing on Newmarket heath in spring, celebration of the 1000 Guineas', POSTER_STYLE],
  ['poster_derby', 'the Derby at Epsom, field rounding Tattenham Corner with huge crowds on the downs', POSTER_STYLE],
  ['poster_oaks', 'the Oaks at Epsom, fillies in the home straight with grandstand and spring sky', POSTER_STYLE],
  ['poster_st_leger', 'the St Leger at Doncaster, stayers fighting out the finish in autumn light', POSTER_STYLE],
  ['poster_king_george', 'the King George at Ascot in high summer, horses passing the royal enclosure', POSTER_STYLE],
];
for (const [id, en, style] of misc) {
  add({ id, group: 'Anlage, UI und Plakate', file: `assets/misc/${id}.webp`, size: id.startsWith('poster') ? '1024x1536' : '1536x1024', prompt: `${en}, ${style}`, negative: NEG, tool: 'Bildgenerierung' });
}

const manifest = {
  note: 'Ordnet Fellfarbe, Pose und Altersstufe einer Bilddatei zu. file = null bedeutet: noch nicht generiert, die UI zeigt einen SVG-Platzhalter. Pfade relativ zum Projektstamm; beim Einbinden nach public/ kopieren.',
  version: 1,
  coats: COATS.map((c) => c.key),
  poses: ['profile', 'gallop'],
  posesPlanned: ['three_quarter'],
  ages: ['foal', 'adult'],
  horses: manifestHorses,
  markings: markings.map(([id]) => ({ id, file: null })),
  jockey: { profile: null, gallop: null, mask: null, maskLevels: { body: 64, pattern: 128, sleeves: 192, cap: 255 } },
  staff: staff.map(([id]) => ({ id, file: null })),
  courses: courses.map(([id]) => ({ id, file: null })),
  misc: misc.map(([id]) => ({ id, file: null })),
};

writeFileSync(new URL('../assets/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  new URL('../assets/prompts.json', import.meta.url),
  JSON.stringify(
    {
      note: 'Prompt-Liste für die Stapelgenerierung mit Higgsfield (Konzept: Asset-Tabelle, ca. 75 Bilder, max. 350 Credits). Jede Gruppe erst nach Freigabe generieren, vorher Kostenlimit setzen.',
      style: { horses: HORSE_STYLE, posters: POSTER_STYLE, people: PERSON_STYLE, negative: NEG },
      count: prompts.length,
      prompts,
    },
    null,
    2,
  ) + '\n',
);
console.log(`${prompts.length} Prompts, ${manifestHorses.length} Manifest-Einträge für Pferde geschrieben.`);
