import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Send, Loader2, Share2 } from 'lucide-react';
import type { GalleryItem, ShareSummary } from '@sonycam/shared';
import { useAppConfig } from '@/lib/useAppConfig';
import { fmtAgo } from '@/lib/dates';
import { toast } from '@/components/Toast';
import { useShareActions } from '@/features/shares/useShareActions';
import { EditedUpload } from './EditedUpload';
import { keys, useBrowse } from './api';

export type AlbumTab = 'picks' | 'shortlist' | 'edited' | 'all';

const PILL_ON = 'h-8 rounded-full bg-gray-100 px-3 text-xs font-semibold text-on-accent';
const PILL = 'h-8 rounded-full border border-border-strong px-3 text-xs font-medium text-gray-200 transition hover:bg-surface';
const BTN = 'flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-surface disabled:opacity-50';

/** Folder path on the editing machine for an album's Edited/ folder. */
function editedPath(prefix: string, albumName: string): string {
  const sep = prefix.includes('\\') ? '\\' : '/';
  return `${prefix.replace(/[\\/]+$/, '')}${sep}Albums${sep}${albumName}${sep}Edited`;
}

/**
 * Album root: where it stands (shots · edited · share), what to do next, and
 * which set of photos to look at. The grid itself is rendered by the page from
 * `items`, so this panel is purely the header + tab state.
 */
export function useAlbumPanel(albumPath: string, shares: ShareSummary[]) {
  const [tab, setTab] = useState<AlbumTab>('all');
  const enabled = albumPath !== '';
  const editedKey = `${albumPath}/Edited`;
  // Albums copy into Selected/JPG and/or Selected/RAW depending on the formats
  // chosen at creation; albums from before that split hold their copies in
  // Selected/ itself. Try the buckets first, then the bare folder.
  const jpgKey = `${albumPath}/Selected/JPG`;
  const rawKey = `${albumPath}/Selected/RAW`;
  const bareKey = `${albumPath}/Selected`;
  const edited = useBrowse(editedKey, enabled, { retry: false });
  const selectedJpg = useBrowse(jpgKey, enabled, { retry: false });
  // A bucket that is missing *or empty* is not the one holding the copies.
  const empty = (q: { isError: boolean; isSuccess: boolean; data?: { items: unknown[] } }) =>
    q.isError || (q.isSuccess && (q.data?.items.length ?? 0) === 0);
  const tryRaw = enabled && empty(selectedJpg);
  const selectedRaw = useBrowse(rawKey, tryRaw, { retry: false });
  const tryBare = tryRaw && empty(selectedRaw);
  const selectedBare = useBrowse(bareKey, tryBare, { retry: false });
  const selected = tryBare ? selectedBare : tryRaw ? selectedRaw : selectedJpg;
  const selectedKey = tryBare ? bareKey : tryRaw ? rawKey : jpgKey;
  // An album filled straight from Lightroom has no Selected/ at all: it has
  // edits, not copied originals, so "shots" is meaningless there.
  const hasSelected = enabled && !!selected.data && selected.data.items.length > 0;
  const share = shares.find((s) => s.kind !== 'delivery') ?? shares[0];
  const editedItems = edited.data?.items ?? [];
  const allItems = selected.data?.items ?? [];
  const finalSet = new Set(share?.final ?? []);
  const shortSet = new Set(share?.selections ?? []);

  // Picks and shortlist only exist once a client has a proofing link. An album
  // with nothing in Selected/ but edits in Edited/ opens on the edits.
  const hasProofing = !!share && share.kind !== 'delivery';
  const requested: AlbumTab = hasProofing ? tab : tab === 'picks' || tab === 'shortlist' ? 'all' : tab;
  const effectiveTab: AlbumTab = requested === 'all' && allItems.length === 0 && editedItems.length > 0 ? 'edited' : requested;
  const items: GalleryItem[] =
    effectiveTab === 'picks' ? editedItems.filter((i) => finalSet.has(i.name))
      : effectiveTab === 'shortlist' ? editedItems.filter((i) => shortSet.has(i.name))
        : effectiveTab === 'edited' ? editedItems
          : allItems;

  return {
    tab: effectiveTab, setTab, items,
    /** React Query key of the folder the current tab reads, for cache patches. */
    activeKey: keys.browse(effectiveTab === 'all' ? selectedKey : editedKey),
    loading: enabled && (edited.isLoading || selected.isLoading),
    counts: { picks: finalSet.size, shortlist: shortSet.size, edited: editedItems.length, all: allItems.length },
    hasSelected,
    share,
    editedNames: new Set(editedItems.map((i) => i.name)),
    refetch: () => { void edited.refetch(); void selected.refetch(); },
  };
}

