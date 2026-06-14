import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from './error.middleware.js';

export interface TokenPayload {
  username: string;
  type: 'access' | 'refresh';
}

export function generateToken(username: string): string {
  const payload: TokenPayload = { username, type: 'access' };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.tokenTtl });
}

export function generateRefreshToken(username: string): string {
  const payload: TokenPayload = { username, type: 'refresh' };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.refreshTtl });
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
