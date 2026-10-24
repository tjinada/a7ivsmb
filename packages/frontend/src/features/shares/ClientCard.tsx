import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy, Check, Send, Loader2, MoreHorizontal, Heart, Download, RefreshCw, FolderOpen, Power, Eye, Sparkles,
} from 'lucide-react';
import type { JobSummary, ShareSummary } from '@sonycam/shared';
import { AuthImage } from '@/features/gallery/AuthImage';
import { thumbUrl } from '@/features/gallery/mediaUrl';
import { ConfirmDialog } from '@/features/gallery/ConfirmDialog';
import { fmtAgo } from '@/lib/dates';
import type { useShareActions } from './useShareActions';

type Actions = ReturnType<typeof useShareActions>;

/** Where one link stands. needs-you: the client sent picks; picking: still
 *  choosing; delivered: finals released, or a download-all link. */
export type LinkState = 'needs-you' | 'picking' | 'delivered';

export function linkState(s: ShareSummary): LinkState {
  if (s.kind === 'delivery' || s.phase === 'delivery') return 'delivered';
  return s.phase === 'submitted' ? 'needs-you' : 'picking';
}

const RANK: Record<LinkState, number> = { 'needs-you': 0, picking: 1, delivered: 2 };

/** All of one album's client links, as one card. */
export interface AlbumGroup {
  albumPath: string;
  albumName: string;
  links: ShareSummary[];     // most urgent first, then newest
  state: LinkState;          // the most urgent of its links
  lastActivity: number;
}

const activityOf = (s: ShareSummary) => s.submittedAt ?? s.createdAt;

export function groupByAlbum(shares: ShareSummary[]): AlbumGroup[] {
  const by = new Map<string, ShareSummary[]>();
  for (const s of shares) by.set(s.albumPath, [...(by.get(s.albumPath) ?? []), s]);
  return [...by.values()]
    .map((links) => {
      links.sort((a, b) => RANK[linkState(a)] - RANK[linkState(b)] || activityOf(b) - activityOf(a));
      return {
        albumPath: links[0].albumPath,
        albumName: links[0].albumName,
        links,
        state: linkState(links[0]),
        lastActivity: Math.max(...links.map(activityOf)),
      };
    })
    .sort((a, b) => RANK[a.state] - RANK[b.state] || b.lastActivity - a.lastActivity);
}

const STEP_CHIP: Record<JobSummary['step'], string> = {
  cull: '① Cull', edit: '② Edit', pick: '③ Picks', deliver: '④ Send', done: 'Delivered',
};

function statusPill(g: AlbumGroup): { text: string; cls: string } {
  const s = g.links[0];
  if (g.state === 'needs-you') return { text: `Picks in · ${s.finalCount} of ${s.cap}`, cls: 'bg-primary-500/15 text-primary-400' };
  if (g.state === 'picking') {
    return { text: s.selectedCount > 0 ? `Picking · ${s.selectedCount} shortlisted` : 'Picking · no picks yet', cls: 'bg-white/[0.07] text-gray-300' };
  }
  return { text: 'Delivered', cls: 'bg-emerald-500/10 text-emerald-400' };
}

function linkLine(s: ShareSummary): string {
  if (s.kind === 'delivery') return `Download link · ${s.previewCount} photos · sent ${fmtAgo(s.createdAt)}`;
  if (s.phase === 'delivery') return `Picking link · ${s.finalCount} photos delivered`;
  if (s.phase === 'submitted') return `Picking link · ${s.finalCount} of ${s.cap} picked ${fmtAgo(s.submittedAt ?? s.createdAt)}`;
  return `Picking link · up to ${s.cap} · sent ${fmtAgo(s.createdAt)} · ${s.finalCount} final picks`;
}

const BTN = 'flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-base disabled:opacity-50';

