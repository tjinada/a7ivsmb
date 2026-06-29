import { api } from '@/api/client';
import type { GalleryItem, ApiResponse } from '@sonycam/shared';

const originalUrl = (p: GalleryItem) => `/gallery/original?path=${encodeURIComponent(p.path)}`;

/**
 * Save/share one original. On platforms with the Web Share API this opens the
 * native share sheet (which itself offers "Save Image" / WhatsApp / etc.) and
 * does nothing else — so sharing never *also* saves a duplicate to the phone.
 * Only where file-sharing is unavailable (e.g. desktop) does it download.
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
      await shareNav.share({ files: [file] });
    } catch {
      // Cancelled, or the OS reported an error (iOS does this even after a
      // successful share). Either way, do NOT fall back to a download.
    }
    return;
  }

  // Reached only where the platform can't share files: save directly.
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
 * Photos, Drive, etc.). Returns true once the sheet has been shown (even if
 * the user cancels), so the caller NEVER also downloads. Returns false only
 * where the platform can't share files (e.g. desktop) so the caller can
 * fall back to a zip download.
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
  } catch {
    // Cancelled, or the OS reported an error (iOS does this even after a
    // successful share). The sheet was shown either way - never fall back.
  }
  return true;
}

/**
 * Download the selected files as a single photos.zip. We POST the selection to
 * get a one-time token, then trigger a NATIVE browser download from the GET
 * endpoint: the browser streams straight to disk (no multi-GB archive held in
 * browser memory) and shows its own download progress. Resolves as soon as the
 * download has been handed off to the browser.
 */
export async function downloadZip(items: GalleryItem[]): Promise<void> {
  const res = await api.post<ApiResponse<{ token: string }>>('/gallery/zip', {
    paths: items.map((i) => i.path),
  });
  const token = res.data.data?.token;
  if (!token) throw new Error('Could not start the download');
  // The server replies with Content-Disposition: attachment, so the browser
  // saves the stream rather than navigating. The media cookie authorizes the GET.
  const a = document.createElement('a');
  a.href = `/api/gallery/zip?token=${encodeURIComponent(token)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}