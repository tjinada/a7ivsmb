import type { Request, Response, NextFunction } from 'express';
import archiver from 'archiver';
import { galleryService, type Variant } from './gallery.service.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../middleware/index.js';

function reqPath(req: Request): string {
  const p = req.query.path;
  if (typeof p !== 'string') throw new AppError('Path is required', 400);
  return p;
}

async function serveRendition(req: Request, res: Response, next: NextFunction, variant: Variant): Promise<void> {
  try {
    const { data, type } = await galleryService.render(reqPath(req), variant);
    res.set('Content-Type', type);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(data);
  } catch (err) {
    next(err);
  }
}

export const galleryController = {
  async browse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rel = typeof req.query.path === 'string' ? req.query.path : '';
      sendSuccess(res, await galleryService.browse(rel));
    } catch (err) {
      next(err);
    }
  },

  async timeline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const raw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
      const limit = Number.isFinite(raw) ? Math.min(2000, Math.max(1, raw)) : 1000;
      sendSuccess(res, await galleryService.timeline(limit));
    } catch (err) {
      next(err);
    }
  },

  async rate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { path?: unknown; stars?: unknown };
      if (typeof body.path !== 'string') throw new AppError('Path is required', 400);
      if (typeof body.stars !== 'number' || !Number.isFinite(body.stars)) {
        throw new AppError('stars must be a number 0-5', 400);
      }
      const rating = await galleryService.rate(body.path, body.stars);
      sendSuccess(res, { path: body.path, rating });
    } catch (err) {
      next(err);
    }
  },

  async rateBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { paths?: unknown; stars?: unknown };
      if (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string')) {
        throw new AppError('paths must be an array of strings', 400);
      }
      if (typeof body.stars !== 'number' || !Number.isFinite(body.stars)) {
        throw new AppError('stars must be a number 0-5', 400);
      }
      const count = await galleryService.rateMany(body.paths as string[], body.stars);
      sendSuccess(res, { count, stars: Math.min(5, Math.max(0, Math.round(body.stars))) });
    } catch (err) {
      next(err);
    }
  },

  async exif(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await galleryService.exif(reqPath(req)));
    } catch (err) {
      next(err);
    }
  },

  async albums(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await galleryService.listAlbums());
    } catch (err) {
      next(err);
    }
  },

  async createAlbum(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { name?: unknown; paths?: unknown; formats?: unknown };
      if (typeof body.name !== 'string') throw new AppError('name is required', 400);
      if (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string')) {
        throw new AppError('paths must be an array of strings', 400);
      }
      const formats = body.formats === 'jpg' || body.formats === 'raw' ? body.formats : 'both';
      sendSuccess(res, await galleryService.createAlbum(body.name, body.paths as string[], formats));
    } catch (err) {
      next(err);
    }
  },

  /** Manual upload of one edited JPG into an album's Edited/ folder. The file
   *  rides as the raw request body (see express.raw on the route). */
  async uploadEdited(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { albumName, filename } = req.params;
      const data = req.body;
      if (!Buffer.isBuffer(data)) throw new AppError('No file data received', 400);
      sendSuccess(res, await galleryService.uploadEdited(albumName, filename, data), 201);
    } catch (err) {
      next(err);
    }
  },

  thumb(req: Request, res: Response, next: NextFunction): Promise<void> {
    return serveRendition(req, res, next, 'thumb');
  },

  preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    return serveRendition(req, res, next, 'preview');
  },

  async zip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { paths?: unknown };
      if (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string')) {
        throw new AppError('paths must be an array of strings', 400);
      }
      const files = await galleryService.resolveForZip(body.paths as string[]);
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename="photos.zip"');
      const archive = archiver('zip', { zlib: { level: 0 } });
      archive.on('error', (err) => res.destroy(err));
      archive.pipe(res);
      for (const f of files) archive.file(f.abs, { name: f.name });
      await archive.finalize();
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { paths?: unknown };
      if (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string')) {
        throw new AppError('paths must be an array of strings', 400);
      }
      const deleted = await galleryService.remove(body.paths as string[]);
      sendSuccess(res, { deleted });
    } catch (err) {
      next(err);
    }
  },

  async original(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { stream, name, size, type } = await galleryService.original(reqPath(req));
      res.set('Content-Type', type);
      res.set('Content-Length', String(size));
      res.set('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
      stream.on('error', next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
};
