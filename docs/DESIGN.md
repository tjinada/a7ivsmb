# sonycamera-transfer — Design (Proposed)

**Status:** Approved & in build. Phases 1-3 and 5 implemented; Phase 4
(Transfers + Settings UI) pending. Remote camera access over Tailscale is
documented in [`REMOTE-ACCESS.md`](./REMOTE-ACCESS.md).
This document is the single source of truth for the build.

A PWA that (1) **receives** full-resolution photos from a Sony A7 IV via the
camera's built-in FTP transfer over Wi-Fi, landing them in an unraid share,
and (2) **browses** that share — thumbnail gallery, enlarge, download to
phone — plus a small screen to **configure and monitor** the receiving FTP
service. PWA quality bar (installable, auto-updating) mirrors
`tjbookrequests-v3` / `unraidpwa`.

Principles: KISS, YAGNI, SOLID.

---

## 0. Why not Bluetooth (the original premise)

The project began as "Sony → PWA via Bluetooth → unraid". That path is not
viable, for two independent reasons:

- **Camera side:** the A7 IV's Bluetooth is a control/metadata channel only
  (shutter remote + linking phone GPS into EXIF). Image/video transfer is a
  **Wi-Fi / FTP / USB** function.
- **Browser side:** a PWA's only Bluetooth access is Web Bluetooth (BLE
  GATT) — small characteristic reads/writes, no file-transfer profile — and
  the camera exposes no image data there. BLE throughput would also make
  large RAW files impractical.

So transfer uses the camera's **native FTP over Wi-Fi**. The phone is not in
the transfer path; it is the browse/manage client.

## 1. Locked decisions

| Area            | Decision                                                           |
|-----------------|--------------------------------------------------------------------|
| Transfer        | Camera native FTP (Wi-Fi) → **embedded FTP server in the backend** |
| Host access     | **Bind-mount the share** into the container (no SSH)               |
| Share path      | Host `/mnt/user/data/mekala-share` → container `/photos` (RW)      |
| Auth            | **Single user**, JWT session                                       |
| Local state     | **Plain JSON file** (FTP config + recent transfers); no DB         |
| Push            | **None**                                                           |
| Transfer config | App configures the **receiving** FTP service and shows the camera  |
|                 | setup values; it **cannot** program the camera                     |
| Repo layout     | pnpm monorepo with `shared` package                                |
| Deployment      | Single multi-stage Docker container on unraid                      |

Deliberately **not** copying v3/unraidpwa's SSH, terminal, shortcuts,
multi-user accounts, push/VAPID, or the phone-relay upload path.

## 2. Security model

Far smaller blast radius than `unraidpwa` (no shell, no root, one share).

- **Single-user web auth** (username + password from env / first-run), JWT.
- **Separate FTP credentials** for the camera login (not the web login).
- **LAN-only intended.** Camera and unraid on the same network. Not for raw
  internet exposure; document, don't enforce.
- **Write sandbox.** The embedded FTP server's root is the mounted share;
  resolve every path and reject traversal outside it.
- **Read sandbox.** Gallery reads are confined to the share root.
- **Cleartext note.** Plain FTP is unencrypted on the LAN. **FTPS** is an
  optional toggle (the A7 IV supports it) if the login must be encrypted.
- **Secrets** (JWT secret, FTP pass, app pass) come from env / the container
  template only — never git.
- Container runs **non-root** with `PUID`/`PGID` matching the share owner.

## 3. Architecture

```
Sony A7 IV
   |  Wi-Fi, FTP (or FTPS)
   v
Backend container ── embedded FTP server (ftp-srv) ──┐
   |                                                  │ writes received files
   |  Express REST  (HTTPS)                            v
   |                                          /photos  (bind mount)
   v                                          == host /mnt/user/data/mekala-share
PWA (gallery / transfers / settings)                  ^
   ^                                                   │ list + thumbnail (sharp)
   └──────────────── reads via backend ───────────────┘   on the local filesystem
```

Two consequences make the app simple:

- **Embedded FTP** means every camera login and stored file is an
  *in-process event* — so health and the recent-arrivals feed are native,
  with no log-scraping or second container to manage.
- **Bind-mount** means receive-writes and gallery-reads are plain local
  filesystem operations — fast thumbnails, no SSH, no extra credentials.

## 4. Tech stack

**Frontend** (same as unraidpwa): React 18 + TypeScript + Vite + Tailwind +
`vite-plugin-pwa` (injectManifest) + Workbox + Zustand + TanStack Query +
react-router + axios + lucide-react.

**Backend:** Express + TypeScript + zod + JWT, same module pattern as v3
(`*.controller.ts` / `*.routes.ts` / `*.service.ts` / `index.ts`).
Key libraries: **`ftp-srv`** (receive), **`sharp`** (thumbnails). State
persisted to a **plain JSON file** via a tiny store module (atomic write).

No `ssh2`. No `web-push`. No database.

## 5. Repo structure

