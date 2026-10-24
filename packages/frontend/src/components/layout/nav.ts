import { Images, ListChecks, Share2, Download, Settings, type LucideIcon } from 'lucide-react';
import { useShares } from '@/features/gallery/api';
import { useJobs, needsOwner } from '@/features/jobs/api';
import { useAuthStore } from '@/stores/authStore';

export interface NavItem {
  to: string;
  label: string;
  /** Tab-bar label where the full one won't fit on a phone. */
  short?: string;
  Icon: LucideIcon;
}

/** The app's top-level sections, in order. Shared by the phone tab bar and
 *  the desktop sidebar so they can never drift apart. (Shoots are "jobs" in
 *  the code and API; client links are "shares".) */
export const NAV: NavItem[] = [
  { to: '/gallery', label: 'Gallery', Icon: Images },
  { to: '/shoots', label: 'Shoots', Icon: ListChecks },
  { to: '/clients', label: 'Shared with clients', short: 'Clients', Icon: Share2 },
  { to: '/transfers', label: 'Transfers', Icon: Download },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** Badge count per section: shoots waiting on you (not on the client), and
 *  clients whose picks are in. A section missing from the map has no badge. */
export function useNavBadges(): Record<string, number> {
  const token = useAuthStore((s) => s.token);
  const shares = useShares(!!token).data ?? [];
  const jobs = useJobs(!!token).data ?? [];
  return {
    '/shoots': jobs.filter(needsOwner).length,
    '/clients': shares.filter((s) => s.phase === 'submitted').length,
  };
}
