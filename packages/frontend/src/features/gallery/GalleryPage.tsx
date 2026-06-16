import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder, ChevronRight, RefreshCw, Loader2, Images, Download, Home, Star, SlidersHorizontal,
  CheckSquare, CheckCircle2, Circle, Share2, Trash2, MoreVertical, CalendarDays, FolderPlus, Library,
} from 'lucide-react';
import type {
  ApiResponse, GalleryBrowseResult, GalleryTimelineResult, GalleryItem,
  AlbumInfo, AlbumFormats, AlbumCreateResult,
} from '@sonycam/shared';
import { api } from '@/api/client';
import { AuthImage } from './AuthImage';
import { Lightbox } from './Lightbox';
import { ConfirmDialog } from './ConfirmDialog';
import { CleanupDialog } from './CleanupDialog';
import { AlbumDialog } from './AlbumDialog';
import { StarRating } from './StarRating';
import { shareItems, downloadZip } from './download';

async function browse(path: string): Promise<GalleryBrowseResult> {
  const res = await api.get<ApiResponse<GalleryBrowseResult>>('/gallery/browse', { params: { path } });
  if (!res.data.data) throw new Error('Unexpected response');
  return res.data.data;
}

async function fetchTimeline(): Promise<GalleryTimelineResult> {
  const res = await api.get<ApiResponse<GalleryTimelineResult>>('/gallery/timeline');
  if (!res.data.data) throw new Error('Unexpected response');
  return res.data.data;
}

async function fetchAlbums(): Promise<AlbumInfo[]> {
  const res = await api.get<ApiResponse<AlbumInfo[]>>('/gallery/albums');
  return res.data.data ?? [];
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{children}</h2>
  );
}

/** Group key for the timeline: the date-folder segment if present, else mtime. */
function dateKey(it: GalleryItem): string {
  const seg = it.path.split('/')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) return seg;
  const d = new Date(it.modified);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Friendly label for a YYYY-MM-DD string (Today/Yesterday, else a date). A
 *  non-date string is returned unchanged, so it is safe on folder/crumb names. */
