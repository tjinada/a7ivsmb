import sharp from 'sharp';
import { config } from '../../config/index.js';

/**
 * Static 1200x630 Open Graph card for share-link unfurls (WhatsApp, iMessage,
 * etc). Deliberately generic — no album name, no photo — so nothing about the
 * gallery leaks to link scrapers, which fetch without the share password and
 * cache the image on their own servers. Carries the SHARE_BRAND_NAME so the
 * unfurl says who it's from. Rendered from an inline SVG via sharp on first
 * request and cached in memory; the container ships ttf-dejavu, the same font
 * path the share watermark relies on.
 */

const W = 1200;
const H = 630;

/** Escape text for safe inclusion in an SVG. */
function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;');
}

function cardSvg(): string {
  const brand = escapeXml(config.shares.brandName);
  // Long names shrink so they stay on one line (~0.55em average advance).
  const size = Math.min(64, Math.floor((W * 0.8) / (Math.max(brand.length, 1) * 0.55)));
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#121212"/>
  <!-- aperture motif -->
  <circle cx="600" cy="240" r="96" fill="none" stroke="#E3A33B" stroke-width="10" opacity="0.9"/>
  <circle cx="600" cy="240" r="58" fill="none" stroke="#ededed" stroke-width="6" opacity="0.5"/>
  <circle cx="600" cy="240" r="20" fill="#E3A33B" opacity="0.85"/>
  <text x="600" y="432" text-anchor="middle" font-family="DejaVu Sans" font-size="${size}" font-weight="bold" fill="#ededed">${brand}</text>
  <text x="600" y="500" text-anchor="middle" font-family="DejaVu Sans" font-size="30" fill="#a3a3a3">A private gallery has been shared with you</text>
</svg>`;
}

let cached: Buffer | null = null;

/** Render (once) and return the OG card PNG. */
export async function ogCardPng(): Promise<Buffer> {
  if (!cached) {
    cached = await sharp(Buffer.from(cardSvg())).png().toBuffer();
  }
  return cached;
}
