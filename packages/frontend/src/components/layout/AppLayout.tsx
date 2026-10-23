import type { ReactNode } from 'react';
import { useAppConfig } from '@/lib/useAppConfig';
import { BrandMark } from './BrandMark';
import { SideNav } from './SideNav';
import { TabBar } from './TabBar';

export { BrandMark } from './BrandMark';

/**
 * App chrome. Phones: brand header on top, tab bar at the bottom. Desktop
 * (md+): a sidebar on the left carries the brand and the navigation, and the
 * header and tab bar are hidden.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { brandName } = useAppConfig();

  return (
    <div className="flex md:flex-row" style={{ height: '100dvh' }}>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex flex-shrink-0 items-center gap-2.5 border-b border-border bg-base px-4 py-2.5 md:hidden"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}
        >
          <BrandMark />
          <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">{brandName}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <TabBar />
      </div>
    </div>
  );
}
