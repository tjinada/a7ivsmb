import { Router } from 'express';
import { sharesController } from './shares.controller.js';
import { requireShareAuth } from './shares.auth.js';
import { requireAuth } from '../../middleware/index.js';
import { loginRateLimit } from '../auth/auth.rate-limit.js';

/**
 * Owner share management. Mounted at /api/gallery/shares on the protected host
 * (Cloudflare Access + app auth). Never exposed on the share host.
 */
const owner: Router = Router();
owner.post('/', requireAuth, sharesController.create);
owner.get('/', requireAuth, sharesController.list);
owner.post('/:id/delivery', requireAuth, sharesController.enableDelivery);
owner.post('/:id/refresh', requireAuth, sharesController.refresh);
owner.delete('/:id', requireAuth, sharesController.revoke);

/**
 * Public client surface. Mounted at /api/public/share on the share host (no
 * Cloudflare Access). The password unlock is brute-force throttled; every other
 * route requires the path-scoped share cookie issued by a successful unlock.
 */
const pub: Router = Router();
pub.post('/:slug/auth', loginRateLimit, sharesController.auth);
pub.get('/:slug/list', requireShareAuth, sharesController.state);
pub.get('/:slug/preview/:file', requireShareAuth, sharesController.preview);
pub.post('/:slug/select', requireShareAuth, sharesController.select);
pub.post('/:slug/submit', requireShareAuth, sharesController.submit);
pub.get('/:slug/download/:file', requireShareAuth, sharesController.download);
pub.get('/:slug/download-all', requireShareAuth, sharesController.downloadAll);

export const ownerShareRoutes = owner;
export const publicShareRoutes = pub;
