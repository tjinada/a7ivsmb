import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Star, ChevronLeft, ChevronRight, Loader2, Trash2, ImageOff } from 'lucide-react';
import type { ApiResponse, ExifInfo, GalleryItem } from '@sonycam/shared';
import { api } from '@/api/client';
import { toast } from '@/components/Toast';
import { prettyDate } from '@/lib/dates';
import { useBrowse, useRate, useDeleteItems, useInvalidateGallery } from '@/features/gallery/api';
import { thumbUrl, previewUrl } from '@/features/gallery/mediaUrl';
import { ConfirmDialog } from '@/features/gallery/ConfirmDialog';

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
 *  them server-side), or the RAWs when a folder has only RAW. */
function cullable(items: GalleryItem[]): GalleryItem[] {
  const jpgs = items.filter((i) => i.kind === 'image');
  return jpgs.length > 0 ? jpgs : items.filter((i) => i.kind === 'raw');
}

/**
 * Cull mode: one photo at a time, rate it, a stamp confirms the rating and it
 * advances. Keys 1–5 (1 = reject),
 * X = reject, ←/→ move, Esc exits. Touch: swipe up = ★5, down = reject,
 * sideways moves. Starts at the first unrated photo and preloads the next.
 */
export function CullPage() {
  const [params] = useSearchParams();
  const folder = params.get('path') ?? '';
  const navigate = useNavigate();
  const exit = useCallback(() => navigate(`/gallery?path=${encodeURIComponent(folder)}`, { replace: true }), [navigate, folder]);

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

  // Start at the first unrated photo once the folder has loaded.
  useEffect(() => {
    if (idx !== null || list.length === 0) return;
    const first = list.findIndex((i) => ratingOf(i) === 0);
    setIdx(first === -1 ? 0 : first);
  }, [list, idx, ratingOf]);

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

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDelete) return;
      if (e.key >= '1' && e.key <= '5') rate(Number(e.key));
      else if (e.key === 'x' || e.key === 'X') rate(REJECT);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rate, move, exit, confirmDelete]);

  // Preload the next preview so advancing is instant.
  useEffect(() => {
    const next = idx !== null ? list[idx + 1] : undefined;
    if (!next) return;
    const im = new Image();
    im.src = previewUrl(next.path, next.modified);
  }, [idx, list]);

  // Touch: vertical swipe rates (the photo follows the finger and the stamp
  // fades in as it nears the threshold), horizontal moves. The axis locks on
  // the first clear movement so a sideways swipe never drags the photo.
  const touch = useRef<{ x: number; y: number; axis: 'v' | 'h' | null } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
    if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) s.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
    if (s.axis === 'v' && !reduceMotion && fxTimer.current === null) { setDragging(true); setDrag(dy); }
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    setDragging(false);
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
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
          </p>
        </div>
        <div className="flex flex-none gap-2.5 text-xs text-gray-400">
          <span><span className="font-semibold text-primary-500">★5</span> {tallies.five}</span>
          <span><span className="font-semibold text-gray-100">★4</span> {tallies.four}</span>
          <span><span className="font-semibold text-red-400">✕</span> {tallies.rejected}</span>
        </div>
      </div>
      <div className="mx-3 h-[3px] overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary-500 transition-[width] duration-300" style={{ width: total ? `${Math.round((tallies.rated / total) * 100)}%` : '0%' }} />
      </div>

      {/* Stage */}
      <div
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-2"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touch.current = null; setDragging(false); setDrag(0); }}
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
          />
        ) : null}

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
              <span className="sm:hidden">Swipe up ★5 · down rejects · sideways moves</span>
              <span className="hidden sm:inline">Rating advances to the next photo · keys 1–5 rate · X rejects · ←/→ move · Esc exits</span>
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
function Stage({ item, rating, motion }: { item: GalleryItem; rating: number; motion: StageMotion }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exif, setExif] = useState<ExifInfo | null>(null);

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
      <div className="absolute inset-2 flex items-center justify-center will-change-transform" style={stageStyle(motion)}>
        {failed ? (
          <div className="flex flex-col items-center gap-2 text-white/60"><ImageOff className="h-10 w-10" /><p className="text-sm">Preview unavailable</p></div>
        ) : (
          <>
            {!loaded && (
              <img src={thumbUrl(item.path, item.modified)} alt="" aria-hidden className="absolute max-h-full max-w-full scale-[1.02] rounded object-contain blur-sm" />
            )}
            <img
              src={previewUrl(item.path, item.modified)}
              alt={item.name}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`max-h-full max-w-full rounded object-contain transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        )}
      </div>
      <span className="pointer-events-none absolute left-4 top-3 rounded-md bg-base/75 px-2 py-1 text-[11px] font-semibold text-gray-300 backdrop-blur-sm">
        {item.name.replace(/\.[^.]+$/, '')}{item.twin ? ' · RAW+JPG' : item.kind === 'raw' ? ' · RAW' : ''}
        {stars && <span className={`ml-2 ${rating === REJECT ? 'text-red-400' : 'text-primary-400'}`}>{stars}</span>}
      </span>
      {chips && (
        <span className="pointer-events-none absolute right-4 top-3 rounded-md bg-base/75 px-2 py-1 text-[11px] text-gray-400 backdrop-blur-sm">{chips}</span>
      )}
    </>
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
