# Phase 13 — Share link expiry

Branch: `feature/share-expiry`

## Behaviour

- Per link: `ShareRecord.expiresAt` (epoch ms) and `expiryDays` (the chosen
  length). Null/absent = never. **New links default to 30 days**; records from
  before this phase have neither field and never expire.
- Expired = `now >= expiresAt` (`isExpired`, shares.store). The one gate is
  `requireBySlug` (every public endpoint): 410 "This link has expired". The
  `/s/:slug` page serves an "expired" variant of the inactive page (410)
  instead of the password gate. Owner endpoints ignore expiry.
- Expiry deletes nothing: picks, activity, cover and previews stay, so
  extending revives the same link. Turning a link off is still the delete.
- **Send final photos** restarts the clock with `expiryDays` (a picking link
  sent weeks ago doesn't lapse days after delivery). Never stays never.
- Clients see *Available until <date>* under the photo count on the delivery
  page when the link has an expiry.

## API

- `POST /api/gallery/shares` accepts `expiresInDays` (1–365 or null; omitted =
  30).
- `POST /api/gallery/shares/:id/expiry { days: number | null }` — from now.
- `ShareSummary.expiresAt`, `SharePublicState.expiresAt`.

## Owner UI

- Create dialog: *Link expires* — 7 d · 14 d · **30 d** · 90 d · Never.
- Client card: link line ends "· expires in 12 d" or, in red, "· expired 3 d
  ago"; a card whose links are all expired shows an **Expired** pill (picks
  waiting on you still take priority).
- ⋯ → *Change expiry*: current status plus the same choices, counted from
  today; on an expired link it reads "Bring it back for".
