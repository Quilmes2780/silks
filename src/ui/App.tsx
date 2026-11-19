import { useEffect, useState } from 'react';
import { call, invalidate, toast, useQuery } from './api';
import { href, navigate, useRoute, type Route } from './router';
import { Fig, HorseLink, Modal, Money, RaceLink, SilksIcon, Toasts } from './components/common';
import { SavesScreen } from './screens/Saves';
import { OfficeScreen } from './screens/Office';
import { StableScreen } from './screens/Stable';
import { TrainingScreen } from './screens/Training';
import { HorseScreen } from './screens/Horse';
import { CalendarScreen } from './screens/Calendar';
import { RaceDayScreen } from './screens/RaceDay';
import { RaceScreen } from './screens/Race';
import { JockeysScreen } from './screens/Jockeys';
import { StaffScreen } from './screens/Staff';
import { MarketScreen } from './screens/Market';
import { AuctionScreen } from './screens/Auction';
import { FinanceScreen } from './screens/Finance';
import { FacilitiesScreen } from './screens/Facilities';
import { StudScreen } from './screens/Stud';
import { BreedingScreen } from './screens/Breeding';
import { HelpScreen } from './screens/Help';
import type { WeekSummary } from '../engine/game/state';
import type { RunLink } from '../engine/game/queries';

