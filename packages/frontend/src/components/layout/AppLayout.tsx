import type { ReactNode } from 'react';
import { SideNav } from './SideNav';
import { TabBar } from './TabBar';

export { BrandMark } from './BrandMark';

/**
 * App chrome. Phones: content with the tab bar at the bottom (no brand header,
 * to leave the screen to the photos). Desktop (md+): a sidebar on the left
 * carries the brand and the navigation, and the tab bar is hidden.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex md:flex-row" style={{ height: '100dvh' }}>
      <SideNav />
      {/* The column clears the status bar itself now that no header does. */}
      <div className="flex min-w-0 flex-1 flex-col bg-base" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <TabBar />
      </div>
    </div>
  );
}
