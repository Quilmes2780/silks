import { useState } from 'react';
import { toast, useCommand, useQuery } from '../api';
import { HorseLink, Link, Loading, Money, shortMoney, SilksIcon } from '../components/common';
import { MoneyInput } from '../components/Contract';
import type { AuctionView, LotRow } from '../../engine/game/econQueries';

export function AuctionScreen({ id }: { id: string }) {
  const { data, error } = useQuery('auction', { auctionId: id });
  const { run, busy } = useCommand();
  const [filter, setFilter] = useState<'all' | 'open' | 'mine'>('all');
  if (!data) return <Loading error={error} />;
  const lots = data.lots.filter((l) => (filter === 'open' ? l.status === 'pending' : filter === 'mine' ? l.buyer?.isPlayer || l.mine || l.playerLimit !== null : true));
  const finish = async () => {
    if (!window.confirm('Alle offenen Lose jetzt entscheiden? Deine Auto-Gebote gelten, sonst steigst du aus.')) return;
    await run('finishAuction', { auctionId: data.id });
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <Link to={{ name: 'market', tab: 'auctions' }}>← Markt</Link>
        <h1 style={{ marginBottom: 0 }}>{data.name}</h1>
        <span className={`pill ${data.isLive ? 'warn' : data.status === 'done' ? '' : 'ok'}`}>{data.isLive ? 'läuft' : data.status === 'done' ? 'beendet' : 'Katalog'}</span>
        <span className="muted">{data.dateLabel}</span>
        <span style={{ flex: 1 }} />
        {data.isLive && (
          <button className="btn brass" disabled={busy} onClick={finish}>
            Auktion abschließen
          </button>
        )}
      </div>
      <div className="row muted">
        Kreditrahmen <Money v={data.spendable} /> · {data.freeBoxes} freie Box{data.freeBoxes === 1 ? '' : 'en'} ·{' '}
        {data.hasAgent ? 'Gutachten deines Bloodstock-Agenten' : 'kein Bloodstock-Agent: nur Katalogangaben'}
      </div>
      {data.status === 'catalogue' && (
        <div className="notice">
          Katalogphase: Du kannst die Lose prüfen und Auto-Gebote setzen. Bieten Los für Los ist in der Auktionswoche möglich; offene Lose werden zum Wochenende mit deinen Auto-Geboten entschieden.
        </div>
      )}
      {data.canConsign.length > 0 && <Consign data={data} />}
      <div className="card">
        <h3>
          Lose
          <span style={{ flex: 1 }} />
          <span className="chips">
            {(['all', 'open', 'mine'] as const).map((f) => (
              <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'alle' : f === 'open' ? 'offen' : 'meine'}
              </button>
            ))}
          </span>
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Los</th>
                <th>Abstammung</th>
                <th>Exterieur</th>
                {data.kind === 'breeze_up' && <th className="num">Breeze 2f</th>}
                {data.kind === 'horses_in_training' && <th className="num">OR</th>}
                <th>Gutachten</th>
                <th className="num">Katalogwert</th>
                <th className="num">Stand</th>
                <th>Bieten</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <LotLine key={l.lotId} l={l} live={data.isLive} kind={data.kind} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Katalogwert: Bewertung des Markts aus Abstammung (Decktaxe des Vaters), Exterieur und Breeze-Zeit. Das Gutachten deines Agenten schätzt die verborgene Qualität (Attributskala) – je besser der
          Agent, desto enger die Spanne. Verkäufer zahlen 5 % Provision.
        </p>
      </div>
    </div>
  );
}

