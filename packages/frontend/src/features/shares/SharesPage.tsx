import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Share2 } from 'lucide-react';
import { useShares } from '@/features/gallery/api';
import { useShareActions } from './useShareActions';
import { ShareRow, shareState } from './ShareRow';

type Filter = 'all' | 'needs-you' | 'waiting' | 'sent';

const PILL_ON = 'h-8 rounded-full bg-gray-100 px-3 text-xs font-semibold text-on-accent';
const PILL = 'h-8 rounded-full border border-border-strong px-3 text-xs font-medium text-gray-200 transition hover:bg-surface';

/** Every client share, filterable by what it needs from you. */
export function SharesPage() {
  const sharesQuery = useShares();
  const actions = useShareActions();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  // Deep link from an album page: /shares?album=Albums/June → that share is
  // expanded on arrival.
  const focusAlbum = params.get('album');

  const shares = sharesQuery.data ?? [];
  const counts = {
    all: shares.length,
    'needs-you': shares.filter((s) => shareState(s) === 'needs-you').length,
    waiting: shares.filter((s) => shareState(s) === 'waiting').length,
    sent: shares.filter((s) => shareState(s) === 'sent').length,
  };
  const shown = shares.filter((s) => filter === 'all' || shareState(s) === filter);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-semibold tracking-tight">Shares</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        {([
          ['all', 'All'], ['needs-you', 'Needs you'], ['waiting', 'Waiting'], ['sent', 'Sent'],
        ] as [Filter, string][]).map(([f, label]) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`flex items-center gap-1.5 ${filter === f ? PILL_ON : PILL}`}>
            {f === 'needs-you' && counts['needs-you'] > 0 && <span className="h-2 w-2 rounded-full bg-primary-500" />}
            {label} · {counts[f]}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {sharesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface"><Share2 className="h-7 w-7 text-gray-600" /></div>
            <p className="text-sm">{shares.length === 0 ? 'No shares yet. Open an album and create a link.' : 'Nothing here.'}</p>
          </div>
        ) : (
          shown.map((s) => <ShareRow key={s.id} share={s} actions={actions} defaultOpen={s.albumPath === focusAlbum} />)
        )}
      </div>
    </div>
  );
}
