import { useMemo, useState } from 'react';
import { useQuery } from '../api';
import { Chart } from '../components/Chart';
import { HorseLink, Loading, Money, RaceLink } from '../components/common';

export function FinanceScreen() {
  const [season, setSeason] = useState<number | undefined>(undefined);
  const { data, error } = useQuery('finance', { season });
  const option = useMemo(
    () =>
      data && {
        grid: { left: 70, right: 16, top: 20, bottom: 40 },
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => `£${Math.round(v).toLocaleString('en-GB')}` },
        xAxis: { type: 'category', data: data.history.map((p) => p.label), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `£${Math.round(v / 1000)}k` } },
        series: [
          {
            type: 'line',
            data: data.history.map((p) => p.balance),
            symbol: 'none',
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.08 },
            markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }, { yAxis: -data.overdraftLimit, label: { formatter: 'Dispolimit' }, lineStyle: { color: '#8e2b22', type: 'dashed' } }] },
          },
        ],
      },
    [data],
  );
  if (!data || !option) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Finanzen</h1>
      {data.balance < -data.overdraftLimit && (
        <div className="notice bad">
          Das Dispolimit ist seit {data.overdraftWeeks} Woche{data.overdraftWeeks === 1 ? '' : 'n'} überschritten. Nach 8 Wochen verkauft die Bank dein wertvollstes Pferd (zu 75 % des Marktwerts).
        </div>
      )}
      <div className="metrics">
        <div className="metric">
          <span className="v"><Money v={data.balance} /></span>
          <span className="l">Kontostand</span>
        </div>
        <div className="metric">
          <span className="v"><Money v={-data.overdraftLimit} /></span>
          <span className="l">Dispolimit</span>
        </div>
        <div className="metric">
          <span className="v"><Money v={data.weeklyFixed.total} /></span>
          <span className="l">feste Kosten / Woche</span>
        </div>
        <div className="metric">
          <span className="v"><Money v={data.weeklyFixed.salaries} /></span>
          <span className="l">davon Gehälter</span>
        </div>
        <div className="metric">
          <span className="v"><Money v={data.weeklyFixed.upkeep} /></span>
          <span className="l">davon Unterhalt</span>
        </div>
        <div className="metric">
          <span className="v"><Money v={data.seasonTotal} /></span>
          <span className="l">Ergebnis Saison {data.season}</span>
        </div>
      </div>
      <div className="card">
        <h3>Kontoverlauf</h3>
        <Chart option={option} height={240} />
      </div>
      <div className="card">
        <h3>
          Monatsbilanz
          <span style={{ flex: 1 }} />
          <select value={data.season} onChange={(e) => setSeason(Number(e.target.value))}>
            {data.seasons.map((s) => (
              <option key={s} value={s}>
                Saison {s}
              </option>
            ))}
          </select>
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Kategorie</th>
                {data.months.map((m) => (
                  <th key={m} className="num">{m}</th>
                ))}
                <th className="num">Saison</th>
              </tr>
            </thead>
            <tbody>
              {data.table.map((r) => (
                <tr key={r.kind}>
                  <td>{r.label}</td>
                  {r.months.map((v, i) => (
                    <td key={i} className={`num small ${v < 0 ? 'num-neg' : v > 0 ? 'num-pos' : 'muted'}`}>
                      {v ? Math.round(v).toLocaleString('en-GB') : '·'}
                    </td>
                  ))}
                  <td className="num"><Money v={r.total} signed /></td>
                </tr>
              ))}
              <tr>
                <td><b>Summe</b></td>
                {data.monthTotals.map((v, i) => (
                  <td key={i} className={`num small ${v < 0 ? 'num-neg' : v > 0 ? 'num-pos' : 'muted'}`}>
                    <b>{v ? Math.round(v).toLocaleString('en-GB') : '·'}</b>
                  </td>
                ))}
                <td className="num"><b><Money v={data.seasonTotal} signed /></b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Kosten und Ertrag je Pferd</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Pferd</th>
              <th className="num">Wochen</th>
              <th className="num">Kaufpreis / Einstand</th>
              <th className="num">laufende Kosten</th>
              <th className="num">Preisgeld (netto)</th>
              <th className="num">Verkauf</th>
              <th className="num">Marktwert</th>
              <th className="num">Bilanz</th>
              <th className="num">ROI</th>
            </tr>
          </thead>
          <tbody>
            {data.horses.map((h) => (
              <tr key={h.horseId + h.weeks}>
                <td>
                  {h.active ? <HorseLink id={h.horseId} name={h.name} /> : <span className="muted">{h.name}</span>}
                  {!h.active && <span className="small muted"> (abgegeben)</span>}
                </td>
                <td className="num">{h.weeks}</td>
                <td className="num">
                  {h.purchase ? <Money v={h.purchase} /> : '–'}
                  {!h.bought && h.purchase > 0 && <span className="small muted"> (Wert bei Übernahme)</span>}
                </td>
                <td className="num"><Money v={h.running} signed /></td>
                <td className="num"><Money v={h.income} signed /></td>
                <td className="num">{h.sale ? <Money v={h.sale} /> : '–'}</td>
                <td className="num">{h.value !== null ? <Money v={h.value} /> : '–'}</td>
                <td className="num"><b><Money v={h.net} signed /></b></td>
                <td className={`num ${h.roi !== null && h.roi < 0 ? 'num-neg' : 'num-pos'}`}>{h.roi !== null ? `${h.roi} %` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">
          Laufende Kosten: Unterhalt, Tierarzt, Nenn- und Reitgebühren sowie der Anteil an Gehältern und Anlage (gleichmäßig auf die Pferde verteilt). Bilanz = Preisgeld + Verkauf + Marktwert − Kaufpreis −
          laufende Kosten. ROI = Bilanz ÷ eingesetztes Kapital.
        </p>
      </div>
      <div className="card">
        <h3>Kontoauszug</h3>
        <table className="data">
          <tbody>
            {data.entries.map((e, i) => (
              <tr key={i}>
                <td className="small nowrap">{e.label}</td>
                <td className="small">{e.kind}</td>
                <td className="small">
                  {e.raceId ? <RaceLink id={e.raceId} name={e.text} /> : e.horseId ? <HorseLink id={e.horseId} name={e.text} /> : e.text}
                </td>
                <td className="num"><Money v={e.amount} signed /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
