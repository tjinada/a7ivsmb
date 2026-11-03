import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2, Copy, Check, ExternalLink } from 'lucide-react';
import type { ApiResponse, ShareCreateResult, ShareKind } from '@sonycam/shared';
import { api } from '@/api/client';
import { newProgressId, useShareProgress } from './useShareProgress';
import { shareMessage } from './shareMessage';
import { useBrowse } from './api';
import { AuthImage } from './AuthImage';
import { thumbUrl } from './mediaUrl';

/** The server's order for a link's photos (natural, case-insensitive). */
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

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
  const [kind, setKind] = useState<ShareKind>('proofing');
  const [cap, setCap] = useState(30);
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<ShareCreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [progressId, setProgressId] = useState<string | null>(null);
  // Cover for a Download all link: null = the first photo (the default).
  const [hero, setHero] = useState<string | null>(null);
  const [pickingCover, setPickingCover] = useState(false);
  const edited = useBrowse(`${albumPath}/Edited`, kind === 'delivery', { retry: false });
  const editedNames = useMemo(
    () => (edited.data?.items ?? [])
      .map((it) => it.name)
      .filter((n) => !n.startsWith('.') && /\.jpe?g$/i.test(n))
      .sort(byName),
    [edited.data],
  );
  const cover = hero ?? editedNames[0];

  const createMut = useMutation({
    mutationFn: async (pid: string): Promise<ShareCreateResult> => {
      const res = await api.post<ApiResponse<ShareCreateResult>>('/gallery/shares', {
        albumPath,
        cap,
        password,
        progressId: pid,
        kind,
        ...(kind === 'delivery' && hero ? { hero } : {}),
      });
      if (!res.data.data) throw new Error('Unexpected response');
      return res.data.data;
    },
    onSuccess: (data) => {
      setCreated(data);
      qc.invalidateQueries({ queryKey: ['shares'] });
    },
  });

  const progress = useShareProgress(progressId, createMut.isPending).data;

  const copyLink = async () => {
    if (!created) return;
    const msg = shareMessage(created.albumName, created.kind, created.url);
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this message', msg);
    }
  };

  const capValid = Number.isFinite(cap) && cap >= 1 && cap <= 1000;
  const canCreate = (kind === 'delivery' || capValid) && password.trim().length >= 4 && !createMut.isPending;
  const errorMsg =
    createMut.error instanceof Error
      ? ((createMut.error as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Could not create the share')
      : null;

  return (
    <div
      className="fixed inset-x-0 top-[var(--vv-top,0px)] z-[10001] flex h-[var(--vv-height,100dvh)] overflow-y-auto bg-black/70 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]"
      onClick={createMut.isPending ? undefined : onClose}
    >
      <div
        className="m-auto w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-100">
          <Share2 className="h-4 w-4 text-primary-500" />
          {created ? 'Share is live' : 'Share with client'}
        </h3>

        {!created ? (
          <>
            <p className="mt-1 text-sm text-gray-400">
              {kind === 'proofing' ? (
                <>
                  Creates a private link for <span className="text-gray-300">{albumName}</span>. Your client sees
                  watermarked previews of the <span className="text-gray-300">Edited</span> photos and picks their
                  favourites.
                </>
              ) : (
                <>
                  Creates a private link for <span className="text-gray-300">{albumName}</span>. Your client can
                  view and download every <span className="text-gray-300">Edited</span> photo right away — no
                  picking, no watermarks.
                </>
              )}
            </p>

            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Share type
            </p>
            <div className="flex overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setKind('proofing')}
                className={`flex-1 py-2 text-sm transition ${kind === 'proofing' ? 'bg-primary-600 font-medium text-on-accent' : 'bg-base text-gray-300 hover:bg-border'}`}
              >
                Client picks
              </button>
              <button
                type="button"
                onClick={() => setKind('delivery')}
                className={`flex-1 py-2 text-sm transition ${kind === 'delivery' ? 'bg-primary-600 font-medium text-on-accent' : 'bg-base text-gray-300 hover:bg-border'}`}
              >
                Download all
              </button>
            </div>

            {kind === 'proofing' && (
              <>
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
              </>
            )}

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

            {kind === 'delivery' && cover && (
              <>
                <div className="mb-1.5 mt-4 flex items-baseline justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Cover photo</p>
                  {pickingCover && hero && (
                    <button type="button" onClick={() => setHero(null)} className="text-xs font-medium text-primary-400 hover:text-primary-300">
                      Use first photo
                    </button>
                  )}
                </div>
                {!pickingCover ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-base p-2">
                    <AuthImage src={thumbUrl(`${albumPath}/Edited/${cover}`)} alt="" className="h-14 w-14 flex-none overflow-hidden rounded-md bg-surface" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-gray-200">{hero ?? 'First photo'}</p>
                      <p className="text-xs text-gray-500">{hero ? 'Shown at the top of their gallery' : 'Default · shown at the top of their gallery'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickingCover(true)}
                      disabled={createMut.isPending}
                      className="flex-none rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-gray-200 transition hover:bg-border disabled:opacity-50"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
                      {editedNames.map((n) => {
                        const on = n === cover;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setHero(n === editedNames[0] ? null : n)}
                            disabled={createMut.isPending}
                            aria-label={`Use ${n} as the cover`}
                            aria-pressed={on}
                            className={`relative aspect-square overflow-hidden rounded-md ${on ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-surface' : ''}`}
                          >
                            <AuthImage src={thumbUrl(`${albumPath}/Edited/${n}`)} alt="" className="h-full w-full bg-base" />
                            {on && (
                              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500">
                                <Check className="h-3 w-3 text-on-accent" strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {hero ? 'This photo will be the banner on their gallery.' : 'First photo (default). Tap another to use it instead.'}
                    </p>
                  </>
                )}
              </>
            )}

            {errorMsg && <p className="mt-3 text-sm text-red-400">{errorMsg}</p>}

            {createMut.isPending && (
              <div className="mt-4">
                <p className="text-xs text-gray-400">
                  {progress && progress.total > 0
                    ? `Generating previews… ${progress.done} / ${progress.total}`
                    : 'Preparing…'}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-[width] duration-300"
                    style={{
                      width:
                        progress && progress.total > 0
                          ? `${Math.round((progress.done / progress.total) * 100)}%`
                          : '4%',
                    }}
                  />
                </div>
              </div>
            )}

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
                onClick={() => {
                  const pid = newProgressId();
                  setProgressId(pid);
                  createMut.mutate(pid);
                }}
                disabled={!canCreate}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-medium text-on-accent transition hover:bg-primary-500 disabled:opacity-40"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Create link
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-400">
              {created.kind === 'delivery'
                ? 'Send your client the link and the password. They can download everything right away.'
                : 'Send your client the link and the password. They can start choosing right away.'}
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-base p-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{created.url}</span>
              <button
                type="button"
                onClick={copyLink}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-on-accent transition hover:bg-primary-500"
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
              href={`${created.url}?preview`}
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
              className="mt-5 w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-on-accent transition hover:bg-primary-500"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
