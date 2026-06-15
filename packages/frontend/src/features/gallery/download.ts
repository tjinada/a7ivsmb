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


type ShareNav = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

/**
 * Share one or more originals via the native share sheet (WhatsApp, Google
 * Photos, Drive, etc.). Returns false if the platform can't share files
 * (e.g. plain HTTP / unsupported browser) so the caller can fall back.
 */
export async function shareItems(items: GalleryItem[]): Promise<boolean> {
  const shareNav = navigator as ShareNav;
  if (!shareNav.share || items.length === 0) return false;
  const files = await Promise.all(
    items.map(async (it) => {
      const res = await api.get(originalUrl(it), { responseType: 'blob' });
      const blob = res.data as Blob;
      return new File([blob], it.name, { type: blob.type || 'application/octet-stream' });
    }),
  );
  if (!shareNav.canShare?.({ files })) return false;
  try {
    await shareNav.share({ files });
    return true;
  } catch {
    return false; // cancelled or failed
  }
}

/** Download the selected files as a single photos.zip (built on the backend). */
export async function downloadZip(items: GalleryItem[]): Promise<void> {
  const res = await api.post(
    '/gallery/zip',
    { paths: items.map((i) => i.path) },
    { responseType: 'blob' },
  );
  const blob = res.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'photos.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}