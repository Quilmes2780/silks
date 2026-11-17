import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Silks } from '../../engine/types';
import { renderSilksSvg } from '../silks/colorize';
import { call, useToasts } from '../api';
import { href, type Route } from '../router';
import type { RunLink } from '../../engine/game/queries';
import { lengthsLabel, money, raceTime } from '../../engine/game/format';

export function SilksIcon({ silks, size = 28, title }: { silks: Silks | null; size?: number; title?: string }) {
  const svg = useMemo(() => renderSilksSvg(silks, { size, title }), [silks, size, title]);
  return <span style={{ display: 'inline-flex', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Link({ to, children, className }: { to: Route; children: ReactNode; className?: string }) {
  return (
    <a href={href(to)} className={className}>
      {children}
    </a>
  );
}

export function HorseLink({ id, name }: { id: string; name: string }) {
  return <Link to={{ name: 'horse', id }}>{name}</Link>;
}

export function RaceLink({ id, name, tab }: { id: string; name: string; tab?: string }) {
  return <Link to={{ name: 'race', id, tab }}>{name}</Link>;
}

export function ClassPill({ c }: { c: string }) {
  const cls = c === 'G1' ? 'g1' : c === 'G2' ? 'g2' : c === 'G3' ? 'g3' : c === 'Listed' ? 'listed' : c === 'Heritage' ? 'heritage' : '';
  const label = c === 'G1' ? 'Group 1' : c === 'G2' ? 'Group 2' : c === 'G3' ? 'Group 3' : c;
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function Money({ v, signed }: { v: number; signed?: boolean }) {
  const s = money(Math.abs(v));
  return (
    <span className="mono" style={{ color: signed ? (v < 0 ? 'var(--red)' : 'var(--ok)') : undefined }}>
      {signed ? (v < 0 ? '−' : '+') : v < 0 ? '−' : ''}
      {s}
    </span>
  );
}

export function Fig({ v, runId, raceId }: { v: number | null | undefined; runId?: string; raceId?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="muted">–</span>;
  const cls = v >= 100 ? 'fig hi' : v < 45 ? 'fig lo' : 'fig';
  if (raceId) return <a href={href({ name: 'race', id: raceId, tab: 'result' })} className={cls} title="Zum Rennen">{v}</a>;
  if (runId) return <RunLinkValue runIds={[runId]} label={<span className={cls}>{v}</span>} />;
  return <span className={cls}>{v}</span>;
}

/** Ein Wert, der beim Klick die zugrunde liegenden Starts zeigt (jede Zahl verlinkt auf ihre Rennen). */
export function RunLinkValue({ runIds, label, title }: { runIds: string[]; label: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<RunLink[] | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    call('runLinks', { runIds }).then(setLinks);
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, runIds]);
  if (runIds.length === 1 && links === null && !open) {
    // Einzelner Start: direkt zum Rennen
    return (
      <span ref={ref} className="linkish" title={title ?? 'Zum Rennen'} onClick={async () => {
        const [l] = await call('runLinks', { runIds });
        if (l) window.location.hash = href({ name: 'race', id: l.raceId, tab: 'result' });
      }}>
        {label}
      </span>
    );
  }
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <span className="linkish" title={title ?? 'Starts anzeigen'} onClick={() => setOpen((o) => !o)}>
        {label}
      </span>
      {open && (
        <div className="popover">
          <div className="small muted" style={{ marginBottom: 6 }}>{runIds.length} Start(s)</div>
          {!links ? (
            <div className="muted">lädt …</div>
          ) : (
            <table className="data">
              <tbody>
                {links.map((l) => (
                  <tr key={l.runId}>
                    <td className="nowrap small">{l.dateLabel}</td>
                    <td><RaceLink id={l.raceId} name={l.raceName} tab="result" /></td>
                    <td className="num">{l.position}.</td>
                    <td className="num"><Fig v={l.speedFigure} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </span>
  );
}

export function Bar({ value, max = 100, warnBelow, badBelow }: { value: number; max?: number; warnBelow?: number; badBelow?: number }) {
  const cls = badBelow !== undefined && value < badBelow ? 'bad' : warnBelow !== undefined && value < warnBelow ? 'warn' : '';
  return (
    <div className={`bar ${cls}`} title={`${Math.round(value)} / ${max}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

export function Toasts() {
  const t = useToasts();
  return (
    <div className="toasts">
      {t.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>{x.text}</div>
      ))}
    </div>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="loading">{error ? <span style={{ color: 'var(--red)' }}>{error}</span> : 'lädt …'}</div>;
}

export function Lengths({ l, pos }: { l: number; pos: number }) {
  if (pos === 1) return <span className="muted">–</span>;
  return <span className="mono">{lengthsLabel(l)}</span>;
}

export function Time({ s }: { s: number | null }) {
  return s === null ? <span className="muted">–</span> : <span className="mono">{raceTime(s)}</span>;
}

/** Sortierbare Tabelle (einfach). */
export function useSort<T>(rows: T[] | null, initial: { key: keyof T; dir: 1 | -1 }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => {
      const va = a[sort.key] as unknown;
      const vb = b[sort.key] as unknown;
      const na = va === null || va === undefined;
      const nb = vb === null || vb === undefined;
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
  }, [rows, sort]);
  const th = (key: keyof T, label: ReactNode, cls = '') => (
    <th className={`sortable ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}>
      {label}
      {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  return { sorted, th };
}

export function PlaceholderTag({ show }: { show: boolean }) {
  return show ? <span className="pill placeholder" title="Platzhalter-Datensatz aus der Weltdatei">Platzhalter</span> : null;
}

/** Einstufung in halben Sternen (0,5–5). */
export function Stars({ v }: { v: number }) {
  const full = Math.floor(v);
  const half = v - full >= 0.5;
  return (
    <span className="stars" title={`${v.toFixed(1)} von 5`}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      <span className="muted">{'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}</span>
    </span>
  );
}

/** Kurze Geldangabe (z. B. £12k, £1.2m). */
export function shortMoney(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `£${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m` : a >= 1e4 ? `£${Math.round(a / 1000)}k` : money(a);
  return v < 0 ? `−${s}` : s;
}
