import { NavLink } from 'react-router-dom';
import { Images, Share2, Download, Settings, type LucideIcon } from 'lucide-react';
import { useShares } from '@/features/gallery/api';
import { useAuthStore } from '@/stores/authStore';

const tabs: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/gallery', label: 'Gallery', Icon: Images },
  { to: '/shares', label: 'Shares', Icon: Share2 },
  { to: '/transfers', label: 'Transfers', Icon: Download },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

export function TabBar() {
  const token = useAuthStore((s) => s.token);
  // Submitted shares are the ones waiting on you: badge the tab.
  const shares = useShares(!!token).data ?? [];
  const needsYou = shares.filter((s) => s.phase === 'submitted').length;

  return (
    <nav
      className="flex flex-shrink-0 border-t border-border bg-base"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom) - 0.5rem, 0.25rem)' }}
    >
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation select-none ${
              isActive ? 'text-primary-500' : 'text-gray-400 hover:text-gray-200'
            }`
          }
        >
          <Icon className="h-5 w-5" />
          {label}
          {to === '/shares' && needsYou > 0 && (
            <span className="absolute left-[calc(50%+6px)] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[11px] font-bold text-on-accent">
              {needsYou}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
