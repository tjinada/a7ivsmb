import type { ShareKind } from '@sonycam/shared';

/**
 * Ready-to-paste client message for a share link. Kept short so it drops
 * cleanly into WhatsApp/iMessage; the owner adds the password (and any
 * personal note) themselves before sending.
 */
export function shareMessage(albumName: string, kind: ShareKind, url: string): string {
  return kind === 'delivery'
    ? `Your photos from ${albumName} are ready to view and download: ${url}`
    : `Your photos from ${albumName} are ready! View them and pick your favourites here: ${url}`;
}
