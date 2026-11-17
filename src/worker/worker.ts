/// <reference lib="webworker" />
import type { RequestMessage, ResponseMessage, WorkerEvent } from './protocol';
import { GameService } from './service';
import { SaveStore } from './store';

/**
 * Web Worker: Spielkern und Datenbank laufen hier, damit die Wochensimulation
 * die Oberfläche nicht blockiert.
 */
const ctx = self as unknown as DedicatedWorkerGlobalScope;
const service = new GameService(new SaveStore());

// Befehle strikt nacheinander abarbeiten (keine überlappenden Zustandsänderungen)
let queue: Promise<unknown> = Promise.resolve();

ctx.onmessage = (ev: MessageEvent<RequestMessage>) => {
  const msg = ev.data;
  queue = queue.then(async () => {
    let res: ResponseMessage;
    try {
      const data = await service.handle(msg.type, msg.payload);
      res = { id: msg.id, ok: true, data } as ResponseMessage;
    } catch (e) {
      res = { id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    ctx.postMessage(res);
  });
};

ctx.postMessage({ event: 'ready' } satisfies WorkerEvent);
