import type { ReactNode } from 'react';
import { Folder, ChevronRight, Library } from 'lucide-react';
import type { FolderEntry } from '@sonycam/shared';
import { AuthImage } from './AuthImage';
import { thumbUrl } from './mediaUrl';
import { prettyDate } from '@/lib/dates';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{children}</h2>
  );
}

/** The pinned Albums card plus the folder cards for one directory listing. */
export function FolderGrid({ folders, onOpen, pinAlbums = true }: { folders: FolderEntry[]; onOpen: (path: string) => void; pinAlbums?: boolean }) {
  const albumsFolder = folders.find((f) => f.path === 'Albums');
  const others = albumsFolder ? folders.filter((f) => f.path !== 'Albums') : folders;
  if (folders.length === 0) return null;

  return (
    <section className="mb-5">
      {albumsFolder && pinAlbums && (
        <button
          type="button"
          onClick={() => onOpen(albumsFolder.path)}
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
      {others.length > 0 && (
        <>
          <SectionLabel>Folders</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {others.map((f) => (
              <FolderCard key={f.path} folder={f} onOpen={() => onOpen(f.path)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FolderCard({ folder: f, onOpen }: { folder: FolderEntry; onOpen: () => void }) {
  const placeholder = (
    <div className="flex h-full w-full items-center justify-center text-primary-500/60">
      <Folder className="h-8 w-8" />
    </div>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-primary-500/50 active:scale-[0.98]"
    >
      <div className="relative aspect-[4/3] w-full flex-shrink-0 overflow-hidden bg-base">
        {f.cover ? (
          <AuthImage
            src={thumbUrl(f.cover)}
            alt={f.name}
            className="h-full w-full [&>img]:transition-transform [&>img]:duration-300 group-hover:[&>img]:scale-105"
            fallback={placeholder}
          />
        ) : placeholder}
        {typeof f.count === 'number' && f.count > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {f.count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 px-2.5 py-2">
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium leading-snug text-gray-100">{prettyDate(f.name, false)}</span>
          <span className="mt-0.5 block text-[11px] text-gray-500">
            {typeof f.count === 'number' ? `${f.count} ${f.count === 1 ? 'photo' : 'photos'}` : 'Folder'}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-400" />
      </div>
    </button>
  );
}
