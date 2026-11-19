import { Fragment, useMemo, useState } from 'react';
import { useCommand, useQuery } from '../api';
import { ClassPill, Loading, Money, RaceLink } from '../components/common';
import type { CalendarFilter, CalendarRow } from '../../engine/game/queries';
import type { RaceClass } from '../../engine/types';
import { navigate } from '../router';

const CLASSES: Array<[RaceClass, string]> = [
  ['G1', 'Group 1'],
  ['G2', 'Group 2'],
  ['G3', 'Group 3'],
  ['Listed', 'Listed'],
  ['Heritage', 'Heritage'],
  ['Handicap', 'Handicap'],
  ['Conditions', 'Conditions'],
  ['Novice', 'Novice'],
  ['Maiden', 'Maiden'],
];

const DISTS: Array<[string, number, number]> = [
  ['alle', 0, 0],
  ['Sprint (≤ 7f)', 0, 1450],
  ['Meile (7–9f)', 1400, 1850],
  ['Mittel (9–12f)', 1800, 2550],
  ['Steher (> 12f)', 2500, 0],
];

export function CalendarScreen({ horseId }: { horseId?: string }) {
  const { data: header } = useQuery('header', undefined);
  const { data: stable } = useQuery('stableList', {});
  const [weeks, setWeeks] = useState(6);
  const [offset, setOffset] = useState(0);
  const [classes, setClasses] = useState<RaceClass[]>([]);
  const [surface, setSurface] = useState<'all' | 'turf' | 'aw'>('all');
  const [dist, setDist] = useState(0);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [search, setSearch] = useState('');
  const now = header?.weekIndex ?? 0;
  const filter: CalendarFilter = {
    fromWeekIndex: now + offset,
    toWeekIndex: now + offset + weeks - 1,
    classes,
    surface,
    distMin: DISTS[dist]![1] || undefined,
    distMax: DISTS[dist]![2] || undefined,
    horseId: horseId ?? null,
    onlyOpen,
    search,
  };
  const { data: rows, error } = useQuery('calendar', filter);
  const horse = stable?.find((s) => s.horseId === horseId);
  const grouped = useMemo(() => {
    const m = new Map<number, CalendarRow[]>();
    for (const r of rows ?? []) {
      const arr = m.get(r.weekIndex) ?? [];
      arr.push(r);
      m.set(r.weekIndex, arr);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <h1 style={{ marginBottom: 0 }}>Rennkalender</h1>
        {horse && (
          <span className="pill ok" style={{ fontSize: 13 }}>
            passend für {horse.name}{' '}
            <a href="#/calendar" style={{ marginLeft: 6 }}>
              ✕
            </a>
          </span>
        )}
      </div>
      <div className="card col" style={{ gap: 10 }}>
        <div className="row">
          <button className="btn small" onClick={() => setOffset((o) => o - weeks)}>◂ früher</button>
          <button className="btn small" onClick={() => setOffset(0)}>ab heute</button>
          <button className="btn small" onClick={() => setOffset((o) => o + weeks)}>später ▸</button>
          <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            <option value={2}>2 Wochen</option>
            <option value={6}>6 Wochen</option>
            <option value={12}>12 Wochen</option>
            <option value={26}>26 Wochen</option>
          </select>
          <select value={surface} onChange={(e) => setSurface(e.target.value as typeof surface)}>
            <option value="all">Rasen + Allwetter</option>
            <option value="turf">nur Rasen</option>
            <option value="aw">nur Allwetter</option>
          </select>
          <select value={dist} onChange={(e) => setDist(Number(e.target.value))}>
            {DISTS.map(([l], i) => (
              <option key={l} value={i}>{l}</option>
            ))}
          </select>
          <select value={horseId ?? ''} onChange={(e) => navigate({ name: 'calendar', horseId: e.target.value || undefined })}>
            <option value="">für alle Pferde</option>
            {stable?.map((h) => (
              <option key={h.horseId} value={h.horseId}>passend für {h.name}</option>
            ))}
          </select>
          <label className="row small">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> nur offene Nennungen
          </label>
          <input type="text" placeholder="Suche (Rennen, Bahn)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {horse && (
          <p className="small" style={{ margin: 0 }}>
            <b>Trainer zu {horse.name}:</b> beste Distanz etwa {horse.trainerOpinion.distance}; {horse.trainerOpinion.going}; {horse.trainerOpinion.style}.
          </p>
        )}
        <div className="chips">
          {CLASSES.map(([c, l]) => (
            <span key={c} className={`chip ${classes.includes(c) ? 'on' : ''}`} onClick={() => setClasses((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}>
              {l}
            </span>
          ))}
          {classes.length > 0 && (
            <span className="chip" onClick={() => setClasses([])}>✕ alle Klassen</span>
          )}
        </div>
      </div>
      {!rows ? (
        <Loading error={error} />
      ) : rows.length === 0 ? (
        <div className="card empty">Keine Rennen für diese Filter.</div>
      ) : (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Bahn</th>
                <th>Rennen</th>
                <th>Distanz</th>
                <th>Bedingungen</th>
                <th className="num">Preisgeld</th>
                <th className="num">Nenngeld</th>
                <th>Nennschluss</th>
                <th className="num">Feld</th>
                <th>Nennen</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([wi, list]) => (
                <Fragment key={wi}>
                  <tr className="group">
                    <td colSpan={10}>Woche {list[0]!.week}/{list[0]!.season}</td>
                  </tr>
                  {list.map((r) => (
                    <CalendarLine key={r.raceId} r={r} preferHorse={horseId} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CalendarLine({ r, preferHorse }: { r: CalendarRow; preferHorse?: string }) {
  const { run, busy } = useCommand();
  const ok = r.eligible.filter((e) => e.ok);
  const [sel, setSel] = useState<string>(preferHorse && ok.some((e) => e.horseId === preferHorse) ? preferHorse : ok[0]?.horseId ?? '');
  return (
    <tr className={r.playerHorses.length ? 'mine' : ''}>
      <td className="small nowrap">{r.dateLabel}</td>
      <td className="small">
        {r.trackName}
        <div className="muted">{r.surface === 'aw' ? 'Allwetter' : 'Rasen'}{r.going ? ` · ${r.going}` : ''}</div>
      </td>
      <td>
        <RaceLink id={r.raceId} name={r.name} /> <ClassPill c={r.raceClass} />
        {r.playerHorses.length > 0 && <div className="small" style={{ color: 'var(--ok)' }}>genannt: {r.playerHorses.join(', ')}</div>}
      </td>
      <td className="nowrap">{r.distance}</td>
      <td className="small">{r.conditions}</td>
      <td className="num"><Money v={r.prize} /></td>
      <td className="num"><Money v={r.entryFee} /></td>
      <td className="small">
        <span className={`pill ${r.deadlinePassed ? '' : r.deadlineLabel === 'diese Woche' ? 'warn' : 'ok'}`}>{r.deadlineLabel}</span>
      </td>
      <td className="num">
        {r.entries}/{r.maxRunners}
      </td>
      <td className="nowrap">
        {r.deadlinePassed || r.status !== 'open' ? (
          <span className="small muted">{r.status === 'run' ? 'gelaufen' : r.status === 'void' ? 'ausgefallen' : 'geschlossen'}</span>
        ) : ok.length === 0 ? (
          <span className="small muted" title={r.eligible.map((e) => `${e.name}: ${e.reason}`).join('\n')}>kein Pferd startberechtigt</span>
        ) : (
          <span className="row" style={{ gap: 4 }}>
            <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ maxWidth: 150 }}>
              {ok.map((e) => (
                <option key={e.horseId} value={e.horseId}>{e.name}</option>
              ))}
            </select>
            <button className="btn small primary" disabled={busy || !sel} onClick={() => run('enterRace', { raceId: r.raceId, horseId: sel })}>
              Nennen
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
