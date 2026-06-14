import path from 'node:path';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),

  // Single-user web auth
  appUser: process.env.APP_USER ?? 'admin',
  appPass: process.env.APP_PASS ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  tokenTtl: '12h',
  refreshTtl: '30d',

  // Local JSON state (FTP config, recent transfers) + thumbnail cache
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),

  // Bind-mounted unraid photos share: FTP receive target + gallery root.
  // (Used from Phase 2 onward; the path is part of the app's core identity
  // so it lives in config from the start.)
  photosPath: path.resolve(process.env.PHOTOS_PATH ?? '/photos'),

  // Disk cache for generated thumbnails/previews (Phase 3).
  cacheDir: path.resolve(process.env.THUMB_CACHE_PATH ?? `${process.env.DATA_DIR ?? './data'}/thumbnails`),

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
} as const;

/** Warn loudly if running with insecure defaults outside development. */
export function assertConfig(): void {
  if (config.isProduction) {
    if (!config.appPass) {
      console.warn('[config] APP_PASS is empty — login will be impossible.');
    }
    if (config.jwtSecret === 'dev-insecure-secret-change-me') {
      console.warn('[config] JWT_SECRET is using the insecure default. Set a real one.');
    }
  }
}
