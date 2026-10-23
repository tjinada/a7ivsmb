import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, RefreshCw, Send, Trash2, ChevronRight, Loader2 } from 'lucide-react';
import type { ShareSummary } from '@sonycam/shared';
import { AuthImage } from '@/features/gallery/AuthImage';
import { thumbUrl } from '@/features/gallery/mediaUrl';
import { ConfirmDialog } from '@/features/gallery/ConfirmDialog';
import { fmtAgo } from '@/lib/dates';
import type { useShareActions } from './useShareActions';

type Actions = ReturnType<typeof useShareActions>;

/** needs-you: client has submitted; waiting: still picking; sent: delivered. */
export function shareState(s: ShareSummary): 'needs-you' | 'waiting' | 'sent' {
  if (s.phase === 'delivery') return 'sent';
  return s.phase === 'submitted' ? 'needs-you' : 'waiting';
}

function statusLine(s: ShareSummary): string {
  const when = fmtAgo(s.submittedAt ?? s.createdAt);
  if (s.kind === 'delivery') return `Download-all link · ${s.previewCount} photos · ${when}`;
  switch (shareState(s)) {
    case 'needs-you':
      return `Picked ${s.finalCount} of ${s.cap} · ${s.selectedCount} shortlisted · ${when}`;
    case 'waiting':
      return s.selectedCount > 0
        ? `Awaiting picks · ${s.selectedCount} shortlisted so far · sent ${when}`
        : `Awaiting picks · no picks yet · sent ${when}`;
    default:
      return `Delivered · ${s.finalCount} photos · ${when}`;
  }
}

const btn = 'flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-surface disabled:opacity-50';

export function ShareRow({ share: s, actions: a, defaultOpen = false }: { share: ShareSummary; actions: Actions; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const state = shareState(s);
  const needsYou = state === 'needs-you';
  const busy = a.busyFor(s);
  const extras = s.selections.filter((f) => !s.final.includes(f));
  const covers = (s.kind === 'delivery' ? s.selections : s.final).slice(0, 3);

  return (
    <div className={`rounded-xl border bg-surface p-3 ${needsYou ? 'border-primary-500' : 'border-border'} ${state === 'sent' ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex flex-none gap-0.5">
          {covers.length > 0 ? covers.map((f) => (
            <AuthImage key={f} src={thumbUrl(`${s.albumPath}/Edited/${f}`)} alt="" className="h-9 w-9 overflow-hidden rounded-md bg-base" />
          )) : <div className="h-9 w-9 rounded-md bg-base" />}
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/gallery?path=${encodeURIComponent(s.albumPath)}`} className="block truncate text-sm font-semibold text-gray-100 hover:underline">
            {s.albumName}
          </Link>
          <p className={`truncate text-xs ${needsYou ? 'font-medium text-primary-400' : 'text-gray-400'}`}>{statusLine(s)}</p>
        </div>
        {state === 'sent' && <ChevronRight className="h-4 w-4 flex-none text-gray-600" />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {needsYou && (
          <button type="button" onClick={() => a.deliver(s)} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-primary-400 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send final photos
          </button>
        )}
        {(s.final.length > 0 || s.selections.length > 0) && s.kind !== 'delivery' && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btn}>
            {open ? 'Hide picks' : `View picks (${s.final.length})`}
          </button>
        )}
        <button type="button" onClick={() => a.copyLink(s)} className={btn}>
          {a.copiedId === s.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {a.copiedId === s.id ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={() => a.refresh(s)} disabled={busy} className={btn} title="Refresh previews from the album's current Edited/ folder">
          <RefreshCw className={`h-3.5 w-3.5 ${a.refreshing(s) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button type="button" onClick={() => setConfirmRevoke(true)} disabled={busy} className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" />
          Disable
        </button>
      </div>

      {a.refreshing(s) && (
        <div className="mt-2.5">
          <p className="text-[11px] text-gray-500">
            {a.refreshProgress && a.refreshProgress.total > 0 ? `Regenerating previews… ${a.refreshProgress.done} / ${a.refreshProgress.total}` : 'Preparing…'}
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-base">
            <div className="h-full rounded-full bg-primary-500 transition-[width] duration-300" style={{ width: a.refreshProgress && a.refreshProgress.total > 0 ? `${Math.round((a.refreshProgress.done / a.refreshProgress.total) * 100)}%` : '4%' }} />
          </div>
        </div>
      )}

      {open && (
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
                Also shortlisted · {extras.length} · not chosen
              </p>
              <div className="grid grid-cols-6 gap-1 opacity-60 sm:grid-cols-8">
                {extras.map((f) => (
                  <AuthImage key={f} src={thumbUrl(`${s.albumPath}/Edited/${f}`)} alt={f} className="aspect-square overflow-hidden rounded bg-base" />
                ))}
              </div>
            </>
          )}
          {s.final.length > 0 && (
            <button type="button" onClick={() => a.copyNames(s)} className={`mt-2.5 ${btn}`}>
              {a.copiedNamesId === s.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {a.copiedNamesId === s.id ? 'Copied' : 'Copy filenames'}
            </button>
          )}
        </div>
      )}

      {confirmRevoke && (
        <ConfirmDialog
          title={`Disable the link for "${s.albumName}"?`}
          message="The client will no longer be able to open it. Their picks are kept."
          confirmLabel="Disable link"
          busy={a.revoking}
          onConfirm={() => { a.revoke(s); setConfirmRevoke(false); }}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </div>
  );
}
