import { useState } from 'react';
import type { Markings, StaffRole } from '../../engine/types';
import { horseImage, staffImage } from '../assets';

/**
 * Pferdeporträt aus der Bildbibliothek (Fellfarbe × Pose × Alter). Abzeichen stehen als Text darunter,
 * weil sich gemalte Abzeichen-Ebenen nicht passgenau über unterschiedliche Porträts legen lassen.
 */

const FACE_LABEL: Record<string, string> = { star: 'Stern', stripe: 'Strich', blaze: 'Blesse' };
const LEG_LABEL = ['vorne links', 'vorne rechts', 'hinten links', 'hinten rechts'];

export function markingsLabel(m?: Markings): string | null {
  if (!m) return null;
  const parts: string[] = [];
  if (m.face && m.face !== 'none') parts.push(FACE_LABEL[m.face] ?? m.face);
  const socks = m.socks.map((s, i) => (s ? LEG_LABEL[i]! : null)).filter((x): x is string => x !== null);
  if (socks.length === 4) parts.push('vier weiße Füße');
  else if (socks.length) parts.push(`weiß ${socks.join(', ')}`);
  return parts.length ? parts.join(' · ') : null;
}

export function HorsePortrait({
  coat,
  markings,
  age = 'adult',
  pose = 'profile',
  size = 180,
}: {
  coat: string;
  markings?: Markings;
  age?: 'foal' | 'adult';
  pose?: 'profile' | 'gallop';
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const label = markingsLabel(markings);
  return (
    <figure className="portrait-fig" style={{ width: size }}>
      {failed ? (
        <div className="portrait placeholder" style={{ width: size, height: size }} />
      ) : (
        <img className="portrait" src={horseImage(coat, pose, age)} width={size} height={size} alt="Pferdeporträt" loading="lazy" onError={() => setFailed(true)} />
      )}
      {label && <figcaption className="small muted">Abzeichen: {label}</figcaption>}
    </figure>
  );
}

/** Rundes Porträt einer Person; ohne passendes Bild die Initialen. */
export function StaffAvatar({ role, name, id, size = 36 }: { role: StaffRole; name: string; id: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = staffImage(role, name, id);
  if (!src || failed) {
    const initials = name
      .split(/[\s-]+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2);
    return (
      <span className="avatar initials" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
        {initials}
      </span>
    );
  }
  return <img className="avatar" src={src} width={size} height={size} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** Breites Kopfbild (Rennbahn, Anlage) mit optionalem Text darüber. */
export function Banner({ src, height = 150, children, position = 'center' }: { src: string; height?: number; children?: React.ReactNode; position?: string }) {
  return (
    <div className="banner" style={{ height, backgroundImage: `url("${src}")`, backgroundPosition: position }}>
      {children && <div className="banner-text">{children}</div>}
    </div>
  );
}
