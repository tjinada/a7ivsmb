import { NavLink } from 'react-router-dom';
import { Images, Download, Settings, type LucideIcon } from 'lucide-react';

const tabs: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/gallery', label: 'Gallery', Icon: Images },
  { to: '/transfers', label: 'Transfers', Icon: Download },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

export function TabBar() {
  return (
    <nav
      className="flex flex-shrink-0 border-t border-border bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs touch-manipulation select-none ${
              isActive ? 'text-primary-500' : 'text-gray-400 hover:text-gray-200'
            }`
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
