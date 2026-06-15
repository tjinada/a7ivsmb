import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { api } from '@/api/client';

/**
 * Renders an image from an authorized endpoint. The JWT can't ride on a plain
 * <img src>, so we fetch the bytes as a blob (Bearer header via the api
 * client) and show an object URL. An IntersectionObserver defers the fetch
 * until the tile is near the viewport.
 */
export function AuthImage({
  src,
  alt,
  className,
  eager = false,
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let obj: string | null = null;
    setError(false);
    api
      .get(src, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        obj = URL.createObjectURL(res.data as Blob);
        setUrl(obj);
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [visible, src]);

  return (
    <div ref={ref} className={className}>
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : error ? (
        fallback ?? (
          <div className="flex h-full w-full items-center justify-center bg-surface text-gray-600">
            <ImageOff className="h-5 w-5" />
          </div>
        )
      ) : (
        <div className="h-full w-full animate-pulse bg-surface" />
      )}
    </div>
  );
}
