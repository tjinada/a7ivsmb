import { api } from '@/api/client';
import type { GalleryItem } from '@sonycam/shared';

const originalUrl = (p: GalleryItem) => `/gallery/original?path=${encodeURIComponent(p.path)}`;

/**
 * Save the original file to the phone. Prefers the Web Share API (lets the
 * user save into Photos / share onward); falls back to a plain download.
 */
export async function saveImage(photo: GalleryItem): Promise<void> {
  const res = await api.get(originalUrl(photo), { responseType: 'blob' });
  const blob = res.data as Blob;
  const file = new File([blob], photo.name, { type: blob.type || 'application/octet-stream' });

  const shareNav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  if (shareNav.canShare?.({ files: [file] }) && shareNav.share) {
    try {
      await shareNav.share({ files: [file], title: photo.name });
      return;
    } catch {
      // user cancelled or share failed → fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = photo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
