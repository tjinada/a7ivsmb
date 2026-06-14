/**
 * Shared types used by both backend and frontend.
 * Phase 1: auth + the API response envelope. Later phases add their own
 * types in place: FtpConfig (Phase 2), PhotoEntry (Phase 3), TransferEvent
 * and FtpStatus (Phase 4).
 */

/** Standard API envelope returned by every backend endpoint. */
export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

/** The single application user (no roles, no registration). */
export interface AuthUser {
  username: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

// ── FTP receive (Phase 2) ──────────────────────────────────────────────────

/** Persisted FTP receive settings (data/ftp.json). Holds the camera login. */
export interface FtpConfig {
  enabled: boolean;
  port: number;
  user: string;
  pass: string;
  pasvMin: number;
  pasvMax: number;
  externalIp: string;
  ftpsEnabled: boolean;
}

/** Non-secret FTP status returned by GET /api/ftp/status (no password). */
export interface FtpStatus {
  enabled: boolean;
  listening: boolean;
  port: number;
  user: string;
  pasvMin: number;
  pasvMax: number;
  externalIp: string | null;
  ftps: boolean;
  activeConnections: number;
  lastReceived: number | null;
}

/** One received file, captured from an FTP STOR. */
export interface TransferEvent {
  name: string;
  path: string;       // absolute path on the share
  size: number;       // bytes
  time: number;       // epoch milliseconds
  clientIp: string;
}

// ── Gallery (Phase 3, folder-aware) ────────────────────────────────────────

/** A subfolder in the share. */
export interface FolderEntry {
  name: string;
  path: string;       // POSIX path relative to the share root
  modified: number;   // epoch milliseconds
}

/** 'image' = browser-renderable (thumbnailable); 'raw' = download-only. */
export type GalleryItemKind = 'image' | 'raw';

export interface GalleryItem {
  path: string;       // POSIX path relative to the share root
  name: string;
  size: number;       // bytes
  modified: number;   // epoch milliseconds
  kind: GalleryItemKind;
}

/** One directory's contents, as returned by GET /api/gallery/browse. */
export interface GalleryBrowseResult {
  path: string;            // current dir, POSIX relative ('' = share root)
  parent: string | null;   // parent dir path, or null at the root
  folders: FolderEntry[];
  items: GalleryItem[];
}
