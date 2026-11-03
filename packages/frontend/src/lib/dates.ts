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

/** "in 12 d" style time until epoch ms (for a future moment). */
export function fmtIn(ms: number): string {
  const m = Math.max(0, Math.ceil((ms - Date.now()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.ceil(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.ceil(h / 24)} d`;
}

/** Link-expiry choices offered in the owner app (days; null = never). */
export const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: null, label: 'Never' },
];
