# Phase 2 — Embedded FTP receive

**Status:** Complete. Built and validated 2026-06-14
(`pnpm build` green; live test on port 2121: camera-style login + upload
landed `DSC_TEST.JPG` under the share, appeared in `/api/ftp/transfers`,
`/api/ftp/status` reported `listening` + `lastReceived`, wrong creds rejected).
Parent: [`docs/DESIGN.md`](../DESIGN.md). Builds on Phase 1.

Goal: the backend *is* the FTP endpoint. An embedded `ftp-srv` accepts the
camera's login, writes received photos into the bind-mounted share
(sandboxed), and records every stored file as an in-process event — so the
Phase 4 monitor has native data with no log-scraping.

## Scope (this phase only)

- `ftp` backend module:
  - `ftp.config.ts` — `JsonStore<FtpConfig>`, seeded from env on first run,
    JSON wins thereafter (Phase 4 edits it).
  - `ftp.service.ts` — `ftp-srv` lifecycle (`startFtp` / `stopFtp`), single
    camera credential validated on `login`, FileSystem rooted at
    `PHOTOS_PATH` (sandbox), passive-mode config, optional FTPS, capture of
    `STOR` events into a recent-transfers ring buffer + status counters.
  - read-only authed endpoints: `GET /api/ftp/status`, `GET /api/ftp/transfers`.
- `initFtp()` starts the server on boot (only if enabled **and** a password
  is set — never opens an unauthenticated server).
- Ensures `PHOTOS_PATH` exists before listening.
- Shared types: `FtpConfig`, `FtpStatus`, `TransferEvent`.

## Explicitly NOT in this phase (later)

- Editing FTP config / start-stop from the UI, camera-setup helper card,
  disk-free, the Transfers screen → Phase 4.
- Thumbnails / gallery → Phase 3.

## Key decisions

- **Safe-by-default.** `FTP_ENABLED` defaults to `false`; even when enabled,
  an empty `FTP_PASS` refuses to start. The unraid template sets both.
- **Secrets in JSON.** The live FTP credentials live in `data/ftp.json`
  (per design — plain JSON state on the mounted volume). The status endpoint
  never returns the password.
- **Privileged port caveat.** Cameras default to FTP port 21, which is
  privileged. In Docker, map host `21` → the container's configured port and
  expose the passive range 1:1; locally we test on a high port (2121).
- **Passive mode.** `FTP_EXTERNAL_IP` is advertised for PASV data
  connections — without it (in Docker) the camera hangs after login.

## Acceptance

- With FTP enabled, an FTP client can log in with the configured credentials
  and upload a file; it lands under `PHOTOS_PATH`.
- The upload appears in `GET /api/ftp/transfers`; `GET /api/ftp/status`
  reports `listening: true` and a recent `lastReceived`.
- Wrong credentials are rejected. Disabled / empty-password → server does not
  start, app still runs.
