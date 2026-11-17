import { useMemo, useState } from 'react';
import { toast, useCommand } from '../api';
import { Chart } from '../components/Chart';
import { Link, Money, shortMoney } from '../components/common';
import { MoneyInput } from '../components/Contract';
import { OfferDialog } from './Market';
import type { HorseProfileView } from '../../engine/game/queries';

/** Pferdeprofil: Marktwert, Kauf, Verkauf, Pfleger und Kostenrechnung. */
export function MarketTab({ h }: { h: HorseProfileView }) {
  const m = h.market;
  const { run, busy } = useCommand();
  const [ask, setAsk] = useState(m.forSale?.askingPrice ?? m.value ?? 5000);
  const [reserve, setReserve] = useState(Math.round((m.value ?? 5000) * 0.7));
  const [offer, setOffer] = useState(false);
  const option = useMemo(
    () => ({
      grid: { left: 60, right: 16, top: 16, bottom: 36 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => `£${Math.round(v).toLocaleString('en-GB')}` },
      xAxis: { type: 'category', data: m.valueHistory.map((p) => p.label), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => shortMoney(v) } },
      series: [{ type: 'line', step: 'end', data: m.valueHistory.map((p) => p.value), symbolSize: 5, areaStyle: { opacity: 0.08 } }],
    }),
    [m.valueHistory],
  );
  return (
    <div className="grid two">
      <div className="card">
        <h3>Marktwert</h3>
        <div className="metrics">
          <div className="metric">
            <span className="v">{m.value !== null ? <Money v={m.value} /> : '–'}</span>
            <span className="l">aktueller Marktwert</span>
          </div>
          {m.purchase && (
            <div className="metric">
              <span className="v"><Money v={m.purchase.price} /></span>
              <span className="l">
                Kaufpreis ({m.purchase.via}, {m.purchase.label})
              </span>
            </div>
          )}
          {m.account && (
            <div className="metric">
              <span className="v"><Money v={m.account.net} signed /></span>
              <span className="l">Bilanz bisher</span>
            </div>
          )}
        </div>
        {m.valueHistory.length > 1 ? <Chart option={option} height={220} /> : <div className="empty">Noch kein Verlauf.</div>}
        <p className="small muted">
          Der Markt bewertet nach Official Rating und Speed Figures, ohne Rennleistung nach Abstammung und Exterieur; dazu Alter, Geschlecht (Wallache ohne Zuchtwert) und Gesundheit.
        </p>
      </div>
      <div className="col" style={{ gap: 16 }}>
        {h.own ? (
          <>
            <div className="card">
              <h3>Verkaufen</h3>
              <div className="row">
                Preis <MoneyInput value={ask} onChange={setAsk} step={250} />
                <button className="btn small primary" disabled={busy} onClick={() => run('listForSale', { horseId: h.horseId, askingPrice: ask })}>
                  {m.forSale ? 'Preis ändern' : 'Auf die Verkaufsliste'}
                </button>
                {m.forSale && (
                  <button className="btn small" disabled={busy} onClick={() => run('listForSale', { horseId: h.horseId, askingPrice: null })}>
                    Zurückziehen
                  </button>
                )}
              </div>
              {m.forSale && <p className="small">Angeboten für <b><Money v={m.forSale.askingPrice} /></b>.</p>}
              {m.offers.map((o) => (
                <p key={o.offerId} className="notice">
                  {o.buyer.name} bietet <b><Money v={o.amount} /></b> (bis {o.expires}). <Link to={{ name: 'market', tab: 'offers' }}>Zu den Angeboten</Link>
                </p>
              ))}
              {m.canConsign.map((a) => (
                <div key={a.auctionId} className="row" style={{ marginTop: 8 }}>
                  {a.name}: Mindestpreis <MoneyInput value={reserve} onChange={setReserve} step={500} />
                  <button className="btn small" disabled={busy} onClick={() => run('consign', { horseId: h.horseId, auctionId: a.auctionId, reserve })}>
                    Einliefern
                  </button>
                  <button className="btn small" disabled={busy} onClick={() => run('withdrawLot', { horseId: h.horseId, auctionId: a.auctionId })}>
                    zurückziehen
                  </button>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Pfleger</h3>
              {m.grooms.length === 0 ? (
                <div className="empty">
                  Kein Pfleger im Team. <Link to={{ name: 'staff' }}>Personal</Link>
                </div>
              ) : (
                <>
                  <select
                    value={m.groom?.id ?? ''}
                    disabled={busy}
                    onChange={async (e) => {
                      if (await run('assignGroom', { horseId: h.horseId, groomId: e.target.value || null })) toast('Pfleger zugeteilt.', 'success');
                    }}
                  >
                    <option value="">– kein Pfleger –</option>
                    {m.grooms.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.load} Pferde)
                      </option>
                    ))}
                  </select>
                  {m.groom && <p className="small">Bindung zu {m.groom.name}: {m.groom.bond}/100</p>}
                  <p className="small muted">Ein Pfleger verbessert Erholung und Temperament; ohne Pfleger erholt sich das Pferd schlechter. Ein Wechsel setzt die Bindung zurück.</p>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="card">
            <h3>Kaufen</h3>
            {m.claimable ? (
              <>
                <p>
                  {m.forSale ? (
                    <>
                      Steht für <b><Money v={m.forSale.askingPrice} /></b> zum Verkauf.
                    </>
                  ) : (
                    'Steht nicht auf der Verkaufsliste – der Besitzer verlangt einen Aufschlag, für seine besten Pferde einen hohen.'
                  )}
                </p>
                <button className="btn primary" onClick={() => setOffer(true)}>
                  Angebot machen
                </button>
              </>
            ) : (
              <p className="muted">Dieses Pferd ist nicht verkäuflich.</p>
            )}
            {offer && <OfferDialog horse={{ horseId: h.horseId, name: h.name, value: m.value, askingPrice: m.forSale?.askingPrice ?? null }} onClose={() => setOffer(false)} />}
          </div>
        )}
      </div>
    </div>
  );
}
