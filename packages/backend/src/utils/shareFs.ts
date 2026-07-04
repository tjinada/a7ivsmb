import { promises as fs } from 'node:fs';
import path from 'node:path';

// Unraid share convention (what `newperms` produces): nobody:users with
// world-writable dirs/files. The container runs as root, so without this
// everything it creates is root:root 755 and SMB clients (e.g. the
// Lightroom PC writing into Albums/<name>/Edited) get "access denied".
const SHARE_UID = 99; // nobody
const SHARE_GID = 100; // users
const DIR_MODE = 0o777;
const FILE_MODE = 0o666;

/**
 * Best-effort chmod + chown to the Unraid share convention. Never throws:
 * on Windows dev chown/chmod are no-ops or unsupported, and a failed perms
 * tweak must never fail the photo operation itself.
 */
export async function relaxSharePerms(target: string, isDir: boolean): Promise<void> {
  try {
    await fs.chmod(target, isDir ? DIR_MODE : FILE_MODE);
    await fs.chown(target, SHARE_UID, SHARE_GID);
  } catch {
    /* best effort */
  }
}

/**
 * mkdir -p that leaves every directory level it CREATED SMB-writable
 * (0777 nobody:users). Levels that already existed are left untouched.
 */
export async function mkdirShared(dir: string): Promise<void> {
  const firstCreated = await fs.mkdir(dir, { recursive: true });
  if (!firstCreated) return; // nothing new was created
  let cur = firstCreated;
  await relaxSharePerms(cur, true);
  const rest = path.relative(cur, dir);
  if (!rest) return;
  for (const seg of rest.split(path.sep)) {
    if (!seg) continue;
    cur = path.join(cur, seg);
    await relaxSharePerms(cur, true);
  }
}
