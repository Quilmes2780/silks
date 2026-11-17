import { useMemo, useState } from 'react';
import { useCommand, useQuery } from '../api';
import { Chart, CHART_COLORS } from '../components/Chart';
import { ClassPill, Fig, HorseLink, Lengths, Link, Loading, Money, SilksIcon, Time } from '../components/common';
import { RaceView } from '../components/RaceView';
import type { CardRunner, RaceCardView, ResultRow } from '../../engine/game/queries';
import type { Tactic } from '../../engine/types';
import { ATTACK_LABEL, EVENT_LABEL, lengthsLabel, PATH_LABEL, RUNSTYLE_LABEL, raceTime } from '../../engine/game/format';

export function RaceScreen({ id, tab }: { id: string; tab?: string }) {
  const { data: r, error } = useQuery('raceCard', { raceId: id });
  if (!r) return <Loading error={error} />;
  const ran = r.status === 'run';
  const active = tab ?? (ran ? 'result' : 'card');
  const tabs: Array<[string, string]> = ran
    ? [
        ['view', 'Rennansicht'],
        ['result', 'Ergebnis'],
        ['sectionals', 'Sectionals'],
        ['speed', 'Tempo'],
        ['card', 'Startliste'],
      ]
    : [['card', 'Startliste']];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div>
        <h1 style={{ marginBottom: 2 }}>
          {r.name} <ClassPill c={r.raceClass} />
        </h1>
        <div className="muted">
          {r.dateLabel} · {r.trackName} ({r.direction}, {r.surface === 'aw' ? 'Allwetter' : 'Rasen'}) · {r.distance} ({r.distanceM} m) · {r.conditions} ·
          Boden: {r.going ?? 'wird am Renntag bekannt gegeben'} · Preisgeld <Money v={r.prize} />
          {r.winningTime !== null && <> · Siegerzeit <Time s={r.winningTime} /></>}
        </div>
      </div>
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <Link key={k} to={{ name: 'race', id, tab: k }} className={active === k ? 'active' : ''}>
            {l}
          </Link>
        ))}
      </div>
      {active === 'card' && <Card r={r} />}
      {active === 'view' && ran && <RaceView raceId={r.raceId} />}
      {active === 'result' && ran && <Result r={r} />}
      {active === 'sectionals' && ran && <Sectionals r={r} />}
      {active === 'speed' && ran && <SpeedCurves r={r} />}
    </div>
  );
}

