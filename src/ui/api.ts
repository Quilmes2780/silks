import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Api, ApiType, RequestMessage, ResponseMessage, WorkerEvent } from '../worker/protocol';

/**
 * Client für den Spiel-Worker. Die UI spricht ausschließlich über diese typisierten
 * Nachrichten mit dem Spielkern.
 */

const worker = new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' });
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

worker.onmessage = (ev: MessageEvent<ResponseMessage | WorkerEvent>) => {
  const msg = ev.data;
  if ('event' in msg) return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.ok) p.resolve(msg.data);
  else p.reject(new Error(msg.error));
};

export function call<K extends ApiType>(type: K, ...args: Api[K]['req'] extends void ? [] : [Api[K]['req']]): Promise<Api[K]['res']> {
  const id = nextId++;
  const payload = (args[0] ?? undefined) as Api[K]['req'];
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage({ id, type, payload } satisfies RequestMessage<K>);
  });
}

// ---- Daten-Version: nach jeder Änderung laden die Ansichten neu ----
let version = 0;
const listeners = new Set<() => void>();
export function invalidate(): void {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Lädt eine Abfrage und lädt sie neu, wenn sich Daten oder Parameter ändern. */
export function useQuery<K extends ApiType>(type: K, req: Api[K]['req'], deps: unknown[] = []) {
  const v = useDataVersion();
  const [data, setData] = useState<Api[K]['res'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(req ?? null);
  useEffect(() => {
    let alive = true;
    (call as (t: K, r: Api[K]['req']) => Promise<Api[K]['res']>)(type, req)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, key, v, ...deps]);
  return { data, error };
}

/** Führt einen Befehl aus, meldet Fehler und invalidiert die Daten. */
export function useCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <K extends ApiType>(type: K, req: Api[K]['req']): Promise<Api[K]['res'] | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await (call as (t: K, r: Api[K]['req']) => Promise<Api[K]['res']>)(type, req);
      invalidate();
      return res;
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error };
}

// ---- Toasts ----
export interface ToastMsg {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}
let toasts: ToastMsg[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;
export function toast(text: string, kind: ToastMsg['kind'] = 'info') {
  const t = { id: ++toastId, text, kind };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, 4500);
}
export function useToasts(): ToastMsg[] {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
}
