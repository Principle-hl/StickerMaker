import type { RasterInfo } from './cutline';
import type { TraceJob, TraceOk, TraceReply } from '../workers/trace.worker';

export type TraceOutput = Omit<TraceOk, 'id'>;
export type JobOptions = Pick<TraceJob, 'fill' | 'simplifyPx' | 'check'>;

/** Thrown (as a rejection) when a newer job replaced this one before it ran or finished. */
export const SUPERSEDED = Symbol('superseded');

interface Pending {
  job: TraceJob;
  resolve: (out: TraceOutput) => void;
  reject: (reason: unknown) => void;
}

/**
 * One worker, latest-wins scheduling. While a job is running, `run()` calls
 * replace each other, so a burst of slider ticks costs one trace at the end
 * instead of one per tick. `cancel()` kills an in-flight job outright.
 */
export class Tracer {
  private worker!: Worker;
  private seq = 0;
  private inflight: (Pending & { id: number }) | null = null;
  private pending: Pending | null = null;
  private disposed = false;

  constructor() {
    this.spawn();
  }

  private spawn() {
    this.worker = new Worker(new URL('../workers/trace.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<TraceReply>) => {
      const reply = e.data;
      const cur = this.inflight;
      if (!cur || cur.id !== reply.id) return;
      this.inflight = null;
      if ('error' in reply) cur.reject(new Error(reply.error));
      else {
        const { id: _id, ...out } = reply;
        cur.resolve(out);
      }
      this.flush();
    };
  }

  run(info: RasterInfo, opts: JobOptions): Promise<TraceOutput> {
    return new Promise((resolve, reject) => {
      this.pending?.reject(SUPERSEDED);
      const { W, H, px, mask, s, pad, vb } = info;
      this.pending = { job: { id: 0, W, H, px, mask, s, pad, vb, ...opts }, resolve, reject };
      if (!this.inflight) this.flush();
    });
  }

  private flush() {
    const next = this.pending;
    if (!next) return;
    this.pending = null;
    const id = ++this.seq;
    next.job.id = id;
    this.inflight = { ...next, id };
    // The mask is freshly rasterized per job and never read again on this side, so hand it over.
    this.worker.postMessage(next.job, [next.job.mask.buffer]);
  }

  /** Drop the queued job and abort the running one (by replacing the worker). */
  cancel() {
    this.pending?.reject(SUPERSEDED);
    this.pending = null;
    if (this.inflight) {
      this.inflight.reject(SUPERSEDED);
      this.inflight = null;
      this.worker.terminate();
      if (!this.disposed) this.spawn();
    }
  }

  dispose() {
    this.disposed = true;
    this.cancel();
    this.worker.terminate();
  }
}
