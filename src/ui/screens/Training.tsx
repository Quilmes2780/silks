import { useState } from 'react';
import { call, invalidate, toast, useCommand, useQuery } from '../api';
import { Bar, HorseLink, Loading, PlaceholderTag, RaceLink } from '../components/common';
import type { TrainingBlock, TrainingPlan } from '../../engine/types';

/** Trainingsübersicht: alle eigenen Pferde × Wochentage auf einen Blick. */

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const INTENSITY_CLASS: Record<string, string> = { hoch: 'tr-high', mittel: 'tr-mid', niedrig: 'tr-low', erholend: 'tr-rest', '–': 'tr-rest' };

export function TrainingScreen() {
  const { data, error } = useQuery('stableList', {});
  const { data: info } = useQuery('trainingInfo', undefined);
  const { run, busy } = useCommand();
  const [bulk, setBulk] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  if (!data || !info) return <Loading error={error} />;

  const blockOf = (k: string) => info.blocks.find((b) => b.key === k);
  const setDay = (horseId: string, plan: TrainingPlan, i: number, b: TrainingBlock) => {
    const next = [...plan] as TrainingPlan;
    next[i] = b;
    run('setTraining', { horseId, plan: next });
  };
  const applyAll = async () => {
    if (!bulk) return;
    setBulkBusy(true);
    try {
      const targets = data.filter((h) => !h.injured);
      for (const h of targets) await call('setTraining', { horseId: h.horseId, plan: bulk });
      toast(`Vorlage „${info.templates.find((t) => t.key === bulk)?.label}“ für ${targets.length} Pferde gesetzt.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      invalidate();
      setBulkBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Training</h1>
      <div className="card row" style={{ flexWrap: 'wrap', gap: 8 }}>
        Vorlage für alle gesunden Pferde:
        <select value={bulk} onChange={(e) => setBulk(e.target.value)}>
          <option value="">– wählen –</option>
          {info.templates.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <button className="btn small" disabled={!bulk || bulkBusy || busy} onClick={applyAll}>
          Übernehmen
        </button>
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          Farben: <span className="tr-chip tr-high">hoch</span> <span className="tr-chip tr-mid">mittel</span> <span className="tr-chip tr-low">niedrig</span>{' '}
          <span className="tr-chip tr-rest">erholend</span>
        </span>
      </div>
      <div className="card">
        <table className="data training-grid">
          <thead>
            <tr>
              <th>Pferd</th>
              <th>Fitness</th>
              <th>Frische</th>
              <th>Vorlage</th>
              {DAYS.map((d) => (
                <th key={d}>{d}</th>
              ))}
              <th>Nächstes Rennen</th>
            </tr>
          </thead>
          <tbody>
            {data.map((h) => (
              <tr key={h.horseId}>
                <td>
                  <HorseLink id={h.horseId} name={h.name} /> <PlaceholderTag show={h.placeholder} />
                  <div className="small muted">
                    {h.age} J. · {h.trainerOpinion.distance}
                  </div>
                </td>
                <td><Bar value={h.fitness} warnBelow={80} badBelow={65} /></td>
                <td><Bar value={h.freshness} warnBelow={55} badBelow={35} /></td>
                <td>
                  <select
                    value={info.templates.find((t) => t.label === h.training)?.key ?? ''}
                    disabled={busy || h.injured}
                    onChange={(e) => e.target.value && run('setTraining', { horseId: h.horseId, plan: e.target.value })}
                  >
                    {!info.templates.some((t) => t.label === h.training) && <option value="">individuell</option>}
                    {info.templates.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </td>
                {h.injured ? (
                  <td colSpan={DAYS.length}>
                    <span className="pill bad">verletzt</span> <span className="small muted">kein Training möglich</span>
                  </td>
                ) : (
                  h.trainingPlan.map((b, i) => (
                    <td key={i} className={INTENSITY_CLASS[blockOf(b)?.intensity ?? '–']}>
                      <select value={b} disabled={busy} title={blockOf(b)?.trains} onChange={(e) => setDay(h.horseId, h.trainingPlan, i, e.target.value as TrainingBlock)}>
                        {info.blocks.map((x) => (
                          <option key={x.key} value={x.key}>{x.label}</option>
                        ))}
                      </select>
                    </td>
                  ))
                )}
                <td className="small">
                  {h.nextRace ? (
                    <>
                      <RaceLink id={h.nextRace.raceId} name={h.nextRace.name} />
                      <div className="muted">{h.nextRace.dateLabel}</div>
                    </>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Sonntag ist Ruhetag, ein Renntag ersetzt die Samstagsarbeit. Viele harte Tage kosten Frische und erhöhen das Verletzungsrisiko; Schwimmen und Ruhetage bauen
        Frische wieder auf. Was ein Baustein trainiert, zeigt der Tooltip; Details stehen im Pferdeprofil unter „Training“.
      </p>
    </div>
  );
}
