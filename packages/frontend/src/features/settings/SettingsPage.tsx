import { useAuthStore } from '@/stores/authStore';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// Phase 1: shows identity + version. FTP config and the camera-setup helper
// card are added here in Phase 4.
export function SettingsPage() {
  const { user, clear } = useAuthStore();

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-lg font-semibold">Settings</h1>

      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <Row label="Signed in as" value={user?.username ?? '—'} />
        <Row label="App version" value={__APP_VERSION__} />
      </div>

      <p className="mt-4 text-xs text-gray-500">
        FTP configuration and the camera-setup helper arrive in Phase 4.
      </p>

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
