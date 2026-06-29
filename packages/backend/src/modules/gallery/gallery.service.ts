import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { AppError } from '../../middleware/index.js';
import type {
  GalleryBrowseResult,
  FolderEntry,
  GalleryItem,
  GalleryItemKind,
  ExifInfo,
  GalleryTimelineResult,
  AlbumInfo,
  AlbumCreateResult,
  AlbumFormats,
} from '@sonycam/shared';
import { loadRatings, getRating, setRating, removeRating } from './ratings.store.js';

// Browser-renderable raster formats. RAW formats are previewed via their
// embedded JPEG (see render/extractRawPreview). Anything else is hidden.
const DISPLAYABLE = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif', '.heic', '.heif',
]);
const RAW = new Set([
  '.arw', '.dng', '.cr2', '.cr3', '.nef', '.raf', '.rw2', '.orf', '.srw', '.pef', '.sr2', '.x3f',
]);

const SIZES = {
  thumb: { width: 400, quality: 70 },
  preview: { width: 2048, quality: 82 },
} as const;
export type Variant = keyof typeof SIZES;

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.avif': 'image/avif',
  '.heic': 'image/heic', '.heif': 'image/heif',
};

const toPosix = (p: string) => p.split(path.sep).join('/');

/** Classify a filename into a gallery kind, or null if it's not a photo. */
function kindOf(name: string): GalleryItemKind | null {
  const ext = path.extname(name).toLowerCase();
  return DISPLAYABLE.has(ext) ? 'image' : RAW.has(ext) ? 'raw' : null;
}

/**
 * Key that a JPG and its RAW counterpart share. The Sony filer drops each shot
 * into sibling `<date>/JPG` and `<date>/RAW` folders, so we key on the shared
 * grandparent + basename. Files paired inside one folder key on their own dir.
 */
function pairKey(relPath: string): string {
  const parts = relPath.split('/');
  const file = parts[parts.length - 1];
  const base = file.slice(0, file.length - path.extname(file).length).toLowerCase();
  const parent = (parts[parts.length - 2] ?? '').toUpperCase();
  if (parent === 'JPG' || parent === 'RAW') {
    return `${parts.slice(0, parts.length - 2).join('/')}::${base}`;
  }
  return `${parts.slice(0, parts.length - 1).join('/')}::${base}`;
}

/** Build a relPath -> twin relPath map from a flat list of photo entries. */
function computeTwins(entries: { relPath: string; kind: GalleryItemKind }[]): Map<string, string> {
  const groups = new Map<string, { image?: string; raw?: string }>();
  for (const e of entries) {
    const k = pairKey(e.relPath);
    let g = groups.get(k);
    if (!g) {
      g = {};
      groups.set(k, g);
    }
    if (e.kind === 'image') g.image ??= e.relPath;
    else g.raw ??= e.relPath;
  }
  const twins = new Map<string, string>();
  for (const g of groups.values()) {
    if (g.image && g.raw) {
      twins.set(g.image, g.raw);
      twins.set(g.raw, g.image);
    }
  }
  return twins;
}

/** List the photo entries (rel + kind) directly inside one folder. */
async function photoEntriesIn(absDir: string, root: string): Promise<{ relPath: string; kind: GalleryItemKind }[]> {
  const out: { relPath: string; kind: GalleryItemKind }[] = [];
  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of dirents) {
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const kind = kindOf(e.name);
    if (!kind) continue;
    out.push({ relPath: toPosix(path.relative(root, path.join(absDir, e.name))), kind });
  }
  return out;
}

/** Given a `.../JPG` dir, find its sibling `.../RAW` (or vice versa). */
async function siblingBucketDir(absDir: string): Promise<string | null> {
  const leaf = path.basename(absDir).toUpperCase();
  const want = leaf === 'JPG' ? 'RAW' : leaf === 'RAW' ? 'JPG' : null;
  if (!want) return null;
  const parent = path.dirname(absDir);
  try {
    const sibs = await fs.readdir(parent, { withFileTypes: true });
    const match = sibs.find((d) => d.isDirectory() && d.name.toUpperCase() === want);
    return match ? path.join(parent, match.name) : null;
  } catch {
    return null;
  }
}

/** Find the paired JPG/RAW counterpart of a single share-relative file. */
async function twinOf(relPosix: string): Promise<string | null> {
  const root = path.resolve(config.photosPath);
  const dir = path.dirname(path.resolve(root, relPosix));
  const entries = await photoEntriesIn(dir, root);
  const sib = await siblingBucketDir(dir);
  if (sib) entries.push(...(await photoEntriesIn(sib, root)));
  return computeTwins(entries).get(relPosix) ?? null;
}

