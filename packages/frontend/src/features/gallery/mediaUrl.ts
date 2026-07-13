/**
 * Single source of truth for gallery media URLs. RENDER_VERSION is a
 * cache-buster: the rendition routes serve `Cache-Control: max-age=86400`
 * with no ETag, so when the server-side render pipeline changes (e.g. the
 * sRGB color conversion), bump this to force every browser past its cached
 * copy. The backend ignores the `r` param.
 */
export const RENDER_VERSION = 2;

export function thumbUrl(path: string): string {
  return `/api/gallery/thumb?path=${encodeURIComponent(path)}&r=${RENDER_VERSION}`;
}

export function previewUrl(path: string): string {
  return `/api/gallery/preview?path=${encodeURIComponent(path)}&r=${RENDER_VERSION}`;
}
