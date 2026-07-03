import { Router } from 'express';
import { ftpController } from './ftp.controller.js';
import { requireAuth } from '../../middleware/index.js';

const router: Router = Router();

router.get('/status', requireAuth, ftpController.status);
router.get('/transfers', requireAuth, ftpController.transfers);
router.get('/errors', requireAuth, ftpController.errors);
router.get('/strays', requireAuth, ftpController.strays);
router.post('/strays/refile', requireAuth, ftpController.refileStrays);
router.get('/config', requireAuth, ftpController.config);
router.put('/config', requireAuth, ftpController.updateConfig);
router.post('/restart', requireAuth, ftpController.restart);

export const ftpRoutes = router;
