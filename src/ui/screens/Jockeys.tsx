import { useState } from 'react';
import { useQuery } from '../api';
import { Loading, Money, PlaceholderTag, SilksIcon, Stars, useSort } from '../components/common';
import { ContractDialog } from '../components/Contract';
import type { JockeyView } from '../../engine/game/queries';
import type { StaffRow } from '../../engine/game/econQueries';
import { StaffAvatar } from '../components/Portrait';

function asStaffRow(j: JockeyView): StaffRow {
  return {
    id: j.id,
    name: j.name,
    role: 'jockey',
    generated: !j.placeholder,
    roleLabel: 'Jockey',
    age: j.age,
    stars: j.rating,
    experience: 0,
    morale: null,
    salary: null,
    demand: 0,
    prizeShare: null,
    contractEnd: null,
    leaving: null,
    own: false,
    blocked: false,
    horses: [],
    jockey: { weight: j.weight, allowance: j.allowance, careerWins: j.careerWins, suspended: j.suspendedUntilWeek !== null, fee: j.fee },
    specialty: null,
  };
}

export function JockeysScreen() {
  const { data, error } = useQuery('jockeys', undefined);
  const { sorted, th } = useSort<JockeyView>(data, { key: 'wins', dir: -1 });
  const [hire, setHire] = useState<StaffRow | null>(null);
  if (!sorted) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 14 }}>
      <h1>Jockeys</h1>
      <p className="muted">
        Freie Jockeys reiten gegen Reitgebühr und 8 % des Preisgelds. Ein Stalljockey bekommt ein festes Gehalt und seine vertragliche Erfolgsbeteiligung, reitet deine Pferde zuerst und kostet keine
        Reitgebühr. Nachwuchsjockeys (bis 26 Jahre, unter 95 Siegen) bringen eine Gewichtserlaubnis von 7, 5 oder 3 lb – außer in Group- und Listed-Rennen.
      </p>
      <div className="card">
        <table className="data">
          <thead>
            <tr>
              {th('name', 'Jockey')}
              {th('rating', 'Können', 'num')}
              {th('age', 'Alter', 'num')}
              {th('weightLb', 'Gewicht', 'num')}
              {th('allowance', 'Erlaubnis', 'num')}
              {th('rides', 'Ritte (Saison)', 'num')}
              {th('wins', 'Siege', 'num')}
              <th className="num">Sieg %</th>
              {th('careerWins', 'Karriere', 'num')}
              <th>Stall</th>
              {th('fee', 'Reitgebühr', 'num')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((j) => (
              <tr key={j.id} className={j.stable?.isPlayer ? 'mine' : ''}>
                <td>
                  <span className="person">
                  {!j.placeholder && <StaffAvatar role="jockey" name={j.name} id={j.id} size={28} />}
                  <span>{j.name}</span> <PlaceholderTag show={j.placeholder} />
                  </span>
                  {j.suspendedUntilWeek !== null && <span className="pill bad" style={{ marginLeft: 6 }}>gesperrt bis W{j.suspendedUntilWeek}</span>}
                </td>
                <td className="num"><Stars v={j.rating} /></td>
                <td className="num">{j.age}</td>
                <td className="num mono">{j.weight}</td>
                <td className="num">{j.allowance ? `${j.allowance} lb` : ''}</td>
                <td className="num">{j.rides}</td>
                <td className="num">{j.wins}</td>
                <td className="num">{j.rides ? Math.round((j.wins / j.rides) * 100) : 0}</td>
                <td className="num">{j.careerWins}</td>
                <td className="small">
                  {j.stable && (
                    <span className="row">
                      <SilksIcon silks={j.stable.silks} size={14} /> {j.stable.isPlayer ? 'dein Stalljockey' : j.stable.name}
                    </span>
                  )}
                </td>
                <td className="num"><Money v={j.fee} /></td>
                <td>
                  {!j.stable && (
                    <button className="btn small" onClick={() => setHire(asStaffRow(j))}>
                      verpflichten
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hire && <ContractDialog s={hire} mode="hire" onClose={() => setHire(null)} />}
    </div>
  );
}
