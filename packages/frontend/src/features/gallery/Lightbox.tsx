import { useEffect, useRef, useState, type TouchEvent, type ReactNode } from 'react';
import {
  X, Download, Share2, Loader2, Trash2, ChevronLeft, ChevronRight, ImageOff, Info, MapPin,
} from 'lucide-react';
import type { GalleryItem, ExifInfo, ApiResponse } from '@sonycam/shared';
import { api } from '@/api/client';
import { saveImage } from './download';
import { StarRating } from './StarRating';

/**
 * Full-screen enlarge view. Native pinch-zoom; rate, download, delete, close,
 * inspect EXIF, and move between images via arrows, swipe, or keyboard.
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
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [exif, setExif] = useState<ExifInfo | null>(null);
  const [exifLoading, setExifLoading] = useState(false);

  // The preview loads as a plain <img> (the media cookie authorizes it), so iOS
  // long-press shares the real image and the browser can cache it.
  const previewUrl = `/api/gallery/preview?path=${encodeURIComponent(photo.path)}`;

  // Reset load/fail state when moving to a different photo.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [photo.path]);

  // Fetch EXIF lazily — only while the info panel is open, refetching per photo.
  useEffect(() => {
    if (!showInfo) return;
    let active = true;
    setExif(null);
    setExifLoading(true);
    api
      .get<ApiResponse<ExifInfo>>(`/gallery/exif?path=${encodeURIComponent(photo.path)}`)
      .then((res) => active && setExif(res.data.data ?? {}))
      .catch(() => active && setExif({}))
      .finally(() => active && setExifLoading(false));
    return () => {
      active = false;
    };
  }, [showInfo, photo.path]);

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
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Info"
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
            showInfo ? 'bg-primary-500 text-white' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          <Info className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={download}
          disabled={saving}
          aria-label="Share"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
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
        {failed ? (
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
          <>
            <img
              key={previewUrl}
              src={previewUrl}
              alt={photo.name}
              onClick={(e) => e.stopPropagation()}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className="max-h-full max-w-full object-contain"
              style={loaded ? undefined : { display: 'none' }}
            />
            {!loaded && <Loader2 className="h-8 w-8 animate-spin text-white/70" />}
          </>
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

        {showInfo && (
          <div
            className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto border-t border-white/10 bg-black/85 px-4 pb-3 pt-3 backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <ExifPanel exif={exif} loading={exifLoading} />
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="flex-shrink-0 text-white/40">{label}</span>
      <span className="min-w-0 truncate text-right text-white/90">{value}</span>
    </div>
  );
}

function ExifPanel({ exif, loading }: { exif: ExifInfo | null; loading: boolean }) {
  if (loading || !exif) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading metadata&hellip;
      </div>
    );
  }

  const camera =
    exif.model && exif.make && !exif.model.toLowerCase().includes(exif.make.toLowerCase())
      ? `${exif.make} ${exif.model}`
      : exif.model ?? exif.make;
  const focal = exif.focalLength
    ? exif.focalLength + (exif.focalLength35 ? ` (${exif.focalLength35} eq)` : '')
    : undefined;
  const chips = [exif.aperture, exif.shutter, exif.iso, focal].filter(Boolean) as string[];
  const taken = exif.dateTime?.replace(':', '-').replace(':', '-');
  const mapUrl = exif.gps
    ? `https://www.google.com/maps/search/?api=1&query=${exif.gps.lat},${exif.gps.lng}`
    : null;

  const rows: { label: string; value: ReactNode }[] = [];
  if (camera) rows.push({ label: 'Camera', value: camera });
  if (exif.lens) rows.push({ label: 'Lens', value: exif.lens });
  if (exif.exposureComp) rows.push({ label: 'Exposure comp', value: exif.exposureComp });
  if (exif.dimensions) rows.push({ label: 'Dimensions', value: exif.dimensions });
  if (taken) rows.push({ label: 'Taken', value: taken });

  if (chips.length === 0 && rows.length === 0 && !mapUrl) {
    return <p className="py-3 text-center text-sm text-white/60">No metadata available.</p>;
  }

  return (
    <div className="mx-auto max-w-md">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-white">
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <dl className="mt-2 text-xs">
          {rows.map((r) => (
            <InfoRow key={r.label} label={r.label} value={r.value} />
          ))}
        </dl>
      )}
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/20"
        >
          <MapPin className="h-3.5 w-3.5" /> View on map
        </a>
      )}
    </div>
  );
}