import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import type { ApiResponse, FtpStatus, TransferEvent, GalleryItem } from '@sonycam/shared';
import { api } from '@/api/client';
import { AuthImage } from '../gallery/AuthImage';
import { Lightbox } from '../gallery/Lightbox';

const RAW_EXTS = ['.arw', '.dng', '.cr2', '.cr3', '.nef', '.raf', '.rw2', '.orf', '.srw', '.pef', '.sr2', '.x3f'];
const isRaw = (name: string) => RAW_EXTS.some((e) => name.toLowerCase().endsWith(e));

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function fetchStatus(): Promise<FtpStatus> {
  const res = await api.get<ApiResponse<FtpStatus>>('/ftp/status');
  if (!res.data.data) throw new Error('No status');
  return res.data.data;
}

async function fetchTransfers(): Promise<TransferEvent[]> {
  const res = await api.get<ApiResponse<TransferEvent[]>>('/ftp/transfers');
  return res.data.data ?? [];
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="truncate font-medium text-gray-200">{value}</span>
    </div>
  );
}

function StatusCard({ status }: { status?: FtpStatus }) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking FTP receiver&hellip;
      </div>
    );
  }

  const state = !status.enabled ? 'disabled' : status.listening ? 'listening' : 'stopped';
  const dot =
    state === 'listening' ? 'bg-green-500' : state === 'stopped' ? 'bg-amber-500' : 'bg-gray-500';
  const label =
    state === 'listening' ? 'Listening for transfers' : state === 'stopped' ? 'Not listening' : 'Receiver disabled';

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot} ${state === 'listening' ? 'animate-pulse' : ''}`} />
        <span className="font-medium text-gray-100">{label}</span>
        {status.activeConnections > 0 && (
          <span className="ml-auto rounded-full bg-primary-500/15 px-2 py-0.5 text-[11px] font-medium text-primary-400">
            {status.activeConnections} connected
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        <StatusRow label="Port" value={String(status.port)} />
        <StatusRow label="Passive" value={`${status.pasvMin}\u2013${status.pasvMax}`} />
        <StatusRow label="External IP" value={status.externalIp ?? '\u2014'} />
        <StatusRow label="User" value={status.user} />
        <StatusRow label="FTPS" value={status.ftps ? 'On' : 'Off'} />
        <StatusRow label="Last received" value={status.lastReceived ? fmtAgo(status.lastReceived) : 'Never'} />
      </div>
    </div>
  );
}

export function TransfersPage() {
  const [active, setActive] = useState<GalleryItem | null>(null);

  const { data: status } = useQuery({
    queryKey: ['ftp', 'status'],
    queryFn: fetchStatus,
    refetchInterval: 4000,
  });
  const { data: transfers, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ftp', 'transfers'],
    queryFn: fetchTransfers,
    refetchInterval: 4000,
  });

  const open = (t: TransferEvent) =>
    setActive({
      path: t.relPath,
      name: t.name,
      size: t.size,
      modified: t.time,
      kind: isRaw(t.name) ? 'raw' : 'image',
      rating: 0,
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b border-border bg-base p-3">
        <StatusCard status={status} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Recent arrivals</h2>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !transfers || transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-gray-400">
            <Download className="h-8 w-8 text-gray-600" />
            <p className="text-sm">No transfers yet.</p>
            <p className="max-w-xs text-xs text-gray-500">Send photos from the camera over FTP &mdash; they&rsquo;ll show up here as they arrive.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transfers.map((t) => (
              <button
                key={`${t.path}-${t.time}`}
                type="button"
                onClick={() => open(t)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2 text-left transition hover:border-primary-500/50 active:scale-[0.99]"
              >
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-base">
                  <AuthImage
                    src={`/gallery/thumb?path=${encodeURIComponent(t.relPath)}`}
                    alt={t.name}
                    className="h-full w-full"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center text-gray-600">
                        <Download className="h-4 w-4" />
                      </div>
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-100">{t.name}</p>
                  <p className="truncate text-[11px] text-gray-500">
                    {fmtBytes(t.size)} &middot; {fmtAgo(t.time)} &middot; {t.clientIp}
                  </p>
                </div>
                {isRaw(t.name) && (
                  <span className="flex-shrink-0 rounded bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary-400">
                    RAW
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {active && <Lightbox photo={active} onClose={() => setActive(null)} />}
    </div>
  );
}
