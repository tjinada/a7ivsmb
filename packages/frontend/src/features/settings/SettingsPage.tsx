import { useAuthStore } from '@/stores/authStore';
import { FtpCard } from './FtpCard';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { user, clear } = useAuthStore();

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-lg font-semibold">Settings</h1>

      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <Row label="Signed in as" value={user?.username ?? '—'} />
        <Row label="App version" value={__APP_VERSION__} />
      </div>

      <FtpCard />

      <button
        type="button"
        onClick={clear}
        className="mt-6 w-full rounded-lg border border-border py-2.5 text-sm text-gray-200 transition-colors hover:border-primary-500"
      >
        Sign out
      </button>
    </div>
  );
}
