import { useState } from 'react';
import { toast, useCommand, useQuery } from '../api';
import { Bar, HorseLink, Link, Loading, Modal, Money, Stars, useSort, Term } from '../components/common';
import { navigate } from '../router';
import type { MareRow, StallionRow, StudView } from '../../engine/breeding/queries';

const TABS: Array<[string, string]> = [
  ['mares', 'Stuten & Deckplan'],
  ['young', 'Nachwuchs'],
  ['stallions', 'Eigene Hengste'],
  ['intake', 'Aus dem Rennstall'],
  ['register', 'Hengstregister'],
];

export function StudScreen({ tab = 'mares', mareId }: { tab?: string; mareId?: string }) {
  const { data, error } = useQuery('stud', undefined);
  if (!data) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <h1 style={{ marginBottom: 0 }}>Gestüt</h1>
        <span className="muted">
          {data.covering ? (
            <b style={{ color: 'var(--green)' }}>Decksaison läuft – noch {data.coverWeeksLeft} Woche{data.coverWeeksLeft === 1 ? '' : 'n'}</b>
          ) : (
            <>Nächste Decksaison: Januar {data.planSeason} (Woche 1–10)</>
          )}
        </span>
      </div>
      <StudSummary data={data} />
      <div className="tabs">
        {TABS.map(([k, l]) => (
          <Link key={k} to={{ name: 'stud', tab: k }} className={tab === k ? 'active' : ''}>
            {l}
            {k === 'mares' && data.mares.length > 0 && <span className="muted"> ({data.mares.length})</span>}
            {k === 'young' && data.young.length > 0 && <span className="muted"> ({data.young.length})</span>}
          </Link>
        ))}
      </div>
      {tab === 'mares' && <Mares data={data} mareId={mareId} />}
      {tab === 'young' && <Young data={data} />}
      {tab === 'stallions' && <OwnStallions data={data} />}
      {tab === 'intake' && <Intake data={data} />}
      {tab === 'register' && <Register mareId={null} onPick={null} />}
    </div>
  );
}

