import { useCallback, useEffect, useState } from 'react';
import type { GalleryItem } from '@sonycam/shared';

/** Every modal the gallery can show. At most one is open at a time. */
export type GalleryDialog =
  | { kind: 'none' }
  | { kind: 'delete'; items: GalleryItem[] }
  | { kind: 'cleanup' }
  | { kind: 'album'; source: 'selection' | 'starred' }
  | { kind: 'shareCreate' }
  | { kind: 'rename' }
  | { kind: 'deleteAlbum' }
  | { kind: 'backfill' }
  | { kind: 'deleteFolder' };

const NONE: GalleryDialog = { kind: 'none' };

/**
 * One piece of state for all gallery modals, instead of a boolean per dialog.
 * Any change of folder or view closes whatever is open.
 */
export function useGalleryDialogs(resetKeys: unknown[]) {
  const [dialog, setDialog] = useState<GalleryDialog>(NONE);
  const close = useCallback(() => setDialog(NONE), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDialog(NONE); }, resetKeys);
  return { dialog, open: setDialog, close };
}