function prettyDate(key: string, weekday = true): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(dt);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dt.toLocaleDateString(
    undefined,
    weekday
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

const RATING_OPTS = [0, 3, 4, 5];
const TYPE_OPTS = [
  { label: 'All', value: 'all' as const },
  { label: 'JPG', value: 'image' as const },
  { label: 'RAW', value: 'raw' as const },
];
const activeChip = 'flex items-center rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white';
const idleChip = 'flex items-center rounded-md px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200';

export function GalleryPage() {
  const [view, setView] = useState<'folders' | 'timeline'>('folders');
  const [path, setPath] = useState('');
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [ratingMin, setRatingMin] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'raw'>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<GalleryItem[]>([]);
  const [busy, setBusy] = useState<null | 'share' | 'zip'>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [ratePickerOpen, setRatePickerOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState<null | 'selection' | 'starred'>(null);

  const qc = useQueryClient();
  const isTimeline = view === 'timeline';

  const browseQuery = useQuery({
    queryKey: ['gallery', 'browse', path],
    queryFn: () => browse(path),
    enabled: !isTimeline,
  });
  const timelineQuery = useQuery({
    queryKey: ['gallery', 'timeline'],
    queryFn: fetchTimeline,
    enabled: isTimeline,
  });
  const albumsQuery = useQuery({
    queryKey: ['gallery', 'albums'],
    queryFn: fetchAlbums,
    enabled: albumOpen !== null,
  });

  const activeQuery = isTimeline ? timelineQuery : browseQuery;
  const { isLoading, isError, isFetching } = activeQuery;
  const refetch = activeQuery.refetch;
  const activeKey = isTimeline ? ['gallery', 'timeline'] : ['gallery', 'browse', path];

  const folders = !isTimeline ? browseQuery.data?.folders ?? [] : [];
  const allItems = isTimeline ? timelineQuery.data?.items ?? [] : browseQuery.data?.items ?? [];
  const truncated = isTimeline ? timelineQuery.data?.truncated ?? false : false;

  // Pin the curated Albums/ folder to the top, on its own row.
  const albumsFolder = folders.find((f) => f.path === 'Albums');
  const otherFolders = albumsFolder ? folders.filter((f) => f.path !== 'Albums') : folders;

  // Patch the items array of whichever query is currently showing.
  const patchActive = (fn: (items: GalleryItem[]) => GalleryItem[]) => {
    qc.setQueryData(activeKey, (old: { items: GalleryItem[] } | undefined) =>
      old ? { ...old, items: fn(old.items) } : old,
    );
  };

  // Reset filters + selection + menus when changing folders.
  useEffect(() => {
    setRatingMin(0);
    setTypeFilter('all');
    setSelecting(false);
    setSelected(new Set());
    setMenuOpen(false);
    setCleanupOpen(false);
    setRatePickerOpen(false);
    setAlbumOpen(null);
  }, [path]);

  // Switching view drops the current selection/menus (different item set).
  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
    setMenuOpen(false);
    setCleanupOpen(false);
    setRatePickerOpen(false);
    setAlbumOpen(null);
  }, [view]);

  const rateMut = useMutation({
    mutationFn: ({ path: p, stars }: { path: string; stars: number }) =>
      api.put('/gallery/rating', { path: p, stars }),
    onError: () => {
      qc.invalidateQueries({ queryKey: ['gallery'] });
      window.alert('Could not save rating');
    },
  });

  const rateBulkMut = useMutation({
    mutationFn: ({ paths, stars }: { paths: string[]; stars: number }) =>
      api.post('/gallery/rate-bulk', { paths, stars }),
    onError: () => {
      qc.invalidateQueries({ queryKey: ['gallery'] });
      window.alert('Could not rate photos');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (paths: string[]) => api.post('/gallery/delete', { paths }),
  });

  const createAlbumMut = useMutation({
    mutationFn: (body: { name: string; paths: string[]; formats: AlbumFormats }) =>
      api.post<ApiResponse<AlbumCreateResult>>('/gallery/albums', body),
    onSuccess: (res) => {
      const result = res.data.data;
      qc.invalidateQueries({ queryKey: ['gallery'] });
      setAlbumOpen(null);
      exitSelect();
      if (result) {
        // Jump straight into the new album so the user sees it.
        setView('folders');
        setPath(result.path);
      }
    },
    onError: () => window.alert('Could not create the album'),
  });

  const createAlbum = (opts: { name: string; paths: string[]; formats: AlbumFormats }) => {
    if (opts.paths.length === 0) return;
    createAlbumMut.mutate(opts);
  };

  const rate = (item: GalleryItem, stars: number) => {
    patchActive((items) =>
      items.map((i) =>
        i.path === item.path || (item.twin && i.path === item.twin) ? { ...i, rating: stars } : i,
      ),
    );
    setActive((a) => (a && a.path === item.path ? { ...a, rating: stars } : a));
    rateMut.mutate({ path: item.path, stars });
  };

  const toggleSelect = (p: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    setRatePickerOpen(false);
  };

  const deleteItems = async (items: GalleryItem[]) => {
    const paths = items.map((i) => i.path);
    if (paths.length === 0) return;
    try {
      await deleteMut.mutateAsync(paths);
      setActive((a) => (a && paths.includes(a.path) ? null : a));
      exitSelect();
      qc.invalidateQueries({ queryKey: ['gallery'] });
    } catch {
      window.alert('Delete failed');
    }
  };

  const performDelete = async () => {
    await deleteItems(pendingDelete);
    setPendingDelete([]);
  };

  const runCleanup = async (targets: GalleryItem[]) => {
    await deleteItems(targets);
    setCleanupOpen(false);
  };

  const crumbs = [
    { name: 'Home', path: '' },
    ...(path ? path.split('/').map((seg, i, arr) => ({ name: seg, path: arr.slice(0, i + 1).join('/') })) : []),
  ];

  const shownItems = allItems.filter(
    (i) => i.rating >= ratingMin && (typeFilter === 'all' || i.kind === typeFilter),
  );
  const selectedItems = allItems.filter((i) => selected.has(i.path));
  // Everything the lightbox can page through. RAW previews via its embedded
  // JPEG, so it's included alongside images.
  const viewable = shownItems;
  const activeIndex = active ? viewable.findIndex((i) => i.path === active.path) : -1;
  const allShownSelected = shownItems.length > 0 && shownItems.every((i) => selected.has(i.path));
  const hasContent = isTimeline
    ? allItems.length > 0
    : !!browseQuery.data && (folders.length > 0 || allItems.length > 0);

  // Timeline: bucket the (already newest-first) photos into date sections.
  const groups: { date: string; items: GalleryItem[] }[] = [];
  if (isTimeline) {
    for (const it of shownItems) {
      const d = dateKey(it);
      const last = groups[groups.length - 1];
      if (last && last.date === d) last.items.push(it);
      else groups.push({ date: d, items: [it] });
    }
  }

  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownItems.forEach((i) => next.delete(i.path));
      else shownItems.forEach((i) => next.add(i.path));
      return next;
    });

  const bulkShare = async () => {
    setBusy('share');
    try {
      const ok = await shareItems(selectedItems);
      if (!ok) await downloadZip(selectedItems);
    } catch {
      window.alert('Share failed');
    } finally {
      setBusy(null);
    }
  };

  const bulkDownload = async () => {
    setBusy('zip');
    try {
      await downloadZip(selectedItems);
    } catch {
      window.alert('Download failed');
    } finally {
      setBusy(null);
    }
  };

  const bulkRate = (stars: number) => {
    const items = selectedItems;
    if (items.length === 0) return;
    const affected = new Set(selected);
    items.forEach((i) => i.twin && affected.add(i.twin));
    patchActive((list) => list.map((i) => (affected.has(i.path) ? { ...i, rating: stars } : i)));
    rateBulkMut.mutate({ paths: items.map((i) => i.path), stars });
  };

  const tileTap = (it: GalleryItem) => {
    if (selecting) toggleSelect(it.path);
    else setActive(it);
  };

  const renderTile = (it: GalleryItem) => {
    const sel = selected.has(it.path);
    const isRaw = it.kind === 'raw';
    return (
      <button
        key={it.path}
        type="button"
        onClick={() => tileTap(it)}
        className={`group relative aspect-square overflow-hidden rounded-lg bg-surface ring-1 transition active:scale-[0.98] ${
          sel ? 'ring-2 ring-primary-500' : 'ring-border/60 hover:ring-primary-500/60'
        }`}
      >
        <AuthImage
          src={`/gallery/thumb?path=${encodeURIComponent(it.path)}`}
          alt={it.name}
          className="h-full w-full [&>img]:transition-transform [&>img]:duration-300 group-hover:[&>img]:scale-110"
          fallback={
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2">
              <Download className="h-5 w-5 text-gray-500" />
              <span className="w-full truncate px-1 text-center text-[10px] text-gray-500">{it.name}</span>
            </div>
          }
        />

        {isRaw && (
          <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary-300">
            RAW
          </div>
        )}

        {it.twin && (
          <div
            className={`pointer-events-none absolute left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 ${
              isRaw ? 'top-[1.55rem]' : 'top-1'
            }`}
          >
            {isRaw ? '+JPG' : '+RAW'}
          </div>
        )}

        {it.rating > 0 && (
          <div className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {it.rating}
          </div>
        )}

        {selecting && (
          <div className="absolute right-1 top-1">
            {sel ? (
              <CheckCircle2 className="h-5 w-5 fill-primary-500 text-white" />
            ) : (
              <Circle className="h-5 w-5 text-white/80 drop-shadow" />
            )}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: view toggle + breadcrumb + actions */}
      <div className="flex flex-shrink-0 items-center border-b border-border bg-base px-3 py-2.5 text-sm">
        <div className="mr-2 flex flex-shrink-0 rounded-lg bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setView('folders')}
            aria-label="Folders"
            className={`flex h-7 w-8 items-center justify-center rounded-md transition ${
              !isTimeline ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Folder className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('timeline')}
            aria-label="Timeline"
            className={`flex h-7 w-8 items-center justify-center rounded-md transition ${
              isTimeline ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>

        {isTimeline ? (
          <span className="min-w-0 flex-1 truncate font-medium text-gray-100">All photos</span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={c.path} className="flex items-center gap-1.5 whitespace-nowrap">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />}
                  <button
                    type="button"
                    onClick={() => setPath(c.path)}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition ${
                      isLast ? 'font-medium text-gray-100' : 'text-primary-500 hover:bg-surface'
                    }`}
                  >
                    {i === 0 && <Home className="h-3.5 w-3.5" />}
                    {prettyDate(c.name, false)}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="relative ml-2 flex flex-shrink-0 items-center gap-1">
          {selecting ? (
            <button type="button" onClick={exitSelect} className="rounded-md px-2 py-1 text-xs font-medium text-primary-500">
              Cancel
            </button>
          ) : (
            <>
              {allItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelecting(true)}
                  aria-label="Select"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200"
                >
                  <CheckSquare className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => refetch()}
                aria-label="Refresh"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              {allItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="More actions"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              )}
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setAlbumOpen('starred');
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-surface hover:brightness-125"
                    >
                      <FolderPlus className="h-4 w-4 text-primary-500" />
                      New album from starred&hellip;
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setCleanupOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete low-rated&hellip;
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {allItems.length > 0 && !selecting && (
        <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-base px-3 py-2">
          <SlidersHorizontal className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
          <div className="flex flex-shrink-0 rounded-lg bg-surface p-0.5">
            {RATING_OPTS.map((v) => (
              <button key={v} type="button" onClick={() => setRatingMin(v)} className={ratingMin === v ? activeChip : idleChip}>
                {v === 0 ? (
                  'All'
                ) : (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-current" />
                    {v}
                    {v < 5 ? '+' : ''}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-shrink-0 rounded-lg bg-surface p-0.5">
            {TYPE_OPTS.map((o) => (
              <button key={o.value} type="button" onClick={() => setTypeFilter(o.value)} className={typeFilter === o.value ? activeChip : idleChip}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-gray-400">
            <p className="text-sm">Couldn&rsquo;t load {isTimeline ? 'the timeline' : 'this folder'}.</p>
            <button type="button" onClick={() => refetch()} className="text-xs text-primary-500">
              Try again
            </button>
          </div>
        ) : hasContent ? (
          <div className="p-3">
            {!isTimeline && folders.length > 0 && (
              <section className="mb-5">
                {albumsFolder && (
                  <button
                    type="button"
                    onClick={() => setPath(albumsFolder.path)}
                    className="group mb-3 flex w-full items-center gap-3 rounded-xl border border-primary-500/30 bg-primary-500/[0.07] p-3 text-left transition hover:border-primary-500/60 active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-400">
                      <Library className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-100">Albums</span>
                      <span className="block text-[11px] text-gray-500">Curated collections</span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-500 transition group-hover:translate-x-0.5 group-hover:text-gray-300" />
                  </button>
                )}
                {otherFolders.length > 0 && (
                  <>
                    <SectionLabel>Folders</SectionLabel>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                      {otherFolders.map((f) => (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => setPath(f.path)}
                          className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-primary-500/50 active:scale-[0.98]"
                        >
                          <div className="relative aspect-[4/3] w-full bg-base">
                            {f.cover ? (
                              <AuthImage
                                src={`/gallery/thumb?path=${encodeURIComponent(f.cover)}`}
                                alt={f.name}
                                className="h-full w-full [&>img]:transition-transform [&>img]:duration-300 group-hover:[&>img]:scale-105"
                                fallback={
                                  <div className="flex h-full w-full items-center justify-center text-primary-500/60">
                                    <Folder className="h-8 w-8" />
                                  </div>
                                }
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-primary-500/60">
                                <Folder className="h-8 w-8" />
                              </div>
                            )}
                            {typeof f.count === 'number' && f.count > 0 && (
                              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                                {f.count}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 px-2.5 py-2">
                            <span className="min-w-0 flex-1">
                              <span className="block break-words text-sm font-medium leading-snug text-gray-100">
                                {prettyDate(f.name, false)}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-gray-500">
                                {typeof f.count === 'number'
                                  ? `${f.count} ${f.count === 1 ? 'photo' : 'photos'}`
                                  : 'Folder'}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {isTimeline ? (
              groups.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No photos match this filter.</p>
              ) : (
                <>
                  {groups.map((g) => (
                    <section key={g.date} className="mb-5">
                      <div className="sticky top-0 z-10 -mx-3 mb-2 bg-base/95 px-3 py-1.5 backdrop-blur">
                        <h2 className="text-xs font-semibold text-gray-300">
                          {prettyDate(g.date)}
                          <span className="ml-1.5 text-gray-500">{g.items.length}</span>
                        </h2>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {g.items.map(renderTile)}
                      </div>
                    </section>
                  ))}
                  {truncated && (
                    <p className="py-3 text-center text-xs text-gray-500">
                      Showing the most recent {allItems.length} photos.
                    </p>
                  )}
                </>
              )
            ) : (
              allItems.length > 0 && (
                <section>
                  {folders.length > 0 && <SectionLabel>Photos</SectionLabel>}
                  {shownItems.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">No photos match this filter.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {shownItems.map(renderTile)}
                    </div>
                  )}
                </section>
              )
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
              <Images className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-300">{isTimeline ? 'No photos yet' : 'This folder is empty'}</p>
            <p className="max-w-xs text-xs text-gray-500">Send photos from the camera over FTP, then tap refresh.</p>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selecting && (
        <div className="relative flex flex-shrink-0 items-center gap-3 border-t border-border bg-base px-4 py-2.5">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-100">{selected.size} selected</span>
            <button type="button" onClick={toggleSelectAll} className="text-left text-[11px] text-primary-500">
              {allShownSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setAlbumOpen('selection')}
              disabled={selected.size === 0}
              className="flex w-[52px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-gray-200 transition hover:bg-surface disabled:opacity-40"
            >
              <FolderPlus className="h-5 w-5" />
              <span className="text-[10px]">Album</span>
            </button>
            <button
              type="button"
              onClick={() => setRatePickerOpen((o) => !o)}
              disabled={selected.size === 0}
              className="flex w-[52px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-gray-200 transition hover:bg-surface disabled:opacity-40"
            >
              <Star className="h-5 w-5" />
              <span className="text-[10px]">Rate</span>
            </button>
            <button
              type="button"
              onClick={bulkShare}
              disabled={selected.size === 0 || busy !== null}
              className="flex w-[52px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-gray-200 transition hover:bg-surface disabled:opacity-40"
            >
              {busy === 'share' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
              <span className="text-[10px]">Share</span>
            </button>
            <button
              type="button"
              onClick={bulkDownload}
              disabled={selected.size === 0 || busy !== null}
              className="flex w-[52px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-gray-200 transition hover:bg-surface disabled:opacity-40"
            >
              {busy === 'zip' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              <span className="text-[10px]">Download</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(selectedItems)}
              disabled={selected.size === 0}
              className="flex w-[52px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-5 w-5" />
              <span className="text-[10px]">Delete</span>
            </button>
          </div>

          {ratePickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRatePickerOpen(false)} />
              <div className="absolute bottom-full right-3 z-50 mb-2 rounded-xl border border-border bg-surface p-3 shadow-xl">
                <p className="mb-2 text-xs text-gray-400">Rate {selected.size} selected</p>
                <StarRating
                  value={0}
                  size={26}
                  onChange={(s) => {
                    bulkRate(s);
                    setRatePickerOpen(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    bulkRate(0);
                    setRatePickerOpen(false);
                  }}
                  className="mt-2 text-[11px] text-gray-400 transition hover:text-gray-200"
                >
                  Clear rating
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {active && (
        <Lightbox
          photo={active}
          index={activeIndex >= 0 ? activeIndex : undefined}
          total={viewable.length}
          onClose={() => setActive(null)}
          onRate={(stars) => rate(active, stars)}
          onDelete={() => setPendingDelete([active])}
          onPrev={activeIndex > 0 ? () => setActive(viewable[activeIndex - 1]) : undefined}
          onNext={
            activeIndex >= 0 && activeIndex < viewable.length - 1
              ? () => setActive(viewable[activeIndex + 1])
              : undefined
          }
        />
      )}

      {pendingDelete.length > 0 && (
        <ConfirmDialog
          title={pendingDelete.length === 1 ? 'Delete this photo?' : `Delete ${pendingDelete.length} photos?`}
          message={`This permanently removes the file(s) from the share. This can't be undone.${
            pendingDelete.some((i) => i.twin) ? ' Matching RAW/JPG pairs are removed together.' : ''
          }`}
          confirmLabel="Delete"
          busy={deleteMut.isPending}
          onConfirm={performDelete}
          onCancel={() => setPendingDelete([])}
        />
      )}

      {cleanupOpen && (
        <CleanupDialog
          items={allItems}
          busy={deleteMut.isPending}
          onConfirm={runCleanup}
          onCancel={() => setCleanupOpen(false)}
        />
      )}

      {albumOpen && (
        <AlbumDialog
          starred={albumOpen === 'starred'}
          sourceItems={albumOpen === 'starred' ? allItems : selectedItems}
          existingAlbums={albumsQuery.data ?? []}
          busy={createAlbumMut.isPending}
          onConfirm={createAlbum}
          onCancel={() => setAlbumOpen(null)}
        />
      )}
    </div>
  );
}
