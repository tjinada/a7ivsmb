import sharp from 'sharp';

/**
 * Static 1200x630 Open Graph card for share-link unfurls (WhatsApp, iMessage,
 * etc). Deliberately generic — no album name, no photo — so nothing about the
 * gallery leaks to link scrapers, which fetch without the share password and
 * cache the image on their own servers. Rendered from an inline SVG via sharp
 * on first request and cached in memory; the container ships ttf-dejavu, the
 * same font path the share watermark relies on.
 */

const W = 1200;
const H = 630;

const CARD_SVG = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- aperture motif -->
  <circle cx="600" cy="240" r="96" fill="none" stroke="#f59e0b" stroke-width="10" opacity="0.9"/>
  <circle cx="600" cy="240" r="58" fill="none" stroke="#e5e7eb" stroke-width="6" opacity="0.5"/>
  <circle cx="600" cy="240" r="20" fill="#f59e0b" opacity="0.85"/>
  <text x="600" y="432" text-anchor="middle" font-family="DejaVu Sans" font-size="64" font-weight="bold" fill="#f9fafb">Photo Gallery</text>
  <text x="600" y="500" text-anchor="middle" font-family="DejaVu Sans" font-size="30" fill="#9ca3af">A private gallery has been shared with you</text>
</svg>`;

let cached: Buffer | null = null;

/** Render (once) and return the OG card PNG. */
export async function ogCardPng(): Promise<Buffer> {
  if (!cached) {
    cached = await sharp(Buffer.from(CARD_SVG)).png().toBuffer();
  }
  return cached;
}
