import type { Job, JobPatch, JobStep, JobSummary, PickMode, ShareSummary } from '@sonycam/shared';
import { JOB_STEPS } from '@sonycam/shared';
import { AppError } from '../../middleware/index.js';
import { galleryService } from '../gallery/gallery.service.js';
import { sharesService } from '../shares/shares.service.js';
import { newId } from '../shares/shares.auth.js';
import { loadJobs, listJobs, getJob, jobForFolder, jobForAlbum, putJob, deleteJob } from './jobs.store.js';

/**
 * The guided workflow. A job only records where a shoot is (step, album,
 * pick mode, share id); the work itself — culling, album create, share
 * create, delivery — goes through the existing gallery/shares endpoints.
 */

const ALBUM_PREFIX = 'Albums/';
const stepIndex = (s: JobStep): number => JOB_STEPS.indexOf(s);

/** Counts and the share a job's checks and summary need. */
interface JobContext {
  albumName: string | null;
  shots: number;
  unrated: number;
  edited: number;
  share: ShareSummary | null;
}

async function contextFor(job: Job): Promise<JobContext> {
  // A share that was revoked reads as no share.
  const share = job.shareId ? await sharesService.get(job.shareId) : null;
  if (job.albumPath) {
    const album = (await galleryService.listAlbums()).find((a) => a.path === job.albumPath);
    return {
      albumName: job.albumPath.slice(ALBUM_PREFIX.length),
      shots: album?.shots ?? 0,
      unrated: 0,
      edited: album?.edited ?? 0,
      share,
    };
  }
  const { count, unrated } = await galleryService.folderCounts(job.folderPath);
  return { albumName: null, shots: count, unrated, edited: 0, share };
}

function summarize(job: Job, ctx: JobContext): JobSummary {
  return {
    ...job,
    ...ctx,
    waitingOnClient:
      job.step === 'pick' && job.pickMode === 'client' && !!ctx.share && ctx.share.phase === 'proofing',
  };
}

/** Why `job` (with `ctx`) can't enter `target`, or null if it can. */
function blockedEntering(job: Job, target: JobStep, ctx: JobContext): string | null {
  switch (target) {
    case 'cull':
      return null;
    case 'edit':
      return job.albumPath ? null : 'Create the album before moving on to editing';
    case 'pick':
      return ctx.edited > 0 ? null : 'Export at least one edit into Edited/ first';
    case 'deliver':
      if (!job.pickMode) return 'Choose whether the client picks first';
      if (job.pickMode === 'all') return null;
      if (!ctx.share) return 'Send the client their picking link first';
      return ctx.share.phase === 'proofing' ? 'The client hasn’t sent their picks yet' : null;
    case 'done':
      return ctx.share?.phase === 'delivery' ? null : 'Send the final photos first';
  }
}

function asStep(v: unknown): JobStep {
  if (typeof v !== 'string' || !JOB_STEPS.includes(v as JobStep)) throw new AppError('Unknown step', 400);
  return v as JobStep;
}

function asPickMode(v: unknown): PickMode | null {
  if (v === null || v === 'client' || v === 'all') return v;
  throw new AppError('pickMode must be "client", "all" or null', 400);
}

function requireJob(id: string): Job {
  const job = getJob(id);
  if (!job) throw new AppError('Job not found', 404);
  return job;
}

export const jobsService = {
  async list(): Promise<JobSummary[]> {
    await loadJobs();
    return Promise.all(listJobs().map(async (j) => summarize(j, await contextFor(j))));
  },

  async byFolder(folderPath: string): Promise<JobSummary> {
    await loadJobs();
    const job = jobForFolder(folderPath);
    if (!job) throw new AppError('No job for this folder', 404);
    return summarize(job, await contextFor(job));
  },

  async byAlbum(albumPath: string): Promise<JobSummary> {
    await loadJobs();
    const job = jobForAlbum(albumPath);
    if (!job) throw new AppError('No job for this album', 404);
    return summarize(job, await contextFor(job));
  },

  /** Start a job on a dated Home folder. One job per folder. */
  async create(folderPath: string): Promise<JobSummary> {
    await loadJobs();
    const cleaned = (folderPath ?? '').trim().replace(/\/+$/, '');
    if (!(await galleryService.isDatedFolder(cleaned))) {
      throw new AppError('A workflow starts from a dated shoot folder', 400);
    }
    if (jobForFolder(cleaned)) throw new AppError('This folder already has a workflow', 409);
    const now = Date.now();
    const job: Job = {
      id: newId(),
      folderPath: cleaned,
      albumPath: null,
      step: 'cull',
      pickMode: null,
      shareId: null,
      stepAt: { cull: now },
      createdAt: now,
      updatedAt: now,
    };
    await putJob(job);
    return summarize(job, await contextFor(job));
  },

  /**
   * Apply a patch: field changes first, then the step move, validated against
   * the result. Forward moves go one step at a time and must meet the target
   * step's condition; backward moves are free. A delivered job is final.
   */
  async update(id: string, patch: JobPatch): Promise<JobSummary> {
    await loadJobs();
    const cur = requireJob(id);
    if (cur.step === 'done') throw new AppError('This job is delivered and can’t change', 409);

    const next: Job = { ...cur };

    if (patch.albumPath !== undefined) {
      if (patch.albumPath === null) {
        next.albumPath = null;
      } else {
        if (typeof patch.albumPath !== 'string' || !patch.albumPath.startsWith(ALBUM_PREFIX)) {
          throw new AppError('albumPath must be an album', 400);
        }
        const exists = (await galleryService.listAlbums()).some((a) => a.path === patch.albumPath);
        if (!exists) throw new AppError('Album not found', 404);
        const other = jobForAlbum(patch.albumPath);
        if (other && other.id !== cur.id) throw new AppError('That album already belongs to another workflow', 409);
        next.albumPath = patch.albumPath;
      }
    }

    if (patch.pickMode !== undefined) next.pickMode = asPickMode(patch.pickMode);

    if (patch.shareId !== undefined) {
      if (patch.shareId === null) {
        next.shareId = null;
      } else {
        if (typeof patch.shareId !== 'string') throw new AppError('shareId must be a string', 400);
        const share = await sharesService.get(patch.shareId);
        if (!share) throw new AppError('Share not found', 404);
        if (!next.albumPath || share.albumPath !== next.albumPath) {
          throw new AppError('That share is for a different album', 400);
        }
        next.shareId = patch.shareId;
      }
    }

    if (patch.step !== undefined) {
      const target = asStep(patch.step);
      const from = stepIndex(cur.step);
      const to = stepIndex(target);
      if (to > from + 1) throw new AppError('Finish the current step first', 400);
      if (to > from) {
        const why = blockedEntering(next, target, await contextFor(next));
        if (why) throw new AppError(why, 400);
      }
      if (to !== from) {
        next.step = target;
        next.stepAt = { ...next.stepAt, [target]: Date.now() };
      }
    }

    next.updatedAt = Date.now();
    await putJob(next);
    return summarize(next, await contextFor(next));
  },

  /** Forget a job. Folders, albums and shares are untouched. */
  async remove(id: string): Promise<void> {
    await loadJobs();
    requireJob(id);
    await deleteJob(id);
  },
};
