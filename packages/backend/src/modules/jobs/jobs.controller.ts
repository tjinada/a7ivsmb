import type { Request, Response, NextFunction } from 'express';
import type { JobPatch } from '@sonycam/shared';
import { jobsService } from './jobs.service.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../middleware/index.js';

function queryPath(req: Request): string {
  const p = req.query.path;
  if (typeof p !== 'string' || !p) throw new AppError('path is required', 400);
  return p;
}

export const jobsController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await jobsService.list());
    } catch (err) {
      next(err);
    }
  },

  async byFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await jobsService.byFolder(queryPath(req)));
    } catch (err) {
      next(err);
    }
  },

  async byAlbum(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await jobsService.byAlbum(queryPath(req)));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as { folderPath?: unknown };
      if (typeof body.folderPath !== 'string') throw new AppError('folderPath is required', 400);
      sendSuccess(res, await jobsService.create(body.folderPath), 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: JobPatch = {};
      if ('step' in body) patch.step = body.step as JobPatch['step'];
      if ('albumPath' in body) patch.albumPath = body.albumPath as JobPatch['albumPath'];
      if ('pickMode' in body) patch.pickMode = body.pickMode as JobPatch['pickMode'];
      if ('shareId' in body) patch.shareId = body.shareId as JobPatch['shareId'];
      sendSuccess(res, await jobsService.update(req.params.id, patch));
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await jobsService.remove(req.params.id);
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
};
