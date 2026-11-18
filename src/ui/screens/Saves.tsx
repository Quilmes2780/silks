import { useRef, useState } from 'react';
import { call, invalidate, toast, useQuery } from '../api';
import { Modal, SilksIcon } from '../components/common';
import { Banner } from '../components/Portrait';
import { courseImage } from '../assets';
import type { Silks, SilksPattern } from '../../engine/types';
import type { SaveMeta } from '../../worker/protocol';
import { weekLabel } from '../../engine/game/format';

const PATTERNS: Array<[SilksPattern, string]> = [
  ['plain', 'einfarbig'],
  ['hoops', 'Ringe (hoops)'],
  ['stripes', 'Streifen'],
  ['sash', 'Schärpe'],
  ['chevrons', 'Winkel'],
  ['quartered', 'geviertelt'],
  ['diamond', 'Raute'],
  ['cross_belts', 'gekreuzte Gurte'],
  ['spots', 'Punkte'],
  ['halved', 'halbiert'],
];
const PALETTE = ['#1f3a93', '#7b1e1e', '#0b6623', '#f2c94c', '#ffffff', '#111111', '#e67e22', '#8e44ad', '#16a085', '#c0392b', '#2c3e50', '#d35400', '#f5f0e1', '#5dade2', '#e91e63', '#6b4f2a'];

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % 1_000_000_000;
}

