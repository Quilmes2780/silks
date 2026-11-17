import { useState } from 'react';
import { toast, useCommand, useQuery } from '../api';
import { Fig, HorseLink, Link, Loading, Modal, Money, RaceLink, SilksIcon } from '../components/common';
import { MoneyInput } from '../components/Contract';
import type { HorseMarketRow, MarketView, OfferRow } from '../../engine/game/econQueries';
import { Boarding, Shares } from './Partnerships';

const TABS: Array<[string, string]> = [
  ['auctions', 'Auktionen'],
  ['transfers', 'Transferliste'],
  ['offers', 'Angebote'],
  ['claiming', 'Claiming'],
  ['sell', 'Meine Pferde verkaufen'],
  ['shares', 'Teilhaberschaften'],
  ['boarding', 'Einstellpferde'],
];

export function MarketScreen({ tab = 'auctions' }: { tab?: string }) {
  const { data, error } = useQuery('market', undefined);
  if (!data) return <Loading error={error} />;
  const openOffers = data.offers.filter((o) => (o.incoming && o.status === 'offen') || (!o.incoming && o.status === 'Gegenangebot')).length;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <h1 style={{ marginBottom: 0 }}>Markt</h1>
        <span className="muted">
          Kontostand <Money v={data.balance} /> · Kreditrahmen <Money v={data.spendable} /> · {data.freeBoxes} freie Box{data.freeBoxes === 1 ? '' : 'en'}
        </span>
      </div>
      <div className="tabs">
        {TABS.map(([k, l]) => (
          <Link key={k} to={{ name: 'market', tab: k }} className={tab === k ? 'active' : ''}>
            {l}
            {k === 'offers' && openOffers > 0 && <span className="badge" style={{ marginLeft: 6 }}>{openOffers}</span>}
          </Link>
        ))}
      </div>
      {tab === 'auctions' && <Auctions data={data} />}
      {tab === 'transfers' && <Transfers rows={data.forSale} />}
      {tab === 'offers' && <Offers rows={data.offers} />}
      {tab === 'claiming' && <Claiming data={data} />}
      {tab === 'sell' && <Sell data={data} />}
      {tab === 'shares' && <Shares />}
      {tab === 'boarding' && <Boarding />}
    </div>
  );
}

type MarketData = MarketView;