function StudSummary({ data }: { data: StudView }) {
  return (
    <div className="grid three">
      <div className="card">
        <h3>Plätze</h3>
        {data.level === 0 ? (
          <p className="small">
            Kein eigenes Gestüt: Stuten und Nachwuchs stehen in Pension bei einem fremden Gestüt (<Money v={90} /> je Pferd und Woche).{' '}
            <Link to={{ name: 'facilities' }}>Gestüt bauen</Link>
          </p>
        ) : (
          <>
            <div className="row">
              <b>
                {Math.min(data.used, data.places)} / {data.places}
              </b>{' '}
              eigene Plätze belegt (Stufe {data.level})
            </div>
            <Bar value={Math.min(data.used, data.places)} max={Math.max(1, data.places)} />
            {data.used > data.places && <p className="small muted">{data.used - data.places} weitere in Pension.</p>}
          </>
        )}
      </div>
      <div className="card">
        <h3>Kosten pro Woche</h3>
        <dl className="kv">
          <dt>Eigenes Gestüt</dt>
          <dd><Money v={data.weeklyCost.own} /></dd>
          <dt>Pension</dt>
          <dd><Money v={data.weeklyCost.external} /></dd>
          <dt>Deckhengste</dt>
          <dd><Money v={data.weeklyCost.stallions} /></dd>
          <dt>Gesamt</dt>
          <dd><b><Money v={data.weeklyCost.total} /></b></dd>
        </dl>
      </div>
      <div className="card">
        <h3>Gestütsleiter</h3>
        {data.studManager ? (
          <p>
            {data.studManager.name} <Stars v={data.studManager.stars} />
          </p>
        ) : (
          <p className="small">
            Keiner angestellt. Ein Gestütsleiter erhöht im eigenen Gestüt die Trächtigkeitsrate, senkt Fohlenverluste und macht die Paarungsprognose genauer.{' '}
            <Link to={{ name: 'staff' }}>Personal</Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Mares({ data, mareId }: { data: StudView; mareId?: string }) {
  const { run, busy } = useCommand();
  const mare = mareId ? data.mares.find((m) => m.id === mareId) : undefined;
  if (data.mares.length === 0) {
    return (
      <div className="empty">
        Noch keine Zuchtstuten. Stuten aus dem Rennstall kannst du unter „Aus dem Rennstall“ in die Zucht nehmen, oder du ersteigerst welche auf der Zuchtstutenauktion im
        Dezember (Markt → Auktionen).
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>Stute</th>
              <th className="num">Alter</th>
              <th>Vater</th>
              <th className="num">Rating</th>
              <th className="num">Fohlen</th>
              <th className="num">Bestes</th>
              <th>Trächtig</th>
              <th>Deckplan {data.planSeason}</th>
              <th className="num" title="Chance je Woche der Decksaison, dass die Stute aufnimmt">Aufnahme/Wo.</th>
              <th className="num">Wert</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.mares.map((m) => (
              <tr key={m.id} className={mare?.id === m.id ? 'sel' : ''}>
                <td>
                  <HorseLink id={m.id} name={m.name} />
                  {!m.inOwnStud && <span className="pill" style={{ marginLeft: 6 }} title="steht in Pension">Pension</span>}
                  {m.barren && <span className="pill warn" style={{ marginLeft: 6 }}>güst</span>}
                </td>
                <td className="num">{m.age}</td>
                <td>{m.sire ?? '–'}</td>
                <td className="num">{m.rating ?? '–'}</td>
                <td className="num">{m.foals}</td>
                <td className="num">{m.bestProgeny ?? '–'}</td>
                <td>
                  {m.pregnancy ? (
                    <span className="small">
                      von <HorseLink id={m.pregnancy.sireId} name={m.pregnancy.sireName} />, Termin {m.pregnancy.due}
                    </span>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td>
                  {m.plan ? (
                    <span className="small">
                      <b>{m.plan.name}</b> {m.plan.own ? '(eigener)' : <Money v={m.plan.fee} />}
                    </span>
                  ) : m.canPlan ? (
                    <span className="muted small">offen</span>
                  ) : (
                    <span className="muted small">{m.age > 21 ? 'zu alt' : 'tragend'}</span>
                  )}
                </td>
                <td className="num">{m.conceptionPct.toFixed(0)} %</td>
                <td className="num"><Money v={m.value} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {m.canPlan && (
                    <button className="btn small primary" onClick={() => navigate({ name: 'stud', tab: 'mares', mareId: m.id })}>
                      Hengst wählen
                    </button>
                  )}{' '}
                  {m.plan && (
                    <button className="btn small" disabled={busy} onClick={() => run('setMating', { mareId: m.id, stallionId: null })}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">
          Gedeckt wird in Woche 1–10 jeder Saison: Jede Woche nimmt eine Stute mit der angegebenen Wahrscheinlichkeit auf (ältere Stuten seltener). Die Decktaxe wird erst bei
          bestätigter Trächtigkeit fällig. Fohlen kommen in der folgenden Saison zwischen Februar und Mai zur Welt. Einen Deckplan kannst du jederzeit für die nächste Decksaison
          festlegen.
        </p>
      </div>
      {mare && (
        <Modal onClose={() => navigate({ name: 'stud', tab: 'mares' })}>
          <h2>Hengst für {mare.name}</h2>
          <MarePlanHint mare={mare} />
          <Register
            mareId={mare.id}
            onPick={async (s) => {
              const res = await run('setMating', { mareId: mare.id, stallionId: s.id });
              if (res?.planned) {
                toast(`Deckplan: ${mare.name} × ${s.name}`, 'success');
                navigate({ name: 'stud', tab: 'mares' });
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function MarePlanHint({ mare }: { mare: MareRow }) {
  return (
    <p className="small muted">
      {mare.name}, {mare.age} Jahre{mare.rating !== null ? `, Rating ${mare.rating}` : ', ohne Rennleistung'}
      {mare.sire ? `, von ${mare.sire}` : ''}. Die Prognose schätzt das Niveau des Fohlens (Rating-Skala) aus öffentlichen Daten: Decktaxe des Hengsts und Leistung der Stute. Ein
      Nick zeigt, wie Nachkommen dieser Vaterlinie aus Stuten derselben Muttervaterlinie bisher gelaufen sind (ab 3 gerateten Pferden). Hoher Inzuchtkoeffizient kostet Konstanz
      und Gesundheit.
    </p>
  );
}

/** Hengstregister mit Suche; mit Stute zusätzlich Paarungsprognose. */
function Register({ mareId, onPick }: { mareId: string | null; onPick: ((s: StallionRow) => void) | null }) {
  const { data, error } = useQuery('stallions', { mareId });
  const [q, setQ] = useState('');
  const [maxFee, setMaxFee] = useState<number | null>(null);
  const rows = data?.rows.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.line ?? '').toLowerCase().includes(q.toLowerCase())) && (maxFee === null || r.fee <= maxFee)) ?? null;
  const flat = rows?.map((r) => ({
    ...r,
    avg: r.progeny.avgRating,
    winPct: r.progeny.runners ? Math.round((100 * r.progeny.winners) / r.progeny.runners) : null,
    expected: r.match?.expected ?? null,
    coi: r.match?.coi ?? null,
    load: r.book.covers / r.book.limit,
  }));
  const { sorted, th } = useSort(flat ?? null, { key: mareId ? 'expected' : 'fee', dir: -1 });
  if (!data || !sorted) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row">
        <input placeholder="Name oder Linie suchen" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <select value={maxFee ?? ''} onChange={(e) => setMaxFee(e.target.value ? Number(e.target.value) : null)}>
          <option value="">alle Decktaxen</option>
          {[2000, 5000, 10000, 25000, 50000, 100000].map((v) => (
            <option key={v} value={v}>bis £{v.toLocaleString('en-GB')}</option>
          ))}
        </select>
        <span className="muted small">{sorted.length} Hengste</span>
      </div>
      <div style={{ maxHeight: onPick ? '60vh' : undefined, overflow: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              {th('name', 'Hengst')}
              {th('age', 'Alter', 'num')}
              {th('line', 'Linie')}
              {th('raceRating', 'Rating', 'num')}
              {th('fee', 'Decktaxe', 'num')}
              <th className="num" title="Nachkommen gesamt / gelaufen / Sieger">Nachk.</th>
              {th('winPct', 'Sieger %', 'num')}
              {th('avg', 'Ø Rating', 'num')}
              <th className="num" title="Black-Type-Sieger (Gruppe/Listed)">BT</th>
              <th title="mittlere Siegdistanz und Bodenneigung der Nachkommen">Tendenz</th>
              {th('load', 'Buch', 'num')}
              {mareId && th('expected', 'Prognose', 'num')}
              {mareId && <th><Term id="nick">Nick</Term></th>}
              {mareId && th('coi', 'Inzucht', 'num')}
              {onPick && <th></th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>
                  <HorseLink id={r.id} name={r.name} />
                  {r.own && <span className="pill ok" style={{ marginLeft: 6 }}>eigener</span>}
                  <div className="small muted">{r.sire ? `v. ${r.sire}` : ''} · {r.owner}</div>
                </td>
                <td className="num">{r.age}</td>
                <td className="small">{r.line ?? '–'}</td>
                <td className="num">{r.raceRating ?? '–'}</td>
                <td className="num"><Money v={r.fee} /></td>
                <td className="num small">
                  {r.progeny.foals} / {r.progeny.runners} / {r.progeny.winners}
                </td>
                <td className="num">{r.winPct === null ? '–' : `${r.winPct} %`}</td>
                <td className="num">{r.avg ?? '–'}</td>
                <td className="num">{r.progeny.stakesWinners || '–'}</td>
                <td className="small">
                  {r.tendency.winDistanceM ? `${(r.tendency.winDistanceM / 201.168).toFixed(1)}f` : '–'}
                  {r.tendency.going !== null && <> · {r.tendency.going > 0.25 ? 'weich' : r.tendency.going < -0.25 ? 'fest' : 'neutral'}</>}
                </td>
                <td className="num small">
                  {r.book.covers}/{r.book.limit}
                </td>
                {mareId && (
                  <td className="num">
                    {r.match ? (
                      <span title={`Spanne ${r.match.low}–${r.match.high}`}>
                        <b>{r.match.expected}</b> <span className="small muted">({r.match.low}–{r.match.high})</span>
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                )}
                {mareId && (
                  <td className="small">
                    {r.match?.nick ? (
                      <span className={`pill ${r.match.nick.diff >= 2 ? 'ok' : r.match.nick.diff <= -2 ? 'bad' : ''}`} title={`${r.match.nick.n} geratete Nachkommen dieser Linienkombination`}>
                        {r.match.nick.diff > 0 ? '+' : ''}
                        {r.match.nick.diff} ({r.match.nick.n})
                      </span>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                )}
                {mareId && (
                  <td className="num">
                    {r.match && r.match.coi > 0 ? <span className={`pill ${r.match.coi >= 0.0625 ? 'bad' : 'warn'}`}>{(r.match.coi * 100).toFixed(1)} %</span> : <span className="muted">0</span>}
                  </td>
                )}
                {onPick && (
                  <td>
                    <button className="btn small primary" onClick={() => onPick(r)} disabled={r.book.covers >= r.book.limit || !!r.match?.isSire} title={r.match?.isSire ? 'Vater der Stute' : ''}>
                      wählen
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!onPick && (
        <p className="small muted">
          Decktaxen richten sich nach der Rennleistung des Hengsts und – sobald genug Nachkommen gelaufen sind – nach deren Erfolg. Ob ein Hengst vererbt, zeigen erst seine
          Nachkommen; die Statistik dazu steht unter <Link to={{ name: 'breeding' }}>Zucht-Statistik</Link>.
        </p>
      )}
    </div>
  );
}

function Young({ data }: { data: StudView }) {
  const { run, busy } = useCommand();
  if (data.young.length === 0) return <div className="empty">Kein Nachwuchs im Gestüt.</div>;
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Alter</th>
            <th>Geschlecht</th>
            <th>Farbe</th>
            <th>Vater</th>
            <th>Mutter</th>
            <th>Exterieur</th>
            <th className="num">Wert</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.young.map((y) => (
            <tr key={y.id}>
              <td><HorseLink id={y.id} name={y.name} /></td>
              <td className="num">{y.age}</td>
              <td>{y.sex}</td>
              <td>{y.colour}</td>
              <td>{y.sireId ? <HorseLink id={y.sireId} name={y.sire ?? ''} /> : (y.sire ?? '–')}</td>
              <td>{y.dam ?? '–'}</td>
              <td>{y.conformation}</td>
              <td className="num"><Money v={y.value} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {y.canTrain && (
                  <button className="btn small primary" disabled={busy || data.freeBoxes <= 0} title={data.freeBoxes <= 0 ? 'keine freie Box' : ''} onClick={() => run('bringIntoTraining', { horseId: y.id })}>
                    Ins Training
                  </button>
                )}{' '}
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`${y.name} für 60 % des Marktwerts an die Züchter verkaufen?`)) return;
                    const r = await run('sellToBreeders', { horseId: y.id });
                    if (r) toast(`${y.name} verkauft für £${r.price.toLocaleString('en-GB')}`, 'success');
                  }}
                >
                  Verkaufen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Fohlen und Jährlinge bleiben im Gestüt. Mit zwei Jahren (1. Januar) kommen sie in den Rennstall, wenn eine Box frei ist. Jährlinge kannst du auch auf der Jährlingsauktion
        im Oktober einliefern (Markt → Auktionen, Katalog ab September).
      </p>
    </div>
  );
}

function OwnStallions({ data }: { data: StudView }) {
  const { run, busy } = useCommand();
  if (data.stallions.length === 0) {
    return <div className="empty">Kein eigener Deckhengst. Hengste mit Rating ab 75 kannst du nach der Rennkarriere aufstellen („Aus dem Rennstall“).</div>;
  }
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            <th>Hengst</th>
            <th className="num">Alter</th>
            <th>Linie</th>
            <th className="num"><Term id="fee">Decktaxe</Term></th>
            <th className="num">Buch</th>
            <th className="num">Nachkommen</th>
            <th className="num">Sieger</th>
            <th className="num">Ø Rating</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.stallions.map((s) => (
            <tr key={s.id}>
              <td>
                <HorseLink id={s.id} name={s.name} />
                {s.partners > 0 && <span className="pill" style={{ marginLeft: 6 }}>{Math.round(s.partners * 100)} % Teilhaber</span>}
              </td>
              <td className="num">{s.age}</td>
              <td className="small">{s.line ?? '–'}</td>
              <td className="num"><Money v={s.fee} /></td>
              <td className="num">
                {s.covers}/{s.bookLimit}
              </td>
              <td className="num">{s.progeny.foals}</td>
              <td className="num">{s.progeny.winners}</td>
              <td className="num">{s.progeny.avgRating ?? '–'}</td>
              <td>
                <button className="btn small danger" disabled={busy} onClick={() => window.confirm(`${s.name} in Pension schicken? Er deckt dann nicht mehr.`) && run('retireHorse', { horseId: s.id })}>
                  Pension
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Eigene Hengste decken deine Stuten kostenlos; Decktaxen fremder Stuten gehen an dich. Die Taxe passt sich jedes Jahr an Rennleistung und Nachkommen an. Hengsthaltung
        kostet £150 pro Woche.
      </p>
    </div>
  );
}

function Intake({ data }: { data: StudView }) {
  const { run, busy } = useCommand();
  if (data.candidates.length === 0) return <div className="empty">Keine Pferde ab drei Jahren im Rennstall, die für die Zucht in Frage kommen.</div>;
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            <th>Pferd</th>
            <th className="num">Alter</th>
            <th className="num">Rating</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.candidates.map((c) => (
            <tr key={c.id}>
              <td><HorseLink id={c.id} name={c.name} /></td>
              <td className="num">{c.age}</td>
              <td className="num">{c.rating ?? '–'}</td>
              <td>
                {c.sex === 'female' ? (
                  <button className="btn small primary" disabled={busy} onClick={() => window.confirm(`${c.name} beendet die Rennkarriere und geht als Zuchtstute ins Gestüt. Fortfahren?`) && run('toBroodmare', { horseId: c.id })}>
                    In die Zucht
                  </button>
                ) : (
                  <button
                    className="btn small primary"
                    disabled={busy || !c.canStud}
                    title={c.canStud ? '' : 'Erst ab Rating 75 nimmt eine Deckstation den Hengst auf'}
                    onClick={() => window.confirm(`${c.name} beendet die Rennkarriere und wird Deckhengst. Fortfahren?`) && run('standAsStallion', { horseId: c.id })}
                  >
                    Als Deckhengst aufstellen
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Stuten gehen mit acht Jahren automatisch in die Zucht; vorher entscheidest du. Der Schritt ist endgültig.</p>
    </div>
  );
}
