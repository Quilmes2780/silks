import { toast, useCommand, useQuery } from '../api';
import { HorseLink, Loading, Money, Term } from '../components/common';

/** Markt → Teilhaberschaften: Anteile an Hengsten und Rennpferden der KI-Ställe. */
export function Shares() {
  const { data, error } = useQuery('partnerships', undefined);
  const { run, busy } = useCommand();
  if (!data) return <Loading error={error} />;
  const buy = async (horseId: string, name: string, share: number, price: number) => {
    if (!window.confirm(`${Math.round(share * 100)} % an ${name} für £${price.toLocaleString('en-GB')} kaufen?`)) return;
    const r = await run('buyShare', { horseId, share });
    if (r) toast(`Anteil an ${name} gekauft`, 'success');
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <h3>Deine Anteile</h3>
        {data.mine.length === 0 ? (
          <div className="empty">Du hältst noch keine Anteile.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Pferd</th>
                <th>Besitzer</th>
                <th className="num">Anteil</th>
                <th className="num">Rating</th>
                <th className="num"><Term id="fee">Decktaxe</Term></th>
                <th className="num">Wert des Anteils</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.mine.map((m) => (
                <tr key={m.horseId}>
                  <td>
                    <HorseLink id={m.horseId} name={m.name} /> <span className="pill">{m.kind === 'stallion' ? 'Deckhengst' : 'Rennpferd'}</span>
                  </td>
                  <td className="small">{m.owner}</td>
                  <td className="num">{Math.round(m.share * 100)} %</td>
                  <td className="num">{m.rating ?? '–'}</td>
                  <td className="num">{m.fee !== null ? <Money v={m.fee} /> : '–'}</td>
                  <td className="num"><Money v={Math.round(m.value * m.share)} /></td>
                  <td>
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Anteil an ${m.name} an den Besitzer zurückverkaufen (85 % des anteiligen Marktwerts)?`)) return;
                        const r = await run('sellShare', { horseId: m.horseId });
                        if (r) toast(`Anteil verkauft für £${r.price.toLocaleString('en-GB')}`, 'success');
                      }}
                    >
                      Verkaufen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Angebotene Anteile</h3>
        {data.listings.length === 0 ? (
          <div className="empty">Zurzeit bietet kein Stall Anteile an.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Pferd</th>
                <th>Besitzer</th>
                <th className="num">Rating</th>
                <th className="num"><Term id="fee">Decktaxe</Term></th>
                <th className="num">Marktwert</th>
                <th className="num">frei</th>
                <th>Kaufen</th>
              </tr>
            </thead>
            <tbody>
              {data.listings.map((l) => (
                <tr key={l.horseId}>
                  <td>
                    <HorseLink id={l.horseId} name={l.name} /> <span className="pill">{l.kind === 'stallion' ? 'Deckhengst' : 'Rennpferd'}</span>
                  </td>
                  <td className="small">{l.owner}</td>
                  <td className="num">{l.rating ?? '–'}</td>
                  <td className="num">{l.fee !== null ? <Money v={l.fee} /> : '–'}</td>
                  <td className="num"><Money v={l.value} /></td>
                  <td className="num">{Math.round(l.offered * 100)} %</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {Object.entries(l.priceFor).map(([share, price]) => (
                      <button key={share} className="btn small primary" style={{ marginRight: 4 }} disabled={busy} onClick={() => buy(l.horseId, l.name, Number(share), price)}>
                        {Math.round(Number(share) * 100)} % · <Money v={price} />
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="small muted">
          Der Besitzer behält die Mehrheit und entscheidet über Rennen und Verkauf. Du erhältst deinen Anteil an Preisgeld (nach Trainer- und Jockeybeteiligung), Decktaxen und
          Verkaufserlös und trägst anteilig den Unterhalt. Endet die Karriere, endet die Teilhaberschaft. Anteile kosten 15 % mehr als der anteilige Marktwert.
        </p>
      </div>
    </div>
  );
}

/** Markt → Einstellpferde: Anfragen fremder Besitzer und eingestellte Pferde. */
export function Boarding() {
  const { data, error } = useQuery('partnerships', undefined);
  const { run, busy } = useCommand();
  if (!data) return <Loading error={error} />;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <h3>Anfragen</h3>
        {data.boardingOffers.length === 0 ? (
          <div className="empty">Keine offenen Anfragen. Besitzer fragen je nach Ruf deines Stalls etwa alle vier Wochen an, wenn Boxen frei sind.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Pferd</th>
                <th>Besitzer</th>
                <th className="num">Pauschale/Woche</th>
                <th>gültig bis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.boardingOffers.map((o) => (
                <tr key={o.id}>
                  <td>
                    <HorseLink id={o.horseId} name={o.name} />
                    <div className="small muted">
                      {o.age}j {o.sex}
                      {o.sire ? `, v. ${o.sire}` : ''}
                    </div>
                  </td>
                  <td>{o.owner}</td>
                  <td className="num"><Money v={o.weeklyFee} /></td>
                  <td>{o.expires}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn small primary" disabled={busy || data.freeBoxes <= 0} onClick={() => run('acceptBoarding', { offerId: o.id })}>
                      Annehmen
                    </button>{' '}
                    <button className="btn small" disabled={busy} onClick={() => run('declineBoarding', { offerId: o.id })}>
                      Ablehnen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Eingestellte Pferde</h3>
        {data.boarders.length === 0 ? (
          <div className="empty">Keine Einstellpferde im Stall.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Pferd</th>
                <th>Besitzer</th>
                <th className="num">Pauschale/Woche</th>
                <th>seit</th>
                <th className="num">Starts</th>
                <th className="num">Siege</th>
                <th className="num">Zufriedenheit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.boarders.map((b) => (
                <tr key={b.horseId}>
                  <td><HorseLink id={b.horseId} name={b.name} /></td>
                  <td>{b.owner}</td>
                  <td className="num"><Money v={b.weeklyFee} /></td>
                  <td>{b.since}</td>
                  <td className="num">{b.starts}</td>
                  <td className="num">{b.wins}</td>
                  <td className="num">
                    <span className={`pill ${b.satisfaction >= 60 ? 'ok' : b.satisfaction >= 35 ? 'warn' : 'bad'}`}>{b.satisfaction}</span>
                  </td>
                  <td>
                    <button className="btn small" disabled={busy} onClick={() => window.confirm(`${b.name} an ${b.owner} zurückgeben?`) && run('endBoarding', { horseId: b.horseId })}>
                      Zurückgeben
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="small muted">
          Einstellpferde trainierst und nennst du wie eigene Pferde. Die Wochenpauschale deckt Unterhalt und Arbeit; zusätzlich erhältst du 10 % des Preisgelds. Nenn- und
          Reitgebühren trägt der Besitzer. Verkaufen, einliefern oder in Claiming-Rennen schicken darfst du sie nicht. Läuft ein gesundes Pferd lange nicht oder deutlich unter den
          Erwartungen, sinkt die Zufriedenheit – unter 20 holt der Besitzer es ab.
        </p>
      </div>
    </div>
  );
}
