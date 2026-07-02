import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import type { ApiResponse, FtpStatus, FtpConfigView } from '@sonycam/shared';
import { api } from '@/api/client';

async function fetchStatus(): Promise<FtpStatus | null> {
  const res = await api.get<ApiResponse<FtpStatus>>('/ftp/status');
  return res.data.data ?? null;
}

async function fetchConfig(): Promise<FtpConfigView | null> {
  const res = await api.get<ApiResponse<FtpConfigView>>('/ftp/config');
  return res.data.data ?? null;
}

interface FormState {
  enabled: boolean;
  user: string;
  pass: string;       // blank = keep the current password
  externalIp: string;
}

function serverMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-xs last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-200">{value}</span>
    </div>
  );
}

/**
 * FTP receive settings + live status (Settings page). Editable fields are the
 * runtime-safe subset (enabled, username, password, external IP); the control
 * port and passive range are read-only because they must match the ports
 * published in docker-compose (.env + container recreate changes those).
 * Saving applies the config and restarts the FTP server immediately.
 */
export function FtpCard() {
  const qc = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['ftp-status'],
    queryFn: fetchStatus,
    refetchInterval: 15_000,
  });
  const configQuery = useQuery({ queryKey: ['ftp-config'], queryFn: fetchConfig });

  const [form, setForm] = useState<FormState | null>(null);
  useEffect(() => {
    const c = configQuery.data;
    if (c && form === null) {
      setForm({ enabled: c.enabled, user: c.user, pass: '', externalIp: c.externalIp });
    }
  }, [configQuery.data, form]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ftp-status'] });
    void qc.invalidateQueries({ queryKey: ['ftp-config'] });
  };

  const saveMut = useMutation({
    mutationFn: (f: FormState) =>
      api.put('/ftp/config', {
        enabled: f.enabled,
        user: f.user,
        externalIp: f.externalIp,
        ...(f.pass.length > 0 ? { pass: f.pass } : {}),
      }),
    onSuccess: () => {
      setForm((f) => (f ? { ...f, pass: '' } : f)); // password applied; clear the field
      invalidate();
    },
    onError: (err) => window.alert(serverMessage(err, 'Could not save the FTP settings')),
  });

  const restartMut = useMutation({
    mutationFn: () => api.post('/ftp/restart'),
    onSuccess: invalidate,
    onError: (err) => window.alert(serverMessage(err, 'Could not restart the FTP server')),
  });

  const restart = () => {
    const active = statusQuery.data?.activeConnections ?? 0;
    if (
      active > 0 &&
      !window.confirm(`The camera has ${active} active connection${active === 1 ? '' : 's'}. Restarting will drop any transfer in progress. Restart anyway?`)
    ) {
      return;
    }
    restartMut.mutate();
  };

  const save = () => {
    if (!form) return;
    if (form.enabled && !form.pass && !configQuery.data?.passSet) {
      window.alert('Set a password before enabling FTP');
      return;
    }
    saveMut.mutate(form);
  };

  const status = statusQuery.data;
  const cfg = configQuery.data;
  const busy = saveMut.isPending || restartMut.isPending;

  if (configQuery.isLoading || form === null) {
    return (
      <div className="mt-4 flex items-center justify-center rounded-xl border border-border bg-surface p-6 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-base px-3 py-2 text-sm outline-none focus:border-primary-500';

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-100">FTP receive</h2>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
            status?.listening ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/15 text-gray-300'
          }`}
        >
          {status?.listening ? 'Listening' : 'Stopped'}
        </span>
      </div>

      <div className="mb-4">
        <Row label="Port" value={String(cfg?.port ?? '—')} />
        <Row label="Passive range" value={cfg ? `${cfg.pasvMin}–${cfg.pasvMax}` : '—'} />
        <Row label="Active connections" value={String(status?.activeConnections ?? 0)} />
        <Row
          label="Last received"
          value={status?.lastReceived ? new Date(status.lastReceived).toLocaleString() : 'Never'}
        />
        <Row
          label="Last error"
          value={status?.lastErrorTime ? new Date(status.lastErrorTime).toLocaleString() : 'None'}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between text-sm text-gray-200">
          FTP receive enabled
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="h-4 w-4 accent-primary-600"
          />
        </label>

        <label className="text-xs text-gray-400">
          Username
          <input
            type="text"
            autoComplete="off"
            value={form.user}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <label className="text-xs text-gray-400">
          Password
          <input
            type="password"
            autoComplete="new-password"
            placeholder={cfg?.passSet ? 'Leave blank to keep the current password' : 'Required to enable FTP'}
            value={form.pass}
            onChange={(e) => setForm({ ...form, pass: e.target.value })}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <label className="text-xs text-gray-400">
          External IP advertised for passive mode
          <input
            type="text"
            autoComplete="off"
            placeholder="e.g. 192.168.0.243 (blank = auto)"
            value={form.externalIp}
            onChange={(e) => setForm({ ...form, externalIp: e.target.value })}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-primary-500 disabled:opacity-50"
          >
            {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save &amp; apply
          </button>
          <button
            type="button"
            onClick={restart}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-gray-200 transition hover:bg-base disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${restartMut.isPending ? 'animate-spin' : ''}`} />
            Restart FTP
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-gray-500">
          The port and passive range are set in <span className="text-gray-400">.env</span> and must match the
          ports published in docker-compose, so changing them needs a container recreate.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-base p-3">
        <p className="mb-1.5 text-xs font-semibold text-gray-200">Camera setup (A7 IV FTP transfer)</p>
        <p className="text-[11px] leading-relaxed text-gray-500">
          Server: <span className="text-gray-300">{form.externalIp || 'your Unraid LAN IP'}</span> &middot; Port:{' '}
          <span className="text-gray-300">{cfg?.port ?? 21}</span> &middot; User:{' '}
          <span className="text-gray-300">{form.user || '—'}</span> &middot; Password: the one saved here &middot;
          Passive mode: <span className="text-gray-300">ON</span> &middot; Secure protocol:{' '}
          <span className="text-gray-300">OFF</span> &middot; Destination folder: root. Files are auto-filed into
          dated JPG/RAW folders on arrival.
        </p>
      </div>
    </div>
  );
}
