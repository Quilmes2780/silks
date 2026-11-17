import { useQuery } from '../api';
import { Loading, Money, PlaceholderTag, useSort } from '../components/common';
import type { JockeyView } from '../../engine/game/queries';

export function JockeysScreen() {
  const { data, error } = useQuery('jockeys', undefined);
  const { sorted, th } = useSort<JockeyView>(data, { key: 'wins', dir: -1 });
  if (!sorted) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 14 }}>
      <h1>Jockeys</h1>
      <p className="muted">
        Freie Jockeys, buchbar pro Rennen gegen eine feste Reitgebühr (Personalverwaltung mit Verträgen folgt in Phase 3). Bewertung: Gesamteindruck aus Taktikverständnis, Tempogefühl und Endspurt.
      </p>
      <div className="card">
        <table className="data">
          <thead>
            <tr>
              {th('name', 'Jockey')}
              {th('rating', 'Bewertung', 'num')}
              {th('rides', 'Ritte (Saison)', 'num')}
              {th('wins', 'Siege', 'num')}
              <th className="num">Sieg %</th>
              {th('fee', 'Reitgebühr', 'num')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((j) => (
              <tr key={j.id}>
                <td>
                  {j.name} <PlaceholderTag show={j.placeholder} />
                </td>
                <td className="num">{j.rating.toFixed(1)}</td>
                <td className="num">{j.rides}</td>
                <td className="num">{j.wins}</td>
                <td className="num">{j.rides ? Math.round((j.wins / j.rides) * 100) : 0}</td>
                <td className="num"><Money v={j.fee} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
