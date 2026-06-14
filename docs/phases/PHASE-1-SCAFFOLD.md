# Phase 1 — Scaffold (single-user auth + PWA shell)

**Status:** Complete. Built and validated 2026-06-14
(`pnpm build` green across all three packages; backend auth smoke-tested:
health ok, login issues tokens, `/api/auth/me` authorized, bad creds → 401).
Parent: [`docs/DESIGN.md`](../DESIGN.md).

Goal: a runnable monorepo skeleton — `shared` / `backend` / `frontend`,
Vite + PWA shell, Tailwind, Docker skeleton, and working single-user JWT
auth — onto which Phases 2–5 drop their features without restructuring.

## Scope (this phase only)

- pnpm monorepo (`@sonycam/shared`, `@sonycam/backend`, `@sonycam/frontend`).
- Backend: Express + TS + zod + JWT, the v3/unraidpwa module pattern,
  `auth` module, JSON-store primitive, health endpoint.
- Frontend: React 18 + Vite + Tailwind + `vite-plugin-pwa` (injectManifest),
  Zustand auth store, axios client with refresh, login page, app shell with
  a bottom tab bar (Gallery / Transfers / Settings placeholders), and the
  install / update / offline PWA components.
- Docker skeleton + compose with the photos bind-mount wired (unused until
  Phase 2) and the `/data` volume for JSON state.

## Explicitly NOT in this phase (later)

- Embedded FTP receive server (`ftp-srv`) → Phase 2.
- Gallery (list + `sharp` thumbnails + enlarge + download) → Phase 3.
- Transfers monitor + FTP/camera-setup settings → Phase 4.
- No push, no SSH, no upload/relay anywhere (per design).

## Divergences from unraidpwa (intentional)

- No `ssh2` / `ws` deps; no terminal/shortcuts/files modules.
- No `web-push` / VAPID; the service worker has **no** push handlers.
- Backend config carries `PHOTOS_PATH` (bind-mounted share) instead of
  `SSH_*` / `ALLOWED_ROOTS`.
- Top-level navigation is a mobile bottom tab bar (this is a phone-first
  photo app), via `react-router-dom`.

## Acceptance

- `pnpm install` then `pnpm dev` runs backend (`:3000`) + frontend (`:5173`).
- Login with `APP_USER` / `APP_PASS` returns a token; protected `/api/auth/me`
  works; refresh works; bad creds rejected.
- The app installs as a PWA and the update prompt appears on a new build.
- `GET /api/health` returns ok.

## Files created

See the commit. Backend mirrors `unraidpwa`'s `auth`, `middleware`, `utils`,
`store`, `config`, `app.ts`. Frontend mirrors its `api`, `stores`, `lib`,
`components/pwa`, `components/layout`, `features/auth`, plus placeholder
`features/{gallery,transfers,settings}` pages.
