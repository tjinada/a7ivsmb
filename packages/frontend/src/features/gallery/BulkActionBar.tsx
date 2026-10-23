import { useState, type ReactNode } from 'react';
import { FolderPlus, Star, Share2, Download, Trash2, Loader2 } from 'lucide-react';
import { StarRating } from './StarRating';

export type BulkBusy = null | 'share' | 'zip';

/** Footer shown while selecting: count, select-all, and the bulk actions. */
export function BulkActionBar({
  count, allShownSelected, onToggleAll, busy, onAlbum, onRate, onShare, onDownload, onDelete,
}: {
  count: number;
  allShownSelected: boolean;
  onToggleAll: () => void;
  busy: BulkBusy;
  onAlbum: () => void;
  onRate: (stars: number) => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [rateOpen, setRateOpen] = useState(false);
  const none = count === 0;

  return (
    <div className="relative flex flex-shrink-0 items-center gap-3 border-t border-border bg-base px-4 py-2.5">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-100">{count} selected</span>
        <button type="button" onClick={onToggleAll} className="text-left text-[11px] text-primary-500">
          {allShownSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <Action label="Album" disabled={none} onClick={onAlbum}><FolderPlus className="h-5 w-5" /></Action>
        <Action label="Rate" disabled={none} onClick={() => setRateOpen((o) => !o)}><Star className="h-5 w-5" /></Action>
        <Action label="Share" disabled={none || busy !== null} onClick={onShare}>
          {busy === 'share' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
        </Action>
        <Action label="Download" disabled={none || busy !== null} onClick={onDownload}>
          {busy === 'zip' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </Action>
        <Action label="Delete" disabled={none} onClick={onDelete} danger><Trash2 className="h-5 w-5" /></Action>
      </div>

      {rateOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRateOpen(false)} />
          <div className="absolute bottom-full right-3 z-50 mb-2 rounded-xl border border-border bg-surface p-3 shadow-xl">
            <p className="mb-2 text-xs text-gray-400">Rate {count} selected</p>
            <StarRating value={0} size={26} onChange={(s) => { onRate(s); setRateOpen(false); }} />
            <button
              type="button"
              onClick={() => { onRate(0); setRateOpen(false); }}
              className="mt-2 text-[11px] text-gray-400 transition hover:text-gray-200"
            >
              Clear rating
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Action({ label, disabled, onClick, danger, children }: {
  label: string; disabled: boolean; onClick: () => void; danger?: boolean; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-[52px] flex-col items-center gap-0.5 rounded-lg py-1.5 transition disabled:opacity-40 ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-200 hover:bg-surface'
      }`}
    >
      {children}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
