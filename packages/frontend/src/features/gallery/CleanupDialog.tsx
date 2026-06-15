import { useState } from 'react';
import { Loader2, Star, Trash2 } from 'lucide-react';
import type { GalleryItem } from '@sonycam/shared';

const THRESHOLDS = [2, 3, 4, 5];

/**
 * "Cull by rating" dialog. Picks every photo in the current folder rated below
 * a chosen threshold (and optionally the unrated ones), shows a live count, and
 * hands the targets to the parent to delete.
 */
export function CleanupDialog({
  items,
  busy = false,
  onConfirm,
  onCancel,
}: {
  items: GalleryItem[];
  busy?: boolean;
  onConfirm: (targets: GalleryItem[]) => void;
  onCancel: () => void;
}) {
  const [threshold, setThreshold] = useState(2);
  const [includeUnrated, setIncludeUnrated] = useState(false);

  const targets = items.filter(
    (i) => (i.rating > 0 && i.rating < threshold) || (includeUnrated && i.rating === 0),
  );
  const n = targets.length;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-6"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-100">Delete low-rated photos</h3>
        <p className="mt-1 text-sm text-gray-400">Permanently remove photos below a rating from this folder.</p>

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Delete photos rated below
        </p>
        <div className="flex rounded-lg bg-base p-0.5">
          {THRESHOLDS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setThreshold(t)}
              className={`flex flex-1 items-center justify-center gap-0.5 rounded-md py-1.5 text-sm font-medium transition ${
                threshold === t ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              {t}
            </button>
          ))}
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={includeUnrated}
            onChange={(e) => setIncludeUnrated(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-base accent-primary-500"
          />
          Also delete unrated photos
        </label>

        <p className="mt-4 text-sm">
          {n === 0 ? (
            <span className="text-gray-500">No photos match &mdash; nothing will be deleted.</span>
          ) : (
            <span className="text-gray-300">
              <span className="font-semibold text-red-400">{n}</span> of {items.length} photos will be permanently
              deleted. This can&rsquo;t be undone.
            </span>
          )}
        </p>
        {n > 0 && (
          <p className="mt-1.5 text-[11px] text-gray-500">Matching RAW/JPG pairs are deleted together.</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-gray-200 transition hover:bg-border disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(targets)}
            disabled={busy || n === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete{n > 0 ? ` ${n}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
