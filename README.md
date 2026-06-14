# sonycamera-transfer

A phone-first PWA that **receives** full-resolution photos from a Sony A7 IV
over the camera's built-in FTP transfer (Wi-Fi), landing them in an unraid
share, and lets you **browse, enlarge, and download** them — plus configure
and monitor the receiving FTP service.

> **Why not Bluetooth?** The A7 IV's Bluetooth is remote-control + geotag
> only; image transfer is a Wi-Fi/FTP/USB function, and a browser's Web
> Bluetooth (BLE GATT) can't carry image files anyway. So transfer uses the
> camera's native FTP over Wi-Fi. See [`docs/DESIGN.md`](docs/DESIGN.md).

## Architecture (short)

```
Sony A7 IV --(Wi-Fi FTP)--> backend (embedded ftp-srv) --> /photos (bind mount)
                                                            == /mnt/user/data/mekala-share
PWA (gallery / transfers / settings) <-- backend reads/thumbnails the share
```

Single multi-stage Docker container on unraid; single-user JWT auth; plain
JSON state (no database). No SSH, no push, no phone-relay upload.

## Develop

```bash
cp .env.example .env      # set APP_USER, APP_PASS, JWT_SECRET, PHOTOS_PATH
pnpm install
pnpm dev                  # backend :3000, frontend :5173
```

## Status

Built in phases — see [`docs/DESIGN.md`](docs/DESIGN.md) and
[`docs/phases/`](docs/phases/).

- **Phase 1 — Scaffold + auth + PWA shell** ← current
- Phase 2 — Embedded FTP receive
- Phase 3 — Gallery (thumbnails, enlarge, download)
- Phase 4 — Transfers monitor + settings (FTP config + camera setup)
- Phase 5 — PWA polish
- Phase 6 — Deploy (Dockerfile + unraid template)

## Stack

pnpm monorepo (`@sonycam/shared` · `@sonycam/backend` · `@sonycam/frontend`).
Backend: Express + TypeScript + zod + JWT, `ftp-srv` (Phase 2), `sharp`
(Phase 3). Frontend: React 18 + Vite + Tailwind + `vite-plugin-pwa` +
Zustand + TanStack Query.
