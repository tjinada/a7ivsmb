import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { loginSchema, refreshSchema } from './auth.validation.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../middleware/index.js';
import type { TokenPayload } from '../../middleware/index.js';

export const authController = {
  login(req: Request, res: Response, next: NextFunction): void {
    try {
      const input = loginSchema.parse(req.body);
      sendSuccess(res, authService.login(input));
    } catch (err) {
      next(err instanceof Error && err.name === 'ZodError' ? new AppError('Invalid request', 400) : err);
    }
  },

  refresh(req: Request, res: Response, next: NextFunction): void {
    try {
      const input = refreshSchema.parse(req.body);
      sendSuccess(res, authService.refresh(input.refreshToken));
    } catch (err) {
      next(err instanceof Error && err.name === 'ZodError' ? new AppError('Invalid request', 400) : err);
    }
  },

  me(req: Request, res: Response): void {
    const user = (req as Request & { user?: TokenPayload }).user;
    sendSuccess(res, { username: user?.username });
  },
};