export function ClientCard({
  group: g, actions: a, editedInAlbum, job, defaultOpen = false,
}: {
  group: AlbumGroup;
  actions: Actions;
  /** Photos currently in the album's Edited/ (undefined while unknown). */
  editedInAlbum?: number;
  job?: JobSummary;
  defaultOpen?: boolean;
}) {
  const proofing = g.links.find((s) => s.kind !== 'delivery');
  const [picksOpen, setPicksOpen] = useState(defaultOpen && !!proofing);
  const [revoking, setRevoking] = useState<ShareSummary | null>(null);
  const pill = statusPill(g);
  const cover = g.links.find((s) => s.cover)?.cover;
  const needsYou = g.state === 'needs-you' && proofing;

  // Edits added since a link was published: offer to update the link that a
  // client is still looking at (a download link, or picking still open).
  const stale = editedInAlbum === undefined ? undefined : g.links.find(
    (s) => (s.kind === 'delivery' || s.phase === 'proofing') && editedInAlbum > s.previewCount,
  );
  const refreshing = g.links.find((s) => a.refreshing(s));

  // One link and nothing waiting on you: the whole album fits on one row.
  const compact = g.links.length === 1 && !needsYou;
  // Wide screens show cards in two columns; anything needing room or
  // attention takes the full width.
  const wide = !!needsYou || picksOpen;

  /** Copy + ⋯ for one link. */
  const controls = (s: ShareSummary) => (
    <>
      <button type="button" onClick={() => a.copyLink(s)} className={BTN}>
        {a.copiedId === s.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{a.copiedId === s.id ? 'Copied' : 'Copy link'}</span>
        <span className="sm:hidden">{a.copiedId === s.id ? 'Copied' : 'Copy'}</span>
      </button>
      <LinkMenu
        share={s}
        busy={a.busyFor(s)}
        editedInAlbum={editedInAlbum}
        onUpdate={() => a.refresh(s)}
        onPicks={s.kind !== 'delivery' && s.selectedCount > 0 ? () => setPicksOpen((o) => !o) : undefined}
        picksOpen={picksOpen}
        onTurnOff={() => setRevoking(s)}
      />
    </>
  );

  return (
    // Every card is the same fixed height (sized for an album with two links,
    // or picks-in with its buttons); a one-row card centres its content and
    // anything beyond that scrolls inside the card. Only a card with its picks
    // open grows. Phones keep natural heights.
    <div className={`flex flex-col rounded-2xl border bg-surface p-4 ${picksOpen ? '' : 'sm:h-[192px]'} ${compact ? 'justify-center' : ''} ${
      needsYou ? 'border-primary-500' : 'border-border'
    } ${wide ? 'xl:col-span-2' : ''}`}>
      <div className="flex flex-none items-center gap-4">
        {cover ? (
          <AuthImage src={thumbUrl(`${g.albumPath}/Edited/${cover}`)} alt="" className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-base" />
        ) : (
          <div className="h-16 w-16 flex-none rounded-xl bg-base" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link to={`/gallery?path=${encodeURIComponent(g.albumPath)}`} className="truncate text-[15px] font-semibold text-gray-100 hover:underline">
              {g.albumName}
            </Link>
            {job && (
              <Link to={`/gallery?path=${encodeURIComponent(g.albumPath)}`} className="flex-none rounded-md border border-border-strong px-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-200" title="This album's shoot">
                Shoot · {STEP_CHIP[job.step]}
              </Link>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">
            {compact ? linkLine(g.links[0]) : `${g.links.length} link${g.links.length === 1 ? '' : 's'} · last activity ${fmtAgo(g.lastActivity)}`}
          </p>
          {/* On phones the pill sits under the name. */}
          <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:hidden ${pill.cls}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />{pill.text}
          </span>
        </div>
        <span className={`hidden flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${pill.cls}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />{pill.text}
        </span>
        {compact && controls(g.links[0])}
      </div>

      <div className={`min-h-0 overflow-y-auto ${compact ? '' : 'flex-1'}`}>
      {needsYou && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPicksOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-primary-400">
            <Eye className="h-3.5 w-3.5" />{picksOpen ? 'Hide picks' : 'Review picks'}
          </button>
          <button type="button" onClick={() => a.deliver(proofing)} disabled={a.busyFor(proofing)} className={BTN}>
            {a.busyFor(proofing) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send final photos
          </button>
        </div>
      )}

      {!compact && (
        <div className="mt-2.5 divide-y divide-border border-t border-border">
          {g.links.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 py-1.5 last:pb-0">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white/[0.06] text-gray-400">
                {s.kind === 'delivery' ? <Download className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-snug text-gray-300 sm:truncate">{linkLine(s)}</span>
              {controls(s)}
            </div>
          ))}
        </div>
      )}

      {stale && !refreshing && editedInAlbum !== undefined && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-primary-500/45 bg-primary-500/[0.07] px-3 py-2 text-xs text-primary-300">
          <Sparkles className="h-3.5 w-3.5 flex-none text-primary-400" />
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-primary-400">{editedInAlbum - stale.previewCount} new edit{editedInAlbum - stale.previewCount === 1 ? '' : 's'}</b>
            {editedInAlbum - stale.previewCount === 1 ? ' isn’t' : ' aren’t'} on the {stale.kind === 'delivery' ? 'download' : 'picking'} link yet
          </span>
          <button type="button" onClick={() => a.refresh(stale)} disabled={a.busyFor(stale)} className={BTN}>Update link</button>
        </div>
      )}

      {refreshing && (
        <div className="mt-3">
          <p className="text-[11px] text-gray-500">
            {a.refreshProgress && a.refreshProgress.total > 0 ? `Updating photos… ${a.refreshProgress.done} / ${a.refreshProgress.total}` : 'Preparing…'}
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-base">
            <div className="h-full rounded-full bg-primary-500 transition-[width] duration-300" style={{ width: a.refreshProgress && a.refreshProgress.total > 0 ? `${Math.round((a.refreshProgress.done / a.refreshProgress.total) * 100)}%` : '4%' }} />
          </div>
        </div>
      )}

      {picksOpen && proofing && <PicksPanel share={proofing} actions={a} />}
      </div>

      {revoking && (
        <ConfirmDialog
          title={`Turn off this link for "${g.albumName}"?`}
          message="The client will no longer be able to open it. Their picks are kept."
          confirmLabel="Turn off link"
          busy={a.revoking}
          onConfirm={() => { a.revoke(revoking); setRevoking(null); }}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}

/** ⋯ for one link: update its photos, open the album, view picks, turn off. */
function LinkMenu({ share: s, busy, editedInAlbum, onUpdate, onPicks, picksOpen, onTurnOff }: {
  share: ShareSummary;
  busy: boolean;
  editedInAlbum?: number;
  onUpdate: () => void;
  onPicks?: () => void;
  picksOpen: boolean;
  onTurnOff: () => void;
}) {
  // The menu floats (position: fixed) so a fixed-height card that scrolls
  // can't clip it; it opens below its button, or above when near the bottom
  // of the window, and closes on any scroll.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const open = pos !== null;
  const close = () => setPos(null);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) { close(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    setPos(window.innerHeight - r.bottom < 220 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };
  const pick = (fn: () => void) => () => { close(); fn(); };
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-gray-200 transition hover:bg-white/[0.06] disabled:opacity-50';
  return (
    <div className="flex-none">
      <button
        type="button"
        onClick={toggle}
        aria-label="More for this link"
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${open ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="fixed z-50 w-56 rounded-xl border border-border-strong bg-surface p-1 shadow-xl" style={pos}>
            {onPicks && (
              <button type="button" onClick={pick(onPicks)} className={item}>
                <Eye className="h-4 w-4 text-gray-400" />{picksOpen ? 'Hide picks' : `View picks (${s.finalCount || s.selectedCount})`}
              </button>
            )}
            <button type="button" onClick={pick(onUpdate)} disabled={busy} className={item}>
              <RefreshCw className="h-4 w-4 text-gray-400" />
              Update photos{editedInAlbum !== undefined ? ` (${editedInAlbum} edited)` : ''}
            </button>
            <Link to={`/gallery?path=${encodeURIComponent(s.albumPath)}`} onClick={close} className={item}>
              <FolderOpen className="h-4 w-4 text-gray-400" />Open album
            </Link>
            <div className="my-1 h-px bg-border" />
            <button type="button" onClick={pick(onTurnOff)} disabled={busy} className={`${item} text-red-400`}>
              <Power className="h-4 w-4" />Turn off link…
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The client's final picks and the rest of their shortlist. */
function PicksPanel({ share: s, actions: a }: { share: ShareSummary; actions: Actions }) {
  const extras = s.selections.filter((f) => !s.final.includes(f));
  return (
    <div className="mt-3 border-t border-border pt-3">
      {s.final.length > 0 ? (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Final picks · {s.final.length}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {s.final.map((f) => (
              <figure key={f} className="m-0 min-w-0">
                <AuthImage src={thumbUrl(`${s.albumPath}/Edited/${f}`)} alt={f} className="aspect-square overflow-hidden rounded-md bg-base" />
                <figcaption className="mt-0.5 truncate text-[10px] text-gray-500">{f}</figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500">No final picks yet.</p>
      )}
      {extras.length > 0 && (
        <>
          <p className="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {s.final.length > 0 ? `Also shortlisted · ${extras.length} · not chosen` : `Shortlisted so far · ${extras.length}`}
          </p>
          <div className="grid grid-cols-6 gap-1 opacity-70 sm:grid-cols-8">
            {extras.map((f) => (
              <AuthImage key={f} src={thumbUrl(`${s.albumPath}/Edited/${f}`)} alt={f} className="aspect-square overflow-hidden rounded bg-base" />
            ))}
          </div>
        </>
      )}
      {s.final.length > 0 && (
        <button type="button" onClick={() => a.copyNames(s)} className={`mt-2.5 ${BTN}`}>
          {a.copiedNamesId === s.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {a.copiedNamesId === s.id ? 'Copied' : 'Copy filenames'}
        </button>
      )}
    </div>
  );
}
