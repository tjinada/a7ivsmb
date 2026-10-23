import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShareSummary } from '@sonycam/shared';
import { api } from '@/api/client';
import { toast } from '@/components/Toast';
import { keys } from '@/features/gallery/api';
import { newProgressId, useShareProgress } from '@/features/gallery/useShareProgress';
import { shareMessage } from '@/features/gallery/shareMessage';

/** The owner-side share mutations and clipboard helpers, shared by the
 *  Shares page and the album page. */
export function useShareActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.shares });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedNamesId, setCopiedNamesId] = useState<string | null>(null);

  const deliveryMut = useMutation({
    mutationFn: (id: string) => api.post(`/gallery/shares/${id}/delivery`),
    onSuccess: () => { void invalidate(); toast.success('Final photos sent'); },
    onError: () => toast.error('Could not send the final photos'),
  });
  const refreshMut = useMutation({
    mutationFn: ({ id, pid }: { id: string; pid: string }) => api.post(`/gallery/shares/${id}/refresh`, { progressId: pid }),
    onSuccess: () => void invalidate(),
    onError: () => toast.error('Could not refresh previews'),
  });
  const refreshProgress = useShareProgress(refreshMut.variables?.pid ?? null, refreshMut.isPending).data;
  const revokeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/gallery/shares/${id}`),
    onSuccess: () => void invalidate(),
    onError: () => toast.error('Could not disable the link'),
  });

  const flash = (set: (v: string | null) => void, id: string) => {
    set(id);
    setTimeout(() => set(null), 1800);
  };

  const copyLink = async (s: ShareSummary) => {
    const msg = shareMessage(s.albumName, s.kind, s.url);
    try { await navigator.clipboard.writeText(msg); flash(setCopiedId, s.id); }
    catch { window.prompt('Copy this message', msg); }
  };

  /** Copy the client's final-pick filenames (one per line) for an editor. */
  const copyNames = async (s: ShareSummary) => {
    const text = s.final.join('\n');
    try { await navigator.clipboard.writeText(text); flash(setCopiedNamesId, s.id); }
    catch { window.prompt('Copy these filenames', text); }
  };

  const busyFor = (s: ShareSummary) =>
    (deliveryMut.isPending && deliveryMut.variables === s.id) ||
    (refreshMut.isPending && refreshMut.variables?.id === s.id) ||
    (revokeMut.isPending && revokeMut.variables === s.id);

  return {
    deliver: (s: ShareSummary) => deliveryMut.mutate(s.id),
    refresh: (s: ShareSummary) => refreshMut.mutate({ id: s.id, pid: newProgressId() }),
    revoke: (s: ShareSummary) => revokeMut.mutate(s.id),
    refreshing: (s: ShareSummary) => refreshMut.isPending && refreshMut.variables?.id === s.id,
    refreshProgress,
    revoking: revokeMut.isPending,
    busyFor,
    copyLink, copiedId,
    copyNames, copiedNamesId,
  };
}
