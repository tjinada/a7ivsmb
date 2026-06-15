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

/** Drop a rating entry entirely (used when a file is deleted, later chunk). */
export async function removeRating(relPath: string): Promise<void> {
  await store.update((cur) => {
    if (!(relPath in cur)) return cur;
    const next = { ...cur };
    delete next[relPath];
    return next;
  });
}