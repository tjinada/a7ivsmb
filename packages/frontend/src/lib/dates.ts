import type { GalleryItem } from '@sonycam/shared';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Group key for the timeline: the date-folder segment if present, else mtime. */
export function dateKey(it: GalleryItem): string {
  const seg = it.path.split('/')[0];
  if (DATE_RE.test(seg)) return seg;
  const d = new Date(it.modified);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Friendly label for a YYYY-MM-DD string (Today/Yesterday, else a date). A
 *  non-date string is returned unchanged, so it is safe on folder/crumb names. */
export function prettyDate(key: string, weekday = true): string {
  const m = key.match(DATE_RE);
  if (!m) return key;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(dt);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dt.toLocaleDateString(
    undefined,
    weekday
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

/** True if the last path segment is a YYYY-MM-DD dated folder. */
export function isDateSegment(seg: string): boolean {
  return DATE_RE.test(seg);
}

/** "4 min ago" style relative time from epoch ms. */
export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} d ago`;
  return `${Math.floor(d / 7)} w ago`;
}
