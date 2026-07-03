import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';

/** Small modal to rename an album. Mirrors AlbumDialog's styling. */
export function RenameAlbumDialog({
  currentName,
  busy = false,
  onConfirm,
  onCancel,
}: {
  currentName: string;
  busy?: boolean;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(currentName);
  const trimmed = name.trim();
  const canRename = trimmed.length > 0 && trimmed !== currentName && !busy;

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
          <Pencil className="h-4 w-4 text-primary-500" />
          Rename album
        </h3>
        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Album name</p>
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canRename) onConfirm(trimmed);
          }}
          className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-primary-500"
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
            onClick={() => onConfirm(trimmed)}
            disabled={!canRename}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
