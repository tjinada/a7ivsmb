import { useState } from 'react';
import { Loader2, FolderPlus, Star } from 'lucide-react';
import type { GalleryItem, AlbumInfo, AlbumFormats } from '@sonycam/shared';

const STAR_THRESHOLDS = [3, 4, 5];
const FORMAT_OPTS: { label: string; value: AlbumFormats }[] = [
  { label: 'JPG + RAW', value: 'both' },
  { label: 'JPG only', value: 'jpg' },
  { label: 'RAW only', value: 'raw' },
];

/** Count distinct shots, treating a JPG and its RAW twin as one. */
function distinctShots(items: GalleryItem[]): number {
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

/**
 * Create (or add into) an album by copying the chosen photos. In "starred"
 * mode a rating threshold filters the source pool; otherwise the current
 * selection is used as-is.
 */
export function AlbumDialog({
  starred,
  sourceItems,
  existingAlbums,
  busy = false,
  onConfirm,
  onCancel,
}: {
  starred: boolean;
  sourceItems: GalleryItem[];
  existingAlbums: AlbumInfo[];
  busy?: boolean;
  onConfirm: (opts: { name: string; paths: string[]; formats: AlbumFormats }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [formats, setFormats] = useState<AlbumFormats>('both');
  const [threshold, setThreshold] = useState(4);

  const candidate = starred ? sourceItems.filter((i) => i.rating >= threshold) : sourceItems;
  const shots = distinctShots(candidate);
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && shots > 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-6"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-100">
          <FolderPlus className="h-4 w-4 text-primary-500" />
          {starred ? 'Album from starred' : 'Create album'}
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          Copies your picks into <span className="text-gray-300">Albums/&hellip;/Selected</span>. Originals stay in
          their date folders.
        </p>

        {starred && (
          <>
            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Include photos rated
            </p>
            <div className="flex rounded-lg bg-base p-0.5">
              {STAR_THRESHOLDS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setThreshold(t)}
                  className={`flex flex-1 items-center justify-center gap-0.5 rounded-md py-1.5 text-sm font-medium transition ${
                    threshold === t ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {t}+
                </button>
              ))}
            </div>
          </>
        )}

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Album name</p>
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. June Wedding"
          className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-primary-500"
        />
        {existingAlbums.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {existingAlbums.map((a) => (
              <button
                key={a.path}
                type="button"
                onClick={() => setName(a.name)}
                className={`rounded-md px-2 py-1 text-xs transition ${
                  trimmed === a.name
                    ? 'bg-primary-500 text-white'
                    : 'bg-base text-gray-400 hover:text-gray-200'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Formats</p>
        <div className="flex rounded-lg bg-base p-0.5">
          {FORMAT_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFormats(o.value)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                formats === o.value ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm">
          {shots === 0 ? (
            <span className="text-gray-500">No matching photos to copy.</span>
          ) : (
            <span className="text-gray-300">
              <span className="font-semibold text-primary-400">{shots}</span> photo{shots === 1 ? '' : 's'} will be
              copied{existingAlbums.some((a) => a.name === trimmed) ? ' into this existing album' : ''}.
            </span>
          )}
        </p>

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
            onClick={() => onConfirm({ name: trimmed, paths: candidate.map((i) => i.path), formats })}
            disabled={!canCreate}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
