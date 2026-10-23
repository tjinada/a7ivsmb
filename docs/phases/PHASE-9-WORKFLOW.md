# Phase 9 — Guided workflow (jobs)

**Draft for approval.** One dated folder becomes one *job* that walks the
owner through the real sequence and shows where every shoot stands:

```
① Cull  →  ② Edit  →  ③ Client picks (or skip)  →  ④ Send finals  →  done
```

Client proofing stays as it is today (previews come from `Edited/`, client
picks from the edits). Proofing from unedited originals is a noted future
state, not part of this phase.

Decisions (2026-10-23): one job per dated folder; the album name identifies
the job (no client-name field); stepping back is free until finals are sent.

Three sub-phases on `feature/workflow`, one commit each, TS gate before
every commit.

## 9.1 — Backend: `modules/jobs`

Stored, not derived. A paused job must look different from an abandoned
folder, and the step is something the owner decides (Done editing), not
something the disk can tell us.

```ts
// shared
export type JobStep = 'cull' | 'edit' | 'pick' | 'deliver' | 'done';
export type PickMode = 'client' | 'all';

export interface Job {
  id: string;
  folderPath: string;        // dated Home folder, e.g. "2026-10-22"
  albumPath: string | null;  // "Albums/<name>" once ① is done
  step: JobStep;
  pickMode: PickMode | null; // chosen at ③
  shareId: string | null;    // proofing share (client) or delivery share (all)
  stepAt: Partial<Record<JobStep, number>>;  // when each step was reached
  createdAt: number;
  updatedAt: number;
}

/** Job + what the UI needs to render the step, joined server-side. */
export interface JobSummary extends Job {
  albumName: string | null;
  shots: number;             // Selected/ count (0 until ①)
  edited: number;            // Edited/ count
  share: ShareSummary | null;
  waitingOnClient: boolean;  // step 'pick', mode 'client', share not submitted
}
```

`data/jobs.json` via `JsonStore`, id → record, same as shares.

Routes, mounted at `/api/jobs`, all `requireAuth`:

| Route | Does |
|---|---|
| `GET /` | all jobs as `JobSummary[]`, newest first |
| `GET /by-folder?path=` / `GET /by-album?path=` | the one job for a folder/album, or 404 |
| `POST /` `{ folderPath }` | create at step `cull`; 409 if the folder already has a job |
| `PATCH /:id` `{ step?, albumPath?, pickMode?, shareId? }` | the only mutation; validates below |
| `DELETE /:id` | remove the job (folders/albums untouched) |

Transition rules in the service (one function, table-driven):

- `cull → edit` needs `albumPath` (set in the same PATCH or earlier).
- `edit → pick` needs `edited > 0`.
- `pick → deliver` needs `pickMode`; with `client` also needs the share
  submitted. With `all`, no share yet — it is created at ④.
- `deliver → done` needs `share.phase === 'delivery'`.
- Any step → an earlier step is allowed unless current step is `done`.
- `done` is terminal.

Existing endpoints are reused unchanged for the work itself: album create,
share create, `shares/:id/delivery`. The job only records ids and steps.

## 9.2 — Frontend: Start workflow + stepper

`features/jobs/{api.ts, JobStepper.tsx, StepCard.tsx}`.

**Folder page** (`Home/<date>`): toolbar gets **Start workflow** when the
folder is a dated folder with shots and no job. Once a job exists the
button is replaced by the **stepper strip**: four dots + labels, current
step amber, done steps ticked, with the current step's card beneath.

**Album page**: the same strip and card appear when the album is linked to
a job (`by-album`). The current two-step card in `AlbumPanel` stays for
albums without a job.

Step cards (one primary action each, secondary actions muted):

| Step | Card | Primary | Done when |
|---|---|---|---|
| ① Cull | `n unrated · n ★5` | **Cull** → `/cull` | album created from this folder — the Create Album dialog links it (`PATCH albumPath + step: edit`); **Use existing album…** for folders culled before 9 |
| ② Edit | `Edited 12 · Selected 50`, Copy folder path, Upload | **Done editing** | PATCH `step: pick` |
| ③ Client picks | two choices: **Send for picks** (opens the existing create-share dialog, stores `shareId`, `pickMode: client`) / **Skip — deliver everything** (`pickMode: all`, `step: deliver`) | | with `client`: shows *Waiting for client · n shortlisted*; advances when `share.phase === 'submitted'` (poll via the existing shares query) |
| ④ Send finals | `15 picks · 15 edited` or `96 to deliver` | **Send final photos** (existing `/delivery`, or create a delivery-kind share for `all`) | `step: done` |
| done | `Delivered <date>` · link copy | | — |

**Back** link on every card except done (`PATCH step: <previous>`).
The cull page's exit returns to the folder page, where the stepper is
waiting.

## 9.3 — Jobs page, nav, badge

- `/jobs` (`features/jobs/JobsPage.tsx`): one row per job — album (or
  folder date while culling), step chip, `edited/shots`, days in step,
  *Waiting for client* in muted text. Pills **Active / Waiting / Done**.
  Row opens the folder page (①) or album page (② onward).
- `SideNav`/`TabBar`: **Jobs** after Gallery. Badge = jobs whose step needs
  the owner (active and not waiting on client).
- Home strip: *Jobs* tile (active count, oldest waiting) next to *Today*.

## Out of scope (noted)

- Proofing from unedited originals (`source: 'selected'`, base-name match
  into `Edited/`, `ToEdit/` copy of RAWs). Future state.
- Over-cap picks for a fee. Future state.
- Multi-folder jobs, client names, notes.
