import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2, Copy, Check, ExternalLink } from 'lucide-react';
import type { ApiResponse, ShareCreateResult } from '@sonycam/shared';
import { api } from '@/api/client';

/**
 * Create a password-protected client proofing link from an album. The link
 * shares the album's Edited/ JPGs as watermarked previews; the client picks up
 * to `cap` favourites, then (after you release delivery) downloads the full-res
 * edits. On success the dialog shows the link to copy.
 */
export function ShareDialog({
  albumPath,
  albumName,
  onClose,
}: {
  albumPath: string;
  albumName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [cap, setCap] = useState(30);
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<ShareCreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    mutationFn: async (): Promise<ShareCreateResult> => {
      const res = await api.post<ApiResponse<ShareCreateResult>>('/gallery/shares', {
        albumPath,
        cap,
        password,
      });
      if (!res.data.data) throw new Error('Unexpected response');
      return res.data.data;
    },
    onSuccess: (data) => {
      setCreated(data);
      qc.invalidateQueries({ queryKey: ['shares'] });
    },
  });

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', created.url);
    }
  };

  const capValid = Number.isFinite(cap) && cap >= 1 && cap <= 1000;
  const canCreate = capValid && password.trim().length >= 4 && !createMut.isPending;
  const errorMsg =
    createMut.error instanceof Error
      ? ((createMut.error as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Could not create the share')
      : null;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-6"
      onClick={createMut.isPending ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-100">
          <Share2 className="h-4 w-4 text-primary-500" />
          {created ? 'Share is live' : 'Share with client'}
        </h3>

        {!created ? (
          <>
            <p className="mt-1 text-sm text-gray-400">
              Creates a private link for <span className="text-gray-300">{albumName}</span>. Your client sees
              watermarked previews of the <span className="text-gray-300">Edited</span> photos and picks their
              favourites.
            </p>

            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Max selections
            </p>
            <input
              type="number"
              min={1}
              max={1000}
              value={Number.isFinite(cap) ? cap : ''}
              onChange={(e) => setCap(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-gray-100 outline-none focus:border-primary-500"
            />

            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Password <span className="normal-case text-gray-600">(give this to your client)</span>
            </p>
            <input
              type="text"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-primary-500"
            />

            {errorMsg && <p className="mt-3 text-sm text-red-400">{errorMsg}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={createMut.isPending}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-gray-200 transition hover:bg-border disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMut.mutate()}
                disabled={!canCreate}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-40"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Create link
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-400">
              Send your client the link and the password. They can start choosing right away.
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-base p-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{created.url}</span>
              <button
                type="button"
                onClick={copyLink}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-base px-3 py-2 text-sm">
              <span className="text-gray-500">Password</span>
              <span className="font-mono text-gray-200">{password}</span>
            </div>

            <a
              href={created.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 text-xs text-primary-400 transition hover:text-primary-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open the client view
            </a>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-white transition hover:bg-primary-500"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
