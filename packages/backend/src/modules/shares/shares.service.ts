import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { AppError } from '../../middleware/index.js';
import type {
  ShareSummary,
  ShareCreateResult,
  SharePublicState,
  SharePublicItem,
  ShareKind,
} from '@sonycam/shared';
import {
  type ShareRecord,
  loadShares,
  listShares,
  getShareById,
  getShareBySlug,
  putShare,
  deleteShare,
} from './shares.store.js';
import { hashPassword, verifyPassword, newId, newSlug } from './shares.auth.js';
import { progressStart, progressTick, progressEnd } from './shares.progress.js';
import { compareNames } from '../../utils/naturalOrder.js';

const JPG_EXTS = new Set(['.jpg', '.jpeg']);
const EDITED_DIR = 'Edited';

/** A record's kind; pre-kind records on disk are proofing shares. */
function kindOf(rec: ShareRecord): ShareKind {
  return rec.kind ?? 'proofing';
}

/** Absolute path to a share's preview folder on disk. */
function previewsDirFor(id: string): string {
  return path.join(config.dataDir, 'shares', id, 'previews');
}

/** Preview file (webp) basename for an original edited filename. */
function previewNameFor(file: string): string {
  return `${path.parse(file).name}.webp`;
}

/** Public client link for a share. Absolute when SHARE_HOST is configured (so
 *  the owner can copy a link that resolves on the no-Access share host),
 *  otherwise a relative /s/<slug> path for single-host dev. */
function publicUrl(slug: string): string {
  return config.shareHost ? `https://${config.shareHost}/s/${slug}` : `/s/${slug}`;
}

/** Resolve a share-relative album path and keep it inside the photos root. */
function safeAlbumDir(albumPath: string): string {
  const root = path.resolve(config.photosPath);
  const full = path.resolve(root, albumPath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    throw new AppError('Album path is outside the share', 403);
  }
  return full;
}

/** Reject anything that isn't a single safe filename (no traversal/subpaths). */
function assertPlainFilename(file: string): void {
  if (!file || file.includes('/') || file.includes('\\') || file.includes('..') || file.startsWith('.')) {
    throw new AppError('Invalid filename', 400);
  }
}

/** List edited JPG filenames in an album's Edited/ folder, sorted by name. */
async function listEditedJpgs(albumPath: string): Promise<string[]> {
  const editedDir = path.join(safeAlbumDir(albumPath), EDITED_DIR);
  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fs.readdir(editedDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return dirents
    .filter((d) => d.isFile() && !d.name.startsWith('.') && JPG_EXTS.has(path.extname(d.name).toLowerCase()))
    .map((d) => d.name)
    .sort(compareNames);
}

/** Escape text for safe inclusion in an SVG. */
function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;');
}

/**
 * Full-frame diagonal watermark, sized to the preview's actual dimensions and
 * composited over the centre. The text spans ~65% of the image width at -30°,
 * faint white with a soft dark stroke so it reads on both bright and dark
 * photos. Uses a generic sans-serif so it works with whatever font is present
 * (DejaVu in the Alpine image, Arial on Windows).
 */
