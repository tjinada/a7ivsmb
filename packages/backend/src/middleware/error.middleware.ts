import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/** Throw this for expected, client-facing errors. */
export class AppError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.message, err.status);
    return;
  }
  logger.error('Unhandled error', 'ErrorHandler', err);
  sendError(res, 'Internal server error', 500);
}
