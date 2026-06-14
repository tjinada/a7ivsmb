import { useEffect, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import type { GalleryItem } from '@sonycam/shared';
import { api } from '@/api/client';
import { saveImage } from './download';

/** Full-screen enlarge view. Native pinch-zoom; download/share and close. */
export function Lightbox({ photo, onClose }: { photo: GalleryItem; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    let obj: string | null = null;
    api
      .get(`/gallery/preview?path=${encodeURIComponent(photo.path)}`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        obj = URL.createObjectURL(res.data as Blob);
        setUrl(obj);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [photo.path]);

  const download = async () => {
    setSaving(true);
    try {
      await saveImage(photo);
    } catch {
      window.alert('Download failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/95">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="min-w-0 flex-1 truncate text-sm">{photo.name}</span>
        <button
          type="button"
          onClick={download}
          disabled={saving}
          aria-label="Download"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2" onClick={onClose}>
        {url ? (
          <img
            src={url}
            alt={photo.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        )}
      </div>
    </div>
  );
}
