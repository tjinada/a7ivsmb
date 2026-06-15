import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Folder, ChevronRight, RefreshCw, Loader2, Images, Download, Home } from 'lucide-react';
import type { ApiResponse, GalleryBrowseResult, GalleryItem } from '@sonycam/shared';
import { api } from '@/api/client';
import { AuthImage } from './AuthImage';
import { Lightbox } from './Lightbox';
import { saveImage } from './download';

async function browse(path: string): Promise<GalleryBrowseResult> {
  const res = await api.get<ApiResponse<GalleryBrowseResult>>('/gallery/browse', { params: { path } });
  if (!res.data.data) throw new Error('Unexpected response');
  return res.data.data;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </h2>
  );
}

export function GalleryPage() {
  const [path, setPath] = useState('');
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['gallery', 'browse', path],
    queryFn: () => browse(path),
  });

  const crumbs = [
    { name: 'Home', path: '' },
    ...(path
      ? path.split('/').map((seg, i, arr) => ({ name: seg, path: arr.slice(0, i + 1).join('/') }))
      : []),
  ];

  const downloadRaw = async (item: GalleryItem) => {
    setSavingPath(item.path);
    try {
      await saveImage(item);
    } catch {
      window.alert('Download failed');
    } finally {
      setSavingPath(null);
    }
  };

  const hasContent = !!data && (data.folders.length > 0 || data.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb bar */}
      <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-base px-3 py-2.5 text-sm">
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
                {c.name}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh"
          className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-gray-400">
            <p className="text-sm">Couldn&rsquo;t load this folder.</p>
            <button type="button" onClick={() => refetch()} className="text-xs text-primary-500">
              Try again
            </button>
          </div>
        ) : hasContent ? (
          <div className="p-3">
            {data!.folders.length > 0 && (
              <section className="mb-5">
                <SectionLabel>Folders</SectionLabel>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {data!.folders.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setPath(f.path)}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:border-primary-500/50 active:scale-[0.98]"
                    >
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
                        <Folder className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-100">{f.name}</span>
                        <span className="block text-[11px] text-gray-500">Folder</span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-400" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {data!.items.length > 0 && (
              <section>
                {data!.folders.length > 0 && <SectionLabel>Photos</SectionLabel>}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {data!.items.map((it) =>
                    it.kind === 'image' ? (
                      <button
                        key={it.path}
                        type="button"
                        onClick={() => setActive(it)}
                        className="group aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-border/60 transition hover:ring-primary-500/60"
                      >
                        <AuthImage
                          src={`/gallery/thumb?path=${encodeURIComponent(it.path)}`}
                          alt={it.name}
                          className="h-full w-full [&>img]:transition-transform [&>img]:duration-300 group-hover:[&>img]:scale-110"
                        />
                      </button>
                    ) : (
                      <button
                        key={it.path}
                        type="button"
                        onClick={() => downloadRaw(it)}
                        className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-surface p-2 text-gray-400 transition hover:border-primary-500/50 active:scale-[0.98]"
                      >
                        {savingPath === it.path ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                        ) : (
                          <Download className="h-5 w-5 text-gray-500 transition group-hover:text-gray-300" />
                        )}
                        <span className="rounded bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary-500">
                          RAW
                        </span>
                        <span className="w-full truncate px-1 text-center text-[10px] text-gray-500">{it.name}</span>
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
              <Images className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-300">This folder is empty</p>
            <p className="max-w-xs text-xs text-gray-500">Send photos from the camera over FTP, then tap refresh.</p>
          </div>
        )}
      </div>

      {active && <Lightbox photo={active} onClose={() => setActive(null)} />}
    </div>
  );
}