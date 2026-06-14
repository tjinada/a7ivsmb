import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Shows a small install card when the browser offers installation
 * (Chrome/Edge/Android fire `beforeinstallprompt`). Hidden once installed
 * or dismissed. iOS Safari doesn't fire the event, so nothing shows there.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show || !deferred) return null;

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  };

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[9998] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-600">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install Sony Transfer</p>
          <p className="text-xs text-gray-400">Add it to your home screen for quick access.</p>
        </div>
        <button type="button" onClick={install} className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700">
          Install
        </button>
        <button type="button" onClick={() => setShow(false)} aria-label="Dismiss" className="text-gray-500 hover:text-gray-300">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
