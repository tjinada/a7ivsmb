# Phase 10 — Client delivery page redesign

**Approved 2026-11-01** (D2 as proposed; D6 changed to an icon overlay). Rework what a client sees when they open a delivered
gallery (`/s/:slug`, delivery phase). Approved direction (2026-11-01, canvas
"Client share page redesign"): light theme, cover-photo hero, one download
button per device ("Save all to Photos" on phones, ZIP on desktop/fallback).

Everything lives in the standalone share page (`packages/backend/client/share/`
— vanilla JS/CSS, no build) plus small backend changes. Proofing views
(gate, shortlist, final, submitted) only change colour, not behaviour.

Branch `feature/delivery-page` (off `main` once `feature/workflow` is merged,
or off `feature/workflow` if you want it sooner). Three sub-phases, one commit
each, TS gate before every commit.

## Decisions to confirm

| # | Decision | Proposal |
|---|----------|----------|
| D1 | Light theme scope | Whole share page (gate, proofing, delivery, inactive). Lightbox stays near-black — photos read best on dark. |
| D2 | Display title | Server strips a leading date from the album name: `20261031 - Kai First Halloween` → title `Kai First Halloween`, date `2026-10-31`. No per-share title override (YAGNI) — rename the album if you want "Kai's". |
| D3 | Cover photo | First deliverable photo, served from the existing `/preview/:file` (1600px webp). No cover picker (YAGNI). |
| D4 | Watermark on delivered proofing shares | Today a *proofing* share keeps its watermarked previews after you release delivery, so the hero and lightbox would show "Preview". `enableDelivery` re-renders **only the final picks** without the watermark; non-picked photos stay watermarked (they may be sold as extras). |
| D5 | Android | ZIP for now (same as today). Android's share sheet has no "save to gallery". Revisit sequential per-file downloads after testing on a real device. |
| D6 | Per-tile "Save" buttons in the grid | Replace the "Save" pill with a small round download icon overlaid on each photo (bottom-right). Same action as today: share sheet on iPhone, plain download elsewhere (incl. Android, per D5). Lightbox "Save this photo" stays. |
| D7 | Footer | Brand mark + "Thank you for choosing {brand}" only. No "What's next" (`SHARE_WHATS_NEXT` is the post-*submit* message, wrong for delivery), no contact link, no expiry (not built). |
| D8 | Display font | Add Archivo Expanded (one weight, latin subset, self-hosted woff2 + OFL licence, ~30–50 KB) for the hero title and brand mark. Alternative: Inter caps with wide tracking, zero new assets. |
| D9 | Save-all size limit | `SAVE_ALL_MAX_BYTES = 300 MB` to start; above it, fall back to ZIP. Tune after testing on your iPhone (117 MB album and a ~500 MB one). |

## 10.1 — Backend: title, date, zip name, unwatermarked delivery

**Shared** — `SharePublicState` gains two fields:

```ts
title: string;        // album name with a leading date stripped (D2)
date: string | null;  // ISO 'YYYY-MM-DD' parsed from the album name, or null
```

**`modules/shares/albumTitle.ts`** (new, pure, ~20 lines):

```ts
/** "20261031 - Kai First Halloween" | "2026-10-31 Kai…" → { title, date }.
 *  Accepts YYYYMMDD or YYYY-MM-DD, then an optional - – — _ separator.
 *  Invalid dates or an empty remainder → { title: name, date: null }. */
export function albumTitle(name: string): { title: string; date: string | null }
```

Used by `toPublicState` (new fields) and `renderSharePage` (`{{TITLE}}`,
`og:title`, `data-album`) so the tab title, link unfurl and gate all show
the clean title.

**`shares.controller.downloadAll`** — zip named after the title instead of
`selected.zip`: `Content-Disposition: attachment; filename="<ascii>.zip";
filename*=UTF-8''<encoded>.zip`.

**`shares.service.enableDelivery`** (D4) — extract the per-file body of
`generatePreviews` into `renderPreview(…, watermark)`, then before setting
`phase: 'delivery'` re-render the final picks unwatermarked into the existing
preview/thumb folders (overwrite in place, no wipe). Item list, dims and
picks are unchanged. A few seconds for a typical set; the owner's "Send
finals" button already shows a pending state.

**Cache-bust** — previews/thumbs are served `max-age=86400`, so a client who
saw the watermarked version would keep it for a day. The page appends
`?v=d` to thumb/preview URLs in the delivery phase (server ignores it).

No new routes.

