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
  lastErrorTime: number | null;
}

/** One FTP-side failure, captured for in-app visibility (no secrets). */
export interface FtpErrorEvent {
  time: number;                                   // epoch milliseconds
  kind: 'transfer' | 'filing' | 'client' | 'auth';
  message: string;
  clientIp?: string;
}

/** One received file, captured from an FTP STOR. */
export interface TransferEvent {
  name: string;
  path: string;       // absolute path on the share
  relPath: string;    // POSIX path relative to the share root (for gallery URLs)
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
  count?: number;     // photos inside (peeks one level into JPG/RAW)
  cover?: string;     // share-relative path of a cover image, if any
}

/** 'image' = browser-renderable (thumbnailable); 'raw' = download-only. */
export type GalleryItemKind = 'image' | 'raw';

export interface GalleryItem {
  path: string;       // POSIX path relative to the share root
  name: string;
  size: number;       // bytes
  modified: number;   // epoch milliseconds
  kind: GalleryItemKind;
  rating: number;     // 0 = unrated, else 1..5 stars
  twin?: string;      // paired JPG/RAW counterpart (share-relative), if any
}

/** Camera metadata for one photo, returned by GET /api/gallery/exif. */
export interface ExifInfo {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  focalLength35?: string;
  aperture?: string;        // e.g. "f/2.8"
  shutter?: string;         // e.g. "1/250s"
  iso?: string;             // e.g. "ISO 100"
  exposureComp?: string;
  dateTime?: string;        // raw "YYYY:MM:DD HH:MM:SS"
  dimensions?: string;      // e.g. "7008x4672"
  gps?: { lat: number; lng: number } | null;
}

/** Flat, newest-first photo stream returned by GET /api/gallery/timeline. */
export interface GalleryTimelineResult {
  items: GalleryItem[];
  truncated: boolean;       // true if more photos exist than the returned cap
}

/** Which formats to copy into an album's Selected folder. */
export type AlbumFormats = 'both' | 'jpg' | 'raw';

/** A curated album folder under the share's Albums/ root. */
export interface AlbumInfo {
  name: string;
  path: string;             // share-relative POSIX path, e.g. "Albums/June Wedding"
}

/** Result of POST /api/gallery/albums (create or add-to). */
export interface AlbumCreateResult {
  name: string;
  path: string;             // album root, share-relative
  shots: number;            // distinct photos copied
  copied: number;           // files copied (JPG + RAW)
}

/** One directory's contents, as returned by GET /api/gallery/browse. */
export interface GalleryBrowseResult {
  path: string;            // current dir, POSIX relative ('' = share root)
  parent: string | null;   // parent dir path, or null at the root
  folders: FolderEntry[];
  items: GalleryItem[];
}


// ── Client shares (proofing links) ─────────────────────────────────────────

/**
 * A share moves through three phases:
 *   proofing  – client browses watermarked previews and edits selections
 *   submitted – client has locked their picks (owner reviews)
 *   delivery  – owner has released full-res; client may download their picks
 */
export type SharePhase = 'proofing' | 'submitted' | 'delivery';

/** Owner-facing summary of one share (no secrets). */
export interface ShareSummary {
  id: string;
  slug: string;             // public URL token
  albumName: string;
  albumPath: string;        // share-relative, e.g. "Albums/June Wedding"
  cap: number;              // max selections the client may make
  phase: SharePhase;
  previewCount: number;     // edited JPGs published as previews
  selectedCount: number;
  url: string;              // public client link (absolute when SHARE_HOST set)
  createdAt: number;        // epoch ms
  submittedAt: number | null;
}

/** Result of POST /api/gallery/shares (create). Same shape as a summary. */
export type ShareCreateResult = ShareSummary;

/** One previewable image in the client proofing view. */
export interface SharePublicItem {
  file: string;             // original edited filename; id for select/download
  selected: boolean;
}

/** Client-facing state returned by GET /api/public/share/:slug/list.
 *  Carries nothing about other shares and no secrets. */
export interface SharePublicState {
  albumName: string;
  phase: SharePhase;
  cap: number;
  selectedCount: number;
  items: SharePublicItem[];
}
