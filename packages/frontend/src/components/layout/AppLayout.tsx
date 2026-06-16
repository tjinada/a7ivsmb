import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/api/client';
import { TabBar } from './TabBar';

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, clear } = useAuthStore();

  const signOut = () => {
    // Best-effort: clear the server-set media cookie, then drop local tokens.
    api.post('/auth/logout').catch(() => {});
    clear();
  };

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <header
        className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <span className="font-semibold">Sony Transfer</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{user?.username}</span>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-border"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      <TabBar />
    </div>
  );
}