# Phase 11 — Client share activity

Branch: `feature/share-activity`

## Goal

Let the owner see what a client did with a link: whether and when they opened
it, on what kind of device, which photos they downloaded, and whether a ZIP
download finished.

## Approach

Recorded server-side inside the existing public share endpoints. The client
page gets no tracking script.

| Signal | Where | When it counts |
|---|---|---|
| Open | `GET /list`, successful `POST /auth` | Once per device class per 30 min (reloads inside the window don't count) |
| Photo download | `GET /download/:file` (per-photo icon, lightbox, Save all to Photos) | On response `finish` only — aborted transfers don't count |
| ZIP | `GET /download-all` | `started` when streaming begins, `completed` on `finish` |

Not recorded: thumbnail/preview loads, IP addresses, raw user-agent strings.
Proofing picks (shortlist, final, submittedAt) are already stored on the share.

Device class comes from the user-agent: iPhone, iPad, Android phone, Android
tablet, Mac, Windows, Other. iPadOS Safari reports itself as a Mac, so an iPad
can show as "Mac".

"Save all to Photos" shows as per-photo downloads: the server knows the photos
reached the phone, not whether the share sheet's Save was tapped.

A completed ZIP counts every delivered photo as downloaded.

## Owner visits

The owner's session cookie is scoped to `/api/gallery`, so the share endpoints
can't recognise the owner. The ⋯ menu gets **Open as client**, which opens the
link with `?preview`. The client page then sets a `sonycam_preview=1` cookie
scoped to that share's API path (30 days). Requests carrying it aren't recorded,
so later visits from the same browser stay excluded too. A client could set it
themselves, which only hides their own activity.

## Storage

`DATA_DIR/share-activity.json`, a `JsonStore` keyed by share **slug** (the
controller already has it; slugs are never reused). Module:
`shares.activity.ts`. Kept apart from `shares.json` because a Save-all of 150
photos is 150 updates. Updates apply in memory and are written about 2 s after
the last one (`JsonStore.updateDeferred`). Up to ~2 s of activity can be lost
on a restart. Turning a link off deletes its activity.

## API / types

`ShareSummary` gains:

- `deliverable: string[]` — the files the client can download (empty until delivery)
- `activity: ShareActivity`

```ts
interface ShareActivity {
  opens: number;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  devices: string[];                 // device classes, most recently seen first
  downloads: Record<string, number>; // file -> completed downloads
  lastDownloadAt: number | null;
  zipStarted: number;
  zipCompleted: number;
}
```

## Owner UI (ClientCard)

- Each link line gets a muted second line: *Opened 4× · last 2h ago on iPhone ·
  18 of 24 downloaded*, *Not opened yet*, or *ZIP started, not finished*.
- ⋯ → **Activity**: a panel listing first/last opened and devices, plus the
  delivered photos — downloaded ones at full strength with a count badge, the
  rest dimmed.
- ⋯ → **Open as client** (see Owner visits).
