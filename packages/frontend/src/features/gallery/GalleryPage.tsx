import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Images, Play } from 'lucide-react';
import type { GalleryItem, AlbumFormats } from '@sonycam/shared';
import { toast } from '@/components/Toast';
import { dateKey, prettyDate, isDateSegment } from '@/lib/dates';
import {
  keys, useBrowse, useTimeline, useAlbums, useShares, useRate, useRateBulk, useDeleteItems,
  useCreateAlbum, useRenameAlbum, useDeleteAlbum, useDeleteFolder, useInvalidateGallery,
} from './api';
import { useGalleryDialogs } from './useGalleryDialogs';
import { GalleryToolbar, MenuIcons, type GalleryView, type MenuAction } from './GalleryToolbar';
import { FilterBar, type TypeFilter } from './FilterBar';
import { FolderGrid, SectionLabel } from './FolderGrid';
import { PhotoGrid, TimelineGrid } from './PhotoGrid';
import { BulkActionBar, type BulkBusy } from './BulkActionBar';
import { EditedFolderCard } from './AlbumShareCard';
import { HomeStrip } from './HomeStrip';
import { AlbumPanel, useAlbumPanel } from './AlbumPanel';
import { Lightbox } from './Lightbox';
import { ConfirmDialog } from './ConfirmDialog';
import { CleanupDialog } from './CleanupDialog';
import { AlbumDialog } from './AlbumDialog';
import { ShareDialog } from './ShareDialog';
import { RenameAlbumDialog } from './RenameAlbumDialog';
import { BackfillDialog } from './BackfillDialog';
import { DeleteFolderDialog } from './DeleteFolderDialog';
import { EditedUpload } from './EditedUpload';
import { shareItems, downloadZip } from './download';
import { useJobFor, useStartJob } from '@/features/jobs/api';
import { JobPanel } from '@/features/jobs/JobPanel';

/** sessionStorage key for "where the grid was" when a tile opened cull, so
 *  coming back lands on the same scroll position and filters. */
const returnKey = (view: GalleryView, path: string) => `gallery-return:${view}:${path}`;
interface ReturnSnap { scrollTop: number; ratingMin: number; typeFilter: TypeFilter }
function readReturnSnap(key: string): ReturnSnap | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ReturnSnap) : null;
  } catch {
    return null;
  }
}

/** Where a shoot photo is culled: its dated folder (one level up from a
 *  JPG/RAW bucket). Album photos and loose files at the root aren't culled. */
