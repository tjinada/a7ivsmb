import { Download, Star, CheckCircle2, Circle } from 'lucide-react';
import type { GalleryItem } from '@sonycam/shared';
import { AuthImage } from './AuthImage';
import { thumbUrl } from './mediaUrl';
import { prettyDate } from '@/lib/dates';

const GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10';

export function PhotoTile({
  item: it, selecting, selected, onTap,
}: {
  item: GalleryItem;
  selecting: boolean;
  selected: boolean;
  onTap: () => void;
}) {
  const isRaw = it.kind === 'raw';
  return (
    <button
      type="button"
      onClick={onTap}
      className={`group relative aspect-square overflow-hidden rounded-lg bg-surface ring-1 transition active:scale-[0.98] ${
        selected ? 'ring-2 ring-primary-500' : 'ring-border/60 hover:ring-primary-500/60'
      }`}
    >
      <AuthImage
        src={thumbUrl(it.path, it.modified)}
        alt={it.name}
        className="h-full w-full [&>img]:transition-transform [&>img]:duration-300 group-hover:[&>img]:scale-110"
        fallback={
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2">
            <Download className="h-5 w-5 text-gray-500" />
            <span className="w-full truncate px-1 text-center text-[10px] text-gray-500">{it.name}</span>
          </div>
        }
      />
      {isRaw && (
        <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary-300">RAW</div>
      )}
      {it.twin && (
        <div className={`pointer-events-none absolute left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 ${isRaw ? 'top-[1.55rem]' : 'top-1'}`}>
          {isRaw ? '+JPG' : '+RAW'}
        </div>
      )}
      {it.rating > 0 && (
        <div className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
          {it.rating}
        </div>
      )}
      {selecting && (
        <div className="absolute right-1 top-1">
          {selected ? <CheckCircle2 className="h-5 w-5 fill-primary-500 text-white" /> : <Circle className="h-5 w-5 text-white/80 drop-shadow" />}
        </div>
      )}
    </button>
  );
}

interface GridProps {
  items: GalleryItem[];
  selecting: boolean;
  selected: Set<string>;
  onTap: (item: GalleryItem) => void;
}

/** Plain square grid of one folder's photos. */
export function PhotoGrid({ items, selecting, selected, onTap }: GridProps) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-gray-500">No photos match this filter.</p>;
  return (
    <div className={GRID}>
      {items.map((it) => (
        <PhotoTile key={it.path} item={it} selecting={selecting} selected={selected.has(it.path)} onTap={() => onTap(it)} />
      ))}
    </div>
  );
}

/** Timeline: the same tiles bucketed into sticky date sections. */
export function TimelineGrid({ groups, truncated, total, ...rest }: Omit<GridProps, 'items'> & {
  groups: { date: string; items: GalleryItem[] }[];
  truncated: boolean;
  total: number;
}) {
  if (groups.length === 0) return <p className="py-8 text-center text-sm text-gray-500">No photos match this filter.</p>;
  return (
    <>
      {groups.map((g) => (
        <section key={g.date} className="mb-5">
          <div className="sticky top-0 z-10 -mx-3 mb-2 bg-base/95 px-3 py-1.5 backdrop-blur">
            <h2 className="text-xs font-semibold text-gray-300">
              {prettyDate(g.date)}
              <span className="ml-1.5 text-gray-500">{g.items.length}</span>
            </h2>
          </div>
          <div className={GRID}>
            {g.items.map((it) => (
              <PhotoTile key={it.path} item={it} selecting={rest.selecting} selected={rest.selected.has(it.path)} onTap={() => rest.onTap(it)} />
            ))}
          </div>
        </section>
      ))}
      {truncated && <p className="py-3 text-center text-xs text-gray-500">Showing the most recent {total} photos.</p>}
    </>
  );
}
