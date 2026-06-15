import { Router } from 'express';
import { galleryController } from './gallery.controller.js';
import { requireAuth } from '../../middleware/index.js';

const router: Router = Router();

router.get('/browse', requireAuth, galleryController.browse);
router.get('/timeline', requireAuth, galleryController.timeline);
router.put('/rating', requireAuth, galleryController.rate);
router.post('/rate-bulk', requireAuth, galleryController.rateBulk);
router.get('/exif', requireAuth, galleryController.exif);
router.post('/zip', requireAuth, galleryController.zip);
router.post('/delete', requireAuth, galleryController.remove);
router.get('/thumb', requireAuth, galleryController.thumb);
router.get('/preview', requireAuth, galleryController.preview);
router.get('/original', requireAuth, galleryController.original);

export const galleryRoutes = router;
