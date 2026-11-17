import type { Silks, SilksPattern } from '../../engine/types';

/**
 * Einfärbung der Rennfarben (Silks).
 *
 * Grafiken des Jockeys werden in neutralem Grau erstellt; bestimmte Grauwerte markieren die
 * Regionen, die im Browser eingefärbt werden. Die Schattierung bleibt erhalten (Multiplikation).
 *
 *   Maske (Grauwert)   Region
 *   64  (0.25)         Körper (body)
 *   128 (0.50)         Muster (pattern2)
 *   192 (0.75)         Ärmel (sleeves)
 *   255 (1.00)         Kappe (cap)
 *   0                  nicht einfärben (Haut, Hose, Stiefel, Pferd …)
 *
 * colorizeImageData arbeitet auf Rasterdaten (für die späteren Higgsfield-Bilder),
 * renderSilksSvg erzeugt den SVG-Platzhalter-Jockey mit derselben Regionenlogik.
 */

export const MASK_LEVELS = { body: 64, pattern: 128, sleeves: 192, cap: 255 } as const;
type Region = keyof typeof MASK_LEVELS;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function regionOf(maskValue: number): Region | null {
  if (maskValue < 32) return null;
  if (maskValue < 96) return 'body';
  if (maskValue < 160) return 'pattern';
  if (maskValue < 224) return 'sleeves';
  return 'cap';
}

function colourFor(region: Region, silks: Silks): string {
  return region === 'body' ? silks.body : region === 'pattern' ? silks.pattern2 : region === 'sleeves' ? silks.sleeves : silks.cap;
}

/**
 * Färbt ein Graustufenbild anhand einer Maske ein.
 * image: RGBA (Graustufen-Schattierung), mask: RGBA (R-Kanal = Regionen-Grauwert).
 * Ergebnis: neues RGBA-Array; eingefärbt = Farbe × Helligkeit (Multiply), sonst unverändert.
 */
export function colorizeImageData(image: Uint8ClampedArray, mask: Uint8ClampedArray, silks: Silks): Uint8ClampedArray {
  if (image.length !== mask.length) throw new Error('Bild und Maske müssen gleich groß sein');
  const out = new Uint8ClampedArray(image.length);
  const cache: Partial<Record<Region, [number, number, number]>> = {};
  for (let i = 0; i < image.length; i += 4) {
    const region = regionOf(mask[i]!);
    if (!region) {
      out[i] = image[i]!;
      out[i + 1] = image[i + 1]!;
      out[i + 2] = image[i + 2]!;
      out[i + 3] = image[i + 3]!;
      continue;
    }
    const rgb = (cache[region] ??= hexToRgb(colourFor(region, silks)));
    // Helligkeit des Graustufenbilds, auf 0..1.25 normiert (Glanzlichter dürfen aufhellen)
    const lum = (image[i]! * 0.299 + image[i + 1]! * 0.587 + image[i + 2]! * 0.114) / 200;
    out[i] = Math.min(255, rgb[0] * lum);
    out[i + 1] = Math.min(255, rgb[1] * lum);
    out[i + 2] = Math.min(255, rgb[2] * lum);
    out[i + 3] = image[i + 3]!;
  }
  return out;
}

/** Musterformen (innerhalb der Körperfläche) für das SVG. Koordinaten im 100×120-Raster. */
function patternShapes(p: SilksPattern, fill: string): string {
  const f = `fill="${fill}"`;
  switch (p) {
    case 'plain':
      return '';
    case 'hoops':
      return [42, 58, 74].map((y) => `<rect x="20" y="${y}" width="60" height="8" ${f}/>`).join('');
    case 'stripes':
      return [30, 44, 58, 72].map((x) => `<rect x="${x}" y="30" width="6" height="60" ${f}/>`).join('');
    case 'sash':
      return `<polygon points="28,34 38,34 76,92 66,92" ${f}/>`;
    case 'chevrons':
      return [44, 62].map((y) => `<polyline points="22,${y} 50,${y + 14} 78,${y}" fill="none" stroke="${fill}" stroke-width="7"/>`).join('');
    case 'quartered':
      return `<rect x="50" y="30" width="30" height="30" ${f}/><rect x="20" y="60" width="30" height="32" ${f}/>`;
    case 'diamond':
      return `<polygon points="50,44 62,62 50,80 38,62" ${f}/>`;
    case 'cross_belts':
      return `<polygon points="26,34 34,34 76,90 68,90" ${f}/><polygon points="66,34 74,34 32,90 24,90" ${f}/>`;
    case 'spots':
      return [
        [35, 45],
        [60, 48],
        [45, 64],
        [68, 70],
        [32, 80],
        [55, 84],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" ${f}/>`)
        .join('');
    case 'halved':
      return `<rect x="50" y="30" width="30" height="62" ${f}/>`;
  }
}

/**
 * SVG-Platzhalter-Jockey (Oberkörper in Rennfarben). Ohne Silks werden die Graustufen der
 * Maske gezeigt; mit Silks dieselbe Zeichnung eingefärbt. Die Schattierung kommt über
 * eine halbtransparente Verlaufsebene, die wie die Multiply-Einfärbung der Rasterbilder wirkt.
 */
export function renderSilksSvg(silks: Silks | null, opts: { size?: number; title?: string } = {}): string {
  const size = opts.size ?? 48;
  const gray = (r: Region) => {
    const v = MASK_LEVELS[r];
    return `rgb(${v},${v},${v})`;
  };
  const c = (r: Region) => (silks ? colourFor(r, silks) : gray(r));
  const uid = Math.abs(hash(JSON.stringify(silks ?? 'mask'))).toString(36);
  const pattern = silks?.pattern ?? 'hoops';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}" role="img" aria-label="${escapeXml(opts.title ?? 'Rennfarben')}">
<defs>
  <clipPath id="b${uid}"><path d="M22 34 Q50 24 78 34 L80 92 Q50 100 20 92 Z"/></clipPath>
  <linearGradient id="s${uid}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></linearGradient>
</defs>
<path d="M22 36 L6 70 L14 76 L26 52 Z" fill="${c('sleeves')}" data-region="sleeves"/>
<path d="M78 36 L94 70 L86 76 L74 52 Z" fill="${c('sleeves')}" data-region="sleeves"/>
<circle cx="10" cy="76" r="5" fill="#e9c9a8"/><circle cx="90" cy="76" r="5" fill="#e9c9a8"/>
<path d="M22 34 Q50 24 78 34 L80 92 Q50 100 20 92 Z" fill="${c('body')}" data-region="body"/>
<g clip-path="url(#b${uid})" data-region="pattern">${patternShapes(pattern, c('pattern'))}</g>
<path d="M22 34 Q50 24 78 34 L80 92 Q50 100 20 92 Z" fill="url(#s${uid})"/>
<rect x="30" y="92" width="40" height="22" rx="4" fill="#f4f1ea" stroke="#bbb" stroke-width="1"/>
<circle cx="50" cy="20" r="11" fill="#e9c9a8"/>
<path d="M37 18 Q50 0 63 18 Z" fill="${c('cap')}" data-region="cap"/>
<rect x="35" y="16" width="30" height="4" rx="2" fill="${c('cap')}" data-region="cap"/>
<path d="M60 18 L70 21 L60 21 Z" fill="${c('cap')}" data-region="cap"/>
<path d="M37 18 Q50 0 63 18 Z" fill="url(#s${uid})"/>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
