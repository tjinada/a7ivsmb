import { Router } from 'express';
import { authController } from './auth.controller.js';
import { loginRateLimit } from './auth.rate-limit.js';
import { requireAuth } from '../../middleware/index.js';

const router: Router = Router();

router.post('/login', loginRateLimit, authController.login);
router.post('/refresh', loginRateLimit, authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

export const authRoutes = router;