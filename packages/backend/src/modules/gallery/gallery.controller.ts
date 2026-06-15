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
