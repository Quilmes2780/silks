import { type ReactElement, useMemo, useState } from 'react';
import { call, useCommand, useQuery } from '../api';
import { Chart } from '../components/Chart';
import { Bar, ClassPill, Fig, HorseLink, Lengths, Link, Loading, Money, PlaceholderTag, RaceLink, RunLinkValue, SilksIcon, Time } from '../components/common';
import { HorsePortrait } from '../components/Portrait';
import { navigate } from '../router';
import type { CareerRow, ConditionRow, HorseProfileView, RunLink } from '../../engine/game/queries';
import type { TrainingBlock, TrainingPlan } from '../../engine/types';
import { EVENT_LABEL } from '../../engine/game/format';
import { MarketTab } from './HorseMarket';

const TABS: Array<[string, string]> = [
  ['overview', 'Übersicht'],
  ['stats', 'Statistik'],
  ['training', 'Training'],
  ['health', 'Gesundheit'],
  ['pedigree', 'Abstammung'],
  ['market', 'Markt & Pflege'],
];

export function HorseScreen({ id, tab = 'overview' }: { id: string; tab?: string }) {
  const { data: h, error } = useQuery('horseProfile', { horseId: id });
  if (!h) return <Loading error={error} />;
  const tabs = h.own && h.statusKey === 'active' ? TABS : TABS.filter(([k]) => k !== 'training' && k !== 'health');
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <SilksIcon silks={h.stable.silks} size={34} />
        <div>
          <h1 style={{ marginBottom: 0 }}>
            {h.name} <PlaceholderTag show={h.placeholder} />
          </h1>
          <div className="muted">
            {h.age}j {h.sex} · {h.colour} · {h.stable.name} · Trainer {h.trainerName} · {h.status}
            {h.market.value !== null && (
              <>
                {' '}
                · Marktwert <Money v={h.market.value} />
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <BreedingActions h={h} />
        {h.own && h.statusKey === 'active' && (
          <a className="btn primary" href={`#/calendar/${h.horseId}`}>
            Passende Rennen suchen
          </a>
        )}
      </div>
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <Link key={k} to={{ name: 'horse', id, tab: k }} className={tab === k ? 'active' : ''}>
            {l}
          </Link>
        ))}
      </div>
      {tab === 'overview' && <Overview h={h} />}
      {tab === 'stats' && <Stats h={h} />}
      {tab === 'training' && h.own && <Training h={h} />}
      {tab === 'health' && h.own && <Health h={h} />}
      {tab === 'pedigree' && <Pedigree h={h} />}
      {tab === 'market' && <MarketTab h={h} />}
    </div>
  );
}