function Card({ r }: { r: RaceCardView }) {
  const declared = r.status === 'closed' || r.status === 'run';
  const mine = r.runners.filter((x) => x.isPlayer);
  return (
    <div className="col" style={{ gap: 16 }}>
      {r.status === 'void' && <div className="card empty">Das Rennen ist ausgefallen (zu wenige Starter).</div>}
      {r.status === 'open' && (
        <div className="card small">
          Die Startliste (Boxen, Gewichte, Jockeys, Boden) wird zu Beginn der Rennwoche festgelegt. Bisher {r.runners.length} Nennung(en), maximal {r.maxRunners} Starter. Nenngeld <Money v={r.entryFee} />.
          {r.playerCanEnter.some((p) => p.ok) && (
            <EnterBox r={r} />
          )}
        </div>
      )}
      {mine.length > 0 && r.status !== 'run' && (
        <div className="card">
          <h3>Deine Order an den Jockey</h3>
          {mine.map((x) => (
            <Orders key={x.horseId} r={r} runner={x} />
          ))}
        </div>
      )}
      <div className="card">
        <h3>{declared ? 'Startliste' : 'Nennungen'}</h3>
        <table className="data">
          <thead>
            <tr>
              <th className="num">Box</th>
              <th></th>
              <th>Pferd</th>
              <th className="num">Alter</th>
              <th className="num">Gewicht</th>
              <th>Jockey</th>
              <th className="num">OR</th>
              <th>Form</th>
              <th>letzte Speed Figures</th>
              <th className="num">beste</th>
              <th className="num">Quote</th>
            </tr>
          </thead>
          <tbody>
            {r.runners.map((x) => (
              <tr key={x.horseId} className={x.isPlayer ? 'mine' : ''}>
                <td className="num">{x.stall ?? '–'}</td>
                <td><SilksIcon silks={x.stable.silks} size={22} title={x.stable.name} /></td>
                <td>
                  <HorseLink id={x.horseId} name={x.name} />
                  <div className="small muted">{x.stable.name}</div>
                </td>
                <td className="num">{x.age}</td>
                <td className="num mono">{x.weight ?? '–'}</td>
                <td className="small">{x.jockeyName}</td>
                <td className="num">{x.officialRating ?? '–'}</td>
                <td className="mono">{x.form}</td>
                <td>
                  {x.lastFigures.length
                    ? x.lastFigures.map((f, i) => (
                        <span key={f.runId} style={{ marginRight: 6 }}>
                          <Fig v={f.value} runId={f.runId} />
                          {i < x.lastFigures.length - 1 ? '' : ''}
                        </span>
                      ))
                    : <span className="muted small">–</span>}
                </td>
                <td className="num"><Fig v={x.bestFigure?.value} runId={x.bestFigure?.runId} /></td>
                <td className="num mono">{x.odds}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Quoten sind eine spielinterne Marktmeinung (keine Wetten). Speed Figures sind anklickbar und führen zum jeweiligen Rennen.</p>
      </div>
    </div>
  );
}

function EnterBox({ r }: { r: RaceCardView }) {
  const ok = r.playerCanEnter.filter((p) => p.ok);
  const [sel, setSel] = useState(ok[0]?.horseId ?? '');
  const { run, busy } = useCommand();
  return (
    <div className="row" style={{ marginTop: 8 }}>
      Nennen:
      <select value={sel} onChange={(e) => setSel(e.target.value)}>
        {ok.map((p) => (
          <option key={p.horseId} value={p.horseId}>{p.name}</option>
        ))}
      </select>
      <button className="btn small primary" disabled={busy || !sel} onClick={() => run('enterRace', { raceId: r.raceId, horseId: sel })}>
        Nennen
      </button>
    </div>
  );
}

function Orders({ r, runner }: { r: RaceCardView; runner: CardRunner }) {
  const { run, busy } = useCommand();
  const { data: jockeys } = useQuery('jockeys', undefined);
  const set = (t: Partial<Tactic>, jockeyId?: string | null) =>
    run('setRaceOrders', { raceId: r.raceId, horseId: runner.horseId, tactic: { ...runner.tactic, ...t }, jockeyId });
  const taken = new Set(r.runners.filter((x) => x.horseId !== runner.horseId).map((x) => x.jockeyId));
  return (
    <div className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--paper-2)' }}>
      <b style={{ minWidth: 140 }}>{runner.name}</b>
      <label className="field">
        <span className="small muted">Laufposition</span>
        <select value={runner.tactic.position} disabled={busy} onChange={(e) => set({ position: e.target.value as Tactic['position'] })}>
          {(['natural', 'front', 'prominent', 'midfield', 'held_up'] as const).map((k) => (
            <option key={k} value={k}>{RUNSTYLE_LABEL[k]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="small muted">Angriff</span>
        <select value={runner.tactic.attack} disabled={busy} onChange={(e) => set({ attack: e.target.value as Tactic['attack'] })}>
          {(['early', 'normal', 'late'] as const).map((k) => (
            <option key={k} value={k}>{ATTACK_LABEL[k]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="small muted">Weg</span>
        <select value={runner.tactic.path} disabled={busy} onChange={(e) => set({ path: e.target.value as Tactic['path'] })}>
          {(['rails', 'normal', 'wide'] as const).map((k) => (
            <option key={k} value={k}>{PATH_LABEL[k]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="small muted">Jockey</span>
        <select value={runner.jockeyId ?? ''} disabled={busy} onChange={(e) => set({}, e.target.value || null)}>
          {!runner.jockeyId && <option value="">automatisch buchen</option>}
          {jockeys?.map((j) => (
            <option key={j.id} value={j.id} disabled={taken.has(j.id)}>
              {j.name} ({j.rating.toFixed(1)}/10, {j.wins} Siege){taken.has(j.id) ? ' – reitet anderes Pferd' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Result({ r }: { r: RaceCardView }) {
  const res = r.result!;
  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr>
            <th className="num">Pl.</th>
            <th></th>
            <th>Pferd</th>
            <th className="num">Abstand</th>
            <th className="num">gesamt</th>
            <th className="num">Zeit</th>
            <th className="num">Box</th>
            <th className="num">Gewicht</th>
            <th>Jockey</th>
            <th className="num">SF</th>
            <th className="num">FS %</th>
            <th className="num">Spitze</th>
            <th className="num">Meter</th>
            <th className="num">Preisgeld</th>
            <th>Kommentar</th>
          </tr>
        </thead>
        <tbody>
          {res.map((x) => (
            <tr key={x.runId} className={x.isPlayer ? 'mine' : ''}>
              <td className="num"><b>{x.position}</b></td>
              <td><SilksIcon silks={x.stable.silks} size={22} title={x.stable.name} /></td>
              <td>
                <HorseLink id={x.horseId} name={x.name} />
                <div className="small muted">{x.stable.name}</div>
              </td>
              <td className="num mono">{x.position === 1 ? '' : lengthsLabel(x.marginL)}</td>
              <td className="num"><Lengths l={x.beatenL} pos={x.position} /></td>
              <td className="num"><Time s={x.timeS} /></td>
              <td className="num">{x.stall}</td>
              <td className="num mono">{x.weight}</td>
              <td className="small">{x.jockeyName}</td>
              <td className="num"><Fig v={x.speedFigure} /></td>
              <td className="num mono">{Number.isFinite(x.finishingSpeedPct) ? x.finishingSpeedPct.toFixed(1) : '–'}</td>
              <td className="num mono">{(x.topSpeed * 3.6).toFixed(1)} km/h</td>
              <td className="num mono">{Math.round(x.distanceRunM)}</td>
              <td className="num">{x.prize ? <Money v={x.prize} /> : ''}</td>
              <td className="small muted">{x.events.map((e) => EVENT_LABEL[e.type]).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Speed Figure: bereinigt um Boden, Distanz/Bahn und Gewicht (Pfund-Skala). Finishing Speed %: Tempo der letzten 400 m relativ zum Durchschnittstempo. Meter: tatsächlich gelaufener Weg (Umwege außen).
      </p>
    </div>
  );
}

function Sectionals({ r }: { r: RaceCardView }) {
  const res = r.result!;
  const [highlight, setHighlight] = useState<string | null>(res.find((x) => x.isPlayer)?.horseId ?? null);
  const marks = r.sectionalMarks;
  const option = useMemo(
    () => ({
      grid: { left: 40, right: 140, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { seriesIndex: number; dataIndex: number }) => {
          const x = res[p.seriesIndex]!;
          const s = x.sectionals[p.dataIndex]!;
          return `<b>${x.name}</b><br/>${Math.round(s.atM)} m: Position ${s.position}<br/>Abschnitt ${s.splitS.toFixed(2)} s · gesamt ${raceTime(s.cumS)}<br/>Abstand zum Führenden ${s.gapL.toFixed(1)} L`;
        },
      },
      legend: { type: 'scroll', orient: 'vertical', right: 0, top: 10, textStyle: { fontSize: 11 } },
      xAxis: { type: 'category', data: marks.map((m) => `${Math.round(m)} m`), name: 'Distanz', nameLocation: 'middle', nameGap: 26 },
      yAxis: { type: 'value', inverse: true, min: 1, max: res.length, interval: 1, name: 'Position' },
      series: res.map((x, i) => ({
        name: x.name,
        type: 'line',
        data: x.sectionals.map((s) => s.position),
        symbolSize: 6,
        lineStyle: { width: highlight === x.horseId || x.isPlayer ? 4 : 1.5, opacity: highlight && highlight !== x.horseId ? 0.35 : 1 },
        color: CHART_COLORS[i % CHART_COLORS.length],
        emphasis: { focus: 'series' },
      })),
    }),
    [res, marks, highlight],
  );
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <h3>Position über die Distanz</h3>
        <Chart option={option} height={380} onClick={(p) => setHighlight(res[p.seriesIndex ?? 0]!.horseId)} />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3>Sectional Times (je 200 m, vom Ziel rückwärts gemessen)</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Pferd</th>
              {marks.map((m) => (
                <th key={m} className="num">{Math.round(m)} m</th>
              ))}
              <th className="num">FS %</th>
            </tr>
          </thead>
          <tbody>
            {res.map((x) => (
              <SectionalRow key={x.runId} x={x} best={bestSplits(res)} />
            ))}
          </tbody>
        </table>
        <p className="small muted">Zelle: Abschnittszeit in s, darunter Position und Abstand zum Führenden in Längen. Fett = schnellster Abschnitt des Rennens.</p>
      </div>
    </div>
  );
}

function bestSplits(res: ResultRow[]): number[] {
  const n = res[0]?.sectionals.length ?? 0;
  return Array.from({ length: n }, (_, k) => Math.min(...res.map((x) => x.sectionals[k]?.splitS ?? Infinity)));
}

function SectionalRow({ x, best }: { x: ResultRow; best: number[] }) {
  return (
    <tr className={x.isPlayer ? 'mine' : ''}>
      <td className="nowrap">
        {x.position}. <HorseLink id={x.horseId} name={x.name} />
      </td>
      {x.sectionals.map((s, k) => (
        <td key={k} className="num mono small">
          <span style={{ fontWeight: s.splitS === best[k] ? 700 : 400 }}>{s.splitS.toFixed(2)}</span>
          <div className="muted">
            {s.position}. {s.gapL > 0.05 ? `+${s.gapL.toFixed(1)}` : ''}
          </div>
        </td>
      ))}
      <td className="num mono">{Number.isFinite(x.finishingSpeedPct) ? x.finishingSpeedPct.toFixed(1) : '–'}</td>
    </tr>
  );
}

function SpeedCurves({ r }: { r: RaceCardView }) {
  const res = r.result!;
  const len = Math.max(...res.map((x) => x.speedCurve.length));
  const option = useMemo(
    () => ({
      grid: { left: 46, right: 140, top: 20, bottom: 40 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(2)} m/s` },
      legend: { type: 'scroll', orient: 'vertical', right: 0, top: 10, textStyle: { fontSize: 11 } },
      xAxis: { type: 'category', data: Array.from({ length: len }, (_, i) => `${(i + 1) * 50}`), name: 'm', nameLocation: 'middle', nameGap: 26 },
      yAxis: { type: 'value', scale: true, name: 'm/s' },
      series: res.map((x, i) => ({
        name: x.name,
        type: 'line',
        data: x.speedCurve,
        symbol: 'none',
        lineStyle: { width: x.isPlayer || x.position === 1 ? 3 : 1.2 },
        color: CHART_COLORS[i % CHART_COLORS.length],
        emphasis: { focus: 'series' },
      })),
    }),
    [res, len],
  );
  return (
    <div className="card">
      <h3>Geschwindigkeitskurven</h3>
      <Chart option={option} height={400} />
      <p className="small muted">Einbrechende Frontläufer und aufkommende Schlussläufer sieht man am Verlauf der letzten 400 m.</p>
    </div>
  );
}