/** Run exiftool for a curated tag set and return the parsed JSON object. */
function exiftoolJson(file: string): Promise<Record<string, unknown>> {
  const tags = [
    '-Make', '-Model', '-LensModel', '-LensID', '-FocalLength', '-FocalLengthIn35mmFormat',
    '-FNumber', '-ExposureTime', '-ISO', '-ExposureCompensation', '-DateTimeOriginal',
    '-ImageSize', '-GPSLatitude', '-GPSLongitude',
  ];
  return new Promise((resolve) => {
    execFile(
      config.exiftoolPath,
      ['-j', '-c', '%.6f', ...tags, file],
      { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({});
          return;
        }
        try {
          const arr = JSON.parse(stdout.toString());
          resolve(Array.isArray(arr) && arr[0] ? (arr[0] as Record<string, unknown>) : {});
        } catch {
          resolve({});
        }
      },
    );
  });
}

const exifStr = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

/** Parse an exiftool coordinate ("43.123456 N" / "-79.123456") to signed decimal. */
function parseCoord(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = v.match(/(-?[\d.]+)\s*([NSEW])?/i);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const ref = (m[2] ?? '').toUpperCase();
  if (ref === 'S' || ref === 'W') n = -Math.abs(n);
  return n;
}

function buildExif(j: Record<string, unknown>): ExifInfo {
  const fnum = exifStr(j.FNumber);
  const shutter = exifStr(j.ExposureTime);
  const iso = exifStr(j.ISO);
  const lat = parseCoord(j.GPSLatitude);
  const lng = parseCoord(j.GPSLongitude);
  return {
    make: exifStr(j.Make),
    model: exifStr(j.Model),
    lens: exifStr(j.LensModel) ?? exifStr(j.LensID),
    focalLength: exifStr(j.FocalLength),
    focalLength35: exifStr(j.FocalLengthIn35mmFormat),
    aperture: fnum ? `f/${fnum}` : undefined,
    shutter: shutter ? `${shutter}s` : undefined,
    iso: iso ? `ISO ${iso}` : undefined,
    exposureComp: exifStr(j.ExposureCompensation),
    dateTime: exifStr(j.DateTimeOriginal),
    dimensions: exifStr(j.ImageSize),
    gps: lat !== undefined && lng !== undefined ? { lat, lng } : null,
  };
}

/** Pull one embedded image tag out of a RAW file via exiftool (binary stdout). */
function exiftoolExtract(file: string, tag: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      config.exiftoolPath,
      ['-b', `-${tag}`, file],
      { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout as Buffer)),
    );
  });
}

/**
 * Extract the embedded JPEG preview from a RAW file. Cameras embed a full-size
 * JPEG (PreviewImage); we prefer that and fall back to smaller variants. Throws
 * 415 if nothing usable is found (so the item stays download-only).
 */
async function extractRawPreview(file: string): Promise<Buffer> {
  for (const tag of ['PreviewImage', 'JpgFromRaw', 'ThumbnailImage']) {
    try {
      const buf = await exiftoolExtract(file, tag);
      if (buf.length > 0) return buf;
    } catch {
      /* exiftool missing or tag absent → try the next one */
    }
  }
  throw new AppError('No embedded preview in this RAW file', 415);
}

/** Resolve a share-relative path (file or dir) and keep it inside the share. */
function safeResolve(rel: string): string {
  const root = path.resolve(config.photosPath);
  const full = rel ? path.resolve(root, rel) : root;
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    throw new AppError('Path is outside the share', 403);
  }
  return full;
}

/** The cache file paths (all variants) for a given source file + stat. */
function cacheFilesFor(file: string, stat: { mtimeMs: number; size: number }): string[] {
  return (Object.keys(SIZES) as Variant[]).map((variant) => {
    const { width } = SIZES[variant];
    const key = createHash('sha1')
      .update(`${file}|${stat.mtimeMs}|${stat.size}|${variant}|${width}`)
      .digest('hex');
    return path.join(config.cacheDir, `${key}.webp`);
  });
}

/** Share-relative root that holds curated albums (excluded from the timeline). */
const ALBUMS_ROOT = 'Albums';