export function AlbumPanel({
  albumName, panel, onCreateShare,
}: {
  albumName: string;
  panel: ReturnType<typeof useAlbumPanel>;
  onCreateShare: () => void;
}) {
  const { pathPrefix } = useAppConfig();
  const actions = useShareActions();
  const { share, counts, tab, setTab } = panel;
  const [copied, setCopied] = useState(false);
  const proofing = share && share.kind !== 'delivery';
  const picksEdited = share ? share.final.filter((f) => panel.editedNames.has(f)).length : 0;
  const allEdited = !!share && share.final.length > 0 && picksEdited === share.final.length;

  const copyPath = async () => {
    const p = editedPath(pathPrefix, albumName);
    try { await navigator.clipboard.writeText(p); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt('Copy this path', p); }
  };

  const phaseTile = !share
    ? { label: 'Not shared', sub: 'Create a client link', hot: false }
    : share.kind === 'delivery' ? { label: 'Download link', sub: `${share.previewCount} photos`, hot: false }
      : share.phase === 'submitted' ? { label: 'Picks in', sub: `${share.finalCount} of ${share.cap} · ${fmtAgo(share.submittedAt ?? share.createdAt)}`, hot: true }
        : share.phase === 'delivery' ? { label: 'Delivered', sub: `${share.finalCount} photos`, hot: false }
          : { label: 'Awaiting picks', sub: share.selectedCount > 0 ? `${share.selectedCount} shortlisted so far` : 'no picks yet', hot: false };

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat value={panel.hasSelected ? String(counts.all) : '—'} label={panel.hasSelected ? 'shots' : 'no originals'} />
        <Stat value={String(counts.edited)} label="edited" />
        <div className={`rounded-xl border p-3 ${phaseTile.hot ? 'border-primary-500 bg-primary-500/10' : 'border-border bg-surface'}`}>
          <p className={`text-sm font-semibold leading-tight ${phaseTile.hot ? 'text-primary-400' : 'text-gray-100'}`}>{phaseTile.label}</p>
          <p className="mt-0.5 truncate text-[11px] text-gray-400">{phaseTile.sub}</p>
        </div>
      </div>

      {proofing && share.phase === 'submitted' ? (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <Step n={1} done={allEdited} title={`Edit the ${share.final.length} pick${share.final.length === 1 ? '' : 's'}`}
            sub={`Export from Lightroom to this album’s Edited folder. ${picksEdited} of ${share.final.length} ${picksEdited === 1 ? 'is' : 'are'} there.`}>
            {pathPrefix && (
              <button type="button" onClick={copyPath} className={BTN}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy folder path'}
              </button>
            )}
            <EditedUpload albumName={albumName} onUploaded={() => { panel.refetch(); void actions.refresh(share); }} label="Upload" tone="subtle" />
          </Step>
          <div className="my-3 h-px bg-border" />
          <Step n={2} title="Send the final photos" sub="Unlocks full-resolution downloads on the client’s link.">
            <button type="button" onClick={() => actions.deliver(share)} disabled={actions.busyFor(share)} className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-2 text-xs font-semibold text-on-accent transition hover:bg-primary-400 disabled:opacity-50">
              {actions.busyFor(share) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send final photos
            </button>
            {!allEdited && <span className="self-center text-[11px] text-gray-500">Picks without an edit will be missing from the download.</span>}
          </Step>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary-500/15 text-primary-400"><Share2 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-100">{share ? 'Client link' : 'Share with client'}</p>
            <p className="text-[11px] text-gray-500">
              {share ? (share.phase === 'delivery' ? 'Delivered · client can download' : 'Waiting on the client’s picks') : 'Upload your edits, then send a link to pick favourites.'}
            </p>
          </div>
          <EditedUpload albumName={albumName} onUploaded={() => { panel.refetch(); if (share) void actions.refresh(share); }} label="Upload" tone="subtle" />
          {pathPrefix && (
            <button type="button" onClick={copyPath} className={BTN} title={editedPath(pathPrefix, albumName)}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Folder path'}
            </button>
          )}
          {share ? (
            <Link to={`/shares?album=${encodeURIComponent(share.albumPath)}`} className={BTN}>Manage</Link>
          ) : (
            <button type="button" onClick={() => (counts.edited > 0 ? onCreateShare() : toast.error('Upload edited JPGs first'))} className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-primary-400">
              Create link
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {proofing && <Pill on={tab === 'picks'} onClick={() => setTab('picks')}>Picks · {counts.picks}</Pill>}
        {proofing && <Pill on={tab === 'shortlist'} onClick={() => setTab('shortlist')}>Shortlist · {counts.shortlist}</Pill>}
        <Pill on={tab === 'edited'} onClick={() => setTab('edited')}>Edited · {counts.edited}</Pill>
        {panel.hasSelected && <Pill on={tab === 'all'} onClick={() => setTab('all')}>All · {counts.all}</Pill>}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xl font-semibold leading-tight text-gray-100">{value}</p>
      <p className="mt-0.5 text-[11px] text-gray-400">{label}</p>
    </div>
  );
}

function Step({ n, done, title, sub, children }: { n: number; done?: boolean; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-bold ${done ? 'bg-primary-500 text-on-accent' : 'bg-border text-gray-100'}`}>
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-100">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{sub}</p>
        <div className="mt-2.5 flex flex-wrap items-start gap-2">{children}</div>
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={on ? PILL_ON : PILL}>{children}</button>;
}
