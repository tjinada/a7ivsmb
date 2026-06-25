import { Router } from 'express';
import { ftpController } from './ftp.controller.js';
import { requireAuth } from '../../middleware/index.js';

const router: Router = Router();

router.get('/status', requireAuth, ftpController.status);
router.get('/transfers', requireAuth, ftpController.transfers);
router.get('/errors', requireAuth, ftpController.errors);

export const ftpRoutes = router;
