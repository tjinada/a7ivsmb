import type { Request, Response, NextFunction } from 'express';
import archiver from 'archiver';
import { sharesService } from './shares.service.js';
import { setShareCookie } from './shares.auth.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../middleware/index.js';

/** Block caches on the gate, the JSON state, and all downloads. */
function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

export const sharesController = {
  // ── Owner (protected host) ────────────────────────────────────────────────

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { albumPath?: unknown; cap?: unknown; password?: unknown };
      if (typeof body.albumPath !== 'string') throw new AppError('albumPath is required', 400);
      if (typeof body.cap !== 'number' || !Number.isFinite(body.cap)) throw new AppError('cap must be a number', 400);
      if (typeof body.password !== 'string') throw new AppError('password is required', 400);
      sendSuccess(res, await sharesService.create(body.albumPath, body.cap, body.password), 201);
    } catch (err) {
      next(err);
    }
  },

  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await sharesService.list());
    } catch (err) {
      next(err);
    }
  },

  async enableDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await sharesService.enableDelivery(req.params.id));
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await sharesService.refresh(req.params.id));
    } catch (err) {
      next(err);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await sharesService.revoke(req.params.id);
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },

  // ── Client (public host) ──────────────────────────────────────────────────

  /** Password unlock: sets the path-scoped share cookie on success. */
  async auth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const slug = req.params.slug;
      const body = (req.body ?? {}) as { password?: unknown };
      const password = typeof body.password === 'string' ? body.password : '';
      const ok = await sharesService.authenticate(slug, password);
      if (!ok) throw new AppError('Incorrect password', 401);
      setShareCookie(res, slug);
      sendSuccess(res, await sharesService.publicState(slug));
    } catch (err) {
      next(err);
    }
  },

  async state(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      sendSuccess(res, await sharesService.publicState(req.params.slug));
    } catch (err) {
      next(err);
    }
  },

  async select(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const body = (req.body ?? {}) as { files?: unknown };
      if (!Array.isArray(body.files)) throw new AppError('files must be an array', 400);
      sendSuccess(res, await sharesService.setSelections(req.params.slug, body.files as string[]));
    } catch (err) {
      next(err);
    }
  },

  async submit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      sendSuccess(res, await sharesService.submit(req.params.slug));
    } catch (err) {
      next(err);
    }
  },

  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data, type } = await sharesService.preview(req.params.slug, req.params.file);
      // Watermarked previews are immutable per share -> safe to cache at the edge.
      res.set('Content-Type', type);
      res.set('Cache-Control', 'private, max-age=86400');
      res.send(data);
    } catch (err) {
      next(err);
    }
  },

  async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const { stream, name, size, type } = await sharesService.download(req.params.slug, req.params.file);
      res.set('Content-Type', type);
      res.set('Content-Length', String(size));
      res.set('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
      stream.on('error', next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },

  async downloadAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const files = await sharesService.selectedForZip(req.params.slug);
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename="selected.zip"');
      const archive = archiver('zip', { zlib: { level: 0 } });
      archive.on('error', (err) => res.destroy(err));
      archive.pipe(res);
      for (const f of files) archive.file(f.abs, { name: f.name });
      await archive.finalize();
    } catch (err) {
      next(err);
    }
  },
};