function Auctions({ data }: { data: MarketData }) {
  return (
    <div className="grid side">
      <div className="card">
        <h3>Auktionen</h3>
        {data.auctions.length === 0 ? (
          <div className="empty">Noch kein Katalog erschienen.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Auktion</th>
                <th>Datum</th>
                <th>Status</th>
                <th className="num">Lose</th>
                <th className="num">verkauft</th>
                <th className="num">deine Käufe</th>
              </tr>
            </thead>
            <tbody>
              {data.auctions.map((a) => (
                <tr key={a.id} className={a.status === 'live' ? 'lot-live' : ''}>
                  <td><Link to={{ name: 'auction', id: a.id }}>{a.name}</Link></td>
                  <td className="small">{a.dateLabel}</td>
                  <td>
                    <span className={`pill ${a.status === 'live' ? 'warn' : a.status === 'done' ? '' : 'ok'}`}>
                      {a.status === 'live' ? 'läuft' : a.status === 'done' ? 'beendet' : 'Katalog'}
                    </span>
                  </td>
                  <td className="num">{a.lots}</td>
                  <td className="num">{a.sold}</td>
                  <td className="num">{a.mine}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Termine</h3>
        {data.upcomingAuctions.map((u) => (
          <div key={u.name} style={{ marginBottom: 8 }}>
            <b>{u.name}</b>
            <div className="small muted">{u.dateLabel}</div>
          </div>
        ))}
        <p className="small muted">
          Breeze-up (April): Zweijährige mit gemessener Galoppzeit. Jährlinge (Oktober): nur Abstammung und Exterieur – ein Bloodstock-Agent macht die Gutachten genauer.
          Horses in Training (November): ausgemusterte Rennpferde. Zuchtstuten (Dezember): Stuten mit Rennleistung, oft tragend. Eigene Pferde, Jährlinge und Stuten kannst du in die passende Auktion einliefern.
        </p>
      </div>
    </div>
  );
}

function Transfers({ rows }: { rows: HorseMarketRow[] }) {
  const [offer, setOffer] = useState<HorseMarketRow | null>(null);
  return (
    <div className="card">
      <h3>Pferde auf der Verkaufsliste der KI-Ställe</h3>
      {rows.length === 0 ? (
        <div className="empty">Zurzeit steht kein Pferd auf der Liste. Angebote für andere Pferde kannst du im Pferdeprofil machen.</div>
      ) : (
        <MarketTable rows={rows} action={(h) => <button className="btn small primary" onClick={() => setOffer(h)}>Angebot</button>} />
      )}
      <p className="small muted">Auch für Pferde, die nicht auf der Liste stehen, kannst du im Pferdeprofil ein Angebot machen – die besten Pferde eines Stalls sind aber teuer.</p>
      {offer && <OfferDialog horse={offer} onClose={() => setOffer(null)} />}
    </div>
  );
}

export function MarketTable({ rows, action }: { rows: HorseMarketRow[]; action?: (h: HorseMarketRow) => React.ReactNode }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Pferd</th>
          <th>Stall</th>
          <th className="num">OR</th>
          <th className="num">Starts</th>
          <th className="num">Siege</th>
          <th className="num">beste SF</th>
          <th>beste Distanz</th>
          <th className="num">Marktwert</th>
          <th className="num">Preis</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.horseId}>
            <td>
              <HorseLink id={h.horseId} name={h.name} /> <span className="small muted">{h.age}j {h.sex}</span>
              {h.injured && <span className="pill bad" style={{ marginLeft: 6 }}>verletzt</span>}
            </td>
            <td><span className="row"><SilksIcon silks={h.stable.silks} size={16} /> <span className="small">{h.stable.name}</span></span></td>
            <td className="num">{h.officialRating ?? '–'}</td>
            <td className="num">{h.starts}</td>
            <td className="num">{h.wins}</td>
            <td className="num"><Fig v={h.bestFigure?.value} runId={h.bestFigure?.runId} /></td>
            <td className="small">{h.distance}</td>
            <td className="num">{h.value !== null ? <Money v={h.value} /> : '–'}</td>
            <td className="num">{h.askingPrice !== null ? <b><Money v={h.askingPrice} /></b> : '–'}</td>
            <td>{action?.(h)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OfferDialog({ horse, onClose }: { horse: { horseId: string; name: string; value: number | null; askingPrice: number | null }; onClose: () => void }) {
  const [amount, setAmount] = useState(horse.askingPrice ?? horse.value ?? 5000);
  const [counter, setCounter] = useState<{ offerId: string; amount: number } | null>(null);
  const { run, busy } = useCommand();
  const submit = async () => {
    const res = await run('makeOffer', { horseId: horse.horseId, amount });
    if (!res) return;
    if (res.status === 'accepted') {
      toast(res.message, 'success');
      onClose();
    } else if (res.status === 'countered' && res.counter !== null) {
      setCounter({ offerId: res.offerId, amount: res.counter });
      setAmount(res.counter);
    } else {
      toast(res.message, 'error');
      setCounter(null);
    }
  };
  const accept = async () => {
    if (!counter) return;
    const res = await run('respondOffer', { offerId: counter.offerId, action: 'accept' });
    if (res) {
      toast(res.message, 'success');
      onClose();
    }
  };
  return (
    <Modal onClose={onClose}>
      <h2>Angebot für {horse.name}</h2>
      <p className="muted">
        Marktwert {horse.value !== null ? <Money v={horse.value} /> : '–'}
        {horse.askingPrice !== null && (
          <>
            {' '}
            · geforderter Preis <Money v={horse.askingPrice} />
          </>
        )}
      </p>
      {counter && (
        <p className="notice">
          Der Verkäufer verlangt <b><Money v={counter.amount} /></b>.{' '}
          <button className="btn small primary" disabled={busy} onClick={accept}>
            Annehmen
          </button>
        </p>
      )}
      <div className="row">
        Dein Angebot: <MoneyInput value={amount} onChange={setAmount} step={250} />
        <button className="btn primary" disabled={busy || amount <= 0} onClick={submit}>
          {counter ? 'Neues Angebot' : 'Angebot abgeben'}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Höchstens drei Runden je Verhandlung. Wer zweimal zu niedrig bietet, wird acht Wochen nicht mehr bedient.
      </p>
    </Modal>
  );
}

function Offers({ rows }: { rows: OfferRow[] }) {
  const { run, busy } = useCommand();
  const [counter, setCounter] = useState<Record<string, number>>({});
  const respond = async (o: OfferRow, action: 'accept' | 'decline' | 'counter') => {
    const res = await run('respondOffer', { offerId: o.offerId, action, amount: action === 'counter' ? counter[o.offerId] : undefined });
    if (res) toast(res.message, res.status === 'accepted' ? 'success' : 'info');
  };
  const incoming = rows.filter((o) => o.incoming);
  const outgoing = rows.filter((o) => !o.incoming);
  return (
    <div className="grid two">
      <div className="card">
        <h3>Angebote für deine Pferde</h3>
        {incoming.length === 0 && <div className="empty">Keine Angebote. Pferde auf der Verkaufsliste ziehen mehr Interesse an.</div>}
        <table className="data">
          <tbody>
            {incoming.map((o) => (
              <tr key={o.offerId}>
                <td>
                  <HorseLink id={o.horseId} name={o.horseName} />
                  <div className="small muted">
                    von {o.buyer.name} · gültig bis {o.expires}
                  </div>
                </td>
                <td className="num">
                  <b><Money v={o.amount} /></b>
                  <div className="small muted">Wert {o.value !== null ? <Money v={o.value} /> : '–'}</div>
                </td>
                <td>
                  {o.status === 'offen' ? (
                    <div className="col">
                      <span className="row">
                        <button className="btn small primary" disabled={busy} onClick={() => respond(o, 'accept')}>
                          Annehmen
                        </button>
                        <button className="btn small" disabled={busy} onClick={() => respond(o, 'decline')}>
                          Ablehnen
                        </button>
                      </span>
                      <span className="row">
                        <MoneyInput value={counter[o.offerId] ?? Math.round(o.amount * 1.1)} onChange={(v) => setCounter({ ...counter, [o.offerId]: v })} step={250} />
                        <button className="btn small" disabled={busy} onClick={() => respond(o, 'counter')}>
                          Gegenangebot
                        </button>
                      </span>
                    </div>
                  ) : (
                    <span className="pill">{o.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Ein Gegenangebot über dem Limit des Käufers beendet die Verhandlung.</p>
      </div>
      <div className="card">
        <h3>Deine Angebote</h3>
        {outgoing.length === 0 && <div className="empty">Keine laufenden Verhandlungen.</div>}
        <table className="data">
          <tbody>
            {outgoing.map((o) => (
              <tr key={o.offerId}>
                <td>
                  <HorseLink id={o.horseId} name={o.horseName} />
                  <div className="small muted">bei {o.seller.name}</div>
                </td>
                <td className="num">
                  <Money v={o.amount} />
                  {o.counter !== null && (
                    <div className="small">
                      Gegenangebot <b><Money v={o.counter} /></b>
                    </div>
                  )}
                </td>
                <td>
                  {o.status === 'Gegenangebot' ? (
                    <span className="row">
                      <button className="btn small primary" disabled={busy} onClick={() => respond(o, 'accept')}>
                        Annehmen
                      </button>
                      <button className="btn small" disabled={busy} onClick={() => respond(o, 'decline')}>
                        Zurückziehen
                      </button>
                    </span>
                  ) : (
                    <span className="pill">{o.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Claiming({ data }: { data: MarketData }) {
  return (
    <div className="card">
      <h3>Claiming-Rennen (diese und die nächsten drei Wochen)</h3>
      {data.claiming.length === 0 ? (
        <div className="empty">Keine Claiming-Rennen in Sicht.</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Rennen</th>
              <th className="num">Claiming-Preis</th>
              <th className="num">Starter</th>
              <th>Phase</th>
              <th className="num">deine Starter</th>
              <th className="num">deine Claims</th>
            </tr>
          </thead>
          <tbody>
            {data.claiming.map((c) => (
              <tr key={c.raceId} className={c.thisWeek ? 'lot-live' : ''}>
                <td className="small nowrap">{c.dateLabel}</td>
                <td>
                  <RaceLink id={c.raceId} name={c.name} />
                  <div className="small muted">
                    {c.trackName} · {c.distance}
                  </div>
                </td>
                <td className="num"><Money v={c.claimPrice} /></td>
                <td className="num">{c.runners}</td>
                <td className="small">{c.status}</td>
                <td className="num">{c.myRunners || ''}</td>
                <td className="num">{c.myClaims || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted">
        In der Rennwoche stehen die Starter fest: Auf der Startliste des Rennens kannst du jedes fremde Pferd zum Claiming-Preis claimen. Nach dem Rennen wechselt es den Besitzer (bei mehreren Claims entscheidet
        das Los). Eigene Starter können ebenso geclaimt werden.
      </p>
    </div>
  );
}

function Sell({ data }: { data: MarketData }) {
  const { run, busy } = useCommand();
  const [ask, setAsk] = useState<Record<string, number>>({});
  return (
    <div className="card">
      <h3>Meine Pferde</h3>
      <table className="data">
        <thead>
          <tr>
            <th>Pferd</th>
            <th className="num">OR</th>
            <th className="num">Starts</th>
            <th className="num">beste SF</th>
            <th className="num">Marktwert</th>
            <th>Verkaufsliste</th>
          </tr>
        </thead>
        <tbody>
          {data.myHorses.map((h) => (
            <tr key={h.horseId}>
              <td>
                <HorseLink id={h.horseId} name={h.name} /> <span className="small muted">{h.age}j {h.sex}</span>
              </td>
              <td className="num">{h.officialRating ?? '–'}</td>
              <td className="num">{h.starts}</td>
              <td className="num"><Fig v={h.bestFigure?.value} runId={h.bestFigure?.runId} /></td>
              <td className="num">{h.value !== null ? <Money v={h.value} /> : '–'}</td>
              <td>
                <span className="row">
                  <MoneyInput value={ask[h.horseId] ?? h.askingPrice ?? h.value ?? 5000} onChange={(v) => setAsk({ ...ask, [h.horseId]: v })} step={250} />
                  <button className="btn small" disabled={busy} onClick={() => run('listForSale', { horseId: h.horseId, askingPrice: ask[h.horseId] ?? h.askingPrice ?? h.value ?? 5000 })}>
                    {h.askingPrice !== null ? 'Preis ändern' : 'Anbieten'}
                  </button>
                  {h.askingPrice !== null && (
                    <button className="btn small" disabled={busy} onClick={() => run('listForSale', { horseId: h.horseId, askingPrice: null })}>
                      Zurückziehen
                    </button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Liegt der geforderte Preis unter der Bewertung eines Käufers, kauft er direkt; sonst kommen Angebote. Je näher am Marktwert, desto mehr Interesse. Einliefern in die Horses-in-Training-Auktion geht im
        Pferdeprofil (Tab „Markt &amp; Pflege“), solange der Katalog offen ist.
      </p>
    </div>
  );
}
