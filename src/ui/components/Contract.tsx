import { useEffect, useState } from 'react';
import { call, toast, useCommand } from '../api';
import { Modal, Money, Stars } from './common';
import type { StaffRow } from '../../engine/game/econQueries';

/** Eingabe für Geldbeträge in £ (ganze Pfund). */
export function MoneyInput({ value, onChange, step = 10, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      £
      <input
        type="number"
        className="money-input"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        step={step}
        onChange={(e) => onChange(Math.max(min, Math.round(Number(e.target.value) || 0)))}
      />
    </span>
  );
}

/**
 * Vertragsangebot an Bewerber (Einstellung) oder eigenes Personal (Verlängerung, Gehaltserhöhung).
 * Die Forderung ist bekannt; ob ein Angebot reicht, hängt von Ruf und Moral ab.
 */
export function ContractDialog({ s, mode, onClose }: { s: StaffRow; mode: 'hire' | 'renew'; onClose: () => void }) {
  const [hint, setHint] = useState<{ demand: number; mood: string } | null>(null);
  const [salary, setSalary] = useState<number>(s.salary ?? s.demand);
  const [years, setYears] = useState(2);
  const [share, setShare] = useState(Math.round((s.prizeShare ?? 0.1) * 100));
  const { run, busy } = useCommand();
  const withShare = s.role === 'head_trainer' || s.role === 'jockey';
  useEffect(() => {
    call('staffOfferHint', { staffId: s.id }).then((h) => {
      setHint(h);
      if (mode === 'hire') setSalary(h.demand);
    });
  }, [s.id, mode]);
  const submit = async () => {
    const req = { staffId: s.id, weeklySalary: salary, years, prizeShare: withShare ? share / 100 : undefined };
    const res = await run(mode === 'hire' ? 'hireStaff' : 'offerContract', req);
    if (!res) return;
    toast(res.message, res.accepted ? 'success' : 'error');
    if (res.accepted) onClose();
  };
  return (
    <Modal onClose={onClose}>
      <h2>
        {mode === 'hire' ? 'Angebot an' : 'Vertrag mit'} {s.name}
      </h2>
      <p className="muted">
        {s.roleLabel} · {s.age} Jahre · <Stars v={s.stars} /> · Erfahrung {s.experience}
        {s.specialty ? ` · Spezialgebiet ${s.specialty}` : ''}
        {s.jockey ? ` · Gewicht ${s.jockey.weight}${s.jockey.allowance ? `, Erlaubnis ${s.jockey.allowance} lb` : ''}` : ''}
      </p>
      {hint && (
        <p>
          Forderung: <b><Money v={hint.demand} /></b> pro Woche – {s.name} {hint.mood}.
          {s.salary !== null && (
            <>
              {' '}
              Bisher <Money v={s.salary} />.
            </>
          )}
        </p>
      )}
      {s.leaving && (
        <p className="pill bad">
          {s.leaving.reason} zum {s.leaving.week} – mindestens 15 % mehr Gehalt oder die volle Forderung halten {s.name}.
        </p>
      )}
      <dl className="kv" style={{ margin: '10px 0' }}>
        <dt>Wochengehalt</dt>
        <dd>
          <MoneyInput value={salary} onChange={setSalary} />
        </dd>
        <dt>Laufzeit</dt>
        <dd>
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y} Saison{y > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </dd>
        {withShare && (
          <>
            <dt>Erfolgsbeteiligung</dt>
            <dd>
              <input type="number" min={0} max={15} value={share} onChange={(e) => setShare(Math.max(0, Math.min(15, Number(e.target.value) || 0)))} style={{ width: 60 }} /> % des Preisgelds
              <div className="small muted">Üblich sind 10 %. Jeder Punkt mehr senkt die Gehaltsforderung um 3 %.</div>
            </dd>
          </>
        )}
      </dl>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Abbrechen
        </button>
        <button className="btn primary" disabled={busy || salary <= 0} onClick={submit}>
          {mode === 'hire' ? 'Angebot machen' : 'Vertrag anbieten'}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Ein deutlich zu niedriges Angebot kränkt: Dann redet {s.name} vier Wochen nicht mit dir.
      </p>
    </Modal>
  );
}
