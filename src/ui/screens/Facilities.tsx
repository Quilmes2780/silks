import { useCommand, useQuery } from '../api';
import { Bar, Loading, Money } from '../components/common';
import { Banner } from '../components/Portrait';
import { sceneImage, yardScene, type Scene } from '../assets';

const SCENE: Record<string, Scene> = { pool: 'equine_pool', hill: 'gallops', clinic: 'vet_clinic', stud: 'stud_paddocks' };

export function FacilitiesScreen() {
  const { data, error } = useQuery('facilities', undefined);
  const { run, busy } = useCommand();
  if (!data) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Anlage</h1>
      <Banner src={sceneImage(yardScene(data.boxes))} height={190} position="center 55%">
        Dein Hof: {data.boxes} Boxen
      </Banner>
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
            Gekaufte, geclaimte und ersteigerte Pferde im Training brauchen eine freie Box; Zweijährige aus eigener Zucht kommen nur, wenn Platz ist. Stuten und Nachwuchs stehen im Gestüt. Höchstens {data.maxBoxes} Boxen.
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
                  <td>
                    <div className="person">
                      {SCENE[i.key] && <img className="thumb" src={sceneImage(SCENE[i.key]!)} alt="" loading="lazy" />}
                      <b>{i.label}</b>
                    </div>
                  </td>
                  <td className="small">{i.effect}</td>
                  <td className="num"><Money v={i.cost} /></td>
                  <td className="num"><Money v={i.upkeep} /></td>
                  <td>
                    {i.level !== null && i.level > 0 && !i.owned && <span className="pill ok" style={{ marginRight: 6 }}>Stufe {i.level}</span>}
                    {i.owned ? (
                      <span className="pill ok">{i.level !== null ? `Stufe ${i.level} (voll)` : 'vorhanden'}</span>
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
          <p className="small muted">
            Der Ausbau ist sofort nutzbar. Gestüt: {data.stud.used} Stuten und Nachwuchs, {data.stud.places} eigene Plätze – wer keinen Platz hat, steht in Pension (teurer).
          </p>
        </div>
      </div>
    </div>
  );
}
