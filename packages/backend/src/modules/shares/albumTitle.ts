/** A leading shoot date (YYYYMMDD or YYYY-MM-DD), then a dash/underscore
 *  separator or plain whitespace, then the rest of the name. */
const LEADING_DATE = /^(\d{4})-?(\d{2})-?(\d{2})(?:\s*[-\u2013\u2014_]\s*|\s+)(.+)$/;

/**
 * Split a leading shoot date off an album name for client display.
 *   "20261031 - Kai First Halloween" -> { title: "Kai First Halloween", date: "2026-10-31" }
 * No date, an impossible date, or nothing after it -> the name as-is, date null.
 */
export function albumTitle(name: string): { title: string; date: string | null } {
  const trimmed = name.trim();
  const m = LEADING_DATE.exec(trimmed);
  if (!m) return { title: trimmed, date: null };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  const valid = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  const title = m[4].trim();
  if (!valid || !title) return { title: trimmed, date: null };
  return { title, date };
}
