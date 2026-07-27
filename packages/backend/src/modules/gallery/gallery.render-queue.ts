import { config } from '../../config/index.js';

/**
 * Bounded work queue + in-flight dedupe for rendition generation.
 *
 * Generating a rendition means a full-resolution decode (or an exiftool spawn
 * for RAW). On a cold folder the browser happily opens dozens of image requests
 * at once, and letting them all through means the box fights itself: the total
 * work is unchanged, but every tile finishes late and in arbitrary order.
 *
 * Queueing is FIFO, so tiles land roughly in the order the browser asked for
 * them (top-down), and duplicate requests for one cache key share a single job
 * instead of decoding the same file twice.
 *
 * Cache HITS never come through here — see galleryService.render(). A warm
 * folder stays as fast as the filesystem no matter how many tiles are visible.
 */

const limit = config.renderConcurrency;

let active = 0;
const waiting: (() => void)[] = [];
const inFlight = new Map<string, Promise<unknown>>();

function acquire(): Promise<void> {
  if (active < limit) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(resolve);
  });
}

function release(): void {
  // Hand the slot straight to the next waiter (`active` stays put) so the
  // count can never drift above the limit between release and re-acquire.
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

/**
 * Run `job` under the concurrency limit. Callers arriving while an identical
 * `key` is already in flight await that job's result rather than starting
 * their own.
 */
export function runQueued<T>(key: string, job: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = async (): Promise<T> => {
    await acquire();
    try {
      return await job();
    } finally {
      release();
    }
  };

  const p = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

// ── Background lane ─────────────────────────────────────────────────────────
//
// Warm-up work must never delay a live request, so it gets its own slots rather
// than sharing the live queue: ingesting a card would otherwise put hundreds of
// jobs in front of the tiles someone is actually looking at.

const bgLimit = config.warmConcurrency;

let bgActive = 0;
const bgWaiting: (() => void)[] = [];

function acquireBg(): Promise<void> {
  if (bgActive < bgLimit) {
    bgActive += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    bgWaiting.push(resolve);
  });
}

function releaseBg(): void {
  const next = bgWaiting.shift();
  if (next) next();
  else bgActive -= 1;
}

/**
 * Queue best-effort warm-up work. Fire and forget: errors are swallowed,
 * because anything that fails to pre-render is simply rendered on demand later
 * (and fails visibly there, if it is genuinely broken).
 *
 * A background job joins the dedupe map only once it actually starts, so a live
 * request for a key still sitting in the warm backlog runs straight away in the
 * live lane instead of inheriting the backlog's wait.
 */
export function warmInBackground(key: string, job: () => Promise<unknown>): void {
  if (bgLimit <= 0) return; // warming disabled
  void (async () => {
    await acquireBg();
    try {
      if (inFlight.has(key)) return; // a live request beat us to it
      const p = job();
      inFlight.set(key, p);
      try {
        await p;
      } finally {
        inFlight.delete(key);
      }
    } catch {
      /* best-effort: on-demand rendering remains the fallback */
    } finally {
      releaseBg();
    }
  })();
}
