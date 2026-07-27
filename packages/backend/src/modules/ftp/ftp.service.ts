import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FtpSrv, type FtpSrvOptions } from 'ftp-srv';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { captureDate } from '../../utils/captureDate.js';
import { mkdirShared, relaxSharePerms } from '../../utils/shareFs.js';
import { getFtpConfig } from './ftp.config.js';
import type { FtpStatus, TransferEvent, FtpErrorEvent, StrayFile } from '@sonycam/shared';

// Deep enough to cover a long shoot, so a slowdown that only appears after
// several hundred files is still visible in the throughput chart. Each event
// is a few hundred bytes, so this costs ~100 KB and stays in memory only.
const MAX_RECENT = 500;
const recent: TransferEvent[] = [];

/** Longest gap between two arrivals that still counts as back-to-back. Past
 *  this the camera was idle, so dividing file size by the gap would report a
 *  fake slowdown; throughput is recorded as null (an unmeasured break) instead. */
const IDLE_GAP_MS = 30_000;

/** When the previous STOR finished. Updated synchronously in the STOR handler
 *  so gaps stay in arrival order even though filing completes asynchronously
 *  and can finish out of order. */
let lastStorAt: number | null = null;

const MAX_ERRORS = 50;
const recentErrors: FtpErrorEvent[] = [];
let lastErrorTime: number | null = null;

let server: FtpSrv | null = null;
let listening = false;
let activeConnections = 0;
let lastReceived: number | null = null;

// RAW formats are filed under a RAW/ bucket; everything else (JPEG, etc.)
// goes under JPG/. Mirrors the gallery's image/raw split.
const RAW_EXTS = new Set([
  '.arw', '.dng', '.cr2', '.cr3', '.nef', '.raf', '.rw2', '.orf', '.srw', '.pef', '.sr2', '.x3f',
]);

// Extensions we know how to file. Anything else the camera drops (e.g. a stray
// non-photo) is ignored by the stray lister so it doesn't churn the UI.
const PHOTO_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif', '.heic', '.heif',
  ...RAW_EXTS,
]);

