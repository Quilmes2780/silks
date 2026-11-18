import { useState } from 'react';
import { toast, useCommand, useQuery } from '../api';
import { Bar, HorseLink, Loading, Money, Stars } from '../components/common';
import { ContractDialog } from '../components/Contract';
import { StaffAvatar } from '../components/Portrait';
import type { StaffRow, StaffView } from '../../engine/game/econQueries';
import type { StaffRole } from '../../engine/types';

export function StaffScreen() {
  const { data, error } = useQuery('staff', undefined);
  const { run, busy } = useCommand();
  const [dialog, setDialog] = useState<{ s: StaffRow; mode: 'hire' | 'renew' } | null>(null);
  const [role, setRole] = useState<StaffRole | 'all'>('all');
  if (!data) return <Loading error={error} />;
  const candidates = data.candidates.filter((c) => role === 'all' || c.role === role);
  const fire = async (s: StaffRow) => {
    if (!window.confirm(`${s.roleLabel} ${s.name} entlassen? Es wird eine Abfindung fällig (halbes Restgehalt, höchstens 26 Wochen).`)) return;
    const res = await run('fireStaff', { staffId: s.id });
    if (res) toast(`${s.name} entlassen – Abfindung £${res.severance.toLocaleString('en-GB')}.`, 'info');
  };
  const precision = data.effects.analystPrecision;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row">
        <h1 style={{ marginBottom: 0 }}>Personal</h1>
        <span className="muted">
          {data.team.length} Mitarbeiter · Lohnsumme <Money v={data.payroll} />/Woche · {data.horses} Pferde · Ruf {data.reputation}/100
        </span>
      </div>
      {data.hints.length > 0 && (
        <div className="notice">
          {data.hints.map((h) => (
            <div key={h}>• {h}</div>
          ))}
        </div>
      )}
      <div className="grid side">
        <div className="card">
          <h3>Team</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Rolle</th>
                <th>Name</th>
                <th>Können</th>
                <th className="num">Alter</th>
                <th className="num">Erf.</th>
                <th style={{ width: 90 }}>Moral</th>
                <th className="num">Gehalt/Wo.</th>
                <th className="num">Vertrag bis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((s) => (
                <tr key={s.id}>
                  <td className="small">{s.roleLabel}</td>
                  <td>
                    <div className="person">
                    {s.generated && <StaffAvatar role={s.role} name={s.name} id={s.id} />}
                    <div>
                    {s.name}
                    {s.leaving && (
                      <div>
                        <span className="pill bad">
                          {s.leaving.reason} {s.leaving.week}
                        </span>
                      </div>
                    )}
                    {s.horses.length > 0 && <div className="small muted">{s.horses.map((h) => h.name).join(', ')}</div>}
                    {s.jockey && (
                      <div className="small muted">
                        {s.jockey.weight}
                        {s.jockey.allowance ? ` · Erlaubnis ${s.jockey.allowance} lb` : ''} · {s.jockey.careerWins} Siege{s.jockey.suspended ? ' · gesperrt' : ''}
                      </div>
                    )}
                    </div>
                    </div>
                  </td>
                  <td><Stars v={s.stars} /></td>
                  <td className="num">{s.age}</td>
                  <td className="num">{s.experience}</td>
                  <td><Bar value={s.morale ?? 0} warnBelow={50} badBelow={30} /></td>
                  <td className="num">
                    <Money v={s.salary ?? 0} />
                    {s.prizeShare ? <div className="small muted">+{Math.round(s.prizeShare * 100)} % Preisgeld</div> : null}
                  </td>
                  <td className="num">{s.contractEnd}</td>
                  <td className="nowrap">
                    <button className="btn small" disabled={busy} onClick={() => setDialog({ s, mode: 'renew' })}>
                      Vertrag
                    </button>{' '}
                    {s.role !== 'head_trainer' && (
                      <button className="btn small danger" disabled={busy} onClick={() => fire(s)}>
                        Entlassen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            Moral hängt von Gehalt (im Verhältnis zur Forderung), Erfolg, Ruf und Arbeitslast ab. Unzufriedene kündigen; gute Leute werden von der Konkurrenz abgeworben. Im November ist Vertragsrunde.
          </p>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <h3>Wirkung des Teams</h3>
            <dl className="kv">
              <dt>Trainingseffizienz</dt>
              <dd>{data.effects.training} %</dd>
              <dt>Verletzungsrisiko</dt>
              <dd>{data.effects.risk} % des Grundrisikos</dd>
              <dt>Ausfallzeiten</dt>
              <dd>{data.effects.heal} %</dd>
              <dt>Speed Figures</dt>
              <dd>{precision === 0 ? 'verborgen (kein Analyst)' : precision === 1 ? 'exakt' : `auf ${precision} lb gerundet`}</dd>
            </dl>
            <p className="small muted">100 % entspricht Personal mittlerer Qualität.</p>
          </div>
          <GroomAssignment data={data} />
        </div>
      </div>

      <div className="card">
        <h3>
          Bewerber
          <span style={{ flex: 1 }} />
          <span className="chips">
            <button className={`chip ${role === 'all' ? 'on' : ''}`} onClick={() => setRole('all')}>
              alle
            </button>
            {data.roles.map((r) => (
              <button key={r.role} className={`chip ${role === r.role ? 'on' : ''}`} onClick={() => setRole(r.role)}>
                {r.label}
              </button>
            ))}
          </span>
        </h3>
        <table className="data">
          <thead>
            <tr>
              <th>Rolle</th>
              <th>Name</th>
              <th>Können</th>
              <th className="num">Alter</th>
              <th className="num">Erf.</th>
              <th className="num">Forderung/Wo.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((s) => (
              <tr key={s.id}>
                <td className="small">{s.roleLabel}</td>
                <td>
                  <div className="person">
                  {s.generated && <StaffAvatar role={s.role} name={s.name} id={s.id} />}
                  <div>
                  {s.name}
                  {s.specialty && <span className="small muted"> · {s.specialty}</span>}
                  {s.jockey && (
                    <div className="small muted">
                      {s.jockey.weight}
                      {s.jockey.allowance ? ` · Erlaubnis ${s.jockey.allowance} lb` : ''} · {s.jockey.careerWins} Siege
                    </div>
                  )}
                  </div>
                  </div>
                </td>
                <td><Stars v={s.stars} /></td>
                <td className="num">{s.age}</td>
                <td className="num">{s.experience}</td>
                <td className="num"><Money v={s.demand} /></td>
                <td>
                  {s.blocked ? (
                    <span className="small muted">verhandelt vorerst nicht</span>
                  ) : (
                    <button className="btn small primary" onClick={() => setDialog({ s, mode: 'hire' })}>
                      Angebot
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length === 0 && <div className="empty">Zurzeit keine Bewerber für diese Rolle – der Markt erneuert sich alle vier Wochen.</div>}
      </div>

      <div className="card">
        <h3>Rollen</h3>
        <table className="data">
          <tbody>
            {data.roles.map((r) => (
              <tr key={r.role}>
                <td className="nowrap"><b>{r.label}</b></td>
                <td className="num">{r.count}</td>
                <td className="small">{r.effect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && <ContractDialog s={dialog.s} mode={dialog.mode} onClose={() => setDialog(null)} />}
    </div>
  );
}

function GroomAssignment({ data }: { data: StaffView }) {
  const { run, busy } = useCommand();
  return (
    <div className="card">
      <h3>Pfleger-Zuteilung</h3>
      {data.grooms.length === 0 ? (
        <div className="empty">Kein Pfleger im Team.</div>
      ) : (
        <table className="data">
          <tbody>
            {data.stableHorses.map((h) => (
              <tr key={h.id}>
                <td><HorseLink id={h.id} name={h.name} /></td>
                <td>
                  <select value={h.groomId ?? ''} disabled={busy} onChange={(e) => run('assignGroom', { horseId: h.id, groomId: e.target.value || null })}>
                    <option value="">– kein Pfleger –</option>
                    {data.grooms.map((gr) => (
                      <option key={gr.id} value={gr.id}>
                        {gr.name} ({gr.load})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="small muted nowrap">{h.groomId ? `Bindung ${h.bond}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted">Je Pfleger 4 Pferde. Die Bindung wächst jede Woche und verstärkt die Wirkung; ein Wechsel setzt sie zurück.</p>
    </div>
  );
}
