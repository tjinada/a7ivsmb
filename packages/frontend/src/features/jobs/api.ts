import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, JobPatch, JobSummary } from '@sonycam/shared';
import { api } from '@/api/client';
import { keys as galleryKeys, serverMessage } from '@/features/gallery/api';

export const jobKeys = {
  all: ['jobs'] as const,
  list: ['jobs', 'list'] as const,
  forPath: (path: string) => ['jobs', 'for', path] as const,
};

export async function fetchJobs(): Promise<JobSummary[]> {
  const res = await api.get<ApiResponse<JobSummary[]>>('/jobs');
  return res.data.data ?? [];
}

/** The job for a dated folder or an album root, or null when there is none. */
async function fetchJobFor(path: string): Promise<JobSummary | null> {
  const route = path.startsWith('Albums/') ? '/jobs/by-album' : '/jobs/by-folder';
  try {
    const res = await api.get<ApiResponse<JobSummary>>(route, { params: { path } });
    return res.data.data ?? null;
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) return null;
    throw err;
  }
}

export function useJobs(enabled = true) {
  return useQuery({ queryKey: jobKeys.list, queryFn: fetchJobs, enabled });
}

/** `path` is a dated folder or "Albums/<name>"; pass '' to disable. */
export function useJobFor(path: string) {
  return useQuery({ queryKey: jobKeys.forPath(path), queryFn: () => fetchJobFor(path), enabled: path !== '' });
}

function useInvalidateJobs() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: jobKeys.all }),
    qc.invalidateQueries({ queryKey: galleryKeys.shares }),
  ]);
}

export function useStartJob(opts: { onError: (msg: string) => void }) {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: async (folderPath: string) => {
      const res = await api.post<ApiResponse<JobSummary>>('/jobs', { folderPath });
      return res.data.data;
    },
    onSuccess: () => void invalidate(),
    onError: (err) => opts.onError(serverMessage(err, 'Could not start the workflow')),
  });
}

export function useUpdateJob(opts: { onError: (msg: string) => void }) {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: JobPatch }) => {
      const res = await api.patch<ApiResponse<JobSummary>>(`/jobs/${id}`, patch);
      return res.data.data;
    },
    onSuccess: () => void invalidate(),
    onError: (err) => opts.onError(serverMessage(err, 'Could not update the workflow')),
  });
}

export function useRemoveJob(opts: { onError: (msg: string) => void }) {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/jobs/${id}`),
    onSuccess: () => void invalidate(),
    onError: (err) => opts.onError(serverMessage(err, 'Could not remove the workflow')),
  });
}

/** Release delivery on a proofing share, then close the job. */
export function useDeliverJob(opts: { onDone: () => void; onError: (msg: string) => void }) {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: async (job: JobSummary) => {
      if (job.share && job.share.phase !== 'delivery') await api.post(`/gallery/shares/${job.share.id}/delivery`);
      await api.patch(`/jobs/${job.id}`, { step: 'done' } satisfies JobPatch);
    },
    onSuccess: () => { void invalidate(); opts.onDone(); },
    onError: (err) => { void invalidate(); opts.onError(serverMessage(err, 'Could not send the final photos')); },
  });
}

/** Steps shown in the strip, in order (done is the strip all ticked). */
export const STRIP = [
  { step: 'cull', label: 'Cull' },
  { step: 'edit', label: 'Edit' },
  { step: 'pick', label: 'Picks' },
  { step: 'deliver', label: 'Send' },
] as const;

/** Does this job need the owner (vs. done or waiting on the client)? */
export function needsOwner(j: JobSummary): boolean {
  return j.step !== 'done' && !j.waitingOnClient;
}

/** Whole days since the job entered its current step. */
export function daysInStep(j: JobSummary): number {
  const at = j.stepAt[j.step] ?? j.updatedAt;
  return Math.floor((Date.now() - at) / 86400000);
}
