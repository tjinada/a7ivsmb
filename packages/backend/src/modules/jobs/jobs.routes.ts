import { Router } from 'express';
import { jobsController } from './jobs.controller.js';
import { requireAuth } from '../../middleware/index.js';

/** Workflow jobs. Mounted at /api/jobs on the protected host only. */
const router: Router = Router();

router.get('/', requireAuth, jobsController.list);
router.get('/by-folder', requireAuth, jobsController.byFolder);
router.get('/by-album', requireAuth, jobsController.byAlbum);
router.post('/', requireAuth, jobsController.create);
router.patch('/:id', requireAuth, jobsController.update);
router.delete('/:id', requireAuth, jobsController.remove);

export const jobsRoutes = router;
