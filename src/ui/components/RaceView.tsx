import { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../api';
import type { ReplayView } from '../../engine/game/queries';
import { SilksIcon } from './common';
import { raceTime } from '../../engine/game/format';
import { buildCommentary, marginWords, photoFinish } from './commentary';

/**
 * Rennansicht in Draufsicht (Canvas 2D). Das Replay ist eine deterministische Neusimulation
 * aus Seed und Eingaben; die Positionen kommen fertig berechnet aus dem Worker.
 */

const SPEEDS = [1, 2, 4, 10];

export function RaceView({ raceId }: { raceId: string }) {
  const [data, setData] = useState<ReplayView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    call('replay', { raceId }).then(setData).catch((e: Error) => setErr(e.message));
  }, [raceId]);
  if (err) return <div className="empty">{err}</div>;
  if (!data) return <div className="loading">Rennen wird geladen …</div>;
  return <Player data={data} />;
}

function Player({ data }: { data: ReplayView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const tRef = useRef(0);
  const endT = data.frames[data.frames.length - 1]!.t;
  const finishT = useMemo(() => {
    // Zeit, zu der der Sieger das Ziel erreicht
    for (const f of data.frames) if (f.dist.some((d) => d >= data.distanceM)) return f.t;
    return endT;
  }, [data, endT]);

  // Geometrie: Bounding Box und Skalierung
  const view = useMemo(() => {
    const pts: Array<[number, number]> = [...data.outlineOuter, ...data.coursePath];
    for (const f of data.frames) for (let i = 0; i < f.xy.length; i += 2) pts.push([f.xy[i]!, f.xy[i + 1]!]);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const pad = 30;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [data]);

  // Animation
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tRef.current = Math.min(endT, tRef.current + dt * speed);
      setT(tRef.current);
      if (tRef.current >= endT) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, endT]);

  // Interpolierte Positionen
  const state = useMemo(() => {
    const k = Math.min(data.frames.length - 2, Math.max(0, Math.floor(t / data.frameDt)));
    const a = data.frames[k]!;
    const b = data.frames[k + 1] ?? a;
    const w = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const xy = a.xy.map((v, i) => v + ((b.xy[i] ?? v) - v) * w);
    const dist = a.dist.map((v, i) => v + ((b.dist[i] ?? v) - v) * w);
    return { xy, dist };
  }, [t, data]);

  // Reihenfolge nach gelaufener Strecke; wer im Ziel ist, steht nach offiziellem Platz (auch nach dem Auslaufen)
  const order = useMemo(
    () =>
      data.runners
        .map((_, i) => i)
        .sort((a, b) => {
          const fa = state.dist[a]! >= data.distanceM;
          const fb = state.dist[b]! >= data.distanceM;
          if (fa && fb) return data.runners[a]!.position - data.runners[b]!.position;
          return state.dist[b]! - state.dist[a]!;
        }),
    [state, data],
  );

  // Zeichnen
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const W = c.clientWidth;
    const H = Math.round(W * Math.min(0.75, Math.max(0.3, (view.maxY - view.minY) / (view.maxX - view.minX))));
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
      c.style.height = `${H}px`;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(W / (view.maxX - view.minX), H / (view.maxY - view.minY));
    const ox = (W - (view.maxX - view.minX) * s) / 2;
    const oy = (H - (view.maxY - view.minY) * s) / 2;
    const X = (x: number) => ox + (x - view.minX) * s;
    const Y = (y: number) => oy + (view.maxY - y) * s;

    // Rasen
    ctx.fillStyle = '#4c7d43';
    ctx.fillRect(0, 0, W, H);
    // Bahn
    const lane = 16 * s;
    if (data.outlineOuter.length) {
      ctx.beginPath();
      data.outlineOuter.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.fillStyle = '#6a9a55';
      ctx.fill();
      ctx.beginPath();
      data.outlineInner.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.fillStyle = '#3f6b3a';
      ctx.fill();
      ctx.strokeStyle = '#f5f2e8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Rennstrecke (auch gerade Bahnen)
    ctx.beginPath();
    data.coursePath.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y - 8)) : ctx.moveTo(X(x), Y(y - 8))));
    ctx.strokeStyle = 'rgba(122,170,98,0.9)';
    ctx.lineWidth = lane;
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.beginPath();
    data.coursePath.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.strokeStyle = '#f5f2e8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Ziel und Start
    const post = (p: [number, number], color: string, label: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(X(p[0]) - 2, Y(p[1]) - 2, 4, lane + 6);
      ctx.font = '11px Georgia, serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, X(p[0]) + 5, Y(p[1]) + lane + 14);
    };
    post(data.finish, '#c0392b', 'Ziel');
    post(data.start, '#f2c94c', 'Start');

    // Pferde (hinten zuerst zeichnen)
    const r = Math.max(4.5, 1.1 * s);
    for (const i of [...order].reverse()) {
      const x = X(state.xy[i * 2]!);
      const y = Y(state.xy[i * 2 + 1]!);
      const rn = data.runners[i]!;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = rn.silks.body;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.35);
      ctx.strokeStyle = rn.silks.pattern2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = rn.silks.cap;
      ctx.fill();
      if (rn.isPlayer) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [state, order, data, view]);

  // Live-Zwischenzeiten und Kommentar
  const leader = order[0]!;
  const leaderDist = state.dist[leader]!;
  const passed = data.sectionalMarks.filter((m) => m <= leaderDist);
  const commentary = useMemo(() => buildCommentary(data), [data]);
  const photo = useMemo(() => photoFinish(data), [data]);
  const said = commentary.filter((c) => c.t <= t);
  const ticker = t <= 0.2 ? 'Die Boxen öffnen sich …' : (said.at(-1)?.text ?? '');
  const showPhoto = photo !== null && t >= finishT + 0.5;

  return (
    <div className="grid side">
      <div className="col" style={{ gap: 6 }}>
        <div className="race-canvas-wrap">
          <canvas ref={canvas} style={{ width: '100%' }} />
          <div className="ticker">{ticker}</div>
          {showPhoto && <PhotoFinish data={data} photo={photo!} />}
        </div>
        <div className="row">
          <button className="btn small primary" onClick={() => {
            if (tRef.current >= endT) {
              tRef.current = 0;
              setT(0);
            }
            setPlaying((p) => !p);
          }}>
            {playing ? '❚❚ Pause' : '▶ Abspielen'}
          </button>
          {SPEEDS.map((x) => (
            <button key={x} className={`chip ${speed === x ? 'on' : ''}`} onClick={() => setSpeed(x)}>
              {x}×
            </button>
          ))}
          <button className="btn small" onClick={() => {
            tRef.current = endT;
            setT(endT);
            setPlaying(false);
          }}>
            Sofortergebnis
          </button>
          <input
            type="range"
            min={0}
            max={endT}
            step={0.1}
            value={t}
            style={{ flex: 1 }}
            onChange={(e) => {
              tRef.current = Number(e.target.value);
              setT(tRef.current);
            }}
          />
          <span className="mono small">{raceTime(Math.min(t, finishT))}</span>
        </div>
        <div className="small muted">
          Zwischenzeiten des Führenden:{' '}
          {passed.length === 0 ? '–' : passed.map((m) => `${Math.round(m)} m`).join(' · ')} · gelaufen {Math.round(Math.min(leaderDist, data.distanceM))} von {data.distanceM} m
        </div>
        <div className="commentary">
          {said.slice(-6).reverse().map((c, i) => (
            <div key={`${c.t}-${i}`} className={`${c.mine ? 'mine' : ''} ${c.big ? 'big' : ''}`}>
              <span className="mono muted">{raceTime(Math.min(c.t, finishT))}</span> {c.text}
            </div>
          ))}
        </div>
      </div>
      <div className="card leaderboard">
        <h3>Positionen</h3>
        <ol>
          {order.map((i) => {
            const rn = data.runners[i]!;
            const behind = (state.dist[leader]! - state.dist[i]!) / 2.4;
            return (
              <li key={rn.horseId} style={{ fontWeight: rn.isPlayer ? 700 : 400 }}>
                <SilksIcon silks={rn.silks} size={16} />
                <span style={{ flex: 1 }}>{rn.name}</span>
                <span className="mono muted">{i === leader ? '' : `${behind.toFixed(1)} L`}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Zielfoto: die ersten drei an der Ziellinie, Abstände maßstäblich (1 Länge ≈ 2,4 m). */
function PhotoFinish({ data, photo }: { data: ReplayView; photo: Array<{ idx: number; behindL: number }> }) {
  const W = 360;
  const lineX = 300;
  const perL = 70;
  return (
    <div className="photo-finish">
      <div className="pf-title">Zielfoto</div>
      <svg viewBox={`0 0 ${W} ${28 * photo.length + 16}`} width="100%" role="img" aria-label="Zielfoto">
        <rect x={0} y={0} width={W} height={28 * photo.length + 16} fill="#efe9d8" />
        <line x1={lineX} x2={lineX} y1={0} y2={28 * photo.length + 16} stroke="#8e2b22" strokeWidth={2} />
        {photo.map((p, row) => {
          const rn = data.runners[p.idx]!;
          const nose = lineX - p.behindL * perL;
          const y = 14 + row * 28;
          return (
            <g key={rn.horseId}>
              <rect x={nose - 120} y={y - 7} width={120} height={14} rx={7} fill="#4a3424" opacity={0.85} />
              <circle cx={nose - 4} cy={y} r={7} fill="#4a3424" />
              <rect x={nose - 78} y={y - 12} width={22} height={10} rx={3} fill={rn.silks.body} stroke={rn.silks.pattern2} strokeWidth={1.5} />
              <text x={8} y={y + 4} fontSize={11} fill="#2a2620" fontWeight={rn.isPlayer ? 700 : 400}>
                {row + 1}. {rn.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="small">
        {data.runners[photo[0]!.idx]!.name} gewinnt mit {marginWords(photo[1]?.behindL ?? 0)}.
      </div>
    </div>
  );
}