```
sonycamera-transfer/
  packages/
    shared/     # TS types: file entries, transfer events, FTP config, DTOs
    backend/    # express + ftp-srv + sharp + json store
    frontend/   # react PWA
  Dockerfile        # multi-stage; single container serves web + FTP
  docker-compose.yml
  docs/
    DESIGN.md       # this file
    phases/         # per-phase build docs (created when we start)
```

## 6. Backend modules

- `auth` — single-user login, JWT issue/refresh.
- `ftp` — embedded `ftp-srv` lifecycle (start/stop/restart), camera login
  with its own credentials, writes into the share root (path-sandboxed),
  emits `login` / `stored` events; config persisted to JSON.
- `gallery` — list the share directory, generate + disk-cache thumbnails
  (`sharp`), serve a full-size image for the enlarge view, stream downloads.
  Image types only; confined to the share root.
- `monitor` — FTP health (listening? active connections? last received),
  recent transfers (ring buffer fed by `stored` events, persisted), and
  disk free (`statfs` on the mount).
- `store` — JSON persistence for FTP config + recent transfers.

## 7. Frontend screens

- **Gallery** — responsive thumbnail grid, newest-first, lazy-loaded; tap to
  **enlarge** (pinch/zoom); **download / share** to phone; pull-to-refresh.
- **Transfers** — service status, live recent-arrivals list (filename, size,
  time), disk free. (In-app monitor stands in for the absent push feed.)
- **Settings** — FTP config (enable, port, passive range, username/password,
  target folder, FTPS toggle); a **"Camera setup" helper card**; connection
  / health; app version + update prompt.

## 8. FTP receive + camera setup

The embedded server listens on the configured port with **passive mode**
(cameras use PASV) and advertises the host LAN IP for the data channel. The
camera writes into the directory it is told; files land under the share root.

The PWA **cannot push configuration to the camera**. The Settings
"Camera setup" card simply displays what to type into
`MENU → Network → FTP Transfer Func. → Server Setting` on the A7 IV:
server host (unraid LAN IP), port, username, password, directory, and secure
(FTP / FTPS) — so the manual camera-side setup is copy-from-screen.

## 9. PWA / update (no push)

Reuse the proven v3 / unraidpwa pieces: `injectManifest` service worker,
`registerType: 'prompt'`, the `PWAUpdatePrompt` that checks every 5 min + on
focus/visibility, the install prompt, and an offline indicator for the **app
shell only** (the gallery, transfer, and FTP-status endpoints are inherently
online — the SW must NOT cache them). Push is omitted entirely: no VAPID, no
`web-push`, no SW push/notificationclick handlers.

## 10. Deployment on unraid

Single multi-stage Docker container (frontend static + backend), non-root,
healthcheck — same shape as unraidpwa's Dockerfile. A Community-Apps-style
template will be provided.

**Env vars:**
`APP_USER`, `APP_PASS`, `JWT_SECRET`,
`FTP_USER`, `FTP_PASS`, `FTP_PORT` (default 21),
`FTP_PASV_MIN`, `FTP_PASV_MAX`, `FTP_EXTERNAL_IP` (unraid LAN IP for PASV),
`FTPS_ENABLED`, `PHOTOS_PATH` (container mount, default `/photos`),
`THUMB_CACHE_PATH`, `WEB_PORT`, `PUID`, `PGID`.

**Volumes:**
`/mnt/user/data/mekala-share` → `/photos` (RW); a small app-data path for the
JSON store + thumbnail cache.

**Ports:** `WEB_PORT`, `FTP_PORT`, and the passive range
`FTP_PASV_MIN`–`FTP_PASV_MAX`.

**Deployment gotcha (flag up front):** passive FTP in Docker. Expose the
passive port range and set `FTP_EXTERNAL_IP` to the unraid LAN IP, or the
camera's data connection will hang after login.

## 11. Phased build plan

1. **Scaffold** — monorepo, `shared`/`backend`/`frontend`, Vite + PWA shell,
   Tailwind, Docker skeleton, single-user auth.
2. **FTP receive** — embed `ftp-srv`, sandbox writes to the share, persist
   config to JSON, emit events.
3. **Gallery** — directory list + `sharp` thumbnails + cache, enlarge,
   download UI.
4. **Transfers + Settings** — health / recent-arrivals feed, FTP config form,
   camera-setup helper card.
5. **PWA polish** — install prompt, update prompt, offline shell indicator.
6. **Deploy** — Dockerfile finalize, bind-mount + passive-FTP unraid
   template, docs.

Each phase gets its own `docs/phases/PHASE-N-*.md` when we begin it.

## 12. Open / future (YAGNI for now)

- Auto-sort arrivals into `yyyy/mm/dd` folders on receipt.
- EXIF metadata view, search, multiple shares.
- FTPS by default / certificate management.
- Field / off-network access — **resolved without Path B.** A travel router
  on the tailnet extends the LAN over Tailscale, so the camera reaches unraid
  at its `100.x` IP exactly as on the home LAN; no phone-relay path needed.
  See [`REMOTE-ACCESS.md`](./REMOTE-ACCESS.md).

---

*End of proposed design. Awaiting go-ahead to start Phase 1.*
