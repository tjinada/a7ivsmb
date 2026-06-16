import { Router } from 'express';
import { galleryController } from './gallery.controller.js';
import { requireAuth, requireMediaAuth } from '../../middleware/index.js';

const router: Router = Router();

router.get('/browse', requireAuth, galleryController.browse);
router.get('/timeline', requireAuth, galleryController.timeline);
router.get('/albums', requireAuth, galleryController.albums);
router.post('/albums', requireAuth, galleryController.createAlbum);
router.put('/rating', requireAuth, galleryController.rate);
router.post('/rate-bulk', requireAuth, galleryController.rateBulk);
router.get('/exif', requireAuth, galleryController.exif);
router.post('/zip', requireAuth, galleryController.zip);
router.post('/delete', requireAuth, galleryController.remove);
router.get('/thumb', requireMediaAuth, galleryController.thumb);
router.get('/preview', requireMediaAuth, galleryController.preview);
router.get('/original', requireMediaAuth, galleryController.original);

export const galleryRoutes = router;