function Overview({ h }: { h: HorseProfileView }) {
  const s = h.stats;
  const winsIds = h.career.filter((c) => c.position === 1).map((c) => c.runId);
  const placeIds = h.career.filter((c) => c.position <= 3).map((c) => c.runId);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card hero">
        <HorsePortrait coat={h.colourKey} markings={h.markings} age={h.age <= 1 ? 'foal' : 'adult'} size={230} />
        <div className="col" style={{ gap: 12, flex: 1 }}>
          <div className="metrics">
            <div className="metric">
              <span className="v">{h.officialRating ?? '–'}</span>
              <span className="l">Official Rating</span>
            </div>
            <div className="metric">
              <span className="v">{s.bestFigure ? <Fig v={s.bestFigure.value} runId={s.bestFigure.runId} /> : '–'}</span>
              <span className="l">beste Speed Figure</span>
            </div>
            <div className="metric">
              <span className="v">
                {s.starts}-{s.wins ? <RunLinkValue runIds={winsIds} label={s.wins} /> : 0}-{s.seconds}-{s.thirds}
              </span>
              <span className="l">Starts-Siege-2.-3.</span>
            </div>
            <div className="metric">
              <span className="v">{s.starts ? <RunLinkValue runIds={winsIds.length ? winsIds : h.career.map((c) => c.runId)} label={`${Math.round((s.wins / s.starts) * 100)} %`} /> : '–'}</span>
              <span className="l">Strike Rate</span>
            </div>
            <div className="metric">
              <span className="v">{s.starts ? <RunLinkValue runIds={placeIds.length ? placeIds : h.career.map((c) => c.runId)} label={`${Math.round(((s.wins + s.seconds + s.thirds) / s.starts) * 100)} %`} /> : '–'}</span>
              <span className="l">Platzquote</span>
            </div>
            <div className="metric">
              <span className="v"><Money v={s.earnings} /></span>
              <span className="l">Verdienst</span>
            </div>
            <div className="metric">
              <span className="v">{s.consistencyIndex !== null ? <RunLinkValue runIds={s.lastFigures.map((f) => f.runId)} label={s.consistencyIndex} /> : '–'}</span>
              <span className="l">Konstanz-Index</span>
            </div>
            <div className="metric">
              <span className="v">{s.avgFinishingSpeed !== null ? <RunLinkValue runIds={h.career.map((c) => c.runId)} label={`${s.avgFinishingSpeed} %`} /> : '–'}</span>
              <span className="l">Ø Finishing Speed</span>
            </div>
          </div>
          {h.preRecord.starts > 0 && (
            <div className="small muted">
              Vor Spielbeginn: {h.preRecord.starts} Starts, {h.preRecord.wins} Siege, {h.preRecord.places} Platzierungen (nur Bilanz, keine Rohdaten).
            </div>
          )}
          {h.trainerOpinion && (
            <div className="card" style={{ background: 'var(--paper)' }}>
              <b>Einschätzung des Trainers:</b> beste Distanz etwa {h.trainerOpinion.distance}; {h.trainerOpinion.going}; {h.trainerOpinion.style}.
              {h.condition && (
                <>
                  {' '}
                  Aktuell <b>{h.condition.form}</b>.
                </>
              )}
            </div>
          )}
          {h.upcoming.length > 0 && (
            <div>
              <b>Nennungen:</b>{' '}
              {h.upcoming.map((u) => (
                <span key={u.raceId} style={{ marginRight: 12 }}>
                  <RaceLink id={u.raceId} name={u.raceName} /> <span className="small muted">({u.dateLabel}, {u.status})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <h3>Formkurve (letzte 10 Speed Figures)</h3>
          {h.figurePrecision === 0 ? <NoAnalyst /> : <FormChart h={h} />}
        </div>
        <div className="card">
          <h3>Geschätzte Werte</h3>
          <RadarChart h={h} />
          <div className="small muted">
            Das Band zeigt die Unsicherheit der Schätzung. Es wird mit jedem Start schmaler{h.own ? ' und hängt von der Einsicht deines Trainers ab' : ''}.
          </div>
        </div>
      </div>
      <CareerTable rows={h.career} />
    </div>
  );
}

function FormChart({ h }: { h: HorseProfileView }) {
  const career = useMemo(() => new Map(h.career.map((c) => [c.runId, c])), [h.career]);
  const pts = h.stats.lastFigures;
  const option = useMemo(() => {
    const n = pts.length;
    const ys = pts.map((p) => p.value);
    let trend: number[] = [];
    if (n >= 2) {
      const xm = (n - 1) / 2;
      const ym = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      ys.forEach((y, i) => {
        num += (i - xm) * (y - ym);
        den += (i - xm) ** 2;
      });
      const b = num / den;
      trend = ys.map((_, i) => Math.round((ym + b * (i - xm)) * 10) / 10);
    }
    return {
      grid: { left: 40, right: 16, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { dataIndex: number; seriesIndex: number; value: number }) => {
          if (p.seriesIndex !== 0) return `Trend ${p.value}`;
          const c = career.get(pts[p.dataIndex]!.runId);
          return c ? `${c.dateLabel}<br/><b>${c.raceName}</b><br/>${c.position}./${c.fieldSize} · ${c.distance} · ${c.going}<br/>Speed Figure <b>${c.speedFigure}</b><br/><i>Klick: zum Rennen</i>` : String(p.value);
        },
      },
      xAxis: { type: 'category', data: pts.map((p) => career.get(p.runId)?.dateLabel.replace(/^\w+\.\s/, '') ?? ''), axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', scale: true, name: 'SF' },
      series: [
        { type: 'line', data: ys, symbolSize: 9, lineStyle: { width: 2.5 }, label: { show: true, position: 'top', fontSize: 10 } },
        { type: 'line', data: trend, symbol: 'none', lineStyle: { type: 'dashed', width: 1.5 }, color: '#b08d3c' },
      ],
    };
  }, [pts, career]);
  if (!pts.length) return <div className="empty">Noch keine Starts.</div>;
  return (
    <Chart
      option={option}
      height={260}
      onClick={(p) => {
        if (p.seriesIndex === 0) {
          const c = career.get(pts[p.dataIndex]!.runId);
          if (c) navigate({ name: 'race', id: c.raceId, tab: 'result' });
        }
      }}
    />
  );
}

function RadarChart({ h }: { h: HorseProfileView }) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: () => h.estimates.map((e) => `${e.label}: <b>${e.value}</b> (${e.low}–${e.high})`).join('<br/>'),
      },
      radar: {
        indicator: h.estimates.map((e) => ({ name: e.label, max: 100, min: 0 })),
        radius: '66%',
        axisName: { color: '#5b5346', fontSize: 11 },
        splitArea: { areaStyle: { color: ['#fbf8ef', '#f6f1e4'] } },
      },
      series: [
        {
          type: 'radar',
          symbol: 'none',
          data: [
            { value: h.estimates.map((e) => e.high), name: 'obere Grenze', lineStyle: { width: 0 }, areaStyle: { color: 'rgba(176,141,60,0.35)' } },
            { value: h.estimates.map((e) => e.low), name: 'untere Grenze', lineStyle: { width: 0 }, areaStyle: { color: '#f8f4e8', opacity: 1 } },
            { value: h.estimates.map((e) => e.value), name: 'Schätzung', lineStyle: { width: 2.5, color: '#1d3b2a' }, symbol: 'circle', symbolSize: 5, itemStyle: { color: '#1d3b2a' } },
          ],
        },
      ],
    }),
    [h.estimates],
  );
  return <Chart option={option} height={300} />;
}