/** Validate a user-supplied album name; keep it a single safe path segment. */
function sanitizeAlbumName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) throw new AppError('Album name is required', 400);
  if (name.length > 80) throw new AppError('Album name is too long', 400);
  if (/[\\/:*?"<>|]/.test(name) || name.includes('..') || name.startsWith('.')) {
    throw new AppError('Album name has invalid characters', 400);
  }
  return name;
}

/** Extensions accepted for a manual edited-image upload (what shares consume). */
const EDITED_UPLOAD_EXTS = new Set(['.jpg', '.jpeg']);

/** Validate a manual upload filename; keep it a single safe JPG basename. */
function sanitizeEditedFilename(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) throw new AppError('Filename is required', 400);
  if (name.length > 200) throw new AppError('Filename is too long', 400);
  if (/[\\/:*?"<>|]/.test(name) || name.includes('..') || name.startsWith('.')) {
    throw new AppError('Filename has invalid characters', 400);
  }
  if (!EDITED_UPLOAD_EXTS.has(path.extname(name).toLowerCase())) {
    throw new AppError('Only JPG files can be uploaded', 400);
  }
  return name;
}

/** Reject anything that isn't a real JPEG (SOI marker FF D8 FF). */
function assertJpegMagic(data: Buffer): void {
  if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    throw new AppError('File is not a valid JPEG', 400);
  }
}

/** Find a basename free in both the JPG and RAW buckets (keeps a pair aligned). */
async function uniqueBase(
  base: string,
  jpgDir: string,
  jpgExt: string,
  rawDir: string,
  rawExt: string,
): Promise<string> {
  const exists = async (p: string) => !!(await fs.stat(p).catch(() => null));
  const taken = async (b: string) =>
    (!!jpgExt && (await exists(path.join(jpgDir, b + jpgExt)))) ||
    (!!rawExt && (await exists(path.join(rawDir, b + rawExt))));
  if (!(await taken(base))) return base;
  for (let i = 2; i < 1000; i += 1) {
    const cand = `${base}-${i}`;
    if (!(await taken(cand))) return cand;
  }
  return `${base}-${Date.now()}`;
}

/** Photo count + a cover image for a folder card (peeks one level into JPG/RAW). */
async function folderSummary(absDir: string, root: string): Promise<{ count: number; cover?: string }> {
  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return { count: 0 };
  }

  let count = 0;
  let cover: string | undefined;
  let coverIsRaw = true;
  const consider = (absFile: string, kind: GalleryItemKind) => {
    count += 1;
    if (!cover || (coverIsRaw && kind === 'image')) {
      cover = toPosix(path.relative(root, absFile));
      coverIsRaw = kind === 'raw';
    }
  };

  const subdirs: string[] = [];
  for (const e of dirents) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      subdirs.push(e.name);
      continue;
    }
    if (!e.isFile()) continue;
    const kind = kindOf(e.name);
    if (kind) consider(path.join(absDir, e.name), kind);
  }

  // Peek one level into subfolders. For the JPG/RAW split, count one bucket so
  // a paired day reads as its shot count (and prefer JPG for a faster cover).
  const jpg = subdirs.find((s) => s.toUpperCase() === 'JPG');
  const raw = subdirs.find((s) => s.toUpperCase() === 'RAW');
  const buckets = jpg && raw ? [jpg] : subdirs;
  for (const sub of buckets) {
    let subEntries: import('node:fs').Dirent[];
    try {
      subEntries = await fs.readdir(path.join(absDir, sub), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of subEntries) {
      if (!e.isFile() || e.name.startsWith('.')) continue;
      const kind = kindOf(e.name);
      if (kind) consider(path.join(absDir, sub, e.name), kind);
    }
  }

  return { count, cover };
}

