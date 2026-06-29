import type { Request, Response, NextFunction } from 'express';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { AppError } from '../../middleware/index.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: string, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

/** Cookie that authorizes a client to one share. Path-scoped per share, so a
 *  cookie minted for one slug is never sent to another share's endpoints. */
export const SHARE_COOKIE = 'sonycam_share';

interface SharePayload {
  type: 'share';
  slug: string;
}

/** Hash a share password with scrypt. Returns hex salt + hex hash. */
export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, KEYLEN);
  return { salt, hash: buf.toString('hex') };
}

/** Constant-time verify of a password against a stored salt+hash. */
export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const buf = await scrypt(password, salt, KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return buf.length === expected.length && timingSafeEqual(buf, expected);
}

/** Random URL-safe token for a share's public slug. */
export function newSlug(): string {
  return randomBytes(9).toString('base64url');
}

/** Random internal id (also used as the preview folder name). */
export function newId(): string {
  return randomBytes(8).toString('hex');
}

/** Read one cookie value from the raw Cookie header (no cookie-parser dep). */
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Set the path-scoped share cookie after a successful password unlock. */
export function setShareCookie(res: Response, slug: string): void {
  const payload: SharePayload = { type: 'share', slug };
  const ttlDays = config.shares.cookieTtlDays;
  res.cookie(SHARE_COOKIE, jwt.sign(payload, config.jwtSecret, { expiresIn: `${ttlDays}d` }), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: `/api/public/share/${slug}`,
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  });
}

/**
 * Guard for client share endpoints. Requires a valid share cookie whose slug
 * matches the :slug route param, so unlocking one share never grants access to
 * another. Throws 401 otherwise (the client page then shows the password gate).
 */
export function requireShareAuth(req: Request, _res: Response, next: NextFunction): void {
  const slug = req.params.slug;
  const cookie = readCookie(req, SHARE_COOKIE);
  if (cookie) {
    try {
      const decoded = jwt.verify(cookie, config.jwtSecret) as SharePayload;
      if (decoded.type === 'share' && decoded.slug === slug) {
        next();
        return;
      }
    } catch {
      /* fall through to 401 */
    }
  }
  next(new AppError('This share is locked', 401));
}
