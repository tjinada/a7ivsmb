# Phase 3 — Gallery (thumbnails, enlarge, download)

**Status:** Complete. Built and validated 2026-06-14
(`pnpm build` green; live: list returns share photos, `thumb`/`preview`
serve WebP with a working disk cache, `original` streams the exact bytes,
a non-image returns 415, and `?path=../..` traversal is rejected 403).
Parent: [`docs/DESIGN.md`](../DESIGN.md). Builds on Phases 1–2.

Goal: browse the photos that have landed in the share — a fast thumbnail
grid, a full-screen enlarge view, and download/share to the phone. All reads
are local filesystem (the share is bind-mounted), with `sharp` generating
disk-cached renditions.

## Scope (this phase only)

- `gallery` backend module:
  - `list` — bounded recursive walk of `PHOTOS_PATH` for displayable images,
    newest-first, with `limit`/`offset`. Sandboxed to the share root.
  - `thumb` / `preview` — `sharp` resizes (≈400px / ≈2048px), EXIF-rotated,
    WebP, written to a disk cache keyed by path+mtime+size+variant. Cache
    hit serves bytes directly; unsupported formats fail gracefully (415).
  - `original` — streams the untouched file for download.
  - All endpoints `requireAuth`.
- Shared types: `PhotoEntry`, `GalleryListResult`.
- Frontend Gallery screen:
  - Responsive thumbnail grid, newest-first, lazy-loaded.
  - `AuthImage` — fetches each rendition as an authorized blob (JWT can't ride
    on `<img src>`), with an `IntersectionObserver` so only near-viewport
    tiles load.
  - Lightbox — full-screen `preview`, native pinch-zoom, download/share, close.
  - Download/share via the Web Share API when available (save to Photos),
    else an anchor download of the original.
  - Manual refresh.

## Explicitly NOT in this phase (later)

- Transfers monitor UI + FTP settings/camera helper → Phase 4.
- Folder navigation as a file tree; swipe between photos in the lightbox;
  gesture pull-to-refresh → polish / future.
- RAW (.arw/.dng) preview extraction and video → future. v1 lists only
  browser-renderable raster formats.

## Key decisions

- **Bind-mount, not SFTP.** Listing and rendering are plain `fs` + `sharp`
  on the mounted share — fast, no SSH (per the design's host-access choice).
- **Authorized images via blobs.** Thumbnails/preview are fetched with the
  axios client (Bearer header, 401-refresh) and shown via object URLs, rather
  than adding a query-token auth path for `<img>`.
- **Two cached renditions + original.** `thumb` for the grid, `preview` for
  enlarge (keeps mobile data sane), and the untouched `original` only on an
  explicit download.
- **Graceful on bad/unsupported files.** A non-image (or RAW) returns 415 and
  the tile shows a placeholder rather than breaking the grid.

## Acceptance

- A real image in the share appears in `GET /api/gallery`, its `thumb` and
  `preview` return WebP bytes, and `original` returns the exact file.
- Second thumb request is served from the disk cache.
- A non-image file (e.g. the Phase-2 test `.JPG`) returns 415, not a crash.
- Path traversal (`?path=../...`) is rejected (403).
- In the UI: grid loads lazily, tapping a tile opens the enlarge view, and
  download/share works on a phone.

## Revision — folder-aware (2026-06-14)

The real share is organised into subfolders (e.g. `June Photos JPG`,
`June Photos RAW`) and will grow large, so the flat recursive stream was
replaced with **folder browsing** before moving on:

- Backend `GET /api/gallery/browse?path=<dir>` lists one directory
  (non-recursive): subfolders + items, newest-activity-first. Scales — each
  view scans a single folder, not the whole tree (the old 10k scan cap and
  its "newest could be missed" problem are gone). `thumb`/`preview`/`original`
  are unchanged and handle subfolder paths (incl. spaces).
- Items carry a `kind`: `image` (thumbnailed) or `raw` (.arw/.dng/etc.),
  shown as a download-only tile with a RAW badge.
- Frontend Gallery is now a breadcrumb folder browser: tap a folder to drill
  in, tap an image to enlarge, tap a RAW tile to download the original.
- Shared types: `FolderEntry`, `GalleryItem`, `GalleryBrowseResult` (replaced
  `PhotoEntry`/`GalleryListResult`).

Validated live against a `June Photos JPG` / `June Photos RAW` structure:
root lists folders only; JPG folder → image item; RAW folder → raw item;
thumb with spaces in the path → WebP; `../..` → 403.

A flat "Recent across all folders" view remains a future option (cheap to add
later from an index updated by the FTP receive events).
