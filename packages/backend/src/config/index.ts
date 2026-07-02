import path from 'node:path';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),

  // Hostname of the public client-share surface (Option B isolation). When set,
  // the owner API + PWA shell 404 on this host, leaving only the /s/ client page
  // and /api/public/ endpoints. Unset (dev) = isolation off, everything on one
  // host. In production set this to e.g. "share.yourdomain.com".
  shareHost: process.env.SHARE_HOST ?? '',

  // Max size of one manual edited-image upload (raw request body). ~50MB easily
  // covers a full-res edited JPG from the A7 IV.
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024),

  // Single-user web auth
  appUser: process.env.APP_USER ?? 'admin',
  appPass: process.env.APP_PASS ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  tokenTtl: '12h',
  refreshTtl: '30d',

  // Login brute-force throttle (security hardening). In-memory, per-client-IP.
  // Tunable via env; defaults suit a single-user app behind Cloudflare Access.
  loginRateLimit: {
    windowMs: Number(process.env.LOGIN_RATELIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    maxFails: Number(process.env.LOGIN_RATELIMIT_MAX_FAILS ?? 10),
    blockMs: Number(process.env.LOGIN_RATELIMIT_BLOCK_MS ?? 15 * 60 * 1000),
  },

  // Local JSON state (FTP config, recent transfers) + thumbnail cache
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),

  // Bind-mounted unraid photos share: FTP receive target + gallery root.
  // (Used from Phase 2 onward; the path is part of the app's core identity
  // so it lives in config from the start.)
  photosPath: path.resolve(process.env.PHOTOS_PATH ?? '/photos'),

  // Disk cache for generated thumbnails/previews (Phase 3).
  cacheDir: path.resolve(process.env.THUMB_CACHE_PATH ?? `${process.env.DATA_DIR ?? './data'}/thumbnails`),

  // RAW preview: path to the exiftool binary used to pull the embedded JPEG
  // preview out of .ARW/.NEF/etc. Defaults to whatever's on PATH (the Docker
  // image installs it); override for local dev if needed.
  exiftoolPath: process.env.EXIFTOOL_PATH ?? 'exiftool',

  // Embedded FTP receive server (Phase 2). These seed data/ftp.json on first
  // run; the JSON store is the source of truth thereafter. Safe-by-default:
  // disabled unless explicitly enabled, and never starts without a password.
  ftp: {
    enabled: (process.env.FTP_ENABLED ?? 'false') === 'true',
    user: process.env.FTP_USER ?? 'camera',
    pass: process.env.FTP_PASS ?? '',
    port: Number(process.env.FTP_PORT ?? 21),
    pasvMin: Number(process.env.FTP_PASV_MIN ?? 50000),
    pasvMax: Number(process.env.FTP_PASV_MAX ?? 50009),
    externalIp: process.env.FTP_EXTERNAL_IP ?? '',
    ftpsEnabled: (process.env.FTPS_ENABLED ?? 'false') === 'true',
    tlsKeyPath: process.env.FTPS_KEY ?? '',
    tlsCertPath: process.env.FTPS_CERT ?? '',
  },

  // Client shares (proofing links). Previews are watermarked, downscaled JPEGs
  // written under DATA_DIR/shares/<id>/previews; metadata lives in shares.json.
  shares: {
    previewMaxEdge: Number(process.env.SHARE_PREVIEW_MAX_EDGE ?? 1600),
    previewQuality: Number(process.env.SHARE_PREVIEW_QUALITY ?? 80),
    watermarkText: process.env.SHARE_WATERMARK_TEXT ?? 'Preview',
    cookieTtlDays: Number(process.env.SHARE_COOKIE_TTL_DAYS ?? 7),
  },
} as const;

/** Refuse to start in production with insecure auth config (S1 hardening).
 *  Runs before app.listen(), so the port never opens with forgeable tokens. */
export function assertConfig(): void {
  if (!config.isProduction) return;
  const fatal: string[] = [];
  if (!config.appPass) {
    fatal.push('APP_PASS is empty — set a real login password in .env.');
  }
  if (!config.jwtSecret || config.jwtSecret === 'dev-insecure-secret-change-me') {
    fatal.push('JWT_SECRET is missing or still the insecure dev default — set a long random string in .env.');
  }
  if (fatal.length > 0) {
    for (const msg of fatal) console.error(`[config] FATAL: ${msg}`);
    process.exit(1);
  }
}
