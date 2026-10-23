# Phase 8 — Owner app: flow and visual pass

**Approved 2026-10-22.** The owner PWA gets the same visual language as the
client page and a flow built around the real job: cull → album → edit →
share → deliver. Mockups: Claude Design canvas "Client Gallery Mockup",
row "Owner app — proposed" (A1–A4 + Web).

Four sub-phases, one branch (`feature/owner-app`), one commit each, TS gate
before every commit.

## 8.1 — Decompose `GalleryPage` (pure refactor)

`GalleryPage.tsx` (1,100 lines, ~20 `useState` flags) splits into:

```
features/gallery/
  api.ts               fetchers + query/mutation hooks (useBrowse, useTimeline,
                       useAlbums, useShares, useRate, useDeleteItems, …)
  useGalleryDialogs.ts one `dialog` discriminated union instead of 10 booleans
  GalleryPage.tsx      state wiring + composition (~250 lines)
  GalleryToolbar.tsx   view toggle, crumbs, overflow menu
  FilterBar.tsx        rating/type chips
  FolderGrid.tsx       Albums card + folder cards
  PhotoGrid.tsx        grid / timeline sections, PhotoTile
  BulkActionBar.tsx    selection footer + rate picker
  AlbumShareCard.tsx   "Share with client" / "Edited photos" cards
lib/dates.ts           prettyDate, dateKey
```

Zero behaviour change. Dialog components are untouched.

## 8.2 — Tokens, Inter, brand

- `tailwind.config.js`: `gray` → neutral scale; `base/surface/border` →
  `#121212/#1c1c1c/#2a2a2a`; `primary` → amber `#E3A33B` family; new
  `on-accent` (`#121212`). `text-white` on `bg-primary-*` → `text-on-accent`
  (patch script, line-level).
- Inter 400/500/600 self-hosted under `frontend/public/fonts/`, `font-sans`.
- `GET /api/auth/me` returns `{ username, brandName, pathPrefix }`.
  `useAppConfig()` hook. Header shows brand mark + `brandName`; username and
  the header sign-out go (Settings keeps sign-out, now calling `/auth/logout`).
- `window.alert/confirm` in `FtpCard`, `ShareManager`, `BackfillDialog` →
  `toast` / `ConfirmDialog`.

## 8.3 — Shares tab, home strip, album status

Backend (all additive):
- `FolderEntry.unrated?: number` from the ratings store (dated folders only).
- `AlbumInfo` gains `shots`, `edited`.
- `ALBUM_PATH_PREFIX` env (e.g. `\\unraid\data\mekala-share` or
  `/Volumes/mekala-share`) exposed as `pathPrefix` for "Copy folder path".

Frontend:
- **Shares tab** (`/shares`, `SharesPage`): every share, pills All / Needs
  you / Waiting / Sent. Needs-you rows: amber border, **Send final photos**
  + **View picks** inline. Waiting rows: "n shortlisted so far" or "no picks
  yet", copy-link. Sent rows dimmed. `ShareManager` modal is replaced by
  this page; the album card's "Manage links" deep-links to it.
- **TabBar**: Gallery · Shares (badge = submitted count) · Transfers ·
  Settings.
- **Home strip** at the gallery root: *Today* (newest dated folder: count,
  last arrival from FTP status, unrated, **Cull**), *Shares need you*,
  *Albums* (count, ready = has Edited files and no live share).
- **Album root**: stat tiles (shots · edited · share phase), two-step card
  (① Edit picks — tick when every final pick has an edit, Copy folder path,
  Upload; ② Send final photos), pills **Picks / Shortlist / Edited / All**
  over one grid (Picks/Shortlist/Edited read `Edited/`, All reads
  `Selected/JPG`). The Selected/Edited folders stay on disk; the app stops
  navigating into them.

## 8.4 — Cull mode

`/cull?path=<folder>`: full-screen, one photo at a time from the folder's
JPGs (RAW twins rated together, as today). Header: folder, position,
tallies ★5 / ★4 / ✕, progress bar. Chips: filename + RAW/JPG, exposure.
Bottom: **Reject / 1 / 2 / 3 / 4 / ★5**; rating advances to the next photo.
Keys 1–5, X = reject, ←/→ skip, Esc exit. Touch: swipe up = ★5, down =
reject, sideways skip. Reject = rating 1 (matches the existing "below 2"
cleanup). **Delete n rejected** → `ConfirmDialog` → `/gallery/delete`.
Starts at the first unrated photo. Preloads next.

## Out of scope (follow-ups)

Justified owner grid (reuse client layout; needs `w,h` on `GalleryItem`),
Lightroom export-preset mapping, push on submit.
