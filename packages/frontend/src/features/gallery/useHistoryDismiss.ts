import { useEffect, useRef } from 'react';

/**
 * Makes the browser/Android back gesture dismiss an overlay (e.g. the
 * lightbox) instead of leaving the page or closing the PWA. While `open`,
 * one history entry is pushed; pressing back pops it and fires `onClose`.
 * Closing by other means (X button, backdrop tap, delete) consumes the
 * entry via history.back() so stale entries don't pile up.
 */
export function useHistoryDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    let poppedByGesture = false;
    window.history.pushState({ overlay: true }, '');
    const onPop = () => {
      poppedByGesture = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!poppedByGesture) window.history.back();
    };
  }, [open]);
}
