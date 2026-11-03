import type { ShareActivity } from '@sonycam/shared';
import { JsonStore } from '../../store/jsonStore.js';
import { logger } from '../../utils/logger.js';

/**
 * What a client did with a share link (Phase 11): opens, devices, downloads.
 * Keyed by slug in DATA_DIR/share-activity.json, apart from shares.json:
 * downloads arrive in bursts (Save all to Photos is one request per photo), so
 * writes are deferred and coalesced. Recorded only by the public endpoints.
 */
interface ActivityRecord {
  opens: number;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  seen: Record<string, number>;      // device class -> last seen (epoch ms)
  downloads: Record<string, number>; // file -> completed downloads
  lastDownloadAt: number | null;
  zipStarted: number;
  zipCompleted: number;
}

type Activity = Record<string, ActivityRecord>;

/** Reloads inside this window are the same visit. */
const VISIT_MS = 30 * 60 * 1000;
const WRITE_DELAY_MS = 2000;

const store = new JsonStore<Activity>('share-activity.json', {});
let loaded = false;

export async function loadActivity(): Promise<void> {
  if (!loaded) {
    await store.load();
    loaded = true;
  }
}

function empty(): ActivityRecord {
  return {
    opens: 0, firstOpenedAt: null, lastOpenedAt: null, seen: {},
    downloads: {}, lastDownloadAt: null, zipStarted: 0, zipCompleted: 0,
  };
}

/** Apply a change to one share's record. Fire-and-forget: a failure is
 *  logged and never reaches the client's request. */
function change(slug: string, fn: (r: ActivityRecord) => ActivityRecord): void {
  loadActivity()
    .then(() => {
      store.updateDeferred((cur) => ({ ...cur, [slug]: fn(cur[slug] ?? empty()) }), WRITE_DELAY_MS);
    })
    .catch((err) => logger.error('Failed to record share activity', 'Shares', err));
}

/** Coarse device class from a user-agent. iPadOS Safari sends a Mac UA, so
 *  an iPad can read as "Mac"; that's accepted. */
export function deviceOf(ua: string | undefined): string {
  const s = ua ?? '';
  if (/iPad/.test(s)) return 'iPad';
  if (/iPhone|iPod/.test(s)) return 'iPhone';
  if (/Android/.test(s)) return /Mobile/.test(s) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/.test(s)) return 'Mac';
  if (/Windows/.test(s)) return 'Windows';
  return 'Other';
}

/** The client loaded the gallery. Counts once per device per visit window. */
export function recordOpen(slug: string, ua: string | undefined): void {
  const device = deviceOf(ua);
  const now = Date.now();
  change(slug, (r) => ({
    ...r,
    opens: r.opens + (now - (r.seen[device] ?? 0) > VISIT_MS ? 1 : 0),
    firstOpenedAt: r.firstOpenedAt ?? now,
    lastOpenedAt: now,
    seen: { ...r.seen, [device]: now },
  }));
}

/** One full-res photo finished sending. */
export function recordDownload(slug: string, file: string): void {
  const now = Date.now();
  change(slug, (r) => ({
    ...r,
    downloads: { ...r.downloads, [file]: (r.downloads[file] ?? 0) + 1 },
    lastDownloadAt: now,
  }));
}

/** The download-all ZIP started streaming, or finished. */
export function recordZip(slug: string, stage: 'started' | 'completed'): void {
  const now = Date.now();
  change(slug, (r) => (stage === 'started'
    ? { ...r, zipStarted: r.zipStarted + 1 }
    : { ...r, zipCompleted: r.zipCompleted + 1, lastDownloadAt: now }));
}

/** Owner-facing view of one share's activity (empty if none recorded). */
export function activityOf(slug: string): ShareActivity {
  const r = store.get()[slug] ?? empty();
  return {
    opens: r.opens,
    firstOpenedAt: r.firstOpenedAt,
    lastOpenedAt: r.lastOpenedAt,
    devices: Object.entries(r.seen).sort((a, b) => b[1] - a[1]).map(([d]) => d),
    downloads: { ...r.downloads },
    lastDownloadAt: r.lastDownloadAt,
    zipStarted: r.zipStarted,
    zipCompleted: r.zipCompleted,
  };
}

/** Drop a share's activity (link turned off). */
export async function deleteActivity(slug: string): Promise<void> {
  await loadActivity();
  await store.update((cur) => {
    if (!(slug in cur)) return cur;
    const next = { ...cur };
    delete next[slug];
    return next;
  });
}
