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
  const [coverSavedId, setCoverSavedId] = useState<string | null>(null);
  const coverMut = useMutation({
    mutationFn: ({ id, file, focus }: { id: string; file: string | null; focus?: { x: number; y: number } }) =>
      api.post(`/gallery/shares/${id}/hero`, { file, ...(focus ? { focus } : {}) }),
    onSuccess: (_d, v) => { void invalidate(); flash(setCoverSavedId, v.id); },
    onError: () => toast.error('Could not change the cover photo'),
  });
  const [expirySavedId, setExpirySavedId] = useState<string | null>(null);
  const expiryMut = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number | null }) => api.post(`/gallery/shares/${id}/expiry`, { days }),
    onSuccess: (_d, v) => { void invalidate(); flash(setExpirySavedId, v.id); },
    onError: () => toast.error('Could not change the expiry'),
  });
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
    /** Set the delivery page cover (null = the first delivered photo) and,
     *  optionally, where its crop centres (percent). */
    setCover: (s: ShareSummary, file: string | null, focus?: { x: number; y: number }) =>
      coverMut.mutate({ id: s.id, file, focus }),
    coverSavedId,
    /** Make the link last `days` from today (null = never). */
    setExpiry: (s: ShareSummary, days: number | null) => expiryMut.mutate({ id: s.id, days }),
    expirySavedId,
    expiryPending: (s: ShareSummary) => expiryMut.isPending && expiryMut.variables?.id === s.id,
    refreshing: (s: ShareSummary) => refreshMut.isPending && refreshMut.variables?.id === s.id,
    refreshProgress,
    revoking: revokeMut.isPending,
    busyFor,
    copyLink, copiedId,
    copyNames, copiedNamesId,
  };
}
