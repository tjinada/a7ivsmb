import { loadFtpConfig } from './ftp.config.js';
import { startFtp } from './ftp.service.js';
import { logger } from '../../utils/logger.js';

export { ftpRoutes } from './ftp.routes.js';
export { stopFtp } from './ftp.service.js';

/** Load FTP config and start the receive server (best-effort). */
export async function initFtp(): Promise<void> {
  await loadFtpConfig();
  try {
    await startFtp();
  } catch (err) {
    logger.error('FTP failed to start', 'FTP', err);
  }
}
