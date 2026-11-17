import { useCommand, useQuery } from '../api';
import { Bar, ClassPill, Fig, HorseLink, Loading, Money, RaceLink, SilksIcon } from '../components/common';
import { navigate } from '../router';

export function OfficeScreen() {
  const { data, error } = useQuery('office', undefined);
  const { run } = useCommand();
  if (!data) return <Loading error={error} />;
  const unread = data.inbox.filter((m) => !m.read).length;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row">
        <h1 style={{ marginBottom: 0 }}>Büro</h1>
        <span className="muted">{data.header.stable.name}</span>
      </div>
      <div className="grid side">
        <div className="card">
          <h3>
            Posteingang {unread > 0 && <span className="badge">{unread}</span>}
            <span style={{ flex: 1 }} />
            {unread > 0 && (
              <button className="btn small" onClick={() => run('markInboxRead', { ids: 'all' })}>
                alle gelesen
              </button>
            )}
          </h3>
          {data.inbox.length === 0 && <div className="empty">Keine Nachrichten.</div>}
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            {data.inbox.map((m) => (
              <div
                key={m.id}
                className={`inbox-item ${m.read ? '' : 'unread'}`}
                onClick={() => {
                  if (!m.read) run('markInboxRead', { ids: [m.id] });
                  if (m.raceId) navigate({ name: 'race', id: m.raceId });
                  else if (m.horseId) navigate({ name: 'horse', id: m.horseId });
                }}
              >
                <div className="row">
                  <span className="t">{m.title}</span>
                  <span className="small muted" style={{ marginLeft: 'auto' }}>
                    W{m.week}/{m.season}
                  </span>
                </div>
                <div className="b">{m.body}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <h3>Finanzen</h3>
            <div className="metrics">
              <div className="metric">
                <span className="v"><Money v={data.finance.balance} /></span>
                <span className="l">Kontostand</span>
              </div>
              <div className="metric">
                <span className="v"><Money v={data.finance.seasonPrize} /></span>
                <span className="l">Preisgeld Saison</span>
              </div>
            </div>
            <table className="data" style={{ marginTop: 8 }}>
              <tbody>
                {data.finance.lastEntries.slice(0, 6).map((l, i) => (
                  <tr key={i}>
                    <td className="small">{l.text}</td>
                    <td className="num small"><Money v={l.amount} signed /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.lastSummary && (
            <div className="card small">
              <h3>Letzte Woche</h3>
              {data.lastSummary.racesRun} Rennen, {data.lastSummary.runners} Starter, {data.lastSummary.injuries} Verletzungen. Simulation in{' '}
              {Math.round(data.lastSummary.durationMs)} ms.
            </div>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Anstehende Rennen</h3>
          {data.upcoming.length === 0 ? (
            <div className="empty">
              Keine Nennungen. <a href="#/calendar">Zum Rennkalender</a>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Rennen</th>
                  <th>Pferd</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((u) => (
                  <tr key={u.raceId + u.horseId} className={u.thisWeek ? 'mine' : ''}>
                    <td className="small nowrap">{u.dateLabel}</td>
                    <td>
                      <RaceLink id={u.raceId} name={u.raceName} /> <ClassPill c={u.raceClass} />
                      <div className="small muted">
                        {u.trackName} · {u.distance}
                      </div>
                    </td>
                    <td><HorseLink id={u.horseId} name={u.horseName} /></td>
                    <td>
                      <span className={`pill ${u.status === 'Starter' ? 'ok' : u.status === 'abgesagt' ? 'bad' : ''}`}>{u.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Formstatus</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Pferd</th>
                <th>Form</th>
                <th>Fitness</th>
                <th>Frische</th>
                <th className="num">OR</th>
                <th className="num">letzte SF</th>
              </tr>
            </thead>
            <tbody>
              {data.form.map((f) => (
                <tr key={f.horseId}>
                  <td><HorseLink id={f.horseId} name={f.name} /> <span className="small muted">{f.age}j</span></td>
                  <td className="small">{f.injury ? <span className="pill bad">{f.injury}</span> : f.form}</td>
                  <td><Bar value={f.fitness} warnBelow={80} badBelow={65} /></td>
                  <td><Bar value={f.freshness} warnBelow={55} badBelow={35} /></td>
                  <td className="num">{f.officialRating ?? '–'}</td>
                  <td className="num"><Fig v={f.lastFigure?.value} runId={f.lastFigure?.runId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Besitzer-Tabelle {data.header.season}</h3>
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Stall</th>
              <th className="num">Siege</th>
              <th className="num">Preisgeld</th>
            </tr>
          </thead>
          <tbody>
            {data.leaders.map((l, i) => (
              <tr key={l.stable.id} className={l.stable.isPlayer ? 'mine' : ''}>
                <td>{i + 1}</td>
                <td>
                  <span className="row"><SilksIcon silks={l.stable.silks} size={18} /> {l.stable.name}</span>
                </td>
                <td className="num">{l.wins}</td>
                <td className="num"><Money v={l.prize} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
