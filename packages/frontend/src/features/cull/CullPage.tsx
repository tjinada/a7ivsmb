import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { X, Star, ChevronLeft, ChevronRight, Loader2, Trash2, ImageOff, Info, Share2 } from 'lucide-react';
import type { ApiResponse, ExifInfo, GalleryItem } from '@sonycam/shared';
import { api } from '@/api/client';
import { toast } from '@/components/Toast';
import { prettyDate } from '@/lib/dates';
import { useBrowse, useRate, useDeleteItems, useInvalidateGallery } from '@/features/gallery/api';
import { thumbUrl, previewUrl, originalUrl } from '@/features/gallery/mediaUrl';
import { ConfirmDialog } from '@/features/gallery/ConfirmDialog';
import { ExifPanel } from '@/features/gallery/Lightbox';
import { saveImage } from '@/features/gallery/download';

/** Reject is stored as 1 star, so the existing "delete below 2" cleanup and
 *  the rating filters keep working on culled folders. */
const REJECT = 1;

/** Vertical travel (px) a swipe needs to count as a rating. */
const SWIPE_RATE = 80;

/** Stamp colours per rating: amber ★5, red reject, light for 2–4. */
function stampTone(stars: number): { badge: string; ring: string; label: string } {
  if (stars === 5) return { badge: 'bg-primary-500 text-on-accent', ring: 'ring-primary-500/70', label: '★5' };
  if (stars === REJECT) return { badge: 'bg-red-500 text-white', ring: 'ring-red-500/70', label: '✕ Rejected' };
  return { badge: 'bg-gray-100 text-on-accent', ring: 'ring-gray-100/60', label: `★${stars}` };
}

/** Which items a folder is culled over: the JPGs (RAW twins are rated with
 *  them server-side), or the RAWs when a folder has only RAW. In shooting
 *  order, oldest first: arrival time, then the camera's file number (the
 *  folder listing uses the same order; sorting here keeps cull independent
 *  of it). */
