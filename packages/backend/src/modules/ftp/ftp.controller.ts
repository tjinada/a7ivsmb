import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { getStatus, getRecentTransfers } from './ftp.service.js';

export const ftpController = {
  status(_req: Request, res: Response): void {
    sendSuccess(res, getStatus());
  },
  transfers(_req: Request, res: Response): void {
    sendSuccess(res, getRecentTransfers());
  },
};
