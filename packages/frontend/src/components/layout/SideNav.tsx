import { NavLink } from 'react-router-dom';
import { useAppConfig } from '@/lib/useAppConfig';
import { useFtpStatus } from '@/features/transfers/useFtpStatus';
import { BrandMark } from './BrandMark';
import { NAV, useNavBadges } from './nav';

/**
 * Desktop navigation: a fixed-width sidebar with the brand, the sections, the
 * Jobs/Shares badges, and the FTP receiver's state at the foot. Rendered at md+ only;
 * phones get the TabBar.
 */
export function SideNav() {
  const { brandName } = useAppConfig();
  const badges = useNavBadges();
  const status = useFtpStatus().data;
  const ftp = !status
    ? { dot: 'bg-gray-600', text: 'FTP status unknown' }
    : !status.enabled ? { dot: 'bg-gray-500', text: 'FTP receiver off' }
      : status.listening ? { dot: 'bg-emerald-400', text: `FTP listening${status.externalIp ? ` · ${status.externalIp}` : ''}` }
        : { dot: 'bg-amber-400', text: 'FTP not listening' };

  return (
    <aside className="hidden w-[220px] flex-none flex-col border-r border-border bg-base px-3.5 py-6 md:flex">
      <div className="flex items-center gap-2.5 px-2.5 pb-6">
        <BrandMark />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">{brandName}</span>
      </div>

      <nav className="flex flex-col gap-1.5">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-sm transition ${
                isActive ? 'bg-primary-500/[0.12] font-semibold text-primary-500' : 'font-medium text-gray-100 hover:bg-surface'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
            {(badges[to] ?? 0) > 0 && (
              <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[11px] font-bold text-on-accent">
                {badges[to]}
              </span>
            )}
            {to === '/transfers' && status?.activeConnections ? (
              <span className="ml-auto text-[11px] font-semibold text-emerald-400">{status.activeConnections} live</span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 px-2.5 text-[11px] text-gray-500">
        <span className={`h-2 w-2 flex-none rounded-full ${ftp.dot} ${status?.listening ? 'animate-pulse' : ''}`} />
        <span className="truncate">{ftp.text}</span>
      </div>
    </aside>
  );
}
