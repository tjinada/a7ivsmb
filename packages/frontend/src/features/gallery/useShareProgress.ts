import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, ShareProgress } from '@sonycam/shared';
import { api } from '@/api/client';

/** Generate a progress id the backend registry accepts ([A-Za-z0-9_-]{8,64}). */
export function newProgressId(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Poll preview-generation progress while a share create/refresh mutation is
 * pending. Returns { done: 0, total: 0 } until the backend has started
 * generating (or after it finished), so treat total === 0 as "unknown".
 */
export function useShareProgress(progressId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['share-progress', progressId],
    queryFn: async (): Promise<ShareProgress> => {
      const res = await api.get<ApiResponse<ShareProgress>>(`/gallery/shares/progress/${progressId}`);
      return res.data.data ?? { done: 0, total: 0 };
    },
    enabled: enabled && progressId !== null,
    refetchInterval: 500,
    staleTime: 0,
    gcTime: 0,
  });
}
