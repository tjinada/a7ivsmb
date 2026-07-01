import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2, Copy, Check, RefreshCw, Send, Trash2, X } from 'lucide-react';
import type { ApiResponse, ShareSummary, SharePhase } from '@sonycam/shared';
import { api } from '@/api/client';

async function fetchShares(): Promise<ShareSummary[]> {
  const res = await api.get<ApiResponse<ShareSummary[]>>('/gallery/shares');
  return res.data.data ?? [];
}

const PHASE_LABEL: Record<SharePhase, string> = {
  proofing: 'Awaiting client picks',
  submitted: 'Review picks and send to client',
  delivery: 'Delivered to client',
};
const PHASE_CLASS: Record<SharePhase, string> = {
  proofing: 'bg-gray-500/15 text-gray-300',
  submitted: 'bg-amber-500/15 text-amber-300',
  delivery: 'bg-emerald-500/15 text-emerald-300',
};

/** Owner dashboard for client shares: status, copy link, send final photos,
 *  refresh previews, and disable the link. Selection status reflects what the
 *  client has picked so far (refresh to pull the latest). */
export function ShareManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const sharesQuery = useQuery({ queryKey: ['shares'], queryFn: fetchShares });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['shares'] });

  const deliveryMut = useMutation({
    mutationFn: (id: string) => api.post(`/gallery/shares/${id}/delivery`),
    onSuccess: invalidate,
    onError: () => window.alert('Could not send the final photos'),
  });
  const refreshMut = useMutation({
    mutationFn: (id: string) => api.post(`/gallery/shares/${id}/refresh`),
    onSuccess: invalidate,
    onError: () => window.alert('Could not refresh previews'),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/gallery/shares/${id}`),
    onSuccess: invalidate,
    onError: () => window.alert('Could not disable the link'),
  });

  const copy = async (s: ShareSummary) => {
    try {
      await navigator.clipboard.writeText(s.url);
      setCopiedId(s.id);
      setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1800);
    } catch {
      window.prompt('Copy this link', s.url);
    }
  };

  const revoke = (s: ShareSummary) => {
    if (window.confirm(`Disable the link for "${s.albumName}"? The client will no longer be able to open it.`)) {
      revokeMut.mutate(s.id);
    }
  };

  const shares = sharesQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-100">
            <Share2 className="h-4 w-4 text-primary-500" />
            Client shares
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-base hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {sharesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : shares.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              No shares yet. Open an album and tap <span className="text-gray-300">Share with client</span>.
            </p>
          ) : (
            <div className="space-y-2.5">
              {shares.map((s) => {
                const busy =
                  (deliveryMut.isPending && deliveryMut.variables === s.id) ||
                  (refreshMut.isPending && refreshMut.variables === s.id) ||
                  (revokeMut.isPending && revokeMut.variables === s.id);
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-base p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-100">{s.albumName}</p>
                      <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${PHASE_CLASS[s.phase]}`}>
                        {PHASE_LABEL[s.phase]}
                      </span>
                      <p className="mt-1.5 text-[11px] text-gray-500">
                        {s.selectedCount} / {s.cap} selected &middot; {s.previewCount} preview
                        {s.previewCount === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copy(s)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-surface"
                      >
                        {copiedId === s.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedId === s.id ? 'Copied' : 'Copy link'}
                      </button>

                      {s.phase === 'submitted' && (
                        <button
                          type="button"
                          onClick={() => deliveryMut.mutate(s.id)}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send final photos
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => refreshMut.mutate(s.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-surface disabled:opacity-50"
                        title="Refresh previews from the album's current Edited/ folder"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshMut.isPending && refreshMut.variables === s.id ? 'animate-spin' : ''}`} />
                        Refresh previews
                      </button>

                      <button
                        type="button"
                        onClick={() => revoke(s)}
                        disabled={busy}
                        className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Disable link
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
