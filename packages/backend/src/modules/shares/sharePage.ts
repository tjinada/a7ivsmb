// Standalone client proofing page served at /s/:slug on the share host. It is
// deliberately NOT part of the React PWA: one self-contained HTML document plus
// a stylesheet, a script and the Inter font, so there is no service worker, no
// app shell, and nothing that could leak the owner gallery.
//
// The markup, CSS and JS are plain files under packages/backend/client/share/
// (real files with highlighting, not template strings). This module only fills
// the HTML template's {{TITLE}}, {{OG}}, {{SLUG}} and {{ASSET_V}} holes. The
// slug rides on <body data-slug> so the page needs NO inline script, which
// keeps a strict Content-Security-Policy possible later.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShareKind } from '@sonycam/shared';
import { config } from '../../config/index.js';

// client/ sits beside src/ and dist/, so this relative path resolves the same
// under tsx (src/modules/shares) and node (dist/modules/shares).
const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(here, '../../../client/share');

/** Folder served at /share-assets (CSS, JS, fonts). Templates stay private. */
export const SHARE_ASSETS_DIR = path.join(CLIENT_DIR, 'assets');

/** Cache-buster for asset URLs. The container restarts on every deploy, so a
 *  process-start stamp is enough to get clients past their cached copies. */
export const SHARE_ASSET_VERSION = Date.now().toString(36);

const cache = new Map<string, string>();

/** Read a template; cached in production, re-read per request in dev so the
 *  page can be edited without restarting the server. */
async function template(name: string): Promise<string> {
  if (config.isProduction) {
    const hit = cache.get(name);
    if (hit) return hit;
  }
  const text = await fs.readFile(path.join(CLIENT_DIR, name), 'utf8');
  cache.set(name, text);
  return text;
}

/** Server-side HTML/attribute escape for values injected into the template. */
function escAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}

/** Replace {{KEY}} holes. Values must already be escaped by the caller. */
function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? '');
}

/** Render the full standalone client page for a share slug. */
export async function renderSharePage(slug: string, meta: { albumName: string; kind: ShareKind }): Promise<string> {
  const brand = escAttr(config.shares.brandName);
  const album = escAttr(meta.albumName);
  const title = `${album} — ${brand}`;
  const desc = meta.kind === 'delivery'
    ? 'Your photos are ready to view and download.'
    : 'Your photos are ready — view the gallery and pick your favourites.';
  // OG URLs must be absolute; without SHARE_HOST (single-host dev) the unfurl
  // tags are omitted and the page still works.
  const base = config.shareHost ? `https://${config.shareHost}` : '';
  const og = base
    ? `<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${brand}"/>
<meta property="og:title" content="${album}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${base}/s/${escAttr(slug)}"/>
<meta property="og:image" content="${base}/og.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>`
    : '';
  return fill(await template('page.html'), {
    TITLE: title,
    OG: og,
    SLUG: escAttr(slug),
    BRAND: brand,
    ALBUM: album,
    ASSET_V: SHARE_ASSET_VERSION,
  });
}

/** Static page for a link that no longer resolves to a share (revoked or never
 *  existed — indistinguishable once the record is deleted). No JS, no slug
 *  echo; same styling as the gate so it reads as part of the same product. */
export async function renderInactivePage(): Promise<string> {
  return fill(await template('inactive.html'), {
    BRAND: escAttr(config.shares.brandName),
    ASSET_V: SHARE_ASSET_VERSION,
  });
}