## 10.2 — Light theme (`page.css`, `page.html`, `inactive.html`)

Replace the `:root` tokens; rules that hard-code dark values
(`rgba(255,255,255,.08)` icon buttons, `.tile .save` background, `.pill.on`)
move onto tokens.

```css
--bg: #FAF8F5;  --surface: #F1EDE7;  --border: #E4DFD7;  --border-strong: #D3CCC1;
--text: #1C1B19; --muted: #5E5A54;  --faint: #6E6A63;
--primary: #1C1B19; --on-primary: #FAF8F5;   /* main buttons */
--accent: #B8863B;                            /* hearts, ticks, progress, hairlines */
--tile: #E9E4DC;
```

All text pairs ≥ 4.5:1 on `--bg`. `theme-color` → `#FAF8F5`. Lightbox keeps
its own dark background. Grid: 4px gutters on phone / 6px desktop, square
corners. If D8 is approved, add the Archivo woff2 + licence under
`assets/fonts/` with a preload.

## 10.3 — Delivery view (`page.js`)

`renderDelivery()` is rewritten; other views are untouched apart from the tile Save change (D6) and the cache-bust.

**Layout** (matches the canvas):
- **Hero** — full-bleed cover (`previewUrl(files[0])`, `object-fit: cover`),
  ~70vh phone / 640px desktop, top + bottom scrim. Brand mark top-centre;
  title (caps, Archivo) and formatted date (`Intl.DateTimeFormat`, long month)
  centred near the bottom. Not sticky.
- **Action** — `11 photos · full resolution` line, then one button
  (see below). Desktop: a thin strip under the hero with title + size on the
  left and the button on the right.
- **Grid** — existing justified `Grid` (uncropped photos); the tile Save pill becomes a round download icon (D6).
  Lightbox `download` mode unchanged.
- **Footer** — D7.

**One button, chosen once on render:**

```js
const SAVE_ALL_MAX_BYTES = 300 * 1024 * 1024;           // D9
const canShareFiles = COARSE && !/Android/i.test(navigator.userAgent)  // D5
  && !!navigator.canShare
  && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] });
const mode = canShareFiles && state.downloadBytes <= SAVE_ALL_MAX_BYTES ? 'photos' : 'zip';
```

`zip` → the existing `<a href=".../download-all" download>` styled as the
primary button, labelled `Download all · 117 MB`.

`photos` → a small `SaveAll` controller (one closure, ~60 lines) with four
states, matching the canvas states board:

| State | Button | On tap |
|-------|--------|--------|
| idle | Save all to Photos | → preparing |
| preparing | Preparing photos… 6 of 11 (+ bar), disabled; "Cancel" link | Cancel aborts → idle |
| ready | Save 11 photos | `navigator.share({ files })` |
| done | Done ✓ · "Check your Photos app" | → ready (can share again) |

- **Preparing** fetches `/download/:file` for every deliverable file, 3 at a
  time, into `File` objects; one `AbortController` for Cancel. Any fetch error
  → status message and the button swaps to ZIP mode for this page view.
- **Why two taps:** iOS only allows `share()` inside a user gesture, and the
  gesture expires while ~100 MB downloads. The second tap is the gesture.
- **share() result:** resolves → done; `AbortError` (sheet dismissed) → stay
  ready; anything else → swap to ZIP mode with a short message.
- "Done" rather than "Saved to Photos": `share()` also resolves for AirDrop
  etc., so we can't claim where they went.
- Only `files` are passed to `share()` — adding `title`/`text` makes iOS
  offer to save the text too.
- File refs are dropped when the page unloads; nothing is cached.

## Not in this phase

Cover picker, per-share display title, share expiry, contact link,
Android multi-file save, OG cover image (still the branded card).

## Test plan

- `albumTitle`: `20261031 - X`, `2026-10-31 X`, `2026-10-31`, `Wedding`,
  `20261399 - X` (invalid date).
- iPhone Safari: 117 MB album → Save all → share sheet → "Save 11 Images" →
  photos in Photos at full resolution; Cancel mid-prepare; dismiss sheet;
  ~500 MB album (tunes D9).
- iPhone, Instagram in-app browser → ZIP button.
- Android Chrome → ZIP button. Desktop → ZIP button, zip name is the title.
- Proofing share released to delivery → hero and lightbox unwatermarked (D4).
- Gate, shortlist, final, submitted, inactive pages read correctly in light.
- Before deploy: set `SHARE_BRAND_NAME` on Unraid.
