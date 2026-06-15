# Phase 5 - Library actions

Adds management on top of the gallery: ratings, filtering, multi-select with
bulk download/share, sharing to the OS share sheet, and delete. Built in
reviewable chunks.

Decisions: delete is **permanent (with a confirm dialog)**; sharing uses the
native Web Share API (OS share sheet -> WhatsApp/Google Photos/Drive/etc.),
which needs the app on HTTPS (planned via Tailscale Serve) and falls back to a
download otherwise.

## Chunk 1 - ratings + filter (done)

Ratings are stored in `data/ratings.json` (share-relative POSIX path -> 1..5),
separate from the photo files so originals are never modified.

Backend:
- `ratings.store.ts`: JsonStore<Record<path, number>>; `getRating`,
  `setRating` (1..5, 0 clears the entry), `removeRating`, lazy `loadRatings`.
- `GalleryItem` gains `rating: number` (0 = unrated); `browse` populates it.
- `PUT /api/gallery/rating { path, stars }` -> validates + sandboxes the path,
  persists, returns the stored value.

Frontend:
- `StarRating.tsx`: 5-star control; tapping the current value clears it.
- Lightbox shows an interactive star row (rate while viewing).
- Tiles show a compact star badge when rated.
- Filter bar (rating threshold All/3+/4+/5 and type All/JPG/RAW), applied
  client-side to the current folder; resets on folder change. Rating changes
  are optimistic (cache update) with revert-on-error.

Validated: rate set/clear round-trips, `browse` returns the rating, value
persists to `ratings.json`, `../` traversal -> 403; builds green.

## Chunk 2 - selection + bulk download/share (done)

- Selection mode: a Select toggle in the breadcrumb bar; tapping tiles toggles
  selection (check overlay + ring); a bottom action bar shows the count with
  Select all / Clear all, Share, Download, Delete. Selection resets on folder
  change. The filter bar hides while selecting.
- Bulk share: `shareItems()` fetches the originals and calls the Web Share API
  with files (WhatsApp/Photos/Drive/etc.). Falls back to the zip download when
  the platform can't share files (e.g. plain HTTP) so the button always works.
- Bulk download: `POST /api/gallery/zip { paths[] }` validates + de-dupes names
  and streams a stored (level 0) `photos.zip` via archiver. Single share/save
  from the lightbox still uses the existing Web-Share-or-download path.

## Chunk 3 - delete (done)

- `POST /api/gallery/delete { paths[] }` permanently removes each file plus its
  cached thumbnail/preview renditions and its rating entry, sandboxed to the
  share. Returns `{ deleted: n }`.
- UI: delete from the lightbox (single) or the selection bar (bulk), both
  behind a `ConfirmDialog`. On success the browse query is invalidated, the
  lightbox closes if its photo was deleted, and selection clears.

Validated: zip returns a valid archive containing the selected files; delete
removes files and their rating entries; `../` traversal -> 403; builds green.