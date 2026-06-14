import type { Request, Response, NextFunction } from 'express';
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

  thumb(req: Request, res: Response, next: NextFunction): Promise<void> {
    return serveRendition(req, res, next, 'thumb');
  },

  preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    return serveRendition(req, res, next, 'preview');
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
