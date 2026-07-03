import { execFile } from 'node:child_process';
import { config } from '../config/index.js';

/**
 * Read a shot's capture date (EXIF DateTimeOriginal, then CreateDate) as a
 * local YYYY-MM-DD string. The camera writes these in its own local time as a
 * plain string, so we take the date portion literally — no timezone math.
 *
 * Returns null when exiftool is missing, the tags are absent, or the value
 * can't be parsed, so callers can fall back (the live FTP filer falls back to
 * today; the backfill leaves the file untouched).
 *
 * Single source of truth shared by the FTP receive filer and the date backfill.
 */
export function captureDate(abs: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      config.exiftoolPath,
      ['-j', '-DateTimeOriginal', '-CreateDate', abs],
      { maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        try {
          const arr = JSON.parse(stdout.toString());
          const rec = Array.isArray(arr) && arr[0] ? (arr[0] as Record<string, unknown>) : {};
          const raw = rec.DateTimeOriginal ?? rec.CreateDate;
          // exiftool date form: "YYYY:MM:DD HH:MM:SS" (may carry a subsec/zone).
          const m = typeof raw === 'string' ? raw.match(/^(\d{4}):(\d{2}):(\d{2})/) : null;
          resolve(m ? `${m[1]}-${m[2]}-${m[3]}` : null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}
