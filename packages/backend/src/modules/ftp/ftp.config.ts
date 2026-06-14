import { JsonStore } from '../../store/jsonStore.js';
import { config } from '../../config/index.js';
import type { FtpConfig } from '@sonycam/shared';

// Defaults are seeded from env on first run; data/ftp.json wins thereafter
// (Phase 4 edits it). Secrets live in the JSON store per design.
const defaults: FtpConfig = {
  enabled: config.ftp.enabled,
  port: config.ftp.port,
  user: config.ftp.user,
  pass: config.ftp.pass,
  pasvMin: config.ftp.pasvMin,
  pasvMax: config.ftp.pasvMax,
  externalIp: config.ftp.externalIp,
  ftpsEnabled: config.ftp.ftpsEnabled,
};

const store = new JsonStore<FtpConfig>('ftp.json', defaults);
let loaded = false;

export async function loadFtpConfig(): Promise<FtpConfig> {
  if (!loaded) {
    await store.load();
    loaded = true;
  }
  return store.get();
}

export function getFtpConfig(): FtpConfig {
  return store.get();
}

export function updateFtpConfig(fn: (current: FtpConfig) => FtpConfig): Promise<FtpConfig> {
  return store.update(fn);
}
