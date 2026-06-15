import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { AppError } from '../../middleware/index.js';
import type { GalleryBrowseResult, FolderEntry, GalleryItem } from '@sonycam/shared';
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
    return setRating(relPosix, stars);
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

  /** Permanently delete files + their cached renditions + rating entries. */
  async remove(rels: string[]): Promise<number> {
    await loadRatings();
    const root = path.resolve(config.photosPath);
    let count = 0;
    for (const rel of rels) {
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