export const galleryService = {
  /** List one directory (non-recursive): subfolders + image/raw items. */
  async browse(rel: string): Promise<GalleryBrowseResult> {
    const root = path.resolve(config.photosPath);
    const dir = safeResolve(rel);
    await loadRatings();

    const stat = await fs.stat(dir).catch(() => {
      throw new AppError('Folder not found', 404);
    });
    if (!stat.isDirectory()) throw new AppError('Not a folder', 400);

    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const folders: FolderEntry[] = [];
    const items: GalleryItem[] = [];

    for (const e of dirents) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const relPath = toPosix(path.relative(root, abs));
      let s: import('node:fs').Stats;
      try {
        s = await fs.stat(abs);
      } catch {
        continue;
      }
      if (e.isDirectory()) {
        folders.push({ name: e.name, path: relPath, modified: s.mtimeMs });
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      const kind = DISPLAYABLE.has(ext) ? 'image' : RAW.has(ext) ? 'raw' : null;
      if (!kind) continue;
      items.push({ path: relPath, name: e.name, size: s.size, modified: s.mtimeMs, kind, rating: getRating(relPath) });
    }

    // Newest activity first, for both folders and photos.
    folders.sort((a, b) => b.modified - a.modified);
    items.sort((a, b) => b.modified - a.modified);

    // Pair each photo with its JPG/RAW twin (this folder + sibling bucket).
    const entries = items.map((it) => ({ relPath: it.path, kind: it.kind }));
    const sib = await siblingBucketDir(dir);
    if (sib) entries.push(...(await photoEntriesIn(sib, root)));
    const twins = computeTwins(entries);
    for (const it of items) {
      const t = twins.get(it.path);
      if (t) it.twin = t;
    }

    // Folder cover image + photo count for each card.
    await Promise.all(
      folders.map(async (f) => {
        const summary = await folderSummary(safeResolve(f.path), root);
        f.count = summary.count;
        f.cover = summary.cover;
      }),
    );

    const here = toPosix(path.relative(root, dir)); // '' at the root
    const parent = here === '' ? null : path.posix.dirname(here) === '.' ? '' : path.posix.dirname(here);

    return { path: here, parent, folders, items };
  },

  async rate(rel: string, stars: number): Promise<number> {
    await loadRatings();
    const file = safeResolve(rel);
    const stat = await fs.stat(file).catch(() => {
      throw new AppError('Not found', 404);
    });
    if (!stat.isFile()) throw new AppError('Not a file', 400);
    const relPosix = toPosix(path.relative(path.resolve(config.photosPath), file));
    const value = await setRating(relPosix, stars);
    const twin = await twinOf(relPosix);
    if (twin) await setRating(twin, stars);
    return value;
  },

  /** Rate many photos at once (RAW/JPG twins are kept in sync). */
  async rateMany(rels: string[], stars: number): Promise<number> {
    await loadRatings();
    const root = path.resolve(config.photosPath);
    const seen = new Set<string>();
    let count = 0;
    for (const rel of rels) {
      const file = safeResolve(rel);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat?.isFile()) continue;
      const relPosix = toPosix(path.relative(root, file));
      if (!seen.has(relPosix)) {
        await setRating(relPosix, stars);
        seen.add(relPosix);
        count++;
      }
      const twin = await twinOf(relPosix);
      if (twin && !seen.has(twin)) {
        await setRating(twin, stars);
        seen.add(twin);
      }
    }
    if (count === 0) throw new AppError('No valid files to rate', 400);
    return count;
  },

  /** Camera metadata for one photo (works for JPG and RAW). */
  async exif(rel: string): Promise<ExifInfo> {
    const file = safeResolve(rel);
    const stat = await fs.stat(file).catch(() => {
      throw new AppError('Not found', 404);
    });
    if (!stat.isFile()) throw new AppError('Not a file', 400);
    return buildExif(await exiftoolJson(file));
  },

  /** Existing albums (subfolders under the share's Albums/ root). */
  async listAlbums(): Promise<AlbumInfo[]> {
    const albumsDir = path.join(path.resolve(config.photosPath), ALBUMS_ROOT);
    let dirents: import('node:fs').Dirent[];
    try {
      dirents = await fs.readdir(albumsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, path: `${ALBUMS_ROOT}/${d.name}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Create (or add into) an album by COPYING the chosen photos into
   * `Albums/<name>/Selected/{JPG,RAW}` and creating an empty `Edited/`.
   * Originals are never touched; star ratings are copied onto the new files.
   * JPG/RAW twins are kept together and given matching basenames.
   */
  async createAlbum(name: string, rels: string[], formats: AlbumFormats): Promise<AlbumCreateResult> {
    await loadRatings();
    const root = path.resolve(config.photosPath);
    const albumName = sanitizeAlbumName(name);
    const albumRel = `${ALBUMS_ROOT}/${albumName}`;
    const albumAbs = safeResolve(albumRel);

    const selJpgAbs = path.join(albumAbs, 'Selected', 'JPG');
    const selRawAbs = path.join(albumAbs, 'Selected', 'RAW');
    await fs.mkdir(selJpgAbs, { recursive: true });
    await fs.mkdir(selRawAbs, { recursive: true });
    await fs.mkdir(path.join(albumAbs, 'Edited'), { recursive: true });

    const relOf = (abs: string) => toPosix(path.relative(root, abs));
    const consumed = new Set<string>();
    let shots = 0;
    let copied = 0;

    for (const rel of rels) {
      let srcAbs: string;
      try {
        srcAbs = safeResolve(rel);
      } catch {
        continue;
      }
      if (consumed.has(srcAbs)) continue;
      const srcStat = await fs.stat(srcAbs).catch(() => null);
      if (!srcStat?.isFile()) continue;
      const kind = kindOf(path.basename(srcAbs));
      if (!kind) continue;

      // Resolve the JPG/RAW pair for this shot.
      const twinRel = await twinOf(relOf(srcAbs));
      const twinAbs = twinRel ? safeResolve(twinRel) : null;
      let jpgAbs =
        kind === 'image' ? srcAbs : twinAbs && kindOf(path.basename(twinAbs)) === 'image' ? twinAbs : null;
      let rawAbs =
        kind === 'raw' ? srcAbs : twinAbs && kindOf(path.basename(twinAbs)) === 'raw' ? twinAbs : null;

      consumed.add(srcAbs);
      if (twinAbs) consumed.add(twinAbs);

      if (formats === 'jpg') rawAbs = null;
      if (formats === 'raw') jpgAbs = null;
      if (!jpgAbs && !rawAbs) continue;

      const baseSrc = jpgAbs ?? rawAbs!;
      const jpgExt = jpgAbs ? path.extname(jpgAbs) : '';
      const rawExt = rawAbs ? path.extname(rawAbs) : '';
      const base = await uniqueBase(path.parse(baseSrc).name, selJpgAbs, jpgExt, selRawAbs, rawExt);

      if (jpgAbs) {
        const dest = path.join(selJpgAbs, base + jpgExt);
        await fs.copyFile(jpgAbs, dest);
        const r = getRating(relOf(jpgAbs));
        if (r > 0) await setRating(relOf(dest), r);
        copied += 1;
      }
      if (rawAbs) {
        const dest = path.join(selRawAbs, base + rawExt);
        await fs.copyFile(rawAbs, dest);
        const r = getRating(relOf(rawAbs));
        if (r > 0) await setRating(relOf(dest), r);
        copied += 1;
      }
      shots += 1;
    }

    if (shots === 0) throw new AppError('No valid photos to add to the album', 400);
    return { name: albumName, path: albumRel, shots, copied };
  },

  /**
   * Save one manually uploaded edited JPG into `Albums/<name>/Edited/`. The
   * album must already exist; the file is validated as a real JPEG and written
   * atomically (temp + rename). A same-named file is overwritten so re-uploading
   * a corrected edit replaces the old one.
   */
  async uploadEdited(
    albumNameRaw: string,
    filenameRaw: string,
    data: Buffer,
  ): Promise<{ name: string; size: number }> {
    const albumName = sanitizeAlbumName(albumNameRaw);
    const filename = sanitizeEditedFilename(filenameRaw);
    if (data.length === 0) throw new AppError('No file data received', 400);
    if (data.length > config.uploadMaxBytes) throw new AppError('File is too large', 413);
    assertJpegMagic(data);

    const albumAbs = safeResolve(`${ALBUMS_ROOT}/${albumName}`);
    const albumStat = await fs.stat(albumAbs).catch(() => {
      throw new AppError('Album not found', 404);
    });
    if (!albumStat.isDirectory()) throw new AppError('Album not found', 404);

    const editedAbs = path.join(albumAbs, 'Edited');
    await fs.mkdir(editedAbs, { recursive: true });

    const destAbs = path.join(editedAbs, filename);
    const tmp = `${destAbs}.tmp-${Date.now()}`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, destAbs);
    return { name: filename, size: data.length };
  },

  /** Validate paths for bulk download; returns {abs,name} with de-duped names. */
  async resolveForZip(rels: string[]): Promise<{ abs: string; name: string }[]> {
    const out: { abs: string; name: string }[] = [];
    const seen = new Map<string, number>();
    for (const rel of rels) {
      const file = safeResolve(rel);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat?.isFile()) continue;
      let name = path.basename(file);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      if (n > 1) name = `${n}_${name}`;
      out.push({ abs: file, name });
    }
    if (out.length === 0) throw new AppError('No valid files to download', 400);
    return out;
  },

  /** Permanently delete files (and their JPG/RAW twins) + caches + ratings. */
  async remove(rels: string[]): Promise<number> {
    await loadRatings();
    const root = path.resolve(config.photosPath);

    // Expand the selection to include each photo's twin, de-duplicated.
    const targets = new Set<string>();
    for (const rel of rels) {
      targets.add(rel);
      const twin = await twinOf(rel);
      if (twin) targets.add(twin);
    }

    let count = 0;
    for (const rel of targets) {
      const file = safeResolve(rel);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat || !stat.isFile()) continue;
      for (const cf of cacheFilesFor(file, stat)) {
        await fs.unlink(cf).catch(() => {});
      }
      await fs.unlink(file);
      await removeRating(toPosix(path.relative(root, file)));
      count++;
    }
    if (count === 0) throw new AppError('No valid files to delete', 400);
    return count;
  },

  /** Flat, newest-first stream of every photo in the share (twins paired). */
  async timeline(limit = 1000): Promise<GalleryTimelineResult> {
    await loadRatings();
    const root = path.resolve(config.photosPath);
    const albumsRoot = path.join(root, ALBUMS_ROOT);
    const MAX_WALK = 20000;
    const collected: {
      relPath: string; name: string; size: number; modified: number; kind: GalleryItemKind;
    }[] = [];

    const walk = async (absDir: string): Promise<void> => {
      if (collected.length >= MAX_WALK) return;
      let dirents: import('node:fs').Dirent[];
      try {
        dirents = await fs.readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of dirents) {
        if (e.name.startsWith('.')) continue;
        const abs = path.join(absDir, e.name);
        if (e.isDirectory()) {
          if (abs === albumsRoot) continue; // album copies aren't part of the archive
          await walk(abs);
          continue;
        }
        if (!e.isFile()) continue;
        const kind = kindOf(e.name);
        if (!kind) continue;
        let s: import('node:fs').Stats;
        try {
          s = await fs.stat(abs);
        } catch {
          continue;
        }
        collected.push({
          relPath: toPosix(path.relative(root, abs)),
          name: e.name,
          size: s.size,
          modified: s.mtimeMs,
          kind,
        });
        if (collected.length >= MAX_WALK) return;
      }
    };
    await walk(root);

    const twins = computeTwins(collected.map((c) => ({ relPath: c.relPath, kind: c.kind })));
    collected.sort((a, b) => b.modified - a.modified);
    const truncated = collected.length > limit;
    const items: GalleryItem[] = collected.slice(0, limit).map((c) => ({
      path: c.relPath,
      name: c.name,
      size: c.size,
      modified: c.modified,
      kind: c.kind,
      rating: getRating(c.relPath),
      twin: twins.get(c.relPath),
    }));
    return { items, truncated };
  },

  async render(rel: string, variant: Variant): Promise<{ data: Buffer; type: string }> {
    const file = safeResolve(rel);
    const stat = await fs.stat(file).catch(() => {
      throw new AppError('Not found', 404);
    });
    if (!stat.isFile()) throw new AppError('Not a file', 400);

    const { width, quality } = SIZES[variant];
    const key = createHash('sha1')
      .update(`${file}|${stat.mtimeMs}|${stat.size}|${variant}|${width}`)
      .digest('hex');
    const cacheFile = path.join(config.cacheDir, `${key}.webp`);

    try {
      return { data: await fs.readFile(cacheFile), type: 'image/webp' };
    } catch {
      /* cache miss → generate */
    }

    // RAW files can't be decoded by sharp directly; use the camera's embedded
    // JPEG preview instead. (Throws 415 here if there's no usable preview.)
    const ext = path.extname(file).toLowerCase();
    const input: string | Buffer = RAW.has(ext) ? await extractRawPreview(file) : file;

    let out: Buffer;
    try {
      out = await sharp(input, { failOn: 'none' })
        .rotate() // honor EXIF orientation
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
    } catch {
      throw new AppError('Cannot render this image format', 415);
    }

    await fs.mkdir(config.cacheDir, { recursive: true });
    const tmp = `${cacheFile}.tmp`;
    await fs.writeFile(tmp, out);
    await fs.rename(tmp, cacheFile);
    return { data: out, type: 'image/webp' };
  },

  async original(rel: string): Promise<{ stream: Readable; name: string; size: number; type: string }> {
    const file = safeResolve(rel);
    const stat = await fs.stat(file).catch(() => {
      throw new AppError('Not found', 404);
    });
    if (!stat.isFile()) throw new AppError('Not a file', 400);
    return {
      stream: createReadStream(file),
      name: path.basename(file),
      size: stat.size,
      type: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    };
  },
};
