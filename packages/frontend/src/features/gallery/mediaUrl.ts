/**
 * Single source of truth for gallery media URLs.
 *
 * RENDER_VERSION is the global cache-buster: bump it when the server-side
 * render pipeline changes (e.g. the sRGB colour conversion) to force every
 * browser past its cached copy.
 *
 * `version` is the source file's mtime (GalleryItem.modified). When present the
 * URL names one exact rendition — the server's cache key includes mtime, so
 * editing a file yields a different URL — and the backend answers with an
 * `immutable` cache header, so revisiting a folder costs no requests at all.
 * Omit it where no mtime is at hand (folder covers, the transfers list) and the
 * response falls back to a one-day expiry. The backend ignores both params.
 */
export const RENDER_VERSION = 2;

function renditionUrl(kind: 'thumb' | 'preview', path: string, version?: number): string {
  const v = version === undefined ? '' : `&v=${Math.floor(version)}`;
  return `/api/gallery/${kind}?path=${encodeURIComponent(path)}&r=${RENDER_VERSION}${v}`;
}

export function thumbUrl(path: string, version?: number): string {
  return renditionUrl('thumb', path, version);
}

export function previewUrl(path: string, version?: number): string {
  return renditionUrl('preview', path, version);
}