function cullable(items: GalleryItem[]): GalleryItem[] {
  const jpgs = items.filter((i) => i.kind === 'image');
  const pick = jpgs.length > 0 ? jpgs : items.filter((i) => i.kind === 'raw');
  return [...pick].sort((a, b) => a.modified - b.modified || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Pan/zoom of the photo: scale, and offset (px) from the stage centre. */
interface Zoom { s: number; x: number; y: number }
const FIT: Zoom = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;
const TAP_ZOOM = 2.5;
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Cull mode: one photo at a time, rate it, a stamp confirms the rating and it
 * advances. Keys 1–5 (1 = reject),
 * X = reject, ←/→ move, Esc exits. Touch: swipe up = ★5, down = reject,
 * sideways moves. Starts at `?photo=` when opened from a grid tile, else at
 * the first unrated photo, and preloads the next. Also the shoot viewer:
 * info panel, share/download, delete this photo.
 */
export function CullPage() {
  const [params] = useSearchParams();
  const folder = params.get('path') ?? '';
  const startPhoto = params.get('photo');
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a grid tile: going back returns to that exact grid (view,
  // folder, scroll). Opened any other way: land on the shoot folder.
  const cameFromGrid = (location.state as { fromGrid?: boolean } | null)?.fromGrid === true;
  const exit = useCallback(
    () => (cameFromGrid ? navigate(-1) : navigate(`/gallery?path=${encodeURIComponent(folder)}`, { replace: true })),
    [navigate, folder, cameFromGrid],
  );

  const browse = useBrowse(folder, folder !== '');
  // The FTP filer drops a day's shots into <date>/JPG and <date>/RAW, so a
  // dated folder itself holds no photos: cull the JPG bucket (or RAW when
  // that's all there is). A folder with photos directly in it is used as-is.
  const bucket = useMemo(() => {
    const d = browse.data;
    if (!d || d.items.length > 0) return '';
    const sub = (name: string) => d.folders.find((f) => f.name.toUpperCase() === name)?.path ?? '';
    return sub('JPG') || sub('RAW');
  }, [browse.data]);
  const bucketQuery = useBrowse(bucket, bucket !== '');
  const source = bucket ? bucketQuery : browse;
  const items = useMemo(() => cullable(source.data?.items ?? []), [source.data]);

  // Local ratings so the UI never waits on the network; seeded from the folder.
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [idx, setIdx] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rateMut = useRate(toast.error);
  const deleteMut = useDeleteItems();
  const invalidate = useInvalidateGallery();

  const list = useMemo(() => items.filter((i) => !removed.has(i.path)), [items, removed]);
  const ratingOf = useCallback((it: GalleryItem) => ratings.get(it.path) ?? it.rating, [ratings]);

  // Once the folder has loaded: start at the tapped photo, else the first
  // unrated one.
  useEffect(() => {
    if (idx !== null || list.length === 0) return;
    // A tapped RAW opens on its JPG twin: same shot, matched by file stem.
    const stem = (p: string) => (p.split('/').pop() ?? p).replace(/\.[^.]+$/, '').toLowerCase();
    const tapped = startPhoto
      ? (() => {
          const exact = list.findIndex((i) => i.path === startPhoto);
          return exact !== -1 ? exact : list.findIndex((i) => stem(i.path) === stem(startPhoto));
        })()
      : -1;
    const first = list.findIndex((i) => ratingOf(i) === 0);
    setIdx(tapped !== -1 ? tapped : first === -1 ? 0 : first);
  }, [list, idx, ratingOf, startPhoto]);

  // Viewer extras: info panel, share/download, delete this one photo.
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState(false);

  const total = list.length;
  const current = idx !== null && idx < total ? list[idx] : null;
  const done = idx !== null && idx >= total;
  const tallies = useMemo(() => {
    let five = 0, four = 0, rejected = 0, unrated = 0;
    for (const it of list) {
      const r = ratingOf(it);
      if (r === 5) five += 1;
      else if (r === 4) four += 1;
      else if (r === REJECT) rejected += 1;
      else if (r === 0) unrated += 1;
    }
    return { five, four, rejected, unrated, rated: total - unrated };
  }, [list, ratingOf, total]);
  const rejectedItems = useMemo(() => list.filter((i) => ratingOf(i) === REJECT), [list, ratingOf]);

  const step = useCallback((d: number) => {
    setIdx((i) => (i === null ? i : Math.max(0, Math.min(total, i + d))));
  }, [total]);

  // Rating feedback: the photo holds for a beat with a stamp of its new
  // rating, then leaves (up for ★5, down for reject, fade otherwise) and the
  // next one shows. `fx` is the photo currently being stamped.
  const reduceMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const [fx, setFx] = useState<{ path: string; stars: number } | null>(null);
  const fxTimer = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);        // vertical finger offset while swiping
  const [dragging, setDragging] = useState(false);

  const advance = useCallback(() => {
    if (fxTimer.current !== null) { window.clearTimeout(fxTimer.current); fxTimer.current = null; }
    setFx(null);
    setDrag(0);
    step(1);
  }, [step]);
  useEffect(() => () => { if (fxTimer.current !== null) window.clearTimeout(fxTimer.current); }, []);

  /** Navigate; a stamp still showing finishes first so no rating is lost. */
  const move = useCallback((d: number) => {
    if (fxTimer.current !== null) advance();
    step(d);
  }, [advance, step]);

  const rate = useCallback((stars: number) => {
    if (idx === null) return;
    // Rating again mid-stamp: finish that one now and rate the next photo.
    let target = current;
    if (fxTimer.current !== null) { advance(); target = list[idx + 1] ?? null; }
    if (!target) return;
    const path = target.path;
    setRatings((m) => new Map(m).set(path, stars));
    rateMut.mutate({ path, stars });
    setFx({ path, stars });
    fxTimer.current = window.setTimeout(advance, reduceMotion ? 250 : 350);
  }, [idx, current, list, advance, rateMut, reduceMotion]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  // Web: scroll wheel zooms toward the cursor, drag pans, double-click
  // toggles. Phone: pinch, double-tap toggles, one finger pans while zoomed.
  // Every photo opens fitted.
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>(FIT);
  const [zoomLive, setZoomLive] = useState(false); // finger/mouse is moving it: no easing
  const zoomed = zoom.s > 1.01;
  const currentPath = current?.path;
  useEffect(() => { setZoom(FIT); }, [currentPath]);

  /** Keep the zoomed photo covering the stage: never pan past its edges. */
  const clampZoom = useCallback((z: Zoom): Zoom => {
    const img = stageRef.current?.querySelector<HTMLImageElement>('img[data-cull-preview]');
    const box = img?.parentElement;
    if (!img || !box || z.s <= 1.01) return FIT;
    const s = Math.min(z.s, MAX_ZOOM);
    const bw = box.clientWidth, bh = box.clientHeight;
    const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : bw / bh;
    const dw = Math.min(bw, bh * ar), dh = dw / ar; // the photo's fitted size
    const mx = Math.max(0, (dw * s - bw) / 2), my = Math.max(0, (dh * s - bh) / 2);
    return { s, x: clampNum(z.x, -mx, mx), y: clampNum(z.y, -my, my) };
  }, []);

  /** Scale to `target`, keeping the photo point under (px, py) where it is. */
  const zoomAround = useCallback((z: Zoom, px: number, py: number, target: number): Zoom => {
    const s = clampNum(target, 1, MAX_ZOOM);
    const k = s / z.s;
    return clampZoom({ s, x: px - (px - z.x) * k, y: py - (py - z.y) * k });
  }, [clampZoom]);

  /** A screen point as an offset from the stage centre. */
  const fromCentre = (cx: number, cy: number): [number, number] => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? [cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)] : [0, 0];
  };

  // Wheel needs a non-passive listener so it can stop the page (and the
  // trackpad pinch, which arrives as ctrl+wheel) from zooming the browser.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002));
      const [px, py] = fromCentre(e.clientX, e.clientY);
      setZoomLive(false);
      setZoom((z) => zoomAround(z, px, py, z.s * factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  // Mouse: drag to pan while zoomed, double-click to toggle.
  const pan = useRef<{ x: number; y: number; zx: number; zy: number } | null>(null);
  const lastPointer = useRef<string>('mouse');
  const onPointerDown = (e: React.PointerEvent) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== 'mouse' || e.button !== 0 || !zoomed) return;
    if ((e.target as HTMLElement).closest('button')) return;
    pan.current = { x: e.clientX, y: e.clientY, zx: zoom.x, zy: zoom.y };
    setZoomLive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    setZoom((z) => clampZoom({ s: z.s, x: p.zx + e.clientX - p.x, y: p.zy + e.clientY - p.y }));
  };
  const onPointerUp = () => { pan.current = null; setZoomLive(false); };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (lastPointer.current !== 'mouse' || !current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const [px, py] = fromCentre(e.clientX, e.clientY);
    setZoomLive(false);
    setZoom((z) => (z.s > 1.01 ? FIT : zoomAround(z, px, py, TAP_ZOOM)));
  };

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDelete || confirmDeleteOne) return;
      if (e.key >= '1' && e.key <= '5') rate(Number(e.key));
      else if (e.key === 'x' || e.key === 'X') rate(REJECT);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === '0') setZoom(FIT);
      else if (e.key === 'i' || e.key === 'I') setShowInfo((v) => !v);
      else if (e.key === 'Delete') { if (current) setConfirmDeleteOne(true); }
      else if (e.key === 'Escape') {
        if (showInfo) setShowInfo(false);
        else if (zoomed) setZoom(FIT);
        else exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rate, move, exit, confirmDelete, confirmDeleteOne, zoomed, showInfo, current]);

  // Preload the next preview so advancing is instant.
  useEffect(() => {
    const next = idx !== null ? list[idx + 1] : undefined;
    if (!next) return;
    const im = new Image();
    im.src = previewUrl(next.path, next.modified);
  }, [idx, list]);

  // Touch. Fitted: vertical swipe rates (the photo follows the finger and the
  // stamp fades in as it nears the threshold), horizontal moves; the axis
  // locks on the first clear movement. Zoomed: one finger pans and nothing
  // rates. Two fingers pinch at any time; a double-tap toggles zoom.
  type TouchState =
    | { mode: 'swipe'; x: number; y: number; axis: 'v' | 'h' | null }
    | { mode: 'pan'; x: number; y: number; z0: Zoom }
    | { mode: 'pinch'; d0: number; mx: number; my: number; z0: Zoom };
  const touch = useRef<TouchState | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const pinchOf = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    const [mx, my] = fromCentre((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx, my };
  };
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const p = pinchOf(e);
      touch.current = { mode: 'pinch', d0: p.d || 1, mx: p.mx, my: p.my, z0: zoom };
      setDragging(false);
      setDrag(0);
      setZoomLive(true);
      return;
    }
    if (e.touches.length !== 1) { touch.current = null; return; }
    const { clientX: x, clientY: y } = e.touches[0];
    touch.current = zoomed ? { mode: 'pan', x, y, z0: zoom } : { mode: 'swipe', x, y, axis: null };
    if (zoomed) setZoomLive(true);
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    if (s.mode === 'pinch') {
      if (e.touches.length < 2) return;
      const p = pinchOf(e);
      const target = clampNum(s.z0.s * (p.d / s.d0), 1, MAX_ZOOM);
      // The photo point that was under the fingers stays under them.
      const ux = (s.mx - s.z0.x) / s.z0.s, uy = (s.my - s.z0.y) / s.z0.s;
      setZoom(clampZoom({ s: target, x: p.mx - ux * target, y: p.my - uy * target }));
      return;
    }
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
    if (s.mode === 'pan') {
      setZoom(clampZoom({ s: s.z0.s, x: s.z0.x + dx, y: s.z0.y + dy }));
      return;
    }
    if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) s.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
    if (s.axis === 'v' && !reduceMotion && fxTimer.current === null) { setDragging(true); setDrag(dy); }
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    if (s.mode === 'pinch') {
      if (e.touches.length > 0) return; // wait for the last finger
      touch.current = null;
      setZoomLive(false);
      setZoom((z) => (z.s < 1.05 ? FIT : z));
      return;
    }
    touch.current = null;
    setDragging(false);
    setZoomLive(false);
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;

    // A tap (barely moved): two in quick succession toggle zoom there.
    if (Math.hypot(dx, dy) < 10) {
      setDrag(0);
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 300 && Math.hypot(t.clientX - prev.x, t.clientY - prev.y) < 30) {
        lastTap.current = null;
        const [px, py] = fromCentre(t.clientX, t.clientY);
        setZoom((z) => (z.s > 1.01 ? FIT : zoomAround(z, px, py, TAP_ZOOM)));
      } else {
        lastTap.current = { t: now, x: t.clientX, y: t.clientY };
      }
      return;
    }
    if (s.mode === 'pan') return;

    if (s.axis !== 'h' && Math.abs(dy) > SWIPE_RATE && Math.abs(dy) > Math.abs(dx) * 1.5) rate(dy < 0 ? 5 : REJECT);
    else {
      setDrag(0); // short of the threshold: snap back, no rating
      if (s.axis === 'h' && Math.abs(dx) > 50) move(dx < 0 ? 1 : -1);
    }
  };
  // While dragging, preview the rating the release would give.
  const preview = dragging && drag !== 0 ? { stars: drag < 0 ? 5 : REJECT, strength: Math.min(1, Math.abs(drag) / SWIPE_RATE) } : null;
  const stamped = fx && current && fx.path === current.path ? fx.stars : null;

  const deleteRejected = async () => {
    const paths = rejectedItems.map((i) => i.path);
    try {
      await deleteMut.mutateAsync(paths);
      setRemoved((r) => new Set([...r, ...paths]));
      setConfirmDelete(false);
      void invalidate();
      toast.success(`Deleted ${paths.length} rejected photo${paths.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Delete failed');
    }
  };

  /** Delete the photo on screen (its RAW/JPG twin goes with it, server-side);
   *  the next one slides into its place. */
  const deleteOne = async () => {
    if (!current) return;
    const p = current.path;
    try {
      await deleteMut.mutateAsync([p]);
      setRemoved((r) => new Set([...r, p]));
      setConfirmDeleteOne(false);
      void invalidate();
      toast.success('Photo deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const share = async () => {
    if (!current) return;
    setSaving(true);
    try { await saveImage(current); }
    catch { toast.error('Download failed'); }
    finally { setSaving(false); }
  };

  const title = folder.split('/').pop() ?? folder;

  return (
    <div className="flex flex-col bg-[#0a0a0a] text-gray-100" style={{ height: '100dvh' }}>
      {/* Header: position, tallies, progress */}
      <div className="flex items-center gap-2.5 px-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}>
        <button type="button" onClick={exit} aria-label="Done" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/15">
          <X className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">Culling {prettyDate(title, false)}</p>
          <p className="truncate text-xs text-gray-400">
            {total === 0 ? 'Nothing to cull' : `${Math.min((idx ?? 0) + 1, total)} / ${total} · ${tallies.unrated} to go`}
            {total > 0 && (
              <span className="sm:hidden"> · <span className="text-primary-500">★5</span> {tallies.five} · <span className="text-red-400">✕</span> {tallies.rejected}</span>
            )}
          </p>
        </div>
        <div className="hidden flex-none gap-2.5 text-xs text-gray-400 sm:flex">
          <span><span className="font-semibold text-primary-500">★5</span> {tallies.five}</span>
          <span><span className="font-semibold text-gray-100">★4</span> {tallies.four}</span>
          <span><span className="font-semibold text-red-400">✕</span> {tallies.rejected}</span>
        </div>
        {current && (
          <div className="flex flex-none gap-1.5">
            <HeadBtn label="Info (I)" on={showInfo} onClick={() => setShowInfo((v) => !v)}><Info className="h-[18px] w-[18px]" /></HeadBtn>
            <HeadBtn label="Share or download" onClick={share} disabled={saving}>
              {saving ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Share2 className="h-[18px] w-[18px]" />}
            </HeadBtn>
            <HeadBtn label="Delete this photo" danger onClick={() => setConfirmDeleteOne(true)}><Trash2 className="h-[18px] w-[18px]" /></HeadBtn>
          </div>
        )}
      </div>
      <div className="mx-3 h-[3px] overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary-500 transition-[width] duration-300" style={{ width: total ? `${Math.round((tallies.rated / total) * 100)}%` : '0%' }} />
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className={`relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden p-2 ${
          zoomed ? (zoomLive ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touch.current = null; setDragging(false); setDrag(0); setZoomLive(false); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {browse.isLoading || (bucket && bucketQuery.isLoading) ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        ) : browse.isError || bucketQuery.isError ? (
          <p className="text-sm text-gray-400">Couldn&rsquo;t load this folder.</p>
        ) : done || total === 0 ? (
          <DoneCard tallies={tallies} total={total} onDelete={() => setConfirmDelete(true)} onExit={exit} onReview={() => setIdx(0)} />
        ) : current ? (
          <Stage
            key={current.path}
            item={current}
            rating={ratingOf(current)}
            motion={{
              drag,
              dragging,
              exit: stamped === null || reduceMotion ? null : stamped === 5 ? 'up' : stamped === REJECT ? 'down' : 'fade',
            }}
            zoom={zoom}
            zoomLive={zoomLive}
            showInfo={showInfo}
          />
        ) : null}

        {current && zoomed && (
          <button
            type="button"
            onClick={() => setZoom(FIT)}
            className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-base/80 px-3 py-1.5 text-xs font-semibold text-gray-200 backdrop-blur-sm hover:bg-base"
          >
            {zoom.s.toFixed(1)}× · <span className="text-gray-400">tap to fit</span>
          </button>
        )}

        {current && (stamped !== null || preview) && (
          <RatingStamp key={stamped !== null ? `fx-${current.path}` : 'drag'} stars={stamped ?? preview!.stars} strength={stamped !== null ? 1 : preview!.strength} pop={stamped !== null && !reduceMotion} />
        )}

        {current && idx !== null && idx > 0 && (
          <NavBtn side="left" onClick={() => move(-1)}><ChevronLeft className="h-6 w-6" /></NavBtn>
        )}
        {current && idx !== null && idx < total - 1 && (
          <NavBtn side="right" onClick={() => move(1)}><ChevronRight className="h-6 w-6" /></NavBtn>
        )}
      </div>

      {/* Rating row */}
      {!done && total > 0 && (
        <div className="flex flex-col gap-3 px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <div className="flex gap-2">
            <RateBtn onClick={() => rate(REJECT)} label="Reject" active={current ? ratingOf(current) === REJECT : false} tone="danger">
              <X className="h-5 w-5" strokeWidth={2.4} />
              <span className="text-[11px] font-semibold">Reject</span>
            </RateBtn>
            {[2, 3, 4].map((n) => (
              <RateBtn key={n} onClick={() => rate(n)} label={`${n} stars`} active={current ? ratingOf(current) === n : false}>
                <span className="text-lg font-semibold">{n}</span>
              </RateBtn>
            ))}
            <RateBtn onClick={() => rate(5)} label="5 stars" active={current ? ratingOf(current) === 5 : false} tone="primary" wide>
              <Star className="h-5 w-5 fill-current" />
              <span className="text-[11px] font-bold">5</span>
            </RateBtn>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
            <span className="min-w-0 truncate">
              <span className="sm:hidden">Swipe up ★5 · down rejects · pinch or double-tap to zoom</span>
              <span className="hidden sm:inline">Keys 1–5 rate · X rejects · ←/→ move · scroll to zoom, drag to pan · Esc exits</span>
            </span>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={rejectedItems.length === 0}
              className="flex h-8 flex-none items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {rejectedItems.length} rejected
            </button>
          </div>
        </div>
      )}

      {confirmDeleteOne && current && (
        <ConfirmDialog
          title="Delete this photo?"
          message={`This permanently removes ${current.name}${current.twin ? ' and its RAW/JPG twin' : ''} from the share. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleteMut.isPending}
          onConfirm={deleteOne}
          onCancel={() => setConfirmDeleteOne(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${rejectedItems.length} rejected photo${rejectedItems.length === 1 ? '' : 's'}?`}
          message="This permanently removes them from the share. Matching RAW/JPG pairs are removed together. This can't be undone."
          confirmLabel="Delete"
          busy={deleteMut.isPending}
          onConfirm={deleteRejected}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

interface StageMotion {
  drag: number;                         // finger offset (px) while swiping
  dragging: boolean;                    // follow the finger with no easing
  exit: 'up' | 'down' | 'fade' | null;  // leaving after a rating
}

/** Transform for the photo: follow the finger, snap back, or leave after the
 *  stamp has been visible for a moment (the 120 ms delay). */
function stageStyle({ drag, dragging, exit }: StageMotion): React.CSSProperties {
  if (exit) {
    const y = exit === 'up' ? '-55vh' : exit === 'down' ? '55vh' : '0px';
    return {
      transform: `translateY(${y})`,
      opacity: 0,
      transition: 'transform 230ms ease-in 120ms, opacity 230ms ease-in 120ms',
    };
  }
  return {
    transform: `translateY(${drag}px) rotate(${drag * 0.012}deg)`,
    transition: dragging ? 'none' : 'transform 200ms ease-out',
  };
}

/** The photo itself with the filename / exposure chips. Keyed by path so load
 *  state resets per photo. */
function Stage({ item, rating, motion, zoom, zoomLive, showInfo }: {
  item: GalleryItem;
  rating: number;
  motion: StageMotion;
  zoom: Zoom;
  zoomLive: boolean;
  showInfo: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exif, setExif] = useState<ExifInfo | null>(null);
  // Zooming past the preview's resolution swaps in the original (JPG only; a
  // browser can't show RAW). Once asked for, it stays for this photo.
  const zoomed = zoom.s > 1.01;
  const [wantFull, setWantFull] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  useEffect(() => { if (zoomed && item.kind === 'image') setWantFull(true); }, [zoomed, item.kind]);

  useEffect(() => {
    let live = true;
    api.get<ApiResponse<ExifInfo>>(`/gallery/exif?path=${encodeURIComponent(item.path)}`)
      .then((r) => live && setExif(r.data.data ?? {}))
      .catch(() => live && setExif({}));
    return () => { live = false; };
  }, [item.path]);

  const chips = [exif?.aperture, exif?.shutter, exif?.iso].filter(Boolean).join(' · ');
  const stars = rating > REJECT ? `★${rating}` : rating === REJECT ? 'rejected' : '';

  return (
    <>
      {/* No will-change here: it pins the raster scale, so a zoomed photo
          would stay at screen resolution instead of showing the original. */}
      <div className="absolute inset-2" style={stageStyle(motion)}>
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60"><ImageOff className="h-10 w-10" /><p className="text-sm">Preview unavailable</p></div>
        ) : (
          // The zoom layer: every image fills it with object-contain, so the
          // preview, its blurred placeholder and the original all line up.
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
              transition: zoomLive ? 'none' : 'transform 120ms ease-out',
            }}
          >
            {!loaded && (
              <img src={thumbUrl(item.path, item.modified)} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full scale-[1.02] object-contain blur-sm" />
            )}
            <img
              data-cull-preview
              src={previewUrl(item.path, item.modified)}
              alt={item.name}
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {wantFull && (
              <img
                src={originalUrl(item.path)}
                alt=""
                aria-hidden
                draggable={false}
                onLoad={() => setFullLoaded(true)}
                className={`absolute inset-0 h-full w-full object-contain ${fullLoaded ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
          </div>
        )}
      </div>
      {zoomed && wantFull && !fullLoaded && (
        <span className="pointer-events-none absolute right-4 top-11 z-20 flex items-center gap-1.5 rounded-md bg-base/75 px-2 py-1 text-[11px] text-gray-300 backdrop-blur-sm">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading full resolution
        </span>
      )}
      <span className="pointer-events-none absolute left-4 top-3 rounded-md bg-base/75 px-2 py-1 text-[11px] font-semibold text-gray-300 backdrop-blur-sm">
        {item.name.replace(/\.[^.]+$/, '')}{item.twin ? ' · RAW+JPG' : item.kind === 'raw' ? ' · RAW' : ''}
        {stars && <span className={`ml-2 ${rating === REJECT ? 'text-red-400' : 'text-primary-400'}`}>{stars}</span>}
      </span>
      {chips && (
        <span className="pointer-events-none absolute right-4 top-3 rounded-md bg-base/75 px-2 py-1 text-[11px] text-gray-400 backdrop-blur-sm">{chips}</span>
      )}
      {showInfo && (
        <div
          className="absolute inset-x-2 bottom-2 z-30 max-h-[60%] touch-pan-y select-text overflow-y-auto rounded-xl border border-white/10 bg-black/85 px-4 py-3 backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <ExifPanel exif={exif} loading={exif === null} />
        </div>
      )}
    </>
  );
}

function HeadBtn({ label, on, danger, disabled, onClick, children }: {
  label: string;
  on?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={on}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition disabled:opacity-50 ${
        on ? 'bg-primary-500 text-on-accent'
          : danger ? 'bg-white/[0.08] text-red-400 hover:bg-red-500/20'
            : 'bg-white/[0.08] text-gray-200 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  );
}

/** The rating stamp over the photo, with a matching glow on the stage edge.
 *  `strength` (0–1) fades it in while a swipe nears the threshold; `pop`
 *  scales it in once when a rating lands. */
function RatingStamp({ stars, strength, pop }: { stars: number; strength: number; pop: boolean }) {
  const [shown, setShown] = useState(!pop);
  useEffect(() => {
    if (!pop) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [pop]);
  const tone = stampTone(stars);
  return (
    <div className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl ring-4 ring-inset ${tone.ring}`} style={{ opacity: strength }}>
      <span
        role="status"
        className={`rounded-2xl px-6 py-3 text-3xl font-bold tracking-tight shadow-2xl ${tone.badge}`}
        style={{
          transform: `scale(${shown ? 1 : 0.6})`,
          opacity: shown ? 1 : 0,
          transition: pop ? 'transform 140ms cubic-bezier(.2,1.4,.4,1), opacity 100ms ease-out' : undefined,
        }}
      >
        {tone.label}
      </span>
    </div>
  );
}

function DoneCard({ tallies, total, onDelete, onExit, onReview }: {
  tallies: { five: number; four: number; rejected: number; unrated: number };
  total: number;
  onDelete: () => void;
  onExit: () => void;
  onReview: () => void;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 text-center">
      <p className="text-lg font-semibold">{total === 0 ? 'Nothing to cull here' : 'That’s the lot'}</p>
      {total > 0 && (
        <p className="mt-1 text-sm text-gray-400">
          {tallies.five} five-star · {tallies.four} four-star · {tallies.rejected} rejected{tallies.unrated > 0 && ` · ${tallies.unrated} skipped`}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {tallies.rejected > 0 && (
          <button type="button" onClick={onDelete} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white transition hover:bg-red-500">
            <Trash2 className="h-4 w-4" /> Delete {tallies.rejected} rejected
          </button>
        )}
        <button type="button" onClick={onExit} className="h-11 rounded-xl bg-primary-500 text-sm font-semibold text-on-accent transition hover:bg-primary-400">
          Back to the folder
        </button>
        {total > 0 && (
          <button type="button" onClick={onReview} className="h-10 rounded-xl text-sm text-gray-400 transition hover:text-gray-200">
            Go through them again
          </button>
        )}
      </div>
    </div>
  );
}

function NavBtn({ side, onClick, children }: { side: 'left' | 'right'; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08] text-white backdrop-blur transition hover:bg-white/15 sm:flex ${side === 'left' ? 'left-3' : 'right-3'}`}
    >
      {children}
    </button>
  );
}

function RateBtn({ onClick, label, active, tone, wide, children }: {
  onClick: () => void;
  label: string;
  active: boolean;
  tone?: 'danger' | 'primary';
  wide?: boolean;
  children: React.ReactNode;
}) {
  // Every button is neutral until it matches the photo's current rating; only
  // that one is filled, so the row always reads as "this is what it's rated".
  const base = 'flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-2xl border transition active:scale-95';
  const look = active
    ? tone === 'primary' ? 'border-primary-500 bg-primary-500 text-on-accent'
      : tone === 'danger' ? 'border-red-500 bg-red-500 text-white'
        : 'border-gray-100 bg-gray-100 text-on-accent'
    : tone === 'primary' ? 'border-border-strong bg-surface text-primary-400 hover:bg-primary-500/10'
      : tone === 'danger' ? 'border-border-strong bg-surface text-red-400 hover:bg-red-500/10'
        : 'border-border-strong bg-surface text-gray-100 hover:bg-border';
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={`${base} ${look} ${wide ? 'flex-[1.3]' : 'flex-1'}`}>
      {children}
    </button>
  );
}
