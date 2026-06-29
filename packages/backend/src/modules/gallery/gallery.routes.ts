import express, { Router } from 'express';
import { galleryController } from './gallery.controller.js';
import { requireAuth, requireMediaAuth } from '../../middleware/index.js';
import { config } from '../../config/index.js';

const router: Router = Router();

router.get('/browse', requireAuth, galleryController.browse);
router.get('/timeline', requireAuth, galleryController.timeline);
router.get('/albums', requireAuth, galleryController.albums);
router.post('/albums', requireAuth, galleryController.createAlbum);
// Manual upload of one edited JPG into an album's Edited/ folder. The file is
// the raw request body (any content-type), captured as a Buffer up to the
// configured size limit.
router.post(
  '/albums/:albumName/edited/:filename',
  requireAuth,
  express.raw({ type: () => true, limit: config.uploadMaxBytes }),
  galleryController.uploadEdited,
);
router.put('/rating', requireAuth, galleryController.rate);
router.post('/rate-bulk', requireAuth, galleryController.rateBulk);
router.get('/exif', requireAuth, galleryController.exif);
// Zip download is two steps: POST validates the selection and returns a token;
// GET streams the archive (cookie-authed) so the browser downloads natively.
router.post('/zip', requireAuth, galleryController.zipToken);
router.get('/zip', requireMediaAuth, galleryController.zipDownload);
router.post('/delete', requireAuth, galleryController.remove);
router.get('/thumb', requireMediaAuth, galleryController.thumb);
router.get('/preview', requireMediaAuth, galleryController.preview);
router.get('/original', requireMediaAuth, galleryController.original);

export const galleryRoutes = router;
