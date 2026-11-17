import { useSyncExternalStore } from 'react';

/** Minimaler Hash-Router (funktioniert auch auf GitHub Pages ohne Server-Rewrites). */

export type Route =
  | { name: 'saves' }
  | { name: 'office' }
  | { name: 'stable' }
  | { name: 'horse'; id: string; tab?: string }
  | { name: 'calendar'; horseId?: string }
  | { name: 'raceday' }
  | { name: 'race'; id: string; tab?: string }
  | { name: 'jockeys' }
  | { name: 'staff' }
  | { name: 'market'; tab?: string }
  | { name: 'auction'; id: string }
  | { name: 'finance' }
  | { name: 'facilities' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (parts[0]) {
    case 'office':
      return { name: 'office' };
    case 'stable':
      return { name: 'stable' };
    case 'horse':
      return parts[1] ? { name: 'horse', id: parts[1], tab: parts[2] } : { name: 'stable' };
    case 'calendar':
      return { name: 'calendar', horseId: parts[1] || undefined };
    case 'raceday':
      return { name: 'raceday' };
    case 'race':
      return parts[1] ? { name: 'race', id: parts[1], tab: parts[2] } : { name: 'raceday' };
    case 'jockeys':
      return { name: 'jockeys' };
    case 'staff':
      return { name: 'staff' };
    case 'market':
      return { name: 'market', tab: parts[1] || undefined };
    case 'auction':
      return parts[1] ? { name: 'auction', id: parts[1] } : { name: 'market' };
    case 'finance':
      return { name: 'finance' };
    case 'facilities':
      return { name: 'facilities' };
    default:
      return { name: 'saves' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'horse':
      return `#/horse/${encodeURIComponent(r.id)}${r.tab ? `/${r.tab}` : ''}`;
    case 'race':
      return `#/race/${encodeURIComponent(r.id)}${r.tab ? `/${r.tab}` : ''}`;
    case 'calendar':
      return `#/calendar${r.horseId ? `/${encodeURIComponent(r.horseId)}` : ''}`;
    case 'market':
      return `#/market${r.tab ? `/${r.tab}` : ''}`;
    case 'auction':
      return `#/auction/${encodeURIComponent(r.id)}`;
    default:
      return `#/${r.name}`;
  }
}

export function navigate(r: Route): void {
  window.location.hash = href(r);
}

function subscribe(l: () => void) {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
