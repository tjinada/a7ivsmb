import { loadShares, getShareBySlug } from './shares.store.js';
import { logger } from '../../utils/logger.js';

export { ownerShareRoutes, publicShareRoutes } from './shares.routes.js';
export { renderSharePage, renderInactivePage } from './sharePage.js';
export { albumHasShares, loadShares, anyShareUnder } from './shares.store.js';
export { isValidSlug } from './shares.auth.js';

/** Load the shares map into memory at startup (best-effort). */
export async function initShares(): Promise<void> {
  try {
    await loadShares();
  } catch (err) {
    logger.error('Failed to load shares', 'Shares', err);
  }
}


/** True when a syntactically valid slug resolves to a live share. Used by the
 *  /s/:slug page route so revoked/unknown links get an honest "no longer
 *  active" page instead of the password gate. */
export async function shareSlugExists(slug: string): Promise<boolean> {
  await loadShares();
  return getShareBySlug(slug) !== null;
}
