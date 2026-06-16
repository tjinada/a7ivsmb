import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from './error.middleware.js';

export interface TokenPayload {
  username: string;
  type: 'access' | 'refresh' | 'media';
}

/** Name of the read-only, image-only cookie used by plain <img> tags. */
export const MEDIA_COOKIE = 'sonycam_media';
const MEDIA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateToken(username: string): string {
  const payload: TokenPayload = { username, type: 'access' };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.tokenTtl });
}

export function generateRefreshToken(username: string): string {
  const payload: TokenPayload = { username, type: 'refresh' };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.refreshTtl });
}

/** Mint a media token: read-only, only honored by the image GET routes. */
export function generateMediaToken(username: string): string {
  const payload: TokenPayload = { username, type: 'media' };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyRefreshToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid refresh token', 401);
  }
  return decoded;
}

/** Verify a raw access token string. Throws on any problem. */
export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('wrong token type');
  }
  return decoded;
}

/** Verify a media token string. Throws unless it is a valid media token. */
export function verifyMediaToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
  if (decoded.type !== 'media') {
    throw new Error('wrong token type');
  }
  return decoded;
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

/** Set the read-only media cookie on a response (login / refresh). */
export function setMediaCookie(res: Response, username: string): void {
  res.cookie(MEDIA_COOKIE, generateMediaToken(username), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/gallery',
    maxAge: MEDIA_TTL_MS,
  });
}

/** Clear the media cookie (logout). */
export function clearMediaCookie(res: Response): void {
  res.clearCookie(MEDIA_COOKIE, { path: '/api/gallery' });
}

/** Express guard: requires a valid Bearer access token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }
  try {
    (req as Request & { user?: TokenPayload }).user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

/**
 * Guard for image GET routes: accepts either a Bearer access token (the in-app
 * fetch/download path) or the read-only media cookie (plain <img> tags, which
 * cannot send an Authorization header).
 */
export function requireMediaAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      (req as Request & { user?: TokenPayload }).user = verifyAccessToken(header.slice(7));
      return next();
    } catch {
      /* fall through to cookie */
    }
  }
  const cookie = readCookie(req, MEDIA_COOKIE);
  if (cookie) {
    try {
      verifyMediaToken(cookie);
      return next();
    } catch {
      /* fall through to 401 */
    }
  }
  next(new AppError('Authentication required', 401));
}