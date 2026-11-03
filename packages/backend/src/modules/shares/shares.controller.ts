import type { Request, Response, NextFunction } from 'express';
import archiver from 'archiver';
import { sharesService } from './shares.service.js';
import { isValidProgressId, progressGet } from './shares.progress.js';
import { setShareCookie, isPreviewRequest } from './shares.auth.js';
import { recordOpen, recordDownload, recordZip } from './shares.activity.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../middleware/index.js';

/** Content-Disposition for a download: an ASCII fallback plus the UTF-8 name
 *  (RFC 6266 / 5987), with characters filesystems reject stripped. */
function attachment(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'photos';
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  const utf8 = encodeURIComponent(safe).replace(/['()*!]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** An expiry length from a request body: a number of days or null (never);
 *  undefined only where omitting it is allowed (create = the default). */
function expiryArg(v: unknown, optional: true): number | null | undefined;
function expiryArg(v: unknown, optional: false): number | null;
function expiryArg(v: unknown, optional: boolean): number | null | undefined {
  if (v === undefined && optional) return undefined;
  if (v === null || typeof v === 'number') return v;
  throw new AppError('Expiry must be a number of days or null', 400);
}

/** Block caches on the gate, the JSON state, and all downloads. */
function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

export const sharesController = {
  // ── Owner (protected host) ────────────────────────────────────────────────

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as {
        albumPath?: unknown; cap?: unknown; password?: unknown; progressId?: unknown; kind?: unknown; hero?: unknown; expiresInDays?: unknown;
      };
      if (typeof body.albumPath !== 'string') throw new AppError('albumPath is required', 400);
      const kind = body.kind === 'delivery' ? 'delivery' : 'proofing';
      if (kind === 'proofing' && (typeof body.cap !== 'number' || !Number.isFinite(body.cap))) {
        throw new AppError('cap must be a number', 400);
      }
      const cap = typeof body.cap === 'number' && Number.isFinite(body.cap) ? body.cap : 0;
      if (typeof body.password !== 'string') throw new AppError('password is required', 400);
      const progressId = isValidProgressId(body.progressId) ? body.progressId : undefined;
      const hero = typeof body.hero === 'string' ? body.hero : undefined;
      const expiryDays = expiryArg(body.expiresInDays, true);
      sendSuccess(res, await sharesService.create({
        albumPath: body.albumPath, cap, password: body.password, progressId, kind, hero, expiryDays,
      }), 201);
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

  /** Set the delivery page cover; { file: null } resets to the default. */
  async setHero(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { file?: unknown };
      if (body.file !== null && typeof body.file !== 'string') throw new AppError('file must be a filename or null', 400);
      sendSuccess(res, await sharesService.setHero(req.params.id, body.file));
    } catch (err) {
      next(err);
    }
  },

  /** Change how long a link works, from now: { days: number | null }. */
  async setExpiry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { days?: unknown };
      sendSuccess(res, await sharesService.setExpiry(req.params.id, expiryArg(body.days, false)));
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { progressId?: unknown };
      const progressId = isValidProgressId(body.progressId) ? body.progressId : undefined;
      sendSuccess(res, await sharesService.refresh(req.params.id, progressId));
    } catch (err) {
      next(err);
    }
  },

  /** Poll preview-generation progress for a pending create/refresh. */
  async progress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      if (!isValidProgressId(req.params.progressId)) throw new AppError('Not found', 404);
      sendSuccess(res, progressGet(req.params.progressId));
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
      const state = await sharesService.publicState(slug);
      if (!isPreviewRequest(req)) recordOpen(slug, req.get('user-agent'));
      sendSuccess(res, state);
    } catch (err) {
      next(err);
    }
  },

  async state(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const state = await sharesService.publicState(req.params.slug);
      if (!isPreviewRequest(req)) recordOpen(req.params.slug, req.get('user-agent'));
      sendSuccess(res, state);
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

  async final(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const body = (req.body ?? {}) as { files?: unknown };
      if (!Array.isArray(body.files)) throw new AppError('files must be an array', 400);
      sendSuccess(res, await sharesService.setFinal(req.params.slug, body.files as string[]));
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

  async thumb(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data, type } = await sharesService.thumb(req.params.slug, req.params.file);
      res.set('Content-Type', type);
      res.set('Cache-Control', 'private, max-age=86400');
      res.send(data);
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
      // Counted only once fully sent: an aborted transfer never fires 'finish'.
      if (!isPreviewRequest(req)) res.on('finish', () => recordDownload(req.params.slug, name));
      stream.on('error', next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },

  async downloadAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      noStore(res);
      const { title, files } = await sharesService.selectedForZip(req.params.slug);
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', attachment(`${title}.zip`));
      const archive = archiver('zip', { zlib: { level: 0 } });
      archive.on('error', (err) => res.destroy(err));
      if (!isPreviewRequest(req)) {
        recordZip(req.params.slug, 'started');
        res.on('finish', () => recordZip(req.params.slug, 'completed'));
      }
      archive.pipe(res);
      for (const f of files) archive.file(f.abs, { name: f.name });
      await archive.finalize();
    } catch (err) {
      next(err);
    }
  },
};
