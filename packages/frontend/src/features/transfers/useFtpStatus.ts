import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, FtpStatus } from '@sonycam/shared';
import { api } from '@/api/client';

async function fetchStatus(): Promise<FtpStatus | null> {
  const res = await api.get<ApiResponse<FtpStatus>>('/ftp/status');
  return res.data.data ?? null;
}

/** FTP receiver status, polled. One query key for every consumer so the
 *  sidebar dot, the home strip and the Transfers page share a single poll. */
export function useFtpStatus(intervalMs = 15_000) {
  return useQuery({ queryKey: ['ftp', 'status'], queryFn: fetchStatus, refetchInterval: intervalMs });
}
