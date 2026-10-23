import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Images } from 'lucide-react';
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

export function GalleryPage() {
  const [view, setView] = useState<GalleryView>('folders');
  // Folder path lives in the URL (?path=...) so every drill-down is a real
  // history entry: Android's back gesture walks up folders instead of
  // closing the PWA, and reloads keep the user in the same folder.
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const setPath = (p: string) => setSearchParams(p ? { path: p } : {});

  const [active, setActive] = useState<GalleryItem | null>(null);
  const [ratingMin, setRatingMin] = useState(0);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
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
  const albumShares = (sharesQuery.data ?? []).filter((s) => s.albumPath === shareAlbumPath);

  // At an album root the photos come from the panel's tab (Edited/ or
  // Selected/JPG), not from the album folder itself, which holds no files.
  const panel = useAlbumPanel(isAlbumRoot ? path : '', albumShares);
  const activeQuery = isTimeline ? timelineQuery : browseQuery;
  const { isLoading: baseLoading, isError, isFetching, refetch: baseRefetch } = activeQuery;
  const isLoading = baseLoading || (isAlbumRoot && panel.loading);
  const refetch = () => { void baseRefetch(); if (isAlbumRoot) panel.refetch(); };
  const activeKey = isTimeline ? keys.timeline : isAlbumRoot ? panel.activeKey : keys.browse(path);
  const folders = !isTimeline && !isAlbumRoot ? browseQuery.data?.folders ?? [] : [];
  const allItems = isTimeline ? timelineQuery.data?.items ?? [] : isAlbumRoot ? panel.items : browseQuery.data?.items ?? [];
  const truncated = isTimeline ? timelineQuery.data?.truncated ?? false : false;

  /** Patch the items array of whichever query is currently showing. */
  const patchActive = (fn: (items: GalleryItem[]) => GalleryItem[]) => {
    qc.setQueryData(activeKey, (old: { items: GalleryItem[] } | undefined) => (old ? { ...old, items: fn(old.items) } : old));
  };

  // Reset filters + selection when changing folders or views.
  useEffect(() => { setRatingMin(0); setTypeFilter('all'); }, [path]);
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

  const tileTap = (it: GalleryItem) => (selecting ? toggleSelect(it.path) : setActive(it));

  // ── Overflow menu ───────────────────────────────────────────────────────
  const menu: MenuAction[] = [];
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
      />

      {allItems.length > 0 && !selecting && !isEditedFolder && (
        <FilterBar ratingMin={ratingMin} onRatingMin={setRatingMin} typeFilter={typeFilter} onTypeFilter={setTypeFilter} />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
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
            {!isTimeline && isAlbumRoot && (
              <AlbumPanel albumName={albumName} panel={panel} onCreateShare={() => open({ kind: 'shareCreate' })} />
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