/** Local-time YYYY-MM-DD. Honors the container's TZ env var. */
function dateFolder(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bucketFor(name: string): 'RAW' | 'JPG' {
  return RAW_EXTS.has(path.extname(name).toLowerCase()) ? 'RAW' : 'JPG';
}

/**
 * Move a freshly-received file into <share>/YYYY-MM-DD/<JPG|RAW>/, creating
 * the folders on demand, and return its final absolute path. The folder date
 * is the shot's EXIF capture date when readable (so late/re-sent transfers
 * land correctly), falling back to today's date otherwise.
 */
async function fileIntoFolder(abs: string): Promise<string> {
  const name = path.basename(abs);
  const day = (await captureDate(abs)) ?? dateFolder();
  const destDir = path.join(config.photosPath, day, bucketFor(name));
  const dest = path.join(destDir, name);
  if (dest === abs) return abs;
  await mkdirShared(destDir);
  try {
    await fs.rename(abs, dest);
  } catch {
    // unraid user shares (shfs) can place the source file and the
    // destination folder on different physical disks, so rename() fails
    // with EXDEV. Copy + delete works across devices.
    await fs.copyFile(abs, dest);
    await fs.unlink(abs);
    logger.info(`copied ${name} across devices`, 'FTP');
  }
  await relaxSharePerms(dest, false);
  return dest;
}

/** Timing captured around one arrival. Omitted entirely by the stray re-filer,
 *  where nothing crossed the network and throughput would be meaningless. */
interface RecordTiming {
  /** When the STOR finished. Defaults to now (re-file has no transfer). */
  receivedAt?: number;
  /** Gap to the previous STOR, measured in arrival order by the STOR handler. */
  gapMs?: number | null;
  /** Time spent in fileIntoFolder(): exiftool read plus rename or EXDEV copy. */
  filingMs?: number;
}

function record(absPath: string, size: number, ip: string, timing: RecordTiming = {}): void {
  const receivedAt = timing.receivedAt ?? Date.now();
  const gapMs = timing.gapMs ?? null;
  // Back-to-back transfers only: file N occupied the window between the
  // previous STOR completing and this one, so size/gap is its throughput.
  const measurable = gapMs !== null && gapMs > 0 && gapMs <= IDLE_GAP_MS;
  const evt: TransferEvent = {
    name: path.basename(absPath),
    path: absPath,
    relPath: path.relative(config.photosPath, absPath).split(path.sep).join('/'),
    size,
    time: Date.now(),
    clientIp: ip,
    receivedAt,
    filingMs: timing.filingMs ?? 0,
    bytesPerSec: measurable ? Math.round(size / (gapMs / 1000)) : null,
  };
  recent.unshift(evt);
  if (recent.length > MAX_RECENT) recent.pop();
  lastReceived = evt.time;
  logger.info(`received ${evt.name} (${size} bytes) from ${ip}`, 'FTP');
}

/**
 * Capture an FTP-side failure for in-app visibility (Transfers screen) while
 * still logging it as before. Kept non-secret: message + kind + client IP only.
 */
function recordError(
  kind: FtpErrorEvent['kind'],
  message: string,
  ip?: string,
  cause?: unknown,
): void {
  const evt: FtpErrorEvent = { time: Date.now(), kind, message, clientIp: ip };
  recentErrors.unshift(evt);
  if (recentErrors.length > MAX_ERRORS) recentErrors.pop();
  lastErrorTime = evt.time;
  logger.error(`${message}${ip ? ` (${ip})` : ''}`, 'FTP', cause instanceof Error ? cause : undefined);
}

/**
 * Ensure the receive target exists. Normally it already does (the bind-mount
 * in prod, or an existing folder/share in dev). Recursive mkdir on a UNC /
 * network-share root can fail even when the leaf already exists, so only
 * create when it is genuinely missing.
 */
async function ensurePhotosDir(): Promise<void> {
  const isDir = await fs
    .stat(config.photosPath)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (isDir) return;
  await mkdirShared(config.photosPath);
}

/**
 * List "stray" photos: files sitting directly in the share root instead of a
 * dated folder. That is exactly where a failed filing leaves them, so this is
 * the owner's recovery surface. Non-recursive by design (dated folders and
 * Albums are never scanned).
 */
export async function listStrays(): Promise<StrayFile[]> {
  const root = config.photosPath;
  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: StrayFile[] = [];
  for (const e of dirents) {
    if (!e.isFile() || e.name.startsWith('.')) continue;
    if (!PHOTO_EXTS.has(path.extname(e.name).toLowerCase())) continue;
    const s = await fs.stat(path.join(root, e.name)).catch(() => null);
    if (!s) continue;
    out.push({ name: e.name, size: s.size, modified: s.mtimeMs });
  }
  out.sort((a, b) => b.modified - a.modified);
  return out;
}

/**
 * Re-run filing over every current stray. Each success moves the file into its
 * dated JPG/RAW folder and records it as a normal arrival; each failure is
 * captured in the FTP error buffer. Returns how many were filed vs. failed.
 */
export async function refileStrays(): Promise<{ filed: number; failed: number }> {
  const strays = await listStrays();
  let filed = 0;
  let failed = 0;
  for (const stray of strays) {
    const abs = path.join(config.photosPath, stray.name);
    try {
      const dest = await fileIntoFolder(abs);
      const s = await fs.stat(dest);
      record(dest, s.size, 'refile');
      filed += 1;
    } catch (err) {
      recordError('filing', `Could not file ${stray.name} into a dated folder`, undefined, err);
      failed += 1;
    }
  }
  return { filed, failed };
}

/** Start the embedded FTP server, if enabled and a password is configured. */
export async function startFtp(): Promise<void> {
  const cfg = getFtpConfig();
  if (!cfg.enabled) {
    logger.info('FTP receive is disabled', 'FTP');
    return;
  }
  if (!cfg.pass) {
    logger.warn('FTP is enabled but no password is set - refusing to start an open server', 'FTP');
    return;
  }

  // The receive target must exist before clients connect.
  await ensurePhotosDir();

  const options: FtpSrvOptions = {
    url: `ftp://0.0.0.0:${cfg.port}`,
    pasv_min: cfg.pasvMin,
    pasv_max: cfg.pasvMax,
    anonymous: false,
  };
  if (cfg.externalIp) options.pasv_url = cfg.externalIp;

  if (cfg.ftpsEnabled && config.ftp.tlsKeyPath && config.ftp.tlsCertPath) {
    options.tls = {
      key: await fs.readFile(config.ftp.tlsKeyPath),
      cert: await fs.readFile(config.ftp.tlsCertPath),
    };
  } else if (cfg.ftpsEnabled) {
    logger.warn('FTPS is enabled but key/cert paths are missing - running plain FTP', 'FTP');
  }

  const srv = new FtpSrv(options);

  srv.on('login', ({ connection, username, password }, resolve, reject) => {
    const ip = connection.ip ?? '?';
    if (username !== cfg.user || password !== cfg.pass) {
      recordError('auth', `Rejected login for user "${username}"`, ip);
      reject(new Error('Invalid credentials'));
      return;
    }
    activeConnections++;

    connection.on('STOR', (error: Error | null, fileName: string) => {
      if (error) {
        recordError('transfer', `Upload failed: ${path.basename(fileName)}`, ip, error);
        return;
      }
      // Stamped before filing begins, so throughput reflects the network alone
      // and the exiftool read plus the (possibly cross-device) move are timed
      // separately. Both the stamp and the gap are taken here rather than in
      // record(), because filing runs unawaited and can complete out of order.
      const receivedAt = Date.now();
      const gapMs = lastStorAt === null ? null : receivedAt - lastStorAt;
      lastStorAt = receivedAt;

      const abs = path.isAbsolute(fileName) ? fileName : path.join(config.photosPath, fileName);
      fileIntoFolder(abs)
        .then((dest) =>
          fs.stat(dest).then((s) =>
            record(dest, s.size, ip, { receivedAt, gapMs, filingMs: Date.now() - receivedAt }),
          ),
        )
        .catch((err: unknown) => {
          recordError('filing', `Could not file ${path.basename(abs)} into a dated folder`, ip, err);
          const filingMs = Date.now() - receivedAt;
          fs.stat(abs)
            .then((s) => record(abs, s.size, ip, { receivedAt, gapMs, filingMs }))
            .catch(() => record(abs, 0, ip, { receivedAt, gapMs, filingMs }));
        });
    });

    // Sandbox: ftp-srv roots its default FileSystem at `root`, which clamps
    // every path to the share and blocks traversal.
    resolve({ root: config.photosPath });
  });

  srv.on('disconnect', () => {
    if (activeConnections > 0) activeConnections--;
  });
  srv.on('client-error', ({ connection, context, error }) => {
    const ip = (connection && connection.ip) || undefined;
    const where = typeof context === 'string' && context ? ` during ${context}` : '';
    const detail = (error && (error as Error).message) || 'connection error';
    recordError('client', `Camera connection error${where}: ${detail}`, ip, error);
  });

  await srv.listen();
  server = srv;
  listening = true;
  logger.info(
    `FTP receive listening on :${cfg.port} (passive ${cfg.pasvMin}-${cfg.pasvMax}` +
      `${cfg.externalIp ? `, PASV ${cfg.externalIp}` : ''}) -> ${config.photosPath}`,
    'FTP',
  );
}

export async function stopFtp(): Promise<void> {
  if (server) {
    await server.close();
    server = null;
    listening = false;
    activeConnections = 0;
    lastStorAt = null; // next arrival starts a fresh measurement run
  }
}

/** Stop-then-start with the currently stored config. Used by the in-app
 *  "apply settings" and "restart" actions (e.g. to clear a leaked passive
 *  pool without recreating the container). */
export async function restartFtp(): Promise<void> {
  await stopFtp();
  await startFtp();
}

export function getStatus(): FtpStatus {
  const cfg = getFtpConfig();
  return {
    enabled: cfg.enabled,
    listening,
    port: cfg.port,
    user: cfg.user,
    pasvMin: cfg.pasvMin,
    pasvMax: cfg.pasvMax,
    externalIp: cfg.externalIp || null,
    ftps: cfg.ftpsEnabled,
    activeConnections,
    lastReceived,
    lastErrorTime,
  };
}

export function getRecentTransfers(): TransferEvent[] {
  return [...recent];
}

export function getRecentErrors(): FtpErrorEvent[] {
  return [...recentErrors];
}
