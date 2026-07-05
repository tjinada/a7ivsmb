import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Minimal in-app toast, replacing window.alert. Module-level pub/sub so any
 * code can call toast.error()/toast.success() without context plumbing; the
 * single <Toaster /> mounted in App renders the stack (newest at the bottom,
 * max 3 kept). Toasts auto-dismiss after 3.5s or on tap.
 */

type ToastKind = 'error' | 'success';
type ToastItem = { id: number; kind: ToastKind; message: string };

type Listener = (toasts: ToastItem[]) => void;

let nextId = 1;
let items: ToastItem[] = [];
let listener: Listener | null = null;

function push(kind: ToastKind, message: string) {
  items = [...items, { id: nextId++, kind, message }].slice(-3);
  listener?.(items);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  listener?.(items);
}

export const toast = {
  error: (message: string) => push('error', message),
  success: (message: string) => push('success', message),
};

function ToastCard({ item }: { item: ToastItem }) {
  // Entrance: mount at opacity-0/translated, then flip a frame later.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => dismiss(item.id), 3500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [item.id]);

  return (
    <button
      type="button"
      onClick={() => dismiss(item.id)}
      className={`pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left shadow-xl transition-all duration-200 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      {item.kind === 'error' ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
      )}
      <span className="text-sm text-gray-100">{item.message}</span>
    </button>
  );
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>(items);

  useEffect(() => {
    listener = setToasts;
    return () => {
      if (listener === setToasts) listener = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[10050] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)' }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}
