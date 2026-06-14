import type { Response } from 'express';
import type { ApiResponse } from '@sonycam/shared';

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { status: 'success', data };
  res.status(status).json(body);
}

export function sendError(res: Response, message: string, status = 400): void {
  const body: ApiResponse = { status: 'error', message };
  res.status(status).json(body);
}
