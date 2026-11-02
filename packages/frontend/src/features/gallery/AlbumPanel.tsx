import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Send, Loader2 } from 'lucide-react';
import type { GalleryItem, ShareSummary } from '@sonycam/shared';
import { useAppConfig } from '@/lib/useAppConfig';
import { toast } from '@/components/Toast';
import { useShareActions } from '@/features/shares/useShareActions';
import { EditedUpload } from './EditedUpload';
import { keys, useBrowse } from './api';

export type AlbumTab = 'picks' | 'shortlist' | 'edited' | 'all';

const PILL_ON = 'h-8 rounded-full bg-gray-100 px-3 text-xs font-semibold text-on-accent';
const PILL = 'h-8 rounded-full border border-border-strong px-3 text-xs font-medium text-gray-200 transition hover:bg-surface';
const BTN = 'flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-surface disabled:opacity-50';
const ICON_BTN = 'flex h-8 w-8 flex-none items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200';

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
  // The tab she picked, remembered for this album only; opening another album
  // starts from that album's own default again.
  const [choice, setChoice] = useState<{ album: string; tab: AlbumTab } | null>(null);
  const tab = choice?.album === albumPath ? choice.tab : null;
  const setTab = (t: AlbumTab) => setChoice({ album: albumPath, tab: t });
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

  // Picks and shortlist only exist once a client has a proofing link. Until she
  // picks a tab, the album opens where its next job is: the client's picks once
  // they're in, else the edits once there are any, else the originals.
  const hasProofing = !!share && share.kind !== 'delivery';
  const auto: AlbumTab = hasProofing && share.phase === 'submitted' && finalSet.size > 0 ? 'picks'
    : editedItems.length > 0 ? 'edited' : 'all';
  const wanted = tab ?? auto;
  const requested: AlbumTab = hasProofing ? wanted : wanted === 'picks' || wanted === 'shortlist' ? 'all' : wanted;
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

  // One line saying where the album stands; the tabs below carry the counts.
  const status = !share
    ? counts.edited > 0 ? `Not shared · ${counts.edited} edited` : 'Not shared · no edits yet'
    : share.kind === 'delivery' ? `Download link · ${share.previewCount} photos`
      : share.phase === 'delivery' ? `Delivered · ${share.finalCount} photos`
        : share.selectedCount > 0 ? `Waiting on picks · ${share.selectedCount} shortlisted` : 'Waiting on picks';

  const tabs = (
    <div className="flex flex-wrap gap-2">
      {proofing && <Pill on={tab === 'picks'} onClick={() => setTab('picks')}>Picks · {counts.picks}</Pill>}
      {proofing && <Pill on={tab === 'shortlist'} onClick={() => setTab('shortlist')}>Shortlist · {counts.shortlist}</Pill>}
      <Pill on={tab === 'edited'} onClick={() => setTab('edited')}>Edited · {counts.edited}</Pill>
      {panel.hasSelected && <Pill on={tab === 'all'} onClick={() => setTab('all')}>All · {counts.all}</Pill>}
    </div>
  );

  return (
    <div className="mb-3 space-y-3">
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
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-gray-400">{status}</p>
          {pathPrefix && (
            <button type="button" onClick={copyPath} aria-label="Copy folder path" title={editedPath(pathPrefix, albumName)} className={ICON_BTN}>
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
          <EditedUpload albumName={albumName} onUploaded={() => { panel.refetch(); if (share) void actions.refresh(share); }} label="Upload" tone="subtle" />
          {share ? (
            <Link to={`/clients?album=${encodeURIComponent(share.albumPath)}`} className={BTN}>Manage</Link>
          ) : (
            <button type="button" onClick={() => (counts.edited > 0 ? onCreateShare() : toast.error('Upload edited JPGs first'))} className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-primary-400">
              Create link
            </button>
          )}
        </div>
      )}

      {tabs}
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