function LotLine({ l, live, kind }: { l: LotRow; live: boolean; kind: AuctionView['kind'] }) {
  const { run, busy } = useCommand();
  const [amount, setAmount] = useState(l.nextBid);
  const [limit, setLimit] = useState(l.playerLimit ?? l.report?.valueHigh ?? l.catalogueValue);
  const pending = l.status === 'pending';
  const bid = async (a?: number) => {
    const res = await run('bid', { lotId: l.lotId, amount: a });
    if (res) toast(res.message, res.status === 'sold' && res.leader === 'player' ? 'success' : 'info');
  };
  const pass = async () => {
    const res = await run('pass', { lotId: l.lotId });
    if (res) toast(res.message, 'info');
  };
  return (
    <tr className={`${!pending ? 'lot-sold' : ''} ${l.buyer?.isPlayer ? 'lot-mine' : ''}`}>
      <td>
        <HorseLink id={l.horseId} name={l.name} />
        <div className="small muted">
          {l.age}j {l.sex}, {l.colour}
          {l.mine ? ' · dein Pferd' : l.consignor.isPlayer ? '' : ` · ${l.consignor.name}`}
        </div>
      </td>
      <td className="small">
        {l.sire ? (
          <>
            v. <b>{l.sire.name}</b> ({shortMoney(l.sire.fee)})
            <div className="muted">
              {l.sire.runners} Starter, {l.sire.winners} Sieger{l.sire.bestRating !== null ? `, bestes OR ${l.sire.bestRating}` : ''}
            </div>
          </>
        ) : (
          '–'
        )}
        {l.dam && <div className="muted">a. d. {l.dam}</div>}
      </td>
      <td className="small">{l.conformation}</td>
      {kind === 'breeze_up' && <td className="num mono">{l.breezeTimeS?.toFixed(2) ?? '–'}</td>}
      {kind === 'horses_in_training' && <td className="num">{l.officialRating ?? '–'}</td>}
      <td className="small">
        {l.report ? (
          <>
            <b>{l.report.grade}</b> (Qualität {l.report.low}–{l.report.high})
            <div className="muted">
              {shortMoney(l.report.valueLow)}–{shortMoney(l.report.valueHigh)}
            </div>
          </>
        ) : (
          <span className="muted">–</span>
        )}
      </td>
      <td className="num"><Money v={l.catalogueValue} /></td>
      <td className="num">
        {l.status === 'sold' ? (
          <>
            <b><Money v={l.price ?? 0} /></b>
            <div className="small">
              {l.buyer && (
                <span className="row" style={{ justifyContent: 'flex-end' }}>
                  <SilksIcon silks={l.buyer.silks} size={14} /> {l.buyer.isPlayer ? 'du' : l.buyer.name}
                </span>
              )}
            </div>
          </>
        ) : l.status === 'unsold' ? (
          <span className="muted">nicht verkauft</span>
        ) : (
          <>
            <Money v={l.currentBid} />
            <div className="small muted">{l.leader === 'du' ? 'du führst' : l.leader === 'KI' ? l.leaderName : 'Mindestpreis'}</div>
          </>
        )}
      </td>
      <td>
        {pending && !l.mine && (
          <div className="col" style={{ gap: 4 }}>
            {live && l.leader !== 'du' && (
              <span className="row">
                <button className="btn small primary" disabled={busy} onClick={() => bid()}>
                  {shortMoney(l.nextBid)}
                </button>
                <MoneyInput value={amount} onChange={setAmount} step={500} />
                <button className="btn small" disabled={busy} onClick={() => bid(amount)}>
                  bieten
                </button>
                <button className="btn small" disabled={busy} onClick={pass}>
                  aussteigen
                </button>
              </span>
            )}
            <span className="row small">
              Auto bis <MoneyInput value={limit} onChange={setLimit} step={500} />
              <button className="btn small" disabled={busy} onClick={() => run('setAutoBid', { lotId: l.lotId, limit })}>
                setzen
              </button>
              {l.playerLimit !== null && (
                <button className="btn small" disabled={busy} onClick={() => run('setAutoBid', { lotId: l.lotId, limit: null })}>
                  ✕
                </button>
              )}
            </span>
            {l.playerLimit !== null && <span className="small muted">Auto-Gebot: {shortMoney(l.playerLimit)}</span>}
          </div>
        )}
        {pending && l.mine && <span className="small muted">eingeliefert</span>}
      </td>
    </tr>
  );
}

function Consign({ data }: { data: AuctionView }) {
  const { run, busy } = useCommand();
  const [horseId, setHorseId] = useState(data.canConsign[0]?.horseId ?? '');
  const sel = data.canConsign.find((h) => h.horseId === horseId);
  const [reserve, setReserve] = useState(Math.round((sel?.value ?? 5000) * 0.7));
  return (
    <div className="card">
      <h3>Pferd einliefern</h3>
      <div className="row">
        <select
          value={horseId}
          onChange={(e) => {
            setHorseId(e.target.value);
            const h = data.canConsign.find((x) => x.horseId === e.target.value);
            setReserve(Math.round((h?.value ?? 5000) * 0.7));
          }}
        >
          {data.canConsign.map((h) => (
            <option key={h.horseId} value={h.horseId}>
              {h.name} (Wert {h.value !== null ? shortMoney(h.value) : '–'})
            </option>
          ))}
        </select>
        Mindestpreis <MoneyInput value={reserve} onChange={setReserve} step={500} />
        <button className="btn primary" disabled={busy || !horseId} onClick={() => run('consign', { horseId, auctionId: data.id, reserve })}>
          Einliefern
        </button>
      </div>
      <p className="small muted">Bleibt das Höchstgebot unter dem Mindestpreis, behältst du das Pferd. Bis zur Auktionswoche kannst du es zurückziehen (Pferdeprofil).</p>
    </div>
  );
}
