import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, Loader2, ArrowRight } from 'lucide-react';
import type { ApiResponse, BackfillScanResult, BackfillApplyResult } from '@sonycam/shared';
import { api } from '@/api/client';

/**
 * Re-file misdated photos in one folder by their EXIF capture date. Runs a
 * dry-run scan on open and shows the exact moves; nothing is written until the
 * owner confirms. Scope is whatever folder they launched it from.
 */
export function BackfillDialog({
  path,
  folderLabel,
  onApplied,
  onClose,
}: {
  path: string;
  folderLabel: string;
  onApplied: () => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<BackfillApplyResult | null>(null);

  const scanMut = useMutation({
    mutationFn: () => api.post<ApiResponse<BackfillScanResult>>('/gallery/backfill/scan', { path }),
    onError: () => window.alert('Could not scan this folder'),
  });
  const applyMut = useMutation({
    mutationFn: () => api.post<ApiResponse<BackfillApplyResult>>('/gallery/backfill/apply', { path }),
    onSuccess: (res) => {
      setResult(res.data.data ?? { moved: 0, skipped: 0, failed: 0 });
      onApplied();
    },
    onError: () => window.alert('Could not move the files'),
  });

  // Kick off the dry-run once when the dialog mounts.
  useEffect(() => {
    scanMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scan = scanMut.data?.data.data;
  const busy = scanMut.isPending || applyMut.isPending;

  return (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={busy ? undefined : onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-5 py-3.5">
          <CalendarClock className="h-4 w-4 text-primary-500" />
          <h3 className="text-base font-semibold text-gray-100">Re-file by date</h3>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-xs text-gray-500">
            Scanning <span className="text-gray-300">{folderLabel}</span> for photos whose folder date doesn&rsquo;t
            match their capture date. Your originals&rsquo; contents aren&rsquo;t altered &mdash; only which dated
            folder they live in.
          </p>

          {scanMut.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Scanning&hellip;
            </div>
          ) : result ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-gray-200">
              Moved <span className="font-semibold text-emerald-300">{result.moved}</span>
              {result.skipped > 0 && <> &middot; skipped {result.skipped} (name already existed)</>}
              {result.failed > 0 && <> &middot; {result.failed} failed</>}.
            </div>
          ) : scan ? (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Scanned" value={scan.scanned} />
                <Stat label="To move" value={scan.toMove} accent={scan.toMove > 0} />
                <Stat label="Correct" value={scan.alreadyCorrect} />
              </div>
              {scan.unreadable > 0 && (
                <p className="mb-3 text-[11px] text-amber-400/90">
                  {scan.unreadable} photo{scan.unreadable === 1 ? '' : 's'} had no readable capture date and will be
                  left as-is.
                </p>
              )}
              {scan.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  Nothing to re-file &mdash; every photo here is already in the right dated folder.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {scan.rows.slice(0, 200).map((r) => (
                    <li key={r.from} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-gray-200">{r.name}</span>
                      <span className="flex flex-shrink-0 items-center gap-1.5 text-gray-500">
                        <span>{r.folderDate}</span>
                        <ArrowRight className="h-3 w-3 text-primary-500" />
                        <span className="font-medium text-primary-300">{r.captureDate}</span>
                      </span>
                    </li>
                  ))}
                  {scan.rows.length > 200 && (
                    <li className="px-3 py-2 text-center text-[11px] text-gray-500">
                      &hellip;and {scan.rows.length - 200} more
                    </li>
                  )}
                </ul>
              )}
            </>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-gray-200 transition hover:bg-base disabled:opacity-60"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && scan && scan.rows.length > 0 && (
            <button
              type="button"
              onClick={() => applyMut.mutate()}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50"
            >
              {applyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Move {scan.toMove} file{scan.toMove === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-base py-2">
      <p className={`text-lg font-semibold ${accent ? 'text-primary-300' : 'text-gray-100'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
    </div>
  );
}
