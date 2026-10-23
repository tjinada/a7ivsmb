import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse, GalleryBrowseResult, GalleryTimelineResult, GalleryItem,
  AlbumInfo, AlbumFormats, AlbumCreateResult, ShareSummary,
} from '@sonycam/shared';
import { api } from '@/api/client';

// ── Fetchers ────────────────────────────────────────────────────────────────

export async function browse(path: string): Promise<GalleryBrowseResult> {
  const res = await api.get<ApiResponse<GalleryBrowseResult>>('/gallery/browse', { params: { path } });
  if (!res.data.data) throw new Error('Unexpected response');
  return res.data.data;
}

export async function fetchTimeline(): Promise<GalleryTimelineResult> {
  const res = await api.get<ApiResponse<GalleryTimelineResult>>('/gallery/timeline');
  if (!res.data.data) throw new Error('Unexpected response');
  return res.data.data;
}

export async function fetchAlbums(): Promise<AlbumInfo[]> {
  const res = await api.get<ApiResponse<AlbumInfo[]>>('/gallery/albums');
  return res.data.data ?? [];
}

export async function fetchShares(): Promise<ShareSummary[]> {
  const res = await api.get<ApiResponse<ShareSummary[]>>('/gallery/shares');
  return res.data.data ?? [];
}

/** Pull the server's message out of an axios error, else the fallback. */
export function serverMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

// ── Query keys ──────────────────────────────────────────────────────────────

export const keys = {
  gallery: ['gallery'] as const,
  browse: (path: string) => ['gallery', 'browse', path] as const,
  timeline: ['gallery', 'timeline'] as const,
  albums: ['gallery', 'albums'] as const,
  shares: ['shares'] as const,
};

// ── Queries ─────────────────────────────────────────────────────────────────

export function useBrowse(path: string, enabled = true) {
  return useQuery({ queryKey: keys.browse(path), queryFn: () => browse(path), enabled });
}

export function useTimeline(enabled = true) {
  return useQuery({ queryKey: keys.timeline, queryFn: fetchTimeline, enabled });
}

export function useAlbums(enabled = true) {
  return useQuery({ queryKey: keys.albums, queryFn: fetchAlbums, enabled });
}

export function useShares(enabled = true) {
  return useQuery({ queryKey: keys.shares, queryFn: fetchShares, enabled });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useInvalidateGallery() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.gallery });
}

export function useRate(onError: (msg: string) => void) {
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: ({ path, stars }: { path: string; stars: number }) => api.put('/gallery/rating', { path, stars }),
    onError: () => { void invalidate(); onError('Could not save rating'); },
  });
}

export function useRateBulk(onError: (msg: string) => void) {
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: ({ paths, stars }: { paths: string[]; stars: number }) => api.post('/gallery/rate-bulk', { paths, stars }),
    onError: () => { void invalidate(); onError('Could not rate photos'); },
  });
}

export function useDeleteItems() {
  return useMutation({ mutationFn: (paths: string[]) => api.post('/gallery/delete', { paths }) });
}

export function useCreateAlbum(opts: { onSuccess: (result: AlbumCreateResult | undefined) => void; onError: (msg: string) => void }) {
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: (body: { name: string; paths: string[]; formats: AlbumFormats }) =>
      api.post<ApiResponse<AlbumCreateResult>>('/gallery/albums', body),
    onSuccess: (res) => { void invalidate(); opts.onSuccess(res.data.data); },
    onError: () => opts.onError('Could not create the album'),
  });
}

export function useRenameAlbum(opts: { onSuccess: (info: AlbumInfo | undefined) => void; onError: (msg: string) => void }) {
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      api.post<ApiResponse<AlbumInfo>>(`/gallery/albums/${encodeURIComponent(name)}/rename`, { newName }),
    onSuccess: (res) => { void invalidate(); opts.onSuccess(res.data.data); },
    onError: (err) => opts.onError(serverMessage(err, 'Could not rename the album')),
  });
}

export function useDeleteAlbum(opts: { onSuccess: () => void; onError: (msg: string) => void }) {
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/gallery/albums/${encodeURIComponent(name)}`),
    onSuccess: () => { void invalidate(); opts.onSuccess(); },
    onError: (err) => opts.onError(serverMessage(err, 'Could not delete the album')),
  });
}

export function useDeleteFolder(opts: { onSuccess: () => void; onError: (msg: string) => void }) {
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: (p: string) => api.delete('/gallery/folder', { data: { path: p } }),
    onSuccess: () => { void invalidate(); opts.onSuccess(); },
    onError: (err) => opts.onError(serverMessage(err, 'Could not delete the folder')),
  });
}

/** Count distinct shots, treating a JPG and its RAW twin as one. */
export function distinctShots(items: GalleryItem[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const it of items) {
    if (seen.has(it.path)) continue;
    seen.add(it.path);
    if (it.twin) seen.add(it.twin);
    n += 1;
  }
  return n;
}
