import type { ShareProgress } from '@sonycam/shared';

/**
 * In-memory progress for preview generation (share create/refresh). Keyed by a
 * client-generated id the frontend polls while its mutation is pending. Not
 * persisted on purpose: if the server restarts mid-generation, the request
 * that owned the id has died with it. A TTL sweep on each start keeps
 * abandoned entries from accumulating.
 */

const TTL_MS = 10 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

interface Entry extends ShareProgress {
  touched: number; // epoch ms of last update, for the TTL sweep
}

const entries = new Map<string, Entry>();

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, e] of entries) {
    if (e.touched < cutoff) entries.delete(id);
  }
}

/** Accept only ids the frontend generator can produce; anything else is
 *  treated as "no progress tracking" rather than an error. */
export function isValidProgressId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

export function progressStart(id: string, total: number): void {
  sweep();
  entries.set(id, { done: 0, total, touched: Date.now() });
}

export function progressTick(id: string): void {
  const e = entries.get(id);
  if (!e) return;
  e.done += 1;
  e.touched = Date.now();
}

export function progressEnd(id: string): void {
  entries.delete(id);
}

/** Snapshot for polling. Unknown ids read as { done: 0, total: 0 }. */
export function progressGet(id: string): ShareProgress {
  const e = entries.get(id);
  return e ? { done: e.done, total: e.total } : { done: 0, total: 0 };
}
