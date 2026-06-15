import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FtpSrv, type FtpSrvOptions } from 'ftp-srv';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { getFtpConfig } from './ftp.config.js';
import type { FtpStatus, TransferEvent } from '@sonycam/shared';

const MAX_RECENT = 100;
const recent: TransferEvent[] = [];

let server: FtpSrv | null = null;
let listening = false;
let activeConnections = 0;
let lastReceived: number | null = null;

// RAW formats are filed under a RAW/ bucket; everything else (JPEG, etc.)
// goes under JPG/. Mirrors the gallery's image/raw split.
const RAW_EXTS = new Set([
  '.arw', '.dng', '.cr2', '.cr3', '.nef', '.raf', '.rw2', '.orf', '.srw', '.pef', '.sr2', '.x3f',
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
 * the folders on demand, and return its final absolute path. The date is
 * stamped per file, so a session that crosses midnight splits correctly.
 */
async function fileIntoFolder(abs: string): Promise<string> {
  const name = path.basename(abs);
  const destDir = path.join(config.photosPath, dateFolder(), bucketFor(name));
  const dest = path.join(destDir, name);
  if (dest === abs) return abs;
  await fs.mkdir(destDir, { recursive: true });
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
  return dest;
}

function record(absPath: string, size: number, ip: string): void {
  const evt: TransferEvent = {
    name: path.basename(absPath),
    path: absPath,
    size,
    time: Date.now(),
    clientIp: ip,
  };
  recent.unshift(evt);
  if (recent.length > MAX_RECENT) recent.pop();
  lastReceived = evt.time;
  logger.info(`received ${evt.name} (${size} bytes) from ${ip}`, 'FTP');
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
  await fs.mkdir(config.photosPath, { recursive: true });
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
    if (username !== cfg.user || password !== cfg.pass) {
      reject(new Error('Invalid credentials'));
      return;
    }
    activeConnections++;
    const ip = connection.ip ?? '?';

    connection.on('STOR', (error: Error | null, fileName: string) => {
      if (error) {
        logger.error('FTP STOR failed', 'FTP', error);
        return;
      }
      const abs = path.isAbsolute(fileName) ? fileName : path.join(config.photosPath, fileName);
      fileIntoFolder(abs)
        .then((dest) => fs.stat(dest).then((s) => record(dest, s.size, ip)))
        .catch((err: unknown) => {
          logger.error('FTP auto-file failed', 'FTP', err as Error);
          fs.stat(abs)
            .then((s) => record(abs, s.size, ip))
            .catch(() => record(abs, 0, ip));
        });
    });

    // Sandbox: ftp-srv roots its default FileSystem at `root`, which clamps
    // every path to the share and blocks traversal.
    resolve({ root: config.photosPath });
  });

  srv.on('disconnect', () => {
    if (activeConnections > 0) activeConnections--;
  });
  srv.on('client-error', ({ error }) => logger.error('FTP client error', 'FTP', error));

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
  }
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
  };
}

export function getRecentTransfers(): TransferEvent[] {
  return [...recent];
}