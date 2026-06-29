import { loadShares } from './shares.store.js';
import { logger } from '../../utils/logger.js';

export { ownerShareRoutes, publicShareRoutes } from './shares.routes.js';
export { renderSharePage } from './sharePage.js';

/** Load the shares map into memory at startup (best-effort). */
export async function initShares(): Promise<void> {
  try {
    await loadShares();
  } catch (err) {
    logger.error('Failed to load shares', 'Shares', err);
  }
}
