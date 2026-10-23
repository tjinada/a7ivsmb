import { Images, ListChecks, Share2, Download, Settings, type LucideIcon } from 'lucide-react';
import { useShares } from '@/features/gallery/api';
import { useJobs, needsOwner } from '@/features/jobs/api';
import { useAuthStore } from '@/stores/authStore';

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

/** The app's top-level sections, in order. Shared by the phone tab bar and
 *  the desktop sidebar so they can never drift apart. */
export const NAV: NavItem[] = [
  { to: '/gallery', label: 'Gallery', Icon: Images },
  { to: '/jobs', label: 'Jobs', Icon: ListChecks },
  { to: '/shares', label: 'Shares', Icon: Share2 },
  { to: '/transfers', label: 'Transfers', Icon: Download },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** Badge count per section: jobs waiting on you (not on the client), and
 *  submitted shares. A section missing from the map has no badge. */
export function useNavBadges(): Record<string, number> {
  const token = useAuthStore((s) => s.token);
  const shares = useShares(!!token).data ?? [];
  const jobs = useJobs(!!token).data ?? [];
  return {
    '/jobs': jobs.filter(needsOwner).length,
    '/shares': shares.filter((s) => s.phase === 'submitted').length,
  };
}
