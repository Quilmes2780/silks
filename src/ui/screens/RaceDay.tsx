import { useQuery } from '../api';
import { ClassPill, Loading, Money, RaceLink } from '../components/common';
import type { CalendarRow } from '../../engine/game/queries';

export function RaceDayScreen() {
  const { data: header } = useQuery('header', undefined);
  const now = header?.weekIndex ?? 0;
  const { data: rows, error } = useQuery('calendar', { fromWeekIndex: now - 1, toWeekIndex: now });
  if (!rows || !header) return <Loading error={error} />;
  const thisWeek = rows.filter((r) => r.weekIndex === now && r.status !== 'void');
  const lastWeek = rows.filter((r) => r.weekIndex === now - 1 && r.status === 'run');
  const mineFirst = (a: CalendarRow, b: CalendarRow) => b.playerHorses.length - a.playerHorses.length || b.prize - a.prize;
  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Renntag</h1>
      <div className="card">
        <h3>Diese Woche – Startlisten</h3>
        <p className="small muted">
          Die Startlisten stehen fest. Lege für deine Starter Taktik und Jockey fest; die Rennen laufen, wenn du „Woche abschließen“ drückst.
        </p>
        <RaceList rows={[...thisWeek].sort(mineFirst)} />
      </div>
      <div className="card">
        <h3>Letzte Woche – Ergebnisse</h3>
        <RaceList rows={[...lastWeek].sort(mineFirst)} result />
      </div>
    </div>
  );
}

function RaceList({ rows, result }: { rows: CalendarRow[]; result?: boolean }) {
  if (!rows.length) return <div className="empty">Keine Rennen.</div>;
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Datum</th>
          <th>Bahn</th>
          <th>Rennen</th>
          <th>Distanz</th>
          <th>Boden</th>
          <th className="num">Preisgeld</th>
          <th className="num">Starter</th>
          <th>Deine Pferde</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.raceId} className={r.playerHorses.length ? 'mine' : ''}>
            <td className="small nowrap">{r.dateLabel}</td>
            <td className="small">{r.trackName}</td>
            <td>
              <RaceLink id={r.raceId} name={r.name} /> <ClassPill c={r.raceClass} />
            </td>
            <td>{r.distance}</td>
            <td className="small">{r.going ?? '–'}</td>
            <td className="num"><Money v={r.prize} /></td>
            <td className="num">{r.entries}</td>
            <td className="small">{r.playerHorses.join(', ')}</td>
            <td className="nowrap">
              {result ? (
                <>
                  <a className="btn small" href={`#/race/${r.raceId}/view`}>Rennansicht</a>{' '}
                  <a className="btn small" href={`#/race/${r.raceId}/result`}>Ergebnis</a>
                </>
              ) : (
                <a className={`btn small ${r.playerHorses.length ? 'primary' : ''}`} href={`#/race/${r.raceId}`}>
                  {r.playerHorses.length ? 'Taktik festlegen' : 'Startliste'}
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
