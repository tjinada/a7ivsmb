import { useEffect, useState, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * Renders an image directly from an authorized endpoint. The image GET routes
 * also accept a read-only "media" cookie (set at login), so a plain <img src>
 * works without an Authorization header. That means the browser can HTTP-cache
 * the image and iOS long-press "Share / Save" act on the real photo (not a
 * blob: URL). Shows `fallback` (or a placeholder) if the image fails to load.
 *
 * While the image loads, a shimmer placeholder overlays the tile and fades
 * out on load (cached images fire onLoad immediately, so no flash).
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
  const full = src.startsWith('/api') ? src : `/api${src}`;
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset on source change (a tile may be reused for a different item).
  useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [full]);

  return (
    <div className={`relative ${className ?? ''}`}>
      {error ? (
        fallback ?? (
          <div className="flex h-full w-full items-center justify-center bg-surface text-gray-600">
            <ImageOff className="h-5 w-5" />
          </div>
        )
      ) : (
        <>
          <img
            src={full}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
          <div
            aria-hidden
            className={`img-shimmer pointer-events-none absolute inset-0 transition-opacity duration-300 ${
              loaded ? 'opacity-0' : 'opacity-100'
            }`}
          />
        </>
      )}
    </div>
  );
}
