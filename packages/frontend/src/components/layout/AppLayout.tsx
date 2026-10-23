import type { ReactNode } from 'react';
import { useAppConfig } from '@/lib/useAppConfig';
import { TabBar } from './TabBar';

/** The amber aperture mark used on the client page and the OG card. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block flex-none rounded-full border-2 border-primary-500"
      style={{ width: size, height: size }}
    >
      <span className="absolute rounded-full bg-primary-500" style={{ inset: Math.round(size * 0.22) }} />
    </span>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { brandName } = useAppConfig();

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <header
        className="flex flex-shrink-0 items-center gap-2.5 border-b border-border bg-base px-4 py-2.5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}
      >
        <BrandMark />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">{brandName}</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      <TabBar />
    </div>
  );
}
