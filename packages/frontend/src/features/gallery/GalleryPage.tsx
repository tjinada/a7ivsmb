import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Folder, ChevronRight, RefreshCw, Loader2, Images, Download } from 'lucide-react';
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 py-2 text-xs">
        {crumbs.map((c, i) => (
          <span key={c.path} className="flex items-center gap-1 whitespace-nowrap">
            {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-600" />}
            <button
              type="button"
              onClick={() => setPath(c.path)}
              className={i === crumbs.length - 1 ? 'text-gray-200' : 'text-primary-500'}
            >
              {c.name}
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh"
          className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg hover:bg-border"
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
        ) : data && (data.folders.length > 0 || data.items.length > 0) ? (
          <>
            {data.folders.length > 0 && (
              <div className="divide-y divide-border">
                {data.folders.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setPath(f.path)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
                  >
                    <Folder className="h-5 w-5 flex-shrink-0 text-primary-500" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-600" />
                  </button>
                ))}
              </div>
            )}

            {data.items.length > 0 && (
              <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-4 md:grid-cols-6">
                {data.items.map((it) =>
                  it.kind === 'image' ? (
                    <button
                      key={it.path}
                      type="button"
                      onClick={() => setActive(it)}
                      className="aspect-square overflow-hidden rounded-sm bg-surface"
                    >
                      <AuthImage
                        src={`/gallery/thumb?path=${encodeURIComponent(it.path)}`}
                        alt={it.name}
                        className="h-full w-full"
                      />
                    </button>
                  ) : (
                    <button
                      key={it.path}
                      type="button"
                      onClick={() => downloadRaw(it)}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sm bg-surface px-1 text-gray-400"
                    >
                      {savingPath === it.path ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Download className="h-5 w-5" />
                      )}
                      <span className="rounded bg-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                        RAW
                      </span>
                      <span className="max-w-full truncate text-[10px]">{it.name}</span>
                    </button>
                  ),
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-400">
            <Images className="h-10 w-10 text-gray-600" />
            <p className="text-sm">This folder is empty.</p>
            <p className="text-xs text-gray-500">Send photos from the camera over FTP, then refresh.</p>
          </div>
        )}
      </div>

      {active && <Lightbox photo={active} onClose={() => setActive(null)} />}
    </div>
  );
}
