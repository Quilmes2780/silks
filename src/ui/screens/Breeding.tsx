import { useQuery } from '../api';
import { HorseLink, Link, Loading, Money, useSort } from '../components/common';
import type { BreedingStatsView } from '../../engine/breeding/queries';

const TABS: Array<[string, string]> = [
  ['sires', 'Hengste'],
  ['dams', 'Mutterstuten'],
  ['nicks', 'Nicks'],
  ['breeders', 'Züchter'],
];

export function BreedingScreen({ tab = 'sires' }: { tab?: string }) {
  const { data, error } = useQuery('breedingStats', undefined);
  if (!data) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 14 }}>
      <h1 style={{ marginBottom: 0 }}>Zucht-Statistik</h1>
      <div className="tabs">
        {TABS.map(([k, l]) => (
          <Link key={k} to={{ name: 'breeding', tab: k }} className={tab === k ? 'active' : ''}>
            {l}
          </Link>
        ))}
      </div>
      {tab === 'sires' && <Sires data={data} />}
      {tab === 'dams' && <Dams data={data} />}
      {tab === 'nicks' && <Nicks data={data} />}
      {tab === 'breeders' && <Breeders data={data} />}
    </div>
  );
}

function Sires({ data }: { data: BreedingStatsView }) {
  const rows = data.sires.map((s) => ({
    ...s,
    foals: s.progeny.foals,
    runners: s.progeny.runners,
    winners: s.progeny.winners,
    avg: s.progeny.avgRating,
    best: s.progeny.bestRating,
    bt: s.progeny.stakesWinners,
    dist: s.tendency.winDistanceM,
  }));
  const { sorted, th } = useSort(rows, { key: 'avg', dir: -1 });
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            {th('name', 'Hengst')}
            {th('line', 'Linie')}
            {th('fee', 'Decktaxe', 'num')}
            {th('foals', 'Nachkommen', 'num')}
            {th('runners', 'gelaufen', 'num')}
            {th('winners', 'Sieger', 'num')}
            {th('winnerPct', 'Sieger %', 'num')}
            {th('avg', 'Ø Rating', 'num')}
            {th('best', 'bestes', 'num')}
            {th('bt', 'Black Type', 'num')}
            {th('dist', 'Ø Siegdistanz', 'num')}
            <th>Boden</th>
          </tr>
        </thead>
        <tbody>
          {sorted!.map((s) => (
            <tr key={s.id}>
              <td>
                <HorseLink id={s.id} name={s.name} />
                {!s.active && <span className="pill" style={{ marginLeft: 6 }}>Pension</span>}
                <div className="small muted">{s.owner}</div>
              </td>
              <td className="small">{s.line ?? '–'}</td>
              <td className="num">{s.fee !== null ? <Money v={s.fee} /> : '–'}</td>
              <td className="num">{s.foals}</td>
              <td className="num">{s.runners}</td>
              <td className="num">{s.winners}</td>
              <td className="num">{s.winnerPct === null ? '–' : `${s.winnerPct} %`}</td>
              <td className="num">{s.avg ?? '–'}</td>
              <td className="num">{s.best ?? '–'}</td>
              <td className="num">{s.bt || '–'}</td>
              <td className="num">{s.dist ? `${(s.dist / 201.168).toFixed(1)}f` : '–'}</td>
              <td className="small">{s.tendency.going === null ? '–' : s.tendency.going > 0.25 ? 'weich' : s.tendency.going < -0.25 ? 'fest' : 'neutral'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Ø Rating: Mittel der Official Ratings aller gerateten Nachkommen. Distanz- und Bodenneigung aus den Siegen der Nachkommen. Alles öffentlich – was ein Hengst wirklich
        vererbt, zeigt sich erst über viele Nachkommen.
      </p>
    </div>
  );
}

function Dams({ data }: { data: BreedingStatsView }) {
  if (!data.dams.length) return <div className="empty">Noch keine Mutterstuten mit gelaufenen Nachkommen.</div>;
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            <th>Stute</th>
            <th>Besitzer</th>
            <th className="num">Nachkommen</th>
            <th className="num">gelaufen</th>
            <th className="num">Sieger</th>
            <th className="num">Black Type</th>
            <th className="num">bestes Rating</th>
          </tr>
        </thead>
        <tbody>
          {data.dams.map((d) => (
            <tr key={d.id}>
              <td><HorseLink id={d.id} name={d.name} /></td>
              <td className="small">{d.owner}</td>
              <td className="num">{d.foals}</td>
              <td className="num">{d.runners}</td>
              <td className="num">{d.winners}</td>
              <td className="num">{d.stakesWinners || '–'}</td>
              <td className="num">{d.best ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Die 50 erfolgreichsten Mutterstuten mit im Spiel geborenen Nachkommen.</p>
    </div>
  );
}

function Nicks({ data }: { data: BreedingStatsView }) {
  const lines = data.nicks.lines;
  const cell = (s: string, d: string) => data.nicks.cells.find((c) => c.sireLine === s && c.damSireLine === d);
  return (
    <div className="card">
      <p className="small muted">
        Zeilen: Vaterlinie des Pferds. Spalten: Linie des Muttervaters. Wert: Ø Official Rating der Nachkommen dieser Kombination gegenüber dem Durchschnitt aller gerateten
        Pferde mit bekannter Mutter ({data.nicks.population}); in Klammern die Zahl der Pferde (ab 3). Manche Kombinationen harmonieren – wer es früh erkennt, züchtet besser.
      </p>
      <div style={{ overflow: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>Vaterlinie ↓ / Muttervater →</th>
              {lines.map((l) => (
                <th key={l.id} className="num small">{l.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((s) => (
              <tr key={s.id}>
                <td className="small"><b>{s.name}</b></td>
                {lines.map((d) => {
                  const c = cell(s.id, d.id);
                  return (
                    <td key={d.id} className="num small" style={{ background: c ? heat(c.diff, c.n) : undefined }}>
                      {c ? (
                        <>
                          {c.diff > 0 ? '+' : ''}
                          {c.diff} <span className="muted">({c.n})</span>
                        </>
                      ) : (
                        <span className="muted">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function heat(diff: number, n: number): string {
  const a = Math.min(0.45, (Math.abs(diff) / 10) * Math.min(1, n / 10));
  return diff >= 0 ? `rgba(46, 125, 50, ${a})` : `rgba(183, 28, 28, ${a})`;
}

function Breeders({ data }: { data: BreedingStatsView }) {
  if (!data.breeders.length) return <div className="empty">Noch keine im Spiel gezogenen Pferde.</div>;
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            <th>Züchter</th>
            <th className="num">gezogen</th>
            <th className="num">gelaufen</th>
            <th className="num">Sieger</th>
            <th className="num">Black Type</th>
            <th className="num">Preisgeld</th>
          </tr>
        </thead>
        <tbody>
          {data.breeders.map((b) => (
            <tr key={b.id} className={b.isPlayer ? 'sel' : ''}>
              <td>{b.isPlayer ? <b>{b.name}</b> : b.name}</td>
              <td className="num">{b.bred}</td>
              <td className="num">{b.runners}</td>
              <td className="num">{b.winners}</td>
              <td className="num">{b.stakesWinners || '–'}</td>
              <td className="num"><Money v={b.earnings} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Pferde, die im Spiel aus einer bekannten Stute geboren wurden; Preisgeld über die gesamte Karriere.</p>
    </div>
  );
}
