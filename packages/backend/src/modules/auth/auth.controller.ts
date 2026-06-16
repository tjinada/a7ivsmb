import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { loginSchema, refreshSchema } from './auth.validation.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, setMediaCookie, clearMediaCookie } from '../../middleware/index.js';
import type { TokenPayload } from '../../middleware/index.js';

export const authController = {
  login(req: Request, res: Response, next: NextFunction): void {
    try {
      const input = loginSchema.parse(req.body);
      const result = authService.login(input);
      setMediaCookie(res, result.user.username);
      sendSuccess(res, result);
    } catch (err) {
      next(err instanceof Error && err.name === 'ZodError' ? new AppError('Invalid request', 400) : err);
    }
  },

  refresh(req: Request, res: Response, next: NextFunction): void {
    try {
      const input = refreshSchema.parse(req.body);
      const result = authService.refresh(input.refreshToken);
      setMediaCookie(res, result.user.username);
      sendSuccess(res, result);
    } catch (err) {
      next(err instanceof Error && err.name === 'ZodError' ? new AppError('Invalid request', 400) : err);
    }
  },

  logout(_req: Request, res: Response): void {
    clearMediaCookie(res);
    sendSuccess(res, { ok: true });
  },

  me(req: Request, res: Response): void {
    const user = (req as Request & { user?: TokenPayload }).user;
    // Refresh the read-only media cookie so plain <img> loads keep working
    // (also seeds it for sessions that predate the cookie).
    if (user?.username) setMediaCookie(res, user.username);
    sendSuccess(res, { username: user?.username });
  },
};