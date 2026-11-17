import { useCommand, useQuery } from '../api';
import { Bar, Loading, Money } from '../components/common';

export function FacilitiesScreen() {
  const { data, error } = useQuery('facilities', undefined);
  const { run, busy } = useCommand();
  if (!data) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Anlage</h1>
      <div className="grid two">
        <div className="card">
          <h3>Boxen</h3>
          <div className="row">
            <b>
              {data.used} / {data.boxes}
            </b>{' '}
            belegt
          </div>
          <Bar value={data.used} max={data.boxes} />
          <p className="small muted">
            Gekaufte, geclaimte und ersteigerte Pferde brauchen eine freie Box. Neue Zweijährige aus der Zucht des Besitzers kommen nur, wenn Platz ist. Höchstens {data.maxBoxes} Boxen.
          </p>
          <p>
            Unterhalt der Anlage: <Money v={data.upkeep} /> pro Woche
          </p>
        </div>
        <div className="card">
          <h3>Ausbau</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Ausbau</th>
                <th>Wirkung</th>
                <th className="num">Kosten</th>
                <th className="num">Unterhalt/Wo.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.key}>
                  <td><b>{i.label}</b></td>
                  <td className="small">{i.effect}</td>
                  <td className="num"><Money v={i.cost} /></td>
                  <td className="num"><Money v={i.upkeep} /></td>
                  <td>
                    {i.owned ? (
                      <span className="pill ok">vorhanden</span>
                    ) : (
                      <button
                        className="btn small primary"
                        disabled={busy || !i.canBuild}
                        onClick={() => window.confirm(`${i.label} für £${i.cost.toLocaleString('en-GB')} bauen?`) && run('upgradeFacility', { key: i.key })}
                      >
                        Bauen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Der Ausbau ist sofort nutzbar. Trainingsbahnen, Weiden und Gestüt folgen mit der Zucht in Phase 4.</p>
        </div>
      </div>
    </div>
  );
}
