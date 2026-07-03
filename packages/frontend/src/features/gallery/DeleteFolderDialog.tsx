import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

/**
 * Destructive folder-delete confirmation. Unlike the one-tap ConfirmDialog,
 * this requires typing the exact folder name before the delete button enables
 * (GitHub-style friction), since it removes an entire folder of originals.
 */
export function DeleteFolderDialog({
  folderName,
  photoCount,
  busy = false,
  onConfirm,
  onCancel,
}: {
  folderName: string;
  photoCount?: number;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const match = typed.trim() === folderName;
  const hasCount = typeof photoCount === 'number' && photoCount > 0;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-6"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-100">
          <Trash2 className="h-4 w-4 text-red-400" />
          Delete this folder?
        </h3>
        <p className="mt-2 text-sm text-gray-400">
          This permanently removes the <span className="font-medium text-gray-200">{folderName}</span> folder
          {hasCount ? (
            <>
              {' '}and all{' '}
              <span className="font-medium text-gray-200">
                {photoCount} photo{photoCount === 1 ? '' : 's'}
              </span>{' '}
              in it
            </>
          ) : (
            <> and everything in it</>
          )}
          . Your albums aren&rsquo;t affected. This can&rsquo;t be undone.
        </p>

        <p className="mb-1.5 mt-4 text-[11px] text-gray-500">
          Type <span className="font-mono text-gray-300">{folderName}</span> to confirm
        </p>
        <input
          type="text"
          value={typed}
          autoFocus
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && match && !busy) onConfirm();
          }}
          className="w-full rounded-lg border border-border bg-base px-3 py-2 font-mono text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-red-500"
        />

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-gray-200 transition hover:bg-border disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!match || busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete folder
          </button>
        </div>
      </div>
    </div>
  );
}
