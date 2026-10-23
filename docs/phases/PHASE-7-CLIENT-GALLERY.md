# Phase 7 — Client gallery experience

**Status:** Approved 2026-10-22. Scope is the standalone client page served at
`/s/:slug` and the `/api/public/share/:slug` endpoints behind it. The owner
PWA is untouched except where it reads shared types.

Goal: when a client opens a share link they should get something that feels
like a photographer's delivery, not an admin tool — fast on a phone, photos
shown uncropped, an obvious way to pick favourites, and a painless download.

## Decisions

| # | Decision |
|---|----------|
| C-a | No cover hero. Flat header; the photos are the colour. |
| C-b | Tap opens the lightbox; the **heart** toggles a favourite (tile corner + lightbox). Copy says "favourites", never "selection". |
| C-c | No per-photo client notes (YAGNI). |
| C-d | Brand comes from env: `SHARE_BRAND_NAME` (and `SHARE_WHATS_NEXT`). No logo file. |
| C-e | Inter, self-hosted (400/500/600 latin, OFL), served by the backend. |
| C-f | Dark only, neutral greys, single amber accent (`#E3A33B`, matches the OG card). |

Mockup: Claude Design canvas "Client Gallery Mockup" (phone + desktop
artboards for gate, proofing, lightbox, submitted, delivery).

## Work items (in build order)

**C9 — Page as real files.** `packages/backend/client/share/{page.html,
page.css, page.js, inactive.html, fonts/}`. The backend reads `page.html`
once at startup (every request in dev), substitutes `{{TITLE}}`, `{{OG}}` and
`{{SLUG}}` (attribute-escaped; the slug rides on `<body data-slug>` so the
page has **no inline script** — CSP-ready). Assets served at
`/share-assets/*` with a long cache, public on every host like `/og.png`.
The `client/` folder sits outside `src/` so the same relative path works from
`src/` (tsx) and `dist/` (node); the Dockerfile copies it into the image.

**C1 — Thumbs + dimensions.** `generatePreviews()` also writes a 480 px
`thumbs/<name>.webp` from the resized preview buffer and records
`{ w, h }` per item in a new `dims` map on the record. Old records are
backfilled lazily: on the first `publicState()` that finds an item without
dims, read them from the preview with `sharp().metadata()` and persist. A
thumb request for an old share falls back to generating the thumb from the
preview on first miss. No forced refresh of existing shares.

**C2 — Justified rows.** `page.js` lays tiles out in rows of a target height
(150 px phone, 240 px ≥ 900 px wide), scaling each row to fill the width so
every photo is shown uncropped. Tiles reserve their aspect ratio so nothing
jumps while images stream in; the grid uses thumbs, the lightbox uses
previews.

**C4/C5 — Favourites.** Heart in the tile corner, big heart button in the
lightbox. "All / Favourites · n" toggle in the header, available in proofing
and after submit. Lightbox preloads prev/next; double-tap toggles 2.5× zoom
(pinch stays native).

**C3/C6 — Identity + after-submit.** `SHARE_BRAND_NAME` in the page title,
`og:site_name`, the OG card and the gate copy ("*Brand* has shared *Album*
with you"). After submit: confirmation card with `SHARE_WHATS_NEXT`, then
the favourites grid.

**C7 — Delivery.** `publicState` adds `downloadBytes` (sum of the originals)
so "Download all" shows count and size. Per-photo **Save** uses the Web Share
API where it exists (iOS/Android share sheet → Save Image) and falls back to
an anchor download.

**C8 — Polish.** Safe-area insets, show-password toggle with
`autocomplete="current-password"`, "7 days on this device" note, Inter.

## API additions (all additive)

- `GET /api/public/share/:slug/thumb/:file` — cookie-gated, `image/webp`.
- `SharePublicItem` gains `w`, `h`.
- `SharePublicState` gains `brandName`, `whatsNext`, `downloadBytes`
  (delivery phase only).

## Config

```
SHARE_BRAND_NAME=                 # shown to clients; blank → "Your photographer"
SHARE_WHATS_NEXT=                 # after-submit copy; has a sensible default
```

## Out of scope

Owner-app push on submit (push is a separate phase), per-photo notes,
light theme, share expiry/activity tracking.
