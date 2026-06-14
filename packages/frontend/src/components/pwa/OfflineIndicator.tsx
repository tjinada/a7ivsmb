import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Thin banner shown when the browser goes offline. The gallery and transfer
 * views need a live connection to the server, so it's worth surfacing
 * clearly rather than letting requests silently fail.
 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 bg-amber-600 py-1.5 text-xs font-medium text-white">
      <WifiOff className="h-3.5 w-3.5" />
      You&rsquo;re offline — photos need a connection
    </div>
  );
}
