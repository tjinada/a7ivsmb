import { Router } from 'express';
import { authController } from './auth.controller.js';
import { requireAuth } from '../../middleware/index.js';

const router: Router = Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.get('/me', requireAuth, authController.me);

export const authRoutes = router;
