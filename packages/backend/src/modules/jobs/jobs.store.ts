import { JsonStore } from '../../store/jsonStore.js';
import type { Job } from '@sonycam/shared';

/**
 * Workflow jobs, persisted in DATA_DIR/jobs.json as an id -> record map
 * (same pattern as shares.json). Holds no secrets, so the record type is the
 * shared `Job`. Kept dependency-free so the gallery module can keep jobs in
 * step with album renames/deletes without importing the jobs service.
 */
type Jobs = Record<string, Job>;

const store = new JsonStore<Jobs>('jobs.json', {});
let loaded = false;

export async function loadJobs(): Promise<void> {
  if (!loaded) {
    await store.load();
    loaded = true;
  }
}

/** All jobs, newest first. */
export function listJobs(): Job[] {
  return Object.values(store.get()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getJob(id: string): Job | null {
  return store.get()[id] ?? null;
}

export function jobForFolder(folderPath: string): Job | null {
  return Object.values(store.get()).find((j) => j.folderPath === folderPath) ?? null;
}

export function jobForAlbum(albumPath: string): Job | null {
  return Object.values(store.get()).find((j) => j.albumPath === albumPath) ?? null;
}

export async function putJob(job: Job): Promise<void> {
  await store.update((cur) => ({ ...cur, [job.id]: job }));
}

export async function deleteJob(id: string): Promise<void> {
  await store.update((cur) => {
    if (!(id in cur)) return cur;
    const next = { ...cur };
    delete next[id];
    return next;
  });
}

/** Album renamed on disk: follow it. */
export async function remapJobAlbum(from: string, to: string): Promise<void> {
  await loadJobs();
  const job = jobForAlbum(from);
  if (job) await putJob({ ...job, albumPath: to, updatedAt: Date.now() });
}

/** Album deleted on disk: the job goes back to culling with no album. */
export async function detachJobAlbum(albumPath: string): Promise<void> {
  await loadJobs();
  const job = jobForAlbum(albumPath);
  if (!job) return;
  const now = Date.now();
  await putJob({
    ...job,
    albumPath: null,
    step: 'cull',
    pickMode: null,
    shareId: null,
    stepAt: { ...job.stepAt, cull: now },
    updatedAt: now,
  });
}

/** Dated folder deleted: drop its job only while it never produced an album
 *  (a job with an album outlives its source folder — originals are often
 *  cleaned up once the album exists). */
export async function dropJobsForFolder(folderPath: string): Promise<void> {
  await loadJobs();
  const prefix = `${folderPath}/`;
  for (const j of listJobs()) {
    if ((j.folderPath === folderPath || j.folderPath.startsWith(prefix)) && !j.albumPath) {
      await deleteJob(j.id);
    }
  }
}