function cullFolderOf(item: GalleryItem): string | null {
  if (item.path.startsWith('Albums/')) return null;
  const parts = item.path.split('/');
  parts.pop();
  if (parts.length > 0 && /^(JPG|RAW)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length > 0 ? parts.join('/') : null;
}

export function GalleryPage() {
  // Folder path and view live in the URL (?path=…&view=timeline) so every
  // drill-down is a real history entry: Android's back gesture walks up
  // folders instead of closing the PWA, reloads keep the user in place, and
  // coming back from cull restores the same grid.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const path = searchParams.get('path') ?? '';
  const view: GalleryView = searchParams.get('view') === 'timeline' ? 'timeline' : 'folders';
  const setPath = (p: string) => setSearchParams(p ? { path: p } : {});
  const setView = (v: GalleryView) =>
    setSearchParams({ ...(path ? { path } : {}), ...(v === 'timeline' ? { view: 'timeline' } : {}) });

  // Returning from cull: the grid's scroll and filters as they were.
  const [returnSnap] = useState(() => readReturnSnap(returnKey(view, path)));

  const [active, setActive] = useState<GalleryItem | null>(null);
  const [ratingMin, setRatingMin] = useState(returnSnap?.ratingMin ?? 0);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(returnSnap?.typeFilter ?? 'all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<BulkBusy>(null);
  const { dialog, open, close } = useGalleryDialogs([path, view]);

  const qc = useQueryClient();
  const invalidate = useInvalidateGallery();
  const isTimeline = view === 'timeline';

  // ── Where are we? ───────────────────────────────────────────────────────
  // An album root is exactly one segment under Albums/ (e.g. "Albums/June").
  const isAlbumRoot = /^Albums\/[^/]+$/.test(path);
  const albumName = isAlbumRoot ? path.slice('Albums/'.length) : '';
  const isEditedFolder = /^Albums\/[^/]+\/Edited$/.test(path);
  const editedAlbumName = isEditedFolder ? path.split('/')[1] : '';
  const shareAlbumName = albumName || editedAlbumName;
  const shareAlbumPath = shareAlbumName ? `Albums/${shareAlbumName}` : '';
  const canBackfill = !isTimeline && !path.startsWith('Albums');
  const lastSeg = path.split('/').pop() ?? '';
  const isHomeDateFolder = !isTimeline && path !== '' && !path.startsWith('Albums') && isDateSegment(lastSeg);

  // ── Data ────────────────────────────────────────────────────────────────
  const browseQuery = useBrowse(path, !isTimeline);
  const timelineQuery = useTimeline(isTimeline);
  const albumsQuery = useAlbums(dialog.kind === 'album');
  const sharesQuery = useShares(!isTimeline && path.startsWith('Albums'));
  // The workflow job for this shoot folder or album, if one was started.
  const jobQuery = useJobFor(isHomeDateFolder || (!isTimeline && isAlbumRoot) ? path : '');
  const job = jobQuery.data ?? null;
  const startJobMut = useStartJob({ onError: toast.error });
  const albumShares = (sharesQuery.data ?? []).filter((s) => s.albumPath === shareAlbumPath);

  // At an album root the photos come from the panel's tab (Edited/ or
  // Selected/JPG), not from the album folder itself, which holds no files.
  const panel = useAlbumPanel(isAlbumRoot ? path : '', albumShares);
  const activeQuery = isTimeline ? timelineQuery : browseQuery;
  const { isLoading: baseLoading, isError, isFetching, refetch: baseRefetch } = activeQuery;
  const isLoading = baseLoading || (isAlbumRoot && panel.loading);
  const refetch = () => { void baseRefetch(); if (isAlbumRoot) panel.refetch(); if (job) void jobQuery.refetch(); };
  const activeKey = isTimeline ? keys.timeline : isAlbumRoot ? panel.activeKey : keys.browse(path);
  const folders = !isTimeline && !isAlbumRoot ? browseQuery.data?.folders ?? [] : [];
  const allItems = isTimeline ? timelineQuery.data?.items ?? [] : isAlbumRoot ? panel.items : browseQuery.data?.items ?? [];
  const truncated = isTimeline ? timelineQuery.data?.truncated ?? false : false;

  /** Patch the items array of whichever query is currently showing. */
  const patchActive = (fn: (items: GalleryItem[]) => GalleryItem[]) => {
    qc.setQueryData(activeKey, (old: { items: GalleryItem[] } | undefined) => (old ? { ...old, items: fn(old.items) } : old));
  };

  // Reset filters + selection when changing folders or views (not on the
  // first render, which may be restoring them after cull).
  const firstPathRun = useRef(true);
  useEffect(() => {
    if (firstPathRun.current) { firstPathRun.current = false; return; }
    setRatingMin(0);
    setTypeFilter('all');
  }, [path]);
  useEffect(() => { setSelecting(false); setSelected(new Set()); }, [path, view]);

  // ── Mutations ───────────────────────────────────────────────────────────
  const rateMut = useRate(toast.error);
  const rateBulkMut = useRateBulk(toast.error);
  const deleteMut = useDeleteItems();
  const createAlbumMut = useCreateAlbum({
    onSuccess: (result) => {
      close();
      exitSelect();
      if (result) { setView('folders'); setPath(result.path); }
    },
    onError: toast.error,
  });
  const renameAlbumMut = useRenameAlbum({ onSuccess: (info) => { close(); if (info) setPath(info.path); }, onError: toast.error });
  const deleteAlbumMut = useDeleteAlbum({ onSuccess: () => { close(); setPath('Albums'); }, onError: toast.error });
  const deleteFolderMut = useDeleteFolder({
    onSuccess: () => { close(); setPath(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''); },
    onError: toast.error,
  });

  // ── Derived lists ───────────────────────────────────────────────────────
  const shownItems = allItems.filter((i) => i.rating >= ratingMin && (typeFilter === 'all' || i.kind === typeFilter));
  const selectedItems = allItems.filter((i) => selected.has(i.path));
  const activeIndex = active ? shownItems.findIndex((i) => i.path === active.path) : -1;
  const allShownSelected = shownItems.length > 0 && shownItems.every((i) => selected.has(i.path));
  const hasContent = isTimeline
    ? allItems.length > 0
    : isAlbumRoot ? !!browseQuery.data : !!browseQuery.data && (folders.length > 0 || allItems.length > 0);
  // Back from cull: put the grid where it was, once its photos are laid out
  // (tiles are fixed squares, so the layout is final on the first render).
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !returnSnap || !hasContent || isLoading) return;
    restored.current = true;
    if (scrollRef.current) scrollRef.current.scrollTop = returnSnap.scrollTop;
    try { sessionStorage.removeItem(returnKey(view, path)); } catch { /* ignore */ }
  }, [returnSnap, hasContent, isLoading, view, path]);

  const groups = useMemo(() => {
    if (!isTimeline) return [];
    const out: { date: string; items: GalleryItem[] }[] = [];
    for (const it of shownItems) {
      const d = dateKey(it);
      const last = out[out.length - 1];
      if (last && last.date === d) last.items.push(it);
      else out.push({ date: d, items: [it] });
    }
    return out;
  }, [isTimeline, shownItems]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const rate = (item: GalleryItem, stars: number) => {
    patchActive((items) => items.map((i) => (i.path === item.path || (item.twin && i.path === item.twin) ? { ...i, rating: stars } : i)));
    setActive((a) => (a && a.path === item.path ? { ...a, rating: stars } : a));
    rateMut.mutate({ path: item.path, stars });
  };

  const toggleSelect = (p: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(p)) next.delete(p); else next.add(p); return next; });

  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownItems.forEach((i) => next.delete(i.path));
      else shownItems.forEach((i) => next.add(i.path));
      return next;
    });

  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const deleteItems = async (items: GalleryItem[]) => {
    const paths = items.map((i) => i.path);
    if (paths.length === 0) return;
    try {
      await deleteMut.mutateAsync(paths);
      setActive((a) => (a && paths.includes(a.path) ? null : a));
      exitSelect();
      void invalidate();
    } catch {
      toast.error('Delete failed');
    }
  };

  const bulkShare = async () => {
    setBusy('share');
    try { if (!(await shareItems(selectedItems))) await downloadZip(selectedItems); }
    catch { toast.error('Share failed'); }
    finally { setBusy(null); }
  };

  const bulkDownload = async () => {
    setBusy('zip');
    try { await downloadZip(selectedItems); }
    catch { toast.error('Download failed'); }
    finally { setBusy(null); }
  };

  const bulkRate = (stars: number) => {
    if (selectedItems.length === 0) return;
    const affected = new Set(selected);
    selectedItems.forEach((i) => i.twin && affected.add(i.twin));
    patchActive((list) => list.map((i) => (affected.has(i.path) ? { ...i, rating: stars } : i)));
    rateBulkMut.mutate({ paths: selectedItems.map((i) => i.path), stars });
  };

  const createAlbum = (opts: { name: string; paths: string[]; formats: AlbumFormats }) => {
    if (opts.paths.length > 0) createAlbumMut.mutate(opts);
  };

  // Shoot photos open in cull (the one place photos are reviewed and rated),
  // starting at the tapped photo; album photos keep the plain viewer.
  const openInCull = (it: GalleryItem, folder: string) => {
    try {
      const snap: ReturnSnap = { scrollTop: scrollRef.current?.scrollTop ?? 0, ratingMin, typeFilter };
      sessionStorage.setItem(returnKey(view, path), JSON.stringify(snap));
    } catch { /* storage unavailable: come back at the top */ }
    navigate(`/cull?path=${encodeURIComponent(folder)}&photo=${encodeURIComponent(it.path)}`, { state: { fromGrid: true } });
  };
  const tileTap = (it: GalleryItem) => {
    if (selecting) { toggleSelect(it.path); return; }
    const folder = cullFolderOf(it);
    if (folder) openInCull(it, folder);
    else setActive(it);
  };

  // ── Overflow menu ───────────────────────────────────────────────────────
  const menu: MenuAction[] = [];
  // A dated folder holds its shots in JPG/ and RAW/ subfolders, so "has
  // photos" means photos here or in either bucket.
  const hasShots = allItems.length > 0 || folders.some((f) => /^(JPG|RAW)$/i.test(f.name) && (f.count ?? 0) > 0);
  if (isHomeDateFolder && hasShots) {
    menu.push({ id: 'cull', label: 'Cull this folder', icon: MenuIcons.cull, onSelect: () => navigate(`/cull?path=${encodeURIComponent(path)}`) });
  }
  if (isAlbumRoot) {
    menu.push({ id: 'rename', label: 'Rename album…', icon: MenuIcons.rename, onSelect: () => open({ kind: 'rename' }) });
    menu.push({ id: 'deleteAlbum', label: 'Delete album…', icon: MenuIcons.trash, danger: true, onSelect: () => open({ kind: 'deleteAlbum' }) });
  }
  if (allItems.length > 0) {
    menu.push({ id: 'starred', label: 'New album from starred…', icon: MenuIcons.album, onSelect: () => open({ kind: 'album', source: 'starred' }) });
    menu.push({ id: 'cleanup', label: 'Delete low-rated…', icon: MenuIcons.trash, danger: true, onSelect: () => open({ kind: 'cleanup' }) });
  }
  if (canBackfill) menu.push({ id: 'backfill', label: 'Re-file by date…', icon: MenuIcons.backfill, onSelect: () => open({ kind: 'backfill' }) });
  if (isHomeDateFolder) menu.push({ id: 'deleteFolder', label: 'Delete folder…', icon: MenuIcons.trash, danger: true, onSelect: () => open({ kind: 'deleteFolder' }) });

  return (
    <div className="flex h-full flex-col">
      <GalleryToolbar
        view={view}
        onView={setView}
        path={path}
        onPath={setPath}
        selecting={selecting}
        onSelect={() => setSelecting(true)}
        onCancelSelect={exitSelect}
        canSelect={allItems.length > 0}
        isFetching={isFetching}
        onRefresh={() => refetch()}
        menu={menu}
        extra={isHomeDateFolder && hasShots && jobQuery.isSuccess && !job && (
          <button
            type="button"
            onClick={() => startJobMut.mutate(path)}
            disabled={startJobMut.isPending}
            className="mr-1 flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-primary-400 disabled:opacity-50"
          >
            {startJobMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            <span className="sm:hidden">Track</span><span className="hidden sm:inline">Track this shoot</span>
          </button>
        )}
      />

      {allItems.length > 0 && !selecting && !isEditedFolder && (
        <FilterBar ratingMin={ratingMin} onRatingMin={setRatingMin} typeFilter={typeFilter} onTypeFilter={setTypeFilter} />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-gray-400">
            <p className="text-sm">Couldn&rsquo;t load {isTimeline ? 'the timeline' : 'this folder'}.</p>
            <button type="button" onClick={() => refetch()} className="text-xs text-primary-500">Try again</button>
          </div>
        ) : hasContent ? (
          <div className="mx-auto max-w-screen-2xl p-3">
            {!isTimeline && path === '' && <HomeStrip folders={folders} onOpen={setPath} />}
            {job && <JobPanel job={job} here={isAlbumRoot ? 'album' : 'folder'} />}
            {!isTimeline && isAlbumRoot && (
              <AlbumPanel albumName={albumName} panel={panel} onCreateShare={() => open({ kind: 'shareCreate' })} tabsOnly={!!job} />
            )}
            {!isTimeline && isEditedFolder && (
              <EditedFolderCard albumName={editedAlbumName} onRefetch={() => refetch()} onCreate={() => open({ kind: 'shareCreate' })} />
            )}
            {!isTimeline && <FolderGrid folders={folders} onOpen={setPath} pinAlbums={path !== ''} />}

            {isTimeline ? (
              <TimelineGrid groups={groups} truncated={truncated} total={allItems.length} selecting={selecting} selected={selected} onTap={tileTap} />
            ) : allItems.length > 0 ? (
              <section>
                {folders.length > 0 && <SectionLabel>Photos</SectionLabel>}
                <PhotoGrid items={shownItems} selecting={selecting} selected={selected} onTap={tileTap} />
              </section>
            ) : isAlbumRoot && (
              <p className="py-10 text-center text-sm text-gray-500">
                {panel.tab === 'all' ? 'No photos in this album yet.' : panel.tab === 'edited' ? 'No edited JPGs yet — upload them above.' : 'Nothing here yet.'}
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface"><Images className="h-8 w-8 text-gray-600" /></div>
            <p className="text-sm font-medium text-gray-300">
              {isTimeline ? 'No photos yet' : isEditedFolder ? 'No edited photos yet' : 'This folder is empty'}
            </p>
            <p className="max-w-xs text-xs text-gray-500">
              {isEditedFolder
                ? 'Upload your finished JPG edits here. Clients download them after you release delivery.'
                : 'Send photos from the camera over FTP, then tap refresh.'}
            </p>
            {isEditedFolder && <EditedUpload albumName={editedAlbumName} onUploaded={() => refetch()} />}
          </div>
        )}
      </div>

      {selecting && (
        <BulkActionBar
          count={selected.size}
          allShownSelected={allShownSelected}
          onToggleAll={toggleSelectAll}
          busy={busy}
          onAlbum={() => open({ kind: 'album', source: 'selection' })}
          onRate={bulkRate}
          onShare={bulkShare}
          onDownload={bulkDownload}
          onDelete={() => open({ kind: 'delete', items: selectedItems })}
        />
      )}

      {active && (
        <Lightbox
          photo={active}
          index={activeIndex >= 0 ? activeIndex : undefined}
          total={shownItems.length}
          onClose={() => setActive(null)}
          onRate={(stars) => rate(active, stars)}
          onDelete={() => open({ kind: 'delete', items: [active] })}
          onPrev={activeIndex > 0 ? () => setActive(shownItems[activeIndex - 1]) : undefined}
          onNext={activeIndex >= 0 && activeIndex < shownItems.length - 1 ? () => setActive(shownItems[activeIndex + 1]) : undefined}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          title={dialog.items.length === 1 ? 'Delete this photo?' : `Delete ${dialog.items.length} photos?`}
          message={`This permanently removes the file(s) from the share. This can't be undone.${
            dialog.items.some((i) => i.twin) ? ' Matching RAW/JPG pairs are removed together.' : ''
          }`}
          confirmLabel="Delete"
          busy={deleteMut.isPending}
          onConfirm={async () => { await deleteItems(dialog.items); close(); }}
          onCancel={close}
        />
      )}
      {dialog.kind === 'cleanup' && (
        <CleanupDialog items={allItems} busy={deleteMut.isPending} onConfirm={async (t) => { await deleteItems(t); close(); }} onCancel={close} />
      )}
      {dialog.kind === 'album' && (
        <AlbumDialog
          starred={dialog.source === 'starred'}
          sourceItems={dialog.source === 'starred' ? allItems : selectedItems}
          existingAlbums={albumsQuery.data ?? []}
          busy={createAlbumMut.isPending}
          onConfirm={createAlbum}
          onCancel={close}
        />
      )}
      {dialog.kind === 'shareCreate' && shareAlbumName && (
        <ShareDialog albumPath={shareAlbumPath} albumName={shareAlbumName} onClose={close} />
      )}
      {dialog.kind === 'rename' && isAlbumRoot && (
        <RenameAlbumDialog currentName={albumName} busy={renameAlbumMut.isPending} onConfirm={(newName) => renameAlbumMut.mutate({ name: albumName, newName })} onCancel={close} />
      )}
      {dialog.kind === 'deleteAlbum' && isAlbumRoot && (
        <ConfirmDialog
          title={`Delete "${albumName}"?`}
          message="This removes the album and its copied photos. Your originals in the date folders are not affected."
          confirmLabel="Delete album"
          busy={deleteAlbumMut.isPending}
          onConfirm={() => deleteAlbumMut.mutate(albumName)}
          onCancel={close}
        />
      )}
      {dialog.kind === 'backfill' && (
        <BackfillDialog path={path} folderLabel={path === '' ? 'Home' : prettyDate(lastSeg, false)} onApplied={() => invalidate()} onClose={close} />
      )}
      {dialog.kind === 'deleteFolder' && isHomeDateFolder && (
        <DeleteFolderDialog
          folderName={lastSeg}
          photoCount={allItems.length > 0 ? allItems.length : undefined}
          busy={deleteFolderMut.isPending}
          onConfirm={() => deleteFolderMut.mutate(path)}
          onCancel={close}
        />
      )}
    </div>
  );
}
