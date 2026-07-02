import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../middleware/index.js';
import { getStatus, getRecentTransfers, getRecentErrors, restartFtp } from './ftp.service.js';
import { getFtpConfig, updateFtpConfig } from './ftp.config.js';
import { ftpConfigUpdateSchema } from './ftp.validation.js';
import type { FtpConfigView } from '@sonycam/shared';

/** Project the stored config to its client-safe view (never the password). */
function toView(): FtpConfigView {
  const c = getFtpConfig();
  return {
    enabled: c.enabled,
    user: c.user,
    externalIp: c.externalIp,
    port: c.port,
    pasvMin: c.pasvMin,
    pasvMax: c.pasvMax,
    passSet: c.pass.length > 0,
  };
}

export const ftpController = {
  status(_req: Request, res: Response): void {
    sendSuccess(res, getStatus());
  },
  transfers(_req: Request, res: Response): void {
    sendSuccess(res, getRecentTransfers());
  },
  errors(_req: Request, res: Response): void {
    sendSuccess(res, getRecentErrors());
  },

  config(_req: Request, res: Response): void {
    sendSuccess(res, toView());
  },

  /** Apply new settings and restart the FTP server so they take effect. */
  async updateConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = ftpConfigUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid request', 400);
      }
      const input = parsed.data;
      // Empty pass = keep the current one; never allow an enabled, open server.
      const effectivePass = input.pass && input.pass.length > 0 ? input.pass : getFtpConfig().pass;
      if (input.enabled && !effectivePass) {
        throw new AppError('Set a password before enabling FTP', 400);
      }
      await updateFtpConfig((cur) => ({
        ...cur,
        enabled: input.enabled,
        user: input.user,
        externalIp: input.externalIp,
        pass: effectivePass,
      }));
      await restartFtp();
      sendSuccess(res, { config: toView(), status: getStatus() });
    } catch (err) {
      next(err);
    }
  },

  /** Stop-then-start (clears a leaked passive pool without a container restart). */
  async restart(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await restartFtp();
      sendSuccess(res, getStatus());
    } catch (err) {
      next(err);
    }
  },
};
