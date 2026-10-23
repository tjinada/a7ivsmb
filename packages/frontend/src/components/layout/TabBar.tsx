import { NavLink } from 'react-router-dom';
import { NAV, useNeedsYouCount } from './nav';

/** Phone navigation: the bottom tab bar. Hidden at md+ where SideNav takes over. */
export function TabBar() {
  const needsYou = useNeedsYouCount();

  return (
    <nav
      className="flex flex-shrink-0 border-t border-border bg-base md:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom) - 0.5rem, 0.25rem)' }}
    >
      {NAV.map(({ to, label, Icon }) => (
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
