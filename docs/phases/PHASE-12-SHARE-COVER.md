# Phase 12 — Share link cover photo

Branch: `feature/share-cover`

## Goal

Let the owner choose the photo shown as the hero banner on the client's
delivery page, instead of always the first photo by filename.

## Behaviour

- Per link: `ShareRecord.hero` (an item filename). Absent = default.
- `heroOf(rec)`: before delivery, null; else the chosen cover while it's still
  one the client gets (`deliverable`), otherwise the first of those. A refresh
  that drops the photo, or a picking link whose client didn't pick it, falls
  back quietly.
- `ShareSummary.cover` follows the hero once delivering, so the owner card
  shows what the client sees. `SharePublicState.hero` drives the client page.

## Where it's set

- **Create dialog** — Download all links only (a picking link's client may not
  pick the cover). A *Cover photo* row shows the default; *Change* opens a grid
  of the album's Edited JPGs (from `/gallery/browse`, natural name order to
  match the server). Choosing the first photo sends nothing (default).
  `POST /api/gallery/shares` accepts `hero`; rejected (400) unless the link is
  Download all and the file is in Edited/, checked before previews render.
- **Existing link** — ⋯ → *Choose cover photo*, on links that are delivering
  (download links; picking links after the final photos are sent). Grid of the
  delivered photos; a tap saves straight away; *Use default* resets.
  `POST /api/gallery/shares/:id/hero { file | null }` (409 before delivery,
  400 if the file isn't delivered on that link).

## Cover position (focal point)

The hero crops differently per screen (tall on a phone, wide on a desktop), so
the owner sets a focal point rather than a crop: `ShareRecord.heroFocus { x, y }`
in percent, applied as the hero's `object-position` (set via CSSOM, keeping a
strict CSP possible). Default 50/30 (the page's previous fixed value).

- Set from the cover panel's *Position* section: tap/drag on the photo (or
  arrow keys, Shift for bigger steps); saves on release; *Reset* = default.
  Phone and Desktop previews crop like the client page.
- `POST /:id/hero` takes optional `focus { x, y }` (0–100). A different photo
  without a focus resets it; *Update photos* dropping the cover drops both.
- `ShareSummary.heroFocus`, `SharePublicState.heroFocus`.

## Cover file (high resolution)

The hero is its own render, not the 2560 px preview: 3840 px long edge, WebP
q92 (`SHARE_COVER_MAX_EDGE` / `SHARE_COVER_QUALITY`), made from the edited
original into `DATA_DIR/shares/<id>/cover-<edge>/`. Rendered on first request
and warmed in the background on create, cover change, delivery and refresh;
re-rendered when the original is newer than the cached file. In-flight renders
are shared, so a warm-up and a first visit don't both decode the original.

`GET /api/public/share/:slug/cover` serves only the link's current cover (404
before delivery or if it can't be rendered), behind the usual cookie and expiry
gate. The page requests `…/cover?f=<filename>` so a new cover is a new URL, and
falls back to the preview if the cover fails to load.

## Not in scope

Zooming into the cover; per-album covers for the gallery's album cards.