export function App() {
  const route = useRoute();
  const [loaded, setLoaded] = useState<boolean | null>(null);

  // Beim Start den zuletzt gespielten Spielstand laden
  useEffect(() => {
    (async () => {
      try {
        const last = localStorage.getItem('silks:lastSave');
        if (last) {
          await call('loadGame', { saveId: last });
          setLoaded(true);
          invalidate();
          if (route.name === 'saves') navigate({ name: 'office' });
          return;
        }
      } catch {
        localStorage.removeItem('silks:lastSave');
      }
      setLoaded(false);
      navigate({ name: 'saves' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loaded === null) return <div className="loading">Silks &amp; Stamina wird geladen …</div>;
  if (route.name === 'saves' || !loaded) {
    return (
      <>
        <SavesScreen
          onLoaded={(id) => {
            localStorage.setItem('silks:lastSave', id);
            setLoaded(true);
            invalidate();
            navigate({ name: 'office' });
          }}
          hasGame={loaded}
        />
        <Toasts />
      </>
    );
  }
  return (
    <div className="app">
      <Sidebar route={route} />
      <TopBar />
      <main className="main">
        <Screen route={route} />
      </main>
      <Toasts />
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'office':
      return <OfficeScreen />;
    case 'stable':
      return <StableScreen />;
    case 'training':
      return <TrainingScreen />;
    case 'horse':
      return <HorseScreen id={route.id} tab={route.tab} />;
    case 'calendar':
      return <CalendarScreen horseId={route.horseId} />;
    case 'raceday':
      return <RaceDayScreen />;
    case 'race':
      return <RaceScreen id={route.id} tab={route.tab} />;
    case 'jockeys':
      return <JockeysScreen />;
    case 'staff':
      return <StaffScreen />;
    case 'market':
      return <MarketScreen tab={route.tab} />;
    case 'auction':
      return <AuctionScreen id={route.id} />;
    case 'finance':
      return <FinanceScreen />;
    case 'facilities':
      return <FacilitiesScreen />;
    case 'stud':
      return <StudScreen tab={route.tab} mareId={route.mareId} />;
    case 'breeding':
      return <BreedingScreen tab={route.tab} />;
    case 'help':
      return <HelpScreen />;
    default:
      return <OfficeScreen />;
  }
}

function Sidebar({ route }: { route: Route }) {
  const { data: h } = useQuery('header', undefined);
  // Erste Schritte: besuchte Bildschirme melden
  const open = h?.tutorialOpen.includes(route.name) ?? false;
  useEffect(() => {
    if (open) call('markTutorial', { step: route.name }).then(() => invalidate(), () => undefined);
  }, [open, route.name]);
  const item = (r: Route, label: string, extra?: React.ReactNode) => {
    const active =
      route.name === r.name || (r.name === 'stable' && route.name === 'horse') || (r.name === 'raceday' && route.name === 'race') || (r.name === 'market' && route.name === 'auction');
    return (
      <a href={href(r)} className={active ? 'active' : ''}>
        {label}
        {extra}
      </a>
    );
  };
  return (
    <aside className="sidebar">
      <div className="brand">
        Silks &amp; Stamina
        <small>Rennstall-Manager</small>
      </div>
      <nav className="nav">
        {item({ name: 'office' }, 'Büro', h && h.unread > 0 ? <span className="badge">{h.unread}</span> : null)}
        {item({ name: 'stable' }, 'Stall')}
        {item({ name: 'training' }, 'Training')}
        {item({ name: 'calendar' }, 'Rennkalender')}
        {item({ name: 'raceday' }, 'Renntag', h && h.runnersThisWeek > 0 ? <span className="badge">{h.runnersThisWeek}</span> : null)}
        {item({ name: 'stud' }, 'Gestüt', h && h.studAlerts > 0 ? <span className="badge">{h.studAlerts}</span> : null)}
        {item({ name: 'breeding' }, 'Zucht-Statistik')}
        {item({ name: 'market' }, 'Markt', h && h.marketAlerts > 0 ? <span className="badge">{h.marketAlerts}</span> : null)}
        {item({ name: 'staff' }, 'Personal', h && h.staffAlerts > 0 ? <span className="badge">{h.staffAlerts}</span> : null)}
        {item({ name: 'jockeys' }, 'Jockeys')}
        {item({ name: 'finance' }, 'Finanzen')}
        {item({ name: 'facilities' }, 'Anlage')}
        <div className="sep" />
        {item({ name: 'help' }, 'Hilfe & Glossar')}
        {item({ name: 'saves' }, 'Spielstände')}
      </nav>
      <div className="foot">
        Phase 5 · Grafik und Feinschliff.
        <br />
        Zufall: {h ? Math.round(h.randomness * 100) : '–'} %
      </div>
    </aside>
  );
}

function TopBar() {
  const { data: h } = useQuery('header', undefined);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ s: WeekSummary; links: RunLink[] } | null>(null);
  const advance = async () => {
    setBusy(true);
    try {
      const s = await call('advanceWeek');
      const links = s.playerRuns.length ? await call('runLinks', { runIds: s.playerRuns }) : [];
      invalidate();
      setSummary({ s, links });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey && !busy) advance();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <header className="topbar">
      <div className="date">{h?.weekLabel ?? '…'}</div>
      {h && (
        <div className="stable">
          <SilksIcon silks={h.stable.silks} size={22} />
          {h.stable.name}
        </div>
      )}
      <div className="spacer" />
      {h && (
        <div className={`balance ${h.balance < 0 ? 'neg' : ''}`} title={h.balance < -h.overdraftLimit ? 'Dispolimit überschritten!' : 'Kontostand'}>
          <a href="#/finance" style={{ color: 'inherit' }}><Money v={h.balance} /></a>
        </div>
      )}
      <button className="btn brass" onClick={advance} disabled={busy} title="Strg+Enter">
        {busy ? 'Woche läuft …' : 'Woche abschließen ▸'}
      </button>
      {summary && (
        <Modal onClose={() => setSummary(null)}>
          <h2>
            Woche {summary.s.week} abgeschlossen
          </h2>
          <p className="muted">
            {summary.s.racesRun} Rennen mit {summary.s.runners} Startern gelaufen · {summary.s.injuries} neue Verletzungen · Simulation {Math.round(summary.s.durationMs)} ms
          </p>
          <p>
            Kontostand diese Woche: <Money v={summary.s.balanceDelta} signed />
            {summary.s.events.map((e) => (
              <span key={e} className="pill bad" style={{ marginLeft: 8 }}>{e}</span>
            ))}
          </p>
          {summary.links.length > 0 ? (
            <>
              <h3>Deine Starter</h3>
              <table className="data">
                <tbody>
                  {summary.links.map((l) => (
                    <tr key={l.runId}>
                      <td><HorseLink id={l.horseId} name={l.horseName} /></td>
                      <td><RaceLink id={l.raceId} name={l.raceName} /></td>
                      <td className="num"><b>{l.position}.</b></td>
                      <td className="num">SF <Fig v={l.speedFigure} /></td>
                      <td>
                        <a className="btn small" href={href({ name: 'race', id: l.raceId, tab: 'view' })} onClick={() => setSummary(null)}>
                          Rennen ansehen
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p>Keine eigenen Starter in dieser Woche.</p>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn primary" onClick={() => setSummary(null)}>Weiter</button>
          </div>
        </Modal>
      )}
    </header>
  );
}
