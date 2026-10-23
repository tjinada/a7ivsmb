import { Link } from 'react-router-dom';
import { Share2, Library, ChevronRight } from 'lucide-react';
import type { FolderEntry } from '@sonycam/shared';
import { useFtpStatus } from '@/features/transfers/useFtpStatus';
import { AuthImage } from './AuthImage';
import { thumbUrl } from './mediaUrl';
import { useAlbums, useShares } from './api';
import { fmtAgo, isDateSegment, prettyDate } from '@/lib/dates';

const CARD = 'flex items-center gap-3 rounded-2xl border bg-surface p-3 text-left transition hover:border-border-strong active:scale-[0.99]';

/**
 * The three things worth opening right after a shoot: the latest dated
 * folder (with Cull), shares that need you, and the albums. Shown at the
 * gallery root in folders view.
 */
export function HomeStrip({ folders, onOpen }: { folders: FolderEntry[]; onOpen: (path: string) => void }) {
  const dated = folders.filter((f) => isDateSegment(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  const latest = dated[0];
  const status = useFtpStatus().data;
  const shares = useShares().data ?? [];
  const needsYou = shares.filter((s) => s.phase === 'submitted');
  const albums = useAlbums().data ?? [];
  const liveAlbums = new Set(shares.map((s) => s.albumPath));
  const ready = albums.filter((a) => a.edited > 0 && !liveAlbums.has(a.path)).length;

  if (!latest && shares.length === 0 && albums.length === 0) return null;

  return (
    <section className="mb-5 grid gap-2.5 md:grid-cols-3">
      {latest && (
        <button type="button" onClick={() => onOpen(latest.path)} className={`${CARD} border-border`}>
          <div className="h-11 w-11 flex-none overflow-hidden rounded-lg bg-base">
            {latest.cover && <AuthImage src={thumbUrl(latest.cover)} alt="" className="h-full w-full" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-100">
              {prettyDate(latest.name)} · {latest.count ?? 0} photo{latest.count === 1 ? '' : 's'}
            </p>
            <p className="truncate text-xs text-gray-400">
              {status?.lastReceived ? `Last arrival ${fmtAgo(status.lastReceived)}` : 'No arrivals yet'}
              {typeof latest.unrated === 'number' && latest.unrated > 0 && ` · ${latest.unrated} unrated`}
            </p>
          </div>
          {(latest.count ?? 0) > 0 && (
            <Link
              to={`/cull?path=${encodeURIComponent(latest.path)}`}
              onClick={(e) => e.stopPropagation()}
              className="flex-none rounded-full bg-primary-500 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-primary-400"
            >
              Cull
            </Link>
          )}
        </button>
      )}

      <Link to="/shares" className={`${CARD} ${needsYou.length > 0 ? 'border-primary-500' : 'border-border'}`}>
        <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-lg ${needsYou.length > 0 ? 'bg-primary-500/15 text-primary-400' : 'bg-white/[0.06] text-gray-200'}`}>
          <Share2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-100">
            {needsYou.length > 0 ? `${needsYou.length} share${needsYou.length === 1 ? '' : 's'} need${needsYou.length === 1 ? 's' : ''} you` : 'Shares'}
          </span>
          <span className="block truncate text-xs text-gray-400">
            {needsYou.length > 0
              ? needsYou.map((s) => `${s.albumName} picked ${s.finalCount}`).join(' · ')
              : shares.length > 0 ? `${shares.length} live · nothing waiting on you` : 'No client links yet'}
          </span>
        </span>
        {needsYou.length > 0 ? <span className="h-2.5 w-2.5 flex-none rounded-full bg-primary-500" /> : <ChevronRight className="h-4 w-4 flex-none text-gray-600" />}
      </Link>

      <button type="button" onClick={() => onOpen('Albums')} className={`${CARD} border-border`}>
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-white/[0.06] text-gray-200">
          <Library className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-100">Albums</span>
          <span className="block truncate text-xs text-gray-400">
            {albums.length} album{albums.length === 1 ? '' : 's'}{ready > 0 && ` · ${ready} ready to share`}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 flex-none text-gray-600" />
      </button>
    </section>
  );
}
