import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, MeResponse } from '@sonycam/shared';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

const FALLBACK: MeResponse = { username: '', brandName: 'Your photographer', pathPrefix: '' };

/**
 * Owner-app config from GET /api/auth/me (brand name, share mount path). The
 * same call refreshes the read-only media cookie, so it is fetched once per
 * session and kept fresh on a long interval.
 */
export function useAppConfig(): MeResponse {
  const token = useAuthStore((s) => s.token);
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<ApiResponse<MeResponse>>('/auth/me')).data.data ?? FALLBACK,
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  });
  return q.data ?? FALLBACK;
}
