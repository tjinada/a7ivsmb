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

## Not in scope

Crop position for portrait covers on the wide hero; per-album covers for the
gallery's album cards.
