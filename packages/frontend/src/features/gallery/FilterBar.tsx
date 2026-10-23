import { SlidersHorizontal, Star } from 'lucide-react';
import type { GalleryItemKind } from '@sonycam/shared';

export type TypeFilter = 'all' | GalleryItemKind;

const RATING_OPTS = [0, 3, 4, 5];
const TYPE_OPTS: { label: string; value: TypeFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'JPG', value: 'image' },
  { label: 'RAW', value: 'raw' },
];
const activeChip = 'flex items-center rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-on-accent';
const idleChip = 'flex items-center rounded-md px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200';

/** Rating + type filter chips under the toolbar. */
export function FilterBar({
  ratingMin, onRatingMin, typeFilter, onTypeFilter,
}: {
  ratingMin: number;
  onRatingMin: (v: number) => void;
  typeFilter: TypeFilter;
  onTypeFilter: (v: TypeFilter) => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-base px-3 py-2">
      <SlidersHorizontal className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
      <div className="flex flex-shrink-0 rounded-lg bg-surface p-0.5">
        {RATING_OPTS.map((v) => (
          <button key={v} type="button" onClick={() => onRatingMin(v)} className={ratingMin === v ? activeChip : idleChip}>
            {v === 0 ? 'All' : (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-current" />
                {v}{v < 5 ? '+' : ''}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-shrink-0 rounded-lg bg-surface p-0.5">
        {TYPE_OPTS.map((o) => (
          <button key={o.value} type="button" onClick={() => onTypeFilter(o.value)} className={typeFilter === o.value ? activeChip : idleChip}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