export function SilksEditor({ silks, onChange }: { silks: Silks; onChange: (s: Silks) => void }) {
  const part = (key: keyof Omit<Silks, 'pattern'>, label: string) => (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <div className="swatches">
          {PALETTE.map((c) => (
            <span key={c} className={`swatch ${silks[key] === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ ...silks, [key]: c })} />
          ))}
        </div>
        <input type="color" value={silks[key]} onChange={(e) => onChange({ ...silks, [key]: e.target.value })} title="Eigene Farbe" />
      </div>
    </div>
  );
  return (
    <div className="silks-editor">
      <SilksIcon silks={silks} size={110} title="Deine Rennfarben" />
      <div className="col" style={{ gap: 8 }}>
        <div className="field">
          <label>Muster</label>
          <select value={silks.pattern} onChange={(e) => onChange({ ...silks, pattern: e.target.value as SilksPattern })}>
            {PATTERNS.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        {part('body', 'Grundfarbe')}
        {part('pattern2', 'Musterfarbe')}
        {part('sleeves', 'Ärmel')}
        {part('cap', 'Kappe')}
      </div>
    </div>
  );
}

/** Liest einen exportierten Spielstand – gzip-komprimiert (.json.gz) oder als reines JSON. */
async function readSaveFile(f: File): Promise<string> {
  const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return f.text();
}

export function SavesScreen({ onLoaded, hasGame }: { onLoaded: (id: string) => void; hasGame: boolean }) {
  const { data: saves } = useQuery('listSaves', undefined);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (s: SaveMeta) => {
    setBusy(true);
    try {
      await call('loadGame', { saveId: s.id });
      onLoaded(s.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const exportSave = async (s: SaveMeta) => {
    const { fileName, json } = await call('exportSave', { saveId: s.id });
    // gzip-komprimiert: Spielstände schrumpfen auf etwa ein Fünftel
    const gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    const url = URL.createObjectURL(new Blob([gz], { type: 'application/gzip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.gz`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exportiert: ${fileName}.gz`, 'success');
  };
  const del = async (s: SaveMeta) => {
    if (!confirm(`Spielstand „${s.name}“ endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    await call('deleteSave', { saveId: s.id });
    if (localStorage.getItem('silks:lastSave') === s.id) localStorage.removeItem('silks:lastSave');
    invalidate();
  };
  const importFile = async (f: File) => {
    setBusy(true);
    try {
      const meta = await call('importSave', { json: await readSaveFile(f) });
      toast(`Importiert: ${meta.name}`, 'success');
      onLoaded(meta.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <Banner src={courseImage('', 'turf')} height={230} position="center 70%" />
      <div className="title">Silks &amp; Stamina</div>
      <div className="subtitle">Ein Rennstall-Manager nach britischem Vorbild</div>
      <div className="grid side">
        <div className="card">
          <h3>Spielstände</h3>
          {!saves ? (
            <div className="muted">lädt …</div>
          ) : saves.length === 0 ? (
            <div className="empty">Noch kein Spielstand. Starte ein neues Spiel.</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Spiel</th>
                  <th>Stand</th>
                  <th>Gespeichert</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {saves.map((s) => (
                  <tr key={s.id}>
                    <td><SilksIcon silks={s.silks} size={24} /></td>
                    <td>
                      <b>{s.name}</b>
                      <div className="small muted">{s.stableName}</div>
                    </td>
                    <td className="small">{weekLabel(s.season, s.week)}</td>
                    <td className="small muted">{new Date(s.updatedAt).toLocaleString('de-DE')}</td>
                    <td className="nowrap">
                      <button className="btn small primary" disabled={busy} onClick={() => load(s)}>Laden</button>{' '}
                      <button className="btn small" onClick={() => exportSave(s)}>Export</button>{' '}
                      <button className="btn small danger" onClick={() => del(s)}>Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card col" style={{ gap: 10 }}>
          <h3>Los geht’s</h3>
          <button className="btn primary" onClick={() => setCreating(true)}>Neues Spiel …</button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>Spielstand importieren …</button>
          <input ref={fileRef} type="file" accept="application/json,application/gzip,.json,.gz" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          {hasGame && (
            <a className="btn" href="#/office">Zurück zum Spiel</a>
          )}
          <p className="small muted">
            Spielstände liegen nur in diesem Browser (IndexedDB). Mit Export/Import kannst du sie sichern oder auf einen anderen Rechner übertragen.
          </p>
        </div>
      </div>
      {creating && <NewGameDialog onClose={() => setCreating(false)} onCreated={onLoaded} />}
    </div>
  );
}

function NewGameDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('Meine Karriere');
  const [stableName, setStableName] = useState('Ashcombe Racing');
  const [silks, setSilks] = useState<Silks>({ pattern: 'hoops', body: '#1d3b2a', pattern2: '#d4b56a', sleeves: '#1d3b2a', cap: '#d4b56a' });
  const [randomness, setRandomness] = useState(0.4);
  const [horses, setHorses] = useState(6);
  const [aiStables, setAiStables] = useState(20);
  const [seed, setSeed] = useState(randomSeed);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const meta = await call('newGame', { name, stableName, silks, seed, randomness, playerHorses: horses, aiStables });
      onCreated(meta.id);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };
  const rLabel = randomness < 0.15 ? 'berechenbar' : randomness < 0.35 ? 'eher berechenbar' : randomness < 0.6 ? 'ausgewogen' : randomness < 0.85 ? 'turbulent' : 'wie im echten Leben';

  return (
    <Modal onClose={onClose}>
      <h2>Neues Spiel</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        Du übernimmst einen kleinen Flachrennstall in England mit ein paar mittelmäßigen Pferden und etwas Startkapital. Trainiere, nenne für Rennen,
        stelle Personal ein und züchte später deine eigenen Champions. Die Woche spielst du mit „Woche abschließen“ ab.
      </p>
      <div className="grid two" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>Name des Spielstands</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Name deines Rennstalls</label>
          <input type="text" value={stableName} onChange={(e) => setStableName(e.target.value)} maxLength={40} />
        </div>
      </div>
      <h3>Rennfarben (Silks)</h3>
      <SilksEditor silks={silks} onChange={setSilks} />
      <h3 style={{ marginTop: 16 }}>Spielwelt</h3>
      <div className="grid two">
        <div className="field">
          <label>
            Wie berechenbar sollen Rennen sein? <b>{Math.round(randomness * 100)} %</b> Zufall – {rLabel}
          </label>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            {(
              [
                [0.15, 'Berechenbar'],
                [0.4, 'Ausgewogen'],
                [0.8, 'Wie im echten Leben'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={`chip ${Math.abs(randomness - v) < 0.01 ? 'on' : ''}`} onClick={() => setRandomness(v)}>
                {l}
              </button>
            ))}
          </div>
          <input type="range" min={0} max={1} step={0.05} value={randomness} onChange={(e) => setRandomness(Number(e.target.value))} />
          <span className="small muted">Bestimmt, wie stark Tagesform und Rennzwischenfälle mitspielen. Empfohlen: Ausgewogen (40 %).</span>
        </div>
        <div className="field">
          <label>Startpferde: <b>{horses}</b></label>
          <input type="range" min={2} max={10} step={1} value={horses} onChange={(e) => setHorses(Number(e.target.value))} />
          <span className="small muted">Mittelmäßige Pferde, zwei bis vier Jahre alt.</span>
        </div>
      </div>
      <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => setAdvanced(!advanced)}>
        {advanced ? '▾' : '▸'} Erweitert
      </button>
      {advanced && (
      <div className="grid two" style={{ marginTop: 10 }}>
        <div className="field">
          <label>KI-Ställe: <b>{aiStables}</b></label>
          <input type="range" min={10} max={40} step={1} value={aiStables} onChange={(e) => setAiStables(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Seed (gleicher Seed = gleiche Welt)</label>
          <div className="row">
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} style={{ width: 160 }} />
            <button className="btn small" onClick={() => setSeed(randomSeed())}>Würfeln</button>
          </div>
        </div>
      </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button className="btn primary" onClick={create} disabled={busy || !stableName.trim()}>
          {busy ? 'Welt wird erzeugt …' : 'Spiel starten'}
        </button>
      </div>
    </Modal>
  );
}
