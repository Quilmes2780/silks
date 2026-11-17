import manifest from '../../../assets/manifest.json';
import type { Markings } from '../../engine/types';

/**
 * Pferdeporträt: nutzt ein Bild aus assets/manifest.json, sobald vorhanden,
 * sonst einen neutralen SVG-Platzhalter in der Fellfarbe (mit Abzeichen).
 */

const COAT: Record<string, { base: string; mane: string; shade: string }> = {
  bay: { base: '#8a4b23', mane: '#1d1410', shade: '#5c2f15' },
  chestnut: { base: '#a8562a', mane: '#8a3f1b', shade: '#733612' },
  black: { base: '#262220', mane: '#0d0b0a', shade: '#121010' },
  grey: { base: '#b9b6b0', mane: '#8d8a85', shade: '#8f8b84' },
  brown: { base: '#4e2c1a', mane: '#1a110c', shade: '#2f1a0e' },
};

interface ManifestEntry {
  coat: string;
  pose: string;
  age: string;
  file: string | null;
}

export function portraitFile(coat: string, pose: 'profile' | 'gallop', age: 'foal' | 'adult'): string | null {
  const e = (manifest.horses as ManifestEntry[]).find((x) => x.coat === coat && x.pose === pose && x.age === age);
  return e?.file ? `${import.meta.env.BASE_URL}${e.file}` : null;
}

export function HorsePortrait({ coat, markings, age = 'adult', size = 180 }: { coat: string; markings?: Markings; age?: 'foal' | 'adult'; size?: number }) {
  const file = portraitFile(coat, 'profile', age);
  if (file) return <img className="portrait" src={file} width={size} height={size * 0.8} alt="Pferdeporträt" />;
  const c = COAT[coat] ?? COAT.bay!;
  const face = markings?.face ?? 'none';
  const socks = markings?.socks ?? [false, false, false, false];
  const w = size;
  const h = size * 0.8;
  const leg = (x: number, i: number) => (
    <g key={i}>
      <rect x={x} y={150} width={9} height={45} fill={i < 2 ? c.base : c.shade} />
      {socks[i] && <rect x={x} y={180} width={9} height={15} fill="#f2efe8" />}
      <rect x={x - 1} y={193} width={11} height={5} fill="#222" />
    </g>
  );
  return (
    <svg className="portrait" width={w} height={h} viewBox="0 0 250 200" role="img" aria-label="Platzhalter-Porträt">
      <defs>
        <radialGradient id="bg" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#6e5a3a" />
          <stop offset="1" stopColor="#2b2116" />
        </radialGradient>
      </defs>
      <rect width="250" height="200" fill="url(#bg)" />
      <ellipse cx="125" cy="196" rx="110" ry="8" fill="#1d160e" opacity="0.6" />
      {[70, 88, 160, 178].map(leg)}
      {/* Körper */}
      <ellipse cx="125" cy="125" rx="72" ry="34" fill={c.base} />
      <ellipse cx="125" cy="135" rx="66" ry="20" fill={c.shade} opacity="0.35" />
      {/* Hals und Kopf */}
      <path d="M180 112 Q196 70 205 52 L222 60 Q214 92 200 128 Z" fill={c.base} />
      <path d="M200 50 Q214 38 236 58 Q242 70 232 76 Q220 74 208 66 Z" fill={c.base} />
      <path d="M200 52 Q205 40 210 44 L206 56 Z" fill={c.shade} />
      {/* Mähne und Schweif */}
      <path d="M182 108 Q194 72 202 50 L196 52 Q186 80 176 104 Z" fill={c.mane} />
      <path d="M55 112 Q34 128 40 168 Q48 140 60 124 Z" fill={c.mane} />
      {/* Abzeichen */}
      {face === 'star' && <circle cx="216" cy="56" r="3.5" fill="#f2efe8" />}
      {face === 'stripe' && <path d="M218 58 L228 70 L226 72 L216 60 Z" fill="#f2efe8" />}
      {face === 'blaze' && <path d="M212 54 Q222 56 234 70 L230 76 Q220 66 210 58 Z" fill="#f2efe8" />}
      <circle cx="214" cy="57" r="1.8" fill="#111" />
      <text x="10" y="18" fontSize="10" fill="#d4b56a" fontFamily="Georgia, serif" opacity="0.8">Platzhalter</text>
    </svg>
  );
}
