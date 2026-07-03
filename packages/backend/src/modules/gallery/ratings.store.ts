import { JsonStore } from '../../store/jsonStore.js';

/** Map of share-relative POSIX path -> star rating (1..5). Unrated keys are
 *  simply absent. Stored in data/ratings.json, separate from the photo files
 *  so originals are never modified. */
type Ratings = Record<string, number>;

const store = new JsonStore<Ratings>('ratings.json', {});
let loaded = false;

export async function loadRatings(): Promise<void> {
  if (!loaded) {
    await store.load();
    loaded = true;
  }
}

export function getRating(relPath: string): number {
  return store.get()[relPath] ?? 0;
}

/** Set (1..5) or clear (<=0) a rating. Returns the persisted value (0 = cleared). */
export async function setRating(relPath: string, stars: number): Promise<number> {
  const clamped = Math.min(5, Math.max(0, Math.round(stars)));
  await store.update((cur) => {
    const next = { ...cur };
    if (clamped <= 0) delete next[relPath];
    else next[relPath] = clamped;
    return next;
  });
  return clamped;
}

/** Remove every rating whose key starts with `prefix` (album delete). */
export async function removeRatingsByPrefix(prefix: string): Promise<void> {
  await store.update((cur) => {
    let changed = false;
    const next: Ratings = {};
    for (const [k, v] of Object.entries(cur)) {
      if (k.startsWith(prefix)) changed = true;
      else next[k] = v;
    }
    return changed ? next : cur;
  });
}

/** Rewrite rating keys from one prefix to another (album rename). */
export async function renameRatingPrefix(from: string, to: string): Promise<void> {
  await store.update((cur) => {
    let changed = false;
    const next: Ratings = {};
    for (const [k, v] of Object.entries(cur)) {
      if (k.startsWith(from)) {
        next[to + k.slice(from.length)] = v;
        changed = true;
      } else {
        next[k] = v;
      }
    }
    return changed ? next : cur;
  });
}

/** Move one rating from an old key to a new key (backfill file move). No-op
 *  if the source has no rating; a rating already at `to` is overwritten. */
export async function renameRatingKey(from: string, to: string): Promise<void> {
  await store.update((cur) => {
    if (!(from in cur) || from === to) return cur;
    const next = { ...cur };
    next[to] = cur[from];
    delete next[from];
    return next;
  });
}

/** Drop a rating entry entirely (used when a file is deleted, later chunk). */
export async function removeRating(relPath: string): Promise<void> {
  await store.update((cur) => {
    if (!(relPath in cur)) return cur;
    const next = { ...cur };
    delete next[relPath];
    return next;
  });
}