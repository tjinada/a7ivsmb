import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { sendError } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';

/**
 * In-memory login brute-force throttle.
 *
 * Keyed by the real client IP. When the app is reached through Cloudflare
 * Tunnel, Express only sees the tunnel's localhost socket, so we read the real
 * caller from `CF-Connecting-IP` (set by Cloudflare), falling back to
 * `X-Forwarded-For` and then the socket address.
 *
 * Only failed logins (HTTP 401) count; a successful login (200) clears the
 * caller's bucket. After `maxFails` failures within `windowMs`, the caller is
 * blocked for `blockMs` and gets a 429 + Retry-After.
 *
 * NB: trusting CF-Connecting-IP is safe only because this service is meant to
 * be reachable solely via the Cloudflare tunnel (or the LAN). Don't expose the
 * raw container port to the public internet, or the header could be spoofed.
 */

type Bucket = { fails: number; windowStart: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();
const { windowMs, maxFails, blockMs } = config.loginRateLimit;

function clientKey(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function recordFailure(key: string, now: number): void {
  let b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    b = { fails: 0, windowStart: now, blockedUntil: 0 };
  }
  b.fails += 1;
  if (b.fails >= maxFails) {
    b.blockedUntil = now + blockMs;
    logger.warn(`Login throttled for ${key} after ${b.fails} failed attempts`, 'RateLimit');
  }
  buckets.set(key, b);
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = clientKey(req);
  const existing = buckets.get(key);

  if (existing && existing.blockedUntil > now) {
    const retrySec = Math.ceil((existing.blockedUntil - now) / 1000);
    res.setHeader('Retry-After', String(retrySec));
    sendError(res, `Too many login attempts. Try again in ${retrySec}s.`, 429);
    return;
  }

  // Record the outcome once the response has been sent.
  res.on('finish', () => {
    if (res.statusCode === 401) recordFailure(key, now);
    else if (res.statusCode === 200) buckets.delete(key);
  });

  next();
}

// Periodically prune stale buckets so the map can't grow unbounded.
// `unref()` keeps this timer from holding the process open.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.blockedUntil <= now && now - b.windowStart > windowMs) {
      buckets.delete(key);
    }
  }
}, Math.max(windowMs, 60_000));
cleanup.unref();
