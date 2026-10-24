import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Share2 } from 'lucide-react';
import { useAlbums, useShares } from '@/features/gallery/api';
import { useJobs } from '@/features/jobs/api';
import { useShareActions } from './useShareActions';
import { ClientCard, groupByAlbum, type LinkState } from './ClientCard';

type Filter = 'all' | LinkState;

const PILL_ON = 'h-8 rounded-full bg-gray-100 px-3 text-xs font-semibold text-on-accent';
const PILL = 'h-8 rounded-full border border-border-strong px-3 text-xs font-medium text-gray-200 transition hover:bg-surface';

/** "Shared with clients": one card per album with every client link it has,
 *  most urgent first (picks in, then picking, then delivered). */
export function SharesPage() {
  const sharesQuery = useShares();
  const albums = useAlbums().data;
  const jobs = useJobs().data;
  const actions = useShareActions();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  // Deep link from an album page: /clients?album=Albums/June opens its picks.
  const focusAlbum = params.get('album');

  const shares = sharesQuery.data ?? [];
  const groups = useMemo(() => groupByAlbum(shares), [shares]);
  const edited = useMemo(() => new Map((albums ?? []).map((a) => [a.path, a.edited])), [albums]);
  const jobFor = useMemo(() => new Map((jobs ?? []).filter((j) => j.albumPath).map((j) => [j.albumPath as string, j])), [jobs]);

  const counts: Record<Filter, number> = { all: groups.length, 'needs-you': 0, picking: 0, delivered: 0 };
  groups.forEach((g) => { counts[g.state] += 1; });
  const shown = groups.filter((g) => filter === 'all' || g.state === filter);

  return (
    // Same width and gutters as the gallery, so the pages line up.
    <div className="mx-auto max-w-screen-2xl p-3 sm:p-4">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-xl font-semibold tracking-tight">Shared with clients</h1>
        {shares.length > 0 && (
          <span className="text-xs text-gray-500">
            {shares.length} link{shares.length === 1 ? '' : 's'} · {groups.length} album{groups.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {([['all', 'All'], ['needs-you', 'Needs you'], ['picking', 'Picking'], ['delivered', 'Delivered']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`flex items-center gap-1.5 ${filter === f ? PILL_ON : PILL}`}>
            {f === 'needs-you' && counts['needs-you'] > 0 && <span className="h-2 w-2 rounded-full bg-primary-500" />}
            {label} · {counts[f]}
          </button>
        ))}
      </div>

      {/* One column; two side by side on wide screens (cards needing you or
          showing picks take the full width). */}
      <div className="mt-6 grid items-start gap-x-5 gap-y-6 xl:grid-cols-2">
        {sharesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 xl:col-span-2"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400 xl:col-span-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface"><Share2 className="h-7 w-7 text-gray-600" /></div>
            <p className="max-w-xs text-sm">
              {shares.length === 0 ? 'Nothing shared yet. Open an album and create a link for your client.' : 'Nothing here.'}
            </p>
          </div>
        ) : (
          shown.map((g) => (
            <ClientCard
              key={g.albumPath}
              group={g}
              actions={actions}
              editedInAlbum={albums ? edited.get(g.albumPath) : undefined}
              job={jobFor.get(g.albumPath)}
              defaultOpen={g.albumPath === focusAlbum}
            />
          ))
        )}
      </div>
    </div>
  );
}
