import { useCommand, useQuery } from '../api';
import { Bar, Fig, HorseLink, Loading, Money, PlaceholderTag, RaceLink, useSort } from '../components/common';
import type { StableRow } from '../../engine/game/queries';

export function StableScreen() {
  const { data, error } = useQuery('stableList', {});
  const { data: info } = useQuery('trainingInfo', undefined);
  const { run, busy } = useCommand();
  const { sorted, th } = useSort<StableRow>(data, { key: 'age', dir: 1 });
  if (!sorted) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Stall</h1>
      <div className="card">
        <table className="data">
          <thead>
            <tr>
              {th('name', 'Pferd')}
              {th('age', 'Alter', 'num')}
              <th>Geschlecht</th>
              <th>Trainer-Einschätzung</th>
              {th('officialRating', 'OR', 'num')}
              {th('starts', 'Starts', 'num')}
              {th('wins', 'Siege', 'num')}
              {th('earnings', 'Verdienst', 'num')}
              <th className="num">letzte SF</th>
              <th className="num">beste SF</th>
              {th('fitness', 'Fitness')}
              {th('freshness', 'Frische')}
              <th>Form</th>
              <th>Training</th>
              <th>Nächstes Rennen</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.horseId}>
                <td>
                  <HorseLink id={h.horseId} name={h.name} /> <PlaceholderTag show={h.placeholder} />
                  <div className="small muted">{h.colour}</div>
                </td>
                <td className="num">{h.age}</td>
                <td className="small">{h.sex}</td>
                <td className="small" title={`${h.trainerOpinion.going}; ${h.trainerOpinion.style}`}>
                  <span className="nowrap"><b>{h.trainerOpinion.distance}</b></span>
                  <div className="muted">{h.trainerOpinion.going}</div>
                </td>
                <td className="num">{h.officialRating ?? '–'}</td>
                <td className="num">{h.starts}</td>
                <td className="num">{h.wins}</td>
                <td className="num"><Money v={h.earnings} /></td>
                <td className="num"><Fig v={h.lastFigure?.value} runId={h.lastFigure?.runId} /></td>
                <td className="num"><Fig v={h.bestFigure?.value} runId={h.bestFigure?.runId} /></td>
                <td><Bar value={h.fitness} warnBelow={80} badBelow={65} /></td>
                <td><Bar value={h.freshness} warnBelow={55} badBelow={35} /></td>
                <td className="small">{h.injured ? <span className="pill bad">verletzt</span> : h.form}</td>
                <td>
                  <select
                    value={info?.templates.find((t) => t.label === h.training)?.key ?? ''}
                    disabled={busy || h.injured}
                    onChange={(e) => e.target.value && run('setTraining', { horseId: h.horseId, plan: e.target.value })}
                  >
                    {!info?.templates.some((t) => t.label === h.training) && <option value="">individuell</option>}
                    {info?.templates.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </td>
                <td className="small">
                  {h.nextRace ? (
                    <>
                      <RaceLink id={h.nextRace.raceId} name={h.nextRace.name} />
                      <div className="muted">{h.nextRace.dateLabel}</div>
                    </>
                  ) : (
                    <a href={`#/calendar/${h.horseId}`}>Rennen suchen</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Zahlen in der Spalte SF sind anklickbar und führen zum Rennen, aus dem sie stammen. Die Trainer-Einschätzung wird mit jedem Start und mit einem
        besseren Trainer genauer; den Laufstil zeigt der Tooltip. Training wählst du hier als Vorlage oder im Pferdeprofil Tag für Tag.
      </p>
    </div>
  );
}
