import { Images, Share2, Download, Settings, type LucideIcon } from 'lucide-react';
import { useShares } from '@/features/gallery/api';
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
  { to: '/shares', label: 'Shares', Icon: Share2 },
  { to: '/transfers', label: 'Transfers', Icon: Download },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

/** Submitted shares are the ones waiting on you: that's the Shares badge. */
export function useNeedsYouCount(): number {
  const token = useAuthStore((s) => s.token);
  const shares = useShares(!!token).data ?? [];
  return shares.filter((s) => s.phase === 'submitted').length;
}
