import { loadShares, getShareBySlug } from './shares.store.js';
import { logger } from '../../utils/logger.js';
import type { ShareKind } from '@sonycam/shared';

export { ownerShareRoutes, publicShareRoutes } from './shares.routes.js';
export { renderSharePage, renderInactivePage } from './sharePage.js';
export { ogCardPng } from './ogCard.js';
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


/** Unfurl/title metadata for the /s/:slug page, or null when the slug doesn't
 *  resolve to a live share (revoked/unknown → honest "no longer active" page
 *  instead of a password gate that can never be unlocked). */
export async function sharePageMeta(
  slug: string,
): Promise<{ albumName: string; kind: ShareKind } | null> {
  await loadShares();
  const rec = getShareBySlug(slug);
  if (!rec) return null;
  return { albumName: rec.albumName, kind: rec.kind ?? 'proofing' };
}
