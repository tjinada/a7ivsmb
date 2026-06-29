import { JsonStore } from '../../store/jsonStore.js';
import type { SharePhase } from '@sonycam/shared';

/**
 * Server-side record for one client share. Includes the password hash, so this
 * type stays backend-only (never sent to a client). Persisted in
 * DATA_DIR/shares.json as an id -> record map, mirroring ratings.json. The
 * watermarked previews themselves live in DATA_DIR/shares/<id>/previews/.
 */
export interface ShareRecord {
  id: string;               // internal id; also the preview folder name
  slug: string;             // public URL token
  albumName: string;
  albumPath: string;        // share-relative, e.g. "Albums/June Wedding"
  cap: number;              // max selections
  passwordSalt: string;     // hex (scrypt)
  passwordHash: string;     // hex (scrypt)
  phase: SharePhase;
  items: string[];          // edited JPG filenames published as previews
  selections: string[];     // client's picks (subset of items)
  createdAt: number;        // epoch ms
  submittedAt: number | null;
}

type Shares = Record<string, ShareRecord>;

const store = new JsonStore<Shares>('shares.json', {});
let loaded = false;

export async function loadShares(): Promise<void> {
  if (!loaded) {
    await store.load();
    loaded = true;
  }
}

/** All shares, newest first. */
export function listShares(): ShareRecord[] {
  return Object.values(store.get()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getShareById(id: string): ShareRecord | null {
  return store.get()[id] ?? null;
}

export function getShareBySlug(slug: string): ShareRecord | null {
  return Object.values(store.get()).find((s) => s.slug === slug) ?? null;
}

/** Insert or replace a share record. */
export async function putShare(rec: ShareRecord): Promise<void> {
  await store.update((cur) => ({ ...cur, [rec.id]: rec }));
}

/** Delete a share record (previews are removed separately by the service). */
export async function deleteShare(id: string): Promise<void> {
  await store.update((cur) => {
    if (!(id in cur)) return cur;
    const next = { ...cur };
    delete next[id];
    return next;
  });
}