function watermarkSvg(width: number, height: number): Buffer {
  const text = config.shares.watermarkText;
  // Approximate sans-serif advance of ~0.6em per glyph: choose the font size
  // that makes the text span ~65% of the image width.
  const fontSize = Math.max(24, Math.round((width * 0.65) / (Math.max(text.length, 1) * 0.6)));
  const cx = width / 2;
  const cy = height / 2;
  const stroke = Math.max(1, Math.round(fontSize / 40));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${fontSize}" font-weight="700"
        fill="#fff" fill-opacity="0.2" stroke="#000" stroke-opacity="0.15" stroke-width="${stroke}"
        text-anchor="middle" dominant-baseline="central"
        transform="rotate(-30 ${cx} ${cy})">${escapeXml(text)}</text>
</svg>`;
  return Buffer.from(svg);
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving input
 * order in the results. No dependency — a small index-sharing worker pool.
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** Regenerate the watermarked preview set for a share from its album's Edited/.
 *  When a progressId is supplied, done/total counts are published for the
 *  owner UI to poll; the entry lives exactly as long as this function runs. */
async function generatePreviews(id: string, albumPath: string, progressId?: string, watermark = true): Promise<string[]> {
  const items = await listEditedJpgs(albumPath);
  const dir = previewsDirFor(id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  if (items.length === 0) return items;

  const editedDir = path.join(safeAlbumDir(albumPath), EDITED_DIR);
  const { previewMaxEdge, previewQuality } = config.shares;
  if (progressId) progressStart(progressId, items.length);
  try {
    // Render previews concurrently across CPU cores (capped, since each
    // full-res decode holds memory). Order is preserved; files sharp can't
    // decode return null and are dropped, so the result reflects only
    // previews that landed.
    const concurrency = Math.max(1, Math.min(os.cpus().length, 4));
    const results = await mapLimit(items, concurrency, async (name) => {
      const src = path.join(editedDir, name);
      const out = path.join(dir, previewNameFor(name));
      try {
        // Two passes: resize first to learn the preview's real dimensions,
        // then composite a watermark drawn at exactly that size (the diagonal
        // text scales with each photo's aspect ratio).
        const resized = await sharp(src, { failOn: 'none' })
          .rotate()
          .resize({ width: previewMaxEdge, height: previewMaxEdge, fit: 'inside', withoutEnlargement: true })
          .withIccProfile('srgb') // convert wide-gamut (Adobe RGB etc.) exports to sRGB before compositing
          .toBuffer({ resolveWithObject: true });
        await sharp(resized.data)
          .composite(watermark ? [{ input: watermarkSvg(resized.info.width, resized.info.height) }] : [])
          .webp({ quality: previewQuality })
          .toFile(out);
        return name;
      } catch {
        return null; // sharp couldn't decode it; it just won't appear as a preview
      } finally {
        if (progressId) progressTick(progressId); // counts processed, not just succeeded
      }
    });
    return results.filter((n): n is string => n !== null);
  } finally {
    if (progressId) progressEnd(progressId);
  }
}

/** Project a record to its owner-facing summary (drops the password hash). */
function toSummary(rec: ShareRecord): ShareSummary {
  return {
    id: rec.id,
    slug: rec.slug,
    albumName: rec.albumName,
    albumPath: rec.albumPath,
    cap: rec.cap,
    kind: kindOf(rec),
    phase: rec.phase,
    previewCount: rec.items.length,
    selectedCount: rec.selections.length,
    selections: [...rec.selections],
    url: publicUrl(rec.slug),
    createdAt: rec.createdAt,
    submittedAt: rec.submittedAt,
  };
}

/** Look up a record by slug or throw a 404. */
function requireBySlug(slug: string): ShareRecord {
  const rec = getShareBySlug(slug);
  if (!rec) throw new AppError('Share not found', 404);
  return rec;
}

/** Build the client-facing state for a share (no secrets, this share only). */
function toPublicState(rec: ShareRecord): SharePublicState {
  const picked = new Set(rec.selections);
  const items: SharePublicItem[] = rec.items.map((file) => ({ file, selected: picked.has(file) }));
  return {
    albumName: rec.albumName,
    kind: kindOf(rec),
    phase: rec.phase,
    cap: rec.cap,
    selectedCount: rec.selections.length,
    items,
  };
}

export const sharesService = {
  /** Create a share from an album's Edited/ JPGs. Generates the previews now.
   *  A 'proofing' share starts the pick-and-submit flow; a 'delivery' share is
   *  born downloadable (no cap, unwatermarked previews). */
  async create(albumPath: string, cap: number, password: string, progressId?: string, kind: ShareKind = 'proofing'): Promise<ShareCreateResult> {
    await loadShares();
    if (typeof albumPath !== 'string' || !albumPath.startsWith('Albums/')) {
      throw new AppError('A valid album path is required', 400);
    }
    const isDelivery = kind === 'delivery';
    if (!isDelivery && (!Number.isFinite(cap) || cap < 1 || cap > 1000)) {
      throw new AppError('cap must be between 1 and 1000', 400);
    }
    if (typeof password !== 'string' || password.length < 4) {
      throw new AppError('Password must be at least 4 characters', 400);
    }

    const editedJpgs = await listEditedJpgs(albumPath);
    if (editedJpgs.length === 0) {
      throw new AppError('This album has no edited JPGs to share (Edited/ is empty)', 400);
    }

    const id = newId();
    const items = await generatePreviews(id, albumPath, progressId, !isDelivery);
    if (items.length === 0) throw new AppError('Could not generate any previews', 500);

    const { salt, hash } = await hashPassword(password);
    const rec: ShareRecord = {
      id,
      slug: newSlug(),
      albumName: albumPath.slice('Albums/'.length),
      albumPath,
      cap: isDelivery ? 0 : cap,
      kind,
      passwordSalt: salt,
      passwordHash: hash,
      phase: isDelivery ? 'delivery' : 'proofing',
      items,
      selections: [],
      createdAt: Date.now(),
      submittedAt: null,
    };
    await putShare(rec);
    return toSummary(rec);
  },

  /** All shares, newest first (owner dashboard). */
  async list(): Promise<ShareSummary[]> {
    await loadShares();
    return listShares().map(toSummary);
  },

  /** Release full-res downloads. Only valid once the client has submitted. */
  async enableDelivery(id: string): Promise<ShareSummary> {
    await loadShares();
    const rec = getShareById(id);
    if (!rec) throw new AppError('Share not found', 404);
    if (kindOf(rec) === 'delivery') {
      throw new AppError('This share is already a download-everything link', 409);
    }
    if (rec.phase === 'proofing') {
      throw new AppError('The client has not submitted their selection yet', 400);
    }
    const next: ShareRecord = { ...rec, phase: 'delivery' };
    await putShare(next);
    return toSummary(next);
  },

  /** Rebuild previews from the album's current Edited/ contents. Selections
   *  that no longer exist are pruned; phase is left unchanged. */
  async refresh(id: string, progressId?: string): Promise<ShareSummary> {
    await loadShares();
    const rec = getShareById(id);
    if (!rec) throw new AppError('Share not found', 404);
    const items = await generatePreviews(rec.id, rec.albumPath, progressId, kindOf(rec) !== 'delivery');
    if (items.length === 0) throw new AppError('No edited JPGs to publish', 400);
    const keep = new Set(items);
    const next: ShareRecord = {
      ...rec,
      items,
      selections: rec.selections.filter((f) => keep.has(f)),
    };
    await putShare(next);
    return toSummary(next);
  },

  /** Revoke a share: delete its preview folder and its record. */
  async revoke(id: string): Promise<void> {
    await loadShares();
    const rec = getShareById(id);
    if (!rec) throw new AppError('Share not found', 404);
    await fs.rm(path.join(config.dataDir, 'shares', rec.id), { recursive: true, force: true });
    await deleteShare(rec.id);
  },

  // ── Client (public) surface ───────────────────────────────────────────────

  /** Verify a share password. Returns true on success. */
  async authenticate(slug: string, password: string): Promise<boolean> {
    await loadShares();
    const rec = requireBySlug(slug);
    if (typeof password !== 'string' || password.length === 0) return false;
    return verifyPassword(password, rec.passwordSalt, rec.passwordHash);
  },

  /** Client-facing state (after the cookie gate). */
  async publicState(slug: string): Promise<SharePublicState> {
    await loadShares();
    return toPublicState(requireBySlug(slug));
  },

  /** Replace the client's selection set. Proofing only; cap enforced. */
  async setSelections(slug: string, files: string[]): Promise<SharePublicState> {
    await loadShares();
    const rec = requireBySlug(slug);
    if (kindOf(rec) === 'delivery') {
      throw new AppError('This gallery does not use selections', 409);
    }
    if (rec.phase !== 'proofing') {
      throw new AppError('This selection has already been submitted', 409);
    }
    const known = new Set(rec.items);
    const picked: string[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      if (typeof f !== 'string' || !known.has(f) || seen.has(f)) continue;
      seen.add(f);
      picked.push(f);
    }
    if (picked.length > rec.cap) {
      throw new AppError(`You can select at most ${rec.cap} photo${rec.cap === 1 ? '' : 's'}`, 400);
    }
    const next: ShareRecord = { ...rec, selections: picked };
    await putShare(next);
    return toPublicState(next);
  },

  /** Lock the client's picks. Proofing -> submitted; needs at least one pick. */
  async submit(slug: string): Promise<SharePublicState> {
    await loadShares();
    const rec = requireBySlug(slug);
    if (kindOf(rec) === 'delivery') {
      throw new AppError('This gallery does not use selections', 409);
    }
    if (rec.phase !== 'proofing') {
      throw new AppError('This selection has already been submitted', 409);
    }
    if (rec.selections.length === 0) {
      throw new AppError('Select at least one photo before submitting', 400);
    }
    const next: ShareRecord = { ...rec, phase: 'submitted', submittedAt: Date.now() };
    await putShare(next);
    return toPublicState(next);
  },

  /** Serve a watermarked preview (webp) for one item. Must be a known item. */
  async preview(slug: string, file: string): Promise<{ data: Buffer; type: string }> {
    await loadShares();
    const rec = requireBySlug(slug);
    assertPlainFilename(file);
    if (!rec.items.includes(file)) throw new AppError('Not found', 404);
    const abs = path.join(previewsDirFor(rec.id), previewNameFor(file));
    try {
      return { data: await fs.readFile(abs), type: 'image/webp' };
    } catch {
      throw new AppError('Preview not found', 404);
    }
  },

  /** Stream one full-res edited JPG. Delivery phase + selected items only. */
  async download(slug: string, file: string): Promise<{ stream: Readable; name: string; size: number; type: string }> {
    await loadShares();
    const rec = requireBySlug(slug);
    assertPlainFilename(file);
    if (rec.phase !== 'delivery') throw new AppError('Downloads are not available yet', 403);
    const allowed = kindOf(rec) === 'delivery' ? rec.items : rec.selections;
    if (!allowed.includes(file)) throw new AppError('Not part of your selection', 403);
    const abs = path.join(safeAlbumDir(rec.albumPath), EDITED_DIR, file);
    const stat = await fs.stat(abs).catch(() => {
      throw new AppError('File not found', 404);
    });
    if (!stat.isFile()) throw new AppError('Not a file', 400);
    return { stream: createReadStream(abs), name: file, size: stat.size, type: 'image/jpeg' };
  },

  /** Resolve the selected full-res files for the zip-all download. */
  async selectedForZip(slug: string): Promise<{ abs: string; name: string }[]> {
    await loadShares();
    const rec = requireBySlug(slug);
    if (rec.phase !== 'delivery') throw new AppError('Downloads are not available yet', 403);
    const editedDir = path.join(safeAlbumDir(rec.albumPath), EDITED_DIR);
    const wanted = kindOf(rec) === 'delivery' ? rec.items : rec.selections;
    const out: { abs: string; name: string }[] = [];
    for (const file of wanted) {
      const abs = path.join(editedDir, file);
      const stat = await fs.stat(abs).catch(() => null);
      if (stat?.isFile()) out.push({ abs, name: file });
    }
    if (out.length === 0) throw new AppError('No files to download', 404);
    return out;
  },
};
