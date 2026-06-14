import { useEffect, useState, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function PWAUpdatePrompt() {
  const [show, setShow] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registration.update();
      // Poll + check on focus/visibility so updates land quickly.
      setInterval(() => registration.update(), 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update();
      });
      window.addEventListener('focus', () => registration.update());
    },
  });

  useEffect(() => {
    if (needRefresh) setShow(true);
  }, [needRefresh]);

  const update = useCallback(() => updateServiceWorker(true), [updateServiceWorker]);
  const dismiss = useCallback(() => {
    setShow(false);
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  if (!show) return null;

  return (
    <div className="fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-[9999] sm:left-auto sm:right-4 sm:w-80">
      <div className="rounded-2xl bg-primary-600 p-4 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 text-sm font-semibold">Update available</h3>
            <p className="mb-3 text-xs text-white/80">A new version is ready.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={update}
                className="min-h-[40px] flex-1 rounded-lg bg-white text-xs font-semibold text-primary-600 hover:bg-white/90"
              >
                Update now
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="min-h-[40px] rounded-lg bg-white/20 px-4 text-xs font-semibold hover:bg-white/30"
              >
                Later
              </button>
            </div>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