export function CareerTable({ rows, title = 'Karriere' }: { rows: CareerRow[]; title?: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="empty">Noch keine Starts im Spiel.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Rennen</th>
                <th>Klasse</th>
                <th>Distanz</th>
                <th>Boden</th>
                <th className="num">Platz</th>
                <th className="num">Abstand</th>
                <th className="num">Zeit</th>
                <th className="num">Gewicht</th>
                <th className="num">Box</th>
                <th>Jockey</th>
                <th className="num">OR</th>
                <th className="num">SF</th>
                <th className="num">FS %</th>
                <th className="num">Preisgeld</th>
                <th>Notizen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.runId}>
                  <td className="small nowrap">{r.dateLabel}</td>
                  <td>
                    <RaceLink id={r.raceId} name={r.raceName} tab="result" />
                    <div className="small muted">{r.trackName}</div>
                  </td>
                  <td><ClassPill c={r.raceClass} /></td>
                  <td className="nowrap">{r.distance}</td>
                  <td className="small">{r.going}</td>
                  <td className="num"><b>{r.position}</b>/{r.fieldSize}</td>
                  <td className="num"><Lengths l={r.beatenL} pos={r.position} /></td>
                  <td className="num"><Time s={r.time} /></td>
                  <td className="num mono">{r.weight}</td>
                  <td className="num">{r.stall}</td>
                  <td className="small">{r.jockey}</td>
                  <td className="num">{r.officialRatingBefore ?? '–'}</td>
                  <td className="num"><Fig v={r.speedFigure} raceId={r.raceId} /></td>
                  <td className="num mono">{Number.isFinite(r.finishingSpeedPct) ? r.finishingSpeedPct.toFixed(1) : '–'}</td>
                  <td className="num">{r.prize ? <Money v={r.prize} /> : ''}</td>
                  <td className="small muted">{r.events.map((e) => EVENT_LABEL[e.type]).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stats({ h }: { h: HorseProfileView }) {
  const [cellRuns, setCellRuns] = useState<{ title: string; links: RunLink[] } | null>(null);
  const cellMap = useMemo(() => new Map(h.heatmap.cells.map((c) => [`${c.dist}|${c.going}`, c])), [h.heatmap.cells]);
  const heatOption = useMemo(() => {
    const data: Array<[number, number, number | '-']> = [];
    h.heatmap.dists.forEach((d, x) =>
      h.heatmap.goings.forEach((g, y) => {
        const c = cellMap.get(`${d}|${g}`);
        data.push([x, y, c ? c.meanFigure : '-']);
      }),
    );
    const vals = h.heatmap.cells.map((c) => c.meanFigure);
    return {
      tooltip: {
        formatter: (p: { value: [number, number, number | '-'] }) => {
          const c = cellMap.get(`${h.heatmap.dists[p.value[0]]}|${h.heatmap.goings[p.value[1]]}`);
          return c ? `${c.dist} · ${c.going}<br/>Ø SF <b>${c.meanFigure}</b>, beste ${c.bestFigure}<br/>${c.n} Start(s) – Klick zeigt die Rennen` : 'keine Starts';
        },
      },
      grid: { left: 80, right: 20, top: 10, bottom: 60 },
      xAxis: { type: 'category', data: h.heatmap.dists, name: 'Distanz', nameLocation: 'middle', nameGap: 28, splitArea: { show: true } },
      yAxis: { type: 'category', data: h.heatmap.goings, splitArea: { show: true } },
      visualMap: {
        min: vals.length ? Math.min(...vals) - 5 : 40,
        max: vals.length ? Math.max(...vals) + 5 : 100,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemHeight: 120,
        inRange: { color: ['#f1d4cf', '#f6efd8', '#cfe3c8', '#3c6a4c'] },
        show: vals.length > 0,
      },
      series: [{ type: 'heatmap', data, label: { show: true, fontSize: 11 }, itemStyle: { borderColor: '#fff', borderWidth: 1 } }],
    };
  }, [h.heatmap, cellMap]);

  const ratingOption = useMemo(
    () => ({
      grid: { left: 40, right: 16, top: 20, bottom: 30 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: h.ratingHistory.map((r) => `W${r.week}/${String(r.season).slice(2)}`) },
      yAxis: { type: 'value', scale: true, name: 'OR' },
      series: [{ type: 'line', step: 'end', data: h.ratingHistory.map((r) => r.rating), symbolSize: 7 }],
    }),
    [h.ratingHistory],
  );

  const showRuns = async (title: string, runIds: string[]) => setCellRuns({ title, links: await call('runLinks', { runIds }) });

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid two">
        <div className="card">
          <h3>Distanz × Boden (Ø Speed Figure)</h3>
          {h.figurePrecision === 0 ? (
            <NoAnalyst />
          ) : h.heatmap.cells.length === 0 ? (
            <div className="empty">Noch keine Starts.</div>
          ) : (
            <Chart
              option={heatOption}
              height={300}
              onClick={(p) => {
                const [x, y] = p.data as [number, number];
                const c = cellMap.get(`${h.heatmap.dists[x]}|${h.heatmap.goings[y]}`);
                if (c) showRuns(`${c.dist} · ${c.going}`, c.runIds);
              }}
            />
          )}
          {cellRuns && (
            <div style={{ marginTop: 8 }}>
              <b>{cellRuns.title}</b>
              <table className="data">
                <tbody>
                  {cellRuns.links.map((l) => (
                    <tr key={l.runId}>
                      <td className="small">{l.dateLabel}</td>
                      <td><RaceLink id={l.raceId} name={l.raceName} tab="result" /></td>
                      <td className="num">{l.position}.</td>
                      <td className="num"><Fig v={l.speedFigure} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h3>Official Rating</h3>
          {h.ratingHistory.length === 0 ? (
            <div className="empty">Ein Official Rating gibt es nach drei Starts.</div>
          ) : (
            <Chart option={ratingOption} height={260} />
          )}
          <h3 style={{ marginTop: 10 }}>Strike Rate je Klasse</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Klasse</th>
                <th className="num">Starts</th>
                <th className="num">Siege</th>
                <th className="num">Sieg %</th>
                <th className="num">Platz %</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(h.stats.strikeByClass).map(([k, v]) => {
                const ids = h.career.filter((c) => c.raceClass === k).map((c) => c.runId);
                return (
                  <tr key={k}>
                    <td><ClassPill c={k} /></td>
                    <td className="num"><RunLinkValue runIds={ids} label={v.starts} /></td>
                    <td className="num">{v.wins}</td>
                    <td className="num">{Math.round((v.wins / v.starts) * 100)}</td>
                    <td className="num">{Math.round((v.places / v.starts) * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Leistung nach Bedingung</h3>
        <div className="grid three">
          <CondTable title="Distanz" rows={h.conditions.distance} />
          <CondTable title="Boden" rows={h.conditions.going} />
          <CondTable title="Belag" rows={h.conditions.surface} />
          <CondTable title="Bahn" rows={h.conditions.track} />
          <CondTable title="Startbox" rows={h.conditions.stall} />
          <CondTable title="Jockey" rows={h.conditions.jockey} />
          <CondTable title="Pause seit letztem Start" rows={h.conditions.layoff} />
        </div>
      </div>
      <CareerTable rows={h.career} />
    </div>
  );
}

function CondTable({ title, rows }: { title: string; rows: ConditionRow[] }) {
  return (
    <div>
      <b className="small">{title}</b>
      {rows.length === 0 ? (
        <div className="small muted">–</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th></th>
              <th className="num">n</th>
              <th className="num">Ø SF</th>
              <th className="num">beste</th>
              <th className="num">Siege</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="small">{r.label}</td>
                <td className="num"><RunLinkValue runIds={r.cell.runIds} label={r.cell.n} /></td>
                <td className="num"><Fig v={r.cell.meanFigure === null ? null : Math.round(r.cell.meanFigure)} /></td>
                <td className="num"><Fig v={r.cell.bestFigure} /></td>
                <td className="num">{r.cell.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function Training({ h }: { h: HorseProfileView }) {
  const { data: info } = useQuery('trainingInfo', undefined);
  const { run, busy } = useCommand();
  const plan = h.training!.plan;
  const setDay = (i: number, b: TrainingBlock) => {
    const next = [...plan] as TrainingPlan;
    next[i] = b;
    run('setTraining', { horseId: h.horseId, plan: next });
  };
  return (
    <div className="grid side">
      <div className="card">
        <h3>Wochenplan</h3>
        <div className="row" style={{ marginBottom: 12 }}>
          Vorlage:
          {info?.templates.map((t) => (
            <button key={t.key} className={`chip ${h.training!.template === t.key ? 'on' : ''}`} disabled={busy} onClick={() => run('setTraining', { horseId: h.horseId, plan: t.key })}>
              {t.label}
            </button>
          ))}
        </div>
        <table className="data">
          <thead>
            <tr>
              {DAYS.map((d) => (
                <th key={d}>{d}</th>
              ))}
              <th>So</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {plan.map((b, i) => (
                <td key={i}>
                  <select value={b} disabled={busy || !!h.condition?.injury} onChange={(e) => setDay(i, e.target.value as TrainingBlock)}>
                    {info?.blocks.map((x) => (
                      <option key={x.key} value={x.key}>{x.label}</option>
                    ))}
                  </select>
                </td>
              ))}
              <td className="muted small">Ruhetag</td>
            </tr>
          </tbody>
        </table>
        <p className="small muted">
          Der Renntag ersetzt die Samstagsarbeit. Training verschiebt die aktuellen Werte Richtung Potenzial – nie darüber hinaus. Hohe Belastung kostet Frische und erhöht das Verletzungsrisiko.
        </p>
        {h.condition?.injury && <p><span className="pill bad">verletzt: {h.condition.injury}</span> – kein Training möglich.</p>}
      </div>
      <div className="card">
        <h3>Bausteine</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Baustein</th>
              <th>Trainiert</th>
              <th>Belastung</th>
            </tr>
          </thead>
          <tbody>
            {info?.blocks.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td className="small">{b.trains}</td>
                <td className="small">{b.intensity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {h.condition && (
          <div className="col" style={{ marginTop: 12 }}>
            <span className="small">Fitness {h.condition.fitness}</span>
            <Bar value={h.condition.fitness} warnBelow={80} badBelow={65} />
            <span className="small">Frische {h.condition.freshness}</span>
            <Bar value={h.condition.freshness} warnBelow={55} badBelow={35} />
            <span className="small">Trainer: <b>{h.condition.form}</b></span>
          </div>
        )}
      </div>
    </div>
  );
}

function Health({ h }: { h: HorseProfileView }) {
  const c = h.condition!;
  const legs = ['vorne links', 'vorne rechts', 'hinten links', 'hinten rechts'];
  return (
    <div className="grid two">
      <div className="card">
        <h3>Zustand</h3>
        <dl className="kv">
          <dt>Fitness</dt>
          <dd><Bar value={c.fitness} warnBelow={80} badBelow={65} /></dd>
          <dt>Frische</dt>
          <dd><Bar value={c.freshness} warnBelow={55} badBelow={35} /></dd>
          <dt>Form</dt>
          <dd>{c.form}</dd>
          <dt>Verletzung</dt>
          <dd>{c.injury ? <span className="pill bad">{c.injury}</span> : <span className="pill ok">keine</span>}</dd>
        </dl>
      </div>
      <div className="card">
        <h3>Verletzungsrisiko je Bein (pro Woche)</h3>
        <table className="data">
          <tbody>
            {c.legRisk.map((r, i) => (
              <tr key={i}>
                <td>{legs[i]}</td>
                <td style={{ width: '50%' }}><Bar value={r} max={2} /></td>
                <td className="num mono">{h.riskExact ? `${r.toFixed(2)} %` : r < 0.25 ? 'niedrig' : r < 0.45 ? 'mittel' : 'erhöht'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">
          Überforderung (wenig Frische, harte Bausteine, Rennen) erhöht das Risiko messbar. Schwimmen und Weide senken es.{' '}
          {h.riskExact ? 'Genaue Werte von deinem Tierarzt.' : 'Ohne eigenen Tierarzt nur eine grobe Einschätzung.'}
        </p>
      </div>
    </div>
  );
}

function BreedingActions({ h }: { h: HorseProfileView }) {
  const { run, busy } = useCommand();
  const a = h.actions;
  return (
    <>
      {a.toBroodmare && (
        <button className="btn" disabled={busy} onClick={() => window.confirm(`${h.name} beendet die Rennkarriere und geht als Zuchtstute ins Gestüt. Fortfahren?`) && run('toBroodmare', { horseId: h.horseId })}>
          In die Zucht
        </button>
      )}
      {a.toStud && (
        <button className="btn" disabled={busy} onClick={() => window.confirm(`${h.name} beendet die Rennkarriere und wird Deckhengst. Fortfahren?`) && run('standAsStallion', { horseId: h.horseId })}>
          Als Deckhengst aufstellen
        </button>
      )}
      {a.intoTraining && (
        <button className="btn primary" disabled={busy} onClick={() => run('bringIntoTraining', { horseId: h.horseId })}>
          Ins Training holen
        </button>
      )}
      {h.statusKey === 'broodmare' && h.own && (
        <a className="btn primary" href={`#/stud/mares/${h.horseId}`}>
          Hengst wählen
        </a>
      )}
      {a.sellToBreeders && (
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`${h.name} für 60 % des Marktwerts an die Züchter verkaufen?`)) return;
            await run('sellToBreeders', { horseId: h.horseId });
          }}
        >
          An Züchter verkaufen
        </button>
      )}
      {a.retire && h.statusKey !== 'active' && (
        <button className="btn danger" disabled={busy} onClick={() => window.confirm(`${h.name} endgültig in den Ruhestand schicken?`) && run('retireHorse', { horseId: h.horseId })}>
          Ruhestand
        </button>
      )}
      {a.sharesOffered && (
        <a className="btn" href="#/market/shares">
          Anteil kaufen
        </a>
      )}
    </>
  );
}

function Pedigree({ h }: { h: HorseProfileView }) {
  const { data: p, error } = useQuery('pedigree', { horseId: h.horseId });
  if (!p) return <Loading error={error} />;
  const cell = (n: { id: string | null; name: string | null; rating: number | null; stallion: boolean }, span: number, key: string) => (
    <td key={key} rowSpan={span} className={`ped ${n.stallion ? 'ped-m' : ''}`}>
      {n.id ? <HorseLink id={n.id} name={n.name ?? '?'} /> : n.name ? <span>{n.name}</span> : <span className="muted">unbekannt</span>}
      {n.rating !== null && <span className="small muted"> ({n.rating})</span>}
    </td>
  );
  // 16 Zeilen: Generation k hat 2^(k+1) Einträge mit rowSpan 16 / 2^(k+1)
  const rows: ReactElement[] = [];
  for (let r = 0; r < 16; r++) {
    const tds: ReactElement[] = [];
    p.generations.forEach((gen, k) => {
      const span = 16 / gen.length;
      if (r % span === 0) tds.push(cell(gen[r / span]!, span, `${k}-${r}`));
    });
    rows.push(<tr key={r}>{tds}</tr>);
  }
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid side">
        <div className="card">
          <h3>Stammbaum</h3>
          <table className="pedigree">
            <tbody>{rows}</tbody>
          </table>
          <p className="small muted">In Klammern das Official Rating (bzw. die beste Speed Figure). Hengste sind hervorgehoben.</p>
        </div>
        <div className="card">
          <h3>Zuchtdaten</h3>
          <dl className="kv">
            <dt>Jahrgang</dt>
            <dd>{h.foalYear}</dd>
            <dt>Vaterlinie</dt>
            <dd>{p.line ?? '–'}</dd>
            <dt>Muttervaterlinie</dt>
            <dd>{p.damSireLine ?? '–'}</dd>
            <dt>Inzucht</dt>
            <dd>{p.coi === null ? '–' : p.coi === 0 ? 'keine (in 6 Generationen)' : `${(p.coi * 100).toFixed(2)} %`}</dd>
            {p.stallion && (
              <>
                <dt>Deckhengst</dt>
                <dd>
                  {p.stallion.active ? <>Decktaxe <Money v={p.stallion.fee} />, {p.stallion.covers} Stuten in dieser Saison, deckt seit {p.stallion.since}</> : 'in Pension'} · {p.stallion.owner}
                </dd>
              </>
            )}
            {p.pregnancy && (
              <>
                <dt>Tragend</dt>
                <dd>
                  von {p.pregnancy.sire}, Termin {p.pregnancy.due}
                </dd>
              </>
            )}
            {p.partners.length > 0 && (
              <>
                <dt>Teilhaber</dt>
                <dd>{p.partners.map((x) => `${x.name} (${Math.round(x.share * 100)} %)`).join(', ')}</dd>
              </>
            )}
            <dt>Besitzer</dt>
            <dd>
              <span className="row"><SilksIcon silks={h.stable.silks} size={18} /> {h.stable.name}</span>
            </dd>
          </dl>
        </div>
      </div>
      {p.progeny && (
        <div className="card">
          <h3>Nachkommen</h3>
          <p className="small">
            {p.progeny.stats.foals} Nachkommen, {p.progeny.stats.runners} gelaufen, {p.progeny.stats.winners} Sieger
            {p.progeny.stats.stakesWinners > 0 && <>, {p.progeny.stats.stakesWinners} Black-Type-Sieger</>}
            {p.progeny.stats.avgRating !== null && <> · Ø Rating {p.progeny.stats.avgRating}, bestes {p.progeny.stats.bestRating}</>}
            {p.progeny.tendency.winDistanceM && <> · Ø Siegdistanz {(p.progeny.tendency.winDistanceM / 201.168).toFixed(1)}f</>}
          </p>
          <FamilyTable rows={p.progeny.list} mateLabel={p.progeny.mateLabel} />
        </div>
      )}
      <div className="card">
        <h3>Geschwister (gleiche Mutter)</h3>
        {p.siblings.length === 0 ? <div className="empty">Keine bekannten Geschwister.</div> : <FamilyTable rows={p.siblings.map((x) => ({ ...x, mate: x.sire }))} mateLabel="Vater" />}
      </div>
    </div>
  );
}

function FamilyTable({ rows, mateLabel }: { rows: Array<{ id: string; name: string; age: number; mate: string | null; rating: number | null; wins: number; starts: number }>; mateLabel: string }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Name</th>
          <th className="num">Alter</th>
          <th>{mateLabel}</th>
          <th className="num">Starts</th>
          <th className="num">Siege</th>
          <th className="num">Rating</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.id}>
            <td><HorseLink id={x.id} name={x.name} /></td>
            <td className="num">{x.age}</td>
            <td>{x.mate ?? '–'}</td>
            <td className="num">{x.starts}</td>
            <td className="num">{x.wins}</td>
            <td className="num">{x.rating ?? '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NoAnalyst() {
  return (
    <div className="empty">
      Ohne Datenanalyst keine Speed Figures. <Link to={{ name: 'staff' }}>Personal einstellen</Link>
    </div>
  );
}
