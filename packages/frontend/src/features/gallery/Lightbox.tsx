import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { X, Download, Loader2, Trash2, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import type { GalleryItem } from '@sonycam/shared';
import { api } from '@/api/client';
import { saveImage } from './download';
import { StarRating } from './StarRating';

/**
 * Full-screen enlarge view. Native pinch-zoom; rate, download, delete, close,
 * and move between images in the folder via arrows, swipe, or keyboard.
 */
export function Lightbox({
  photo,
  onClose,
  onRate,
  onDelete,
  onPrev,
  onNext,
  index,
  total,
}: {
  photo: GalleryItem;
  onClose: () => void;
  onRate?: (stars: number) => void;
  onDelete?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  index?: number;
  total?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    let obj: string | null = null;
    setUrl(null);
    setFailed(false);
    api
      .get(`/gallery/preview?path=${encodeURIComponent(photo.path)}`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        obj = URL.createObjectURL(res.data as Blob);
        setUrl(obj);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [photo.path]);

  // Keyboard navigation (desktop): arrows move, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext, onClose]);

  // Single-finger horizontal swipe to move between images.
  // (Ignores multi-touch so pinch-zoom keeps working.)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touchStart.current =
      e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onNext?.();
      else onPrev?.();
    }
  };

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

  const showCount = typeof index === 'number' && typeof total === 'number' && total > 1;

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-black/95"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white">
        <span className="min-w-0 flex-1 truncate text-sm">
          {photo.name}
          {showCount && <span className="ml-2 text-xs text-white/50">{index! + 1} / {total}</span>}
        </span>
        <button
          type="button"
          onClick={download}
          disabled={saving}
          aria-label="Download"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {onRate && (
        <div className="flex items-center justify-center pb-2">
          <StarRating value={photo.rating} onChange={onRate} size={28} />
        </div>
      )}

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-2"
        onClick={onClose}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {url ? (
          <img
            src={url}
            alt={photo.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        ) : failed ? (
          <div
            className="flex flex-col items-center gap-3 text-center text-white/70"
            onClick={(e) => e.stopPropagation()}
          >
            <ImageOff className="h-10 w-10" />
            <p className="text-sm">Preview unavailable for this file.</p>
            <button
              type="button"
              onClick={download}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download original
            </button>
          </div>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        )}

        {onPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            aria-label="Previous"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            aria-label="Next"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
