import { randomBytes } from 'node:crypto';

/**
 * Short-lived, single-use tokens that bridge a POST (which carries the selected
 * paths and Bearer auth) to a GET (which the browser navigates to for a native,
 * streamed-to-disk download). The path list is held in memory only; tokens are
 * consumed on first use and expire after a few minutes, so nothing persists.
 */
interface PendingZip {
  paths: string[];
  expires: number;
}

const TTL_MS = 5 * 60 * 1000;
const pending = new Map<string, PendingZip>();

/** Drop expired tokens (called opportunistically, no timer needed). */
function sweep(): void {
  const now = Date.now();
  for (const [token, p] of pending) {
    if (p.expires <= now) pending.delete(token);
  }
}

/** Stash a selection and return a token to download it with. */
export function issueZipToken(paths: string[]): string {
  sweep();
  const token = randomBytes(18).toString('base64url');
  pending.set(token, { paths, expires: Date.now() + TTL_MS });
  return token;
}

/** Resolve + remove a token (single use). Returns null if missing or expired. */
export function consumeZipToken(token: string): string[] | null {
  const p = pending.get(token);
  if (!p) return null;
  pending.delete(token);
  return p.expires > Date.now() ? p.paths : null;
}
