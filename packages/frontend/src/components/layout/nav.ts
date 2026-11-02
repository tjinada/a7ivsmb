import { Images, Share2, Download, Settings, type LucideIcon } from 'lucide-react';
import { useShares } from '@/features/gallery/api';
import { useAuthStore } from '@/stores/authStore';

export interface NavItem {
  to: string;
  label: string;
  /** Tab-bar label where the full one won't fit on a phone. */
  short?: string;
  Icon: LucideIcon;
}

/** The app's top-level sections, in order. Shared by the phone tab bar and
 *  the desktop sidebar so they can never drift apart. (Client links are
 *  "shares" in the code and API.) */
export const NAV: NavItem[] = [
  { to: '/gallery', label: 'Gallery', Icon: Images },
  { to: '/clients', label: 'Shared with clients', short: 'Clients', Icon: Share2 },
  { to: '/transfers', label: 'Transfers', Icon: Download },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** Badge count per section: clients whose picks are in. A section missing from the map has no badge. */
export function useNavBadges(): Record<string, number> {
  const token = useAuthStore((s) => s.token);
  const shares = useShares(!!token).data ?? [];
  return {
    '/clients': shares.filter((s) => s.phase === 'submitted').length,
  };
}
