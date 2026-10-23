import { Share2, Images } from 'lucide-react';
import type { ShareSummary, SharePhase } from '@sonycam/shared';
import { EditedUpload } from './EditedUpload';

/** Compact status pill shown on the "Share with client" card for an album. */
const SHARE_PILL: Record<SharePhase, { label: string; cls: string }> = {
  proofing: { label: 'Awaiting picks', cls: 'bg-gray-500/15 text-gray-300' },
  submitted: { label: 'Picks submitted — review', cls: 'bg-amber-500/15 text-amber-300' },
  delivery: { label: 'Delivered', cls: 'bg-emerald-500/15 text-emerald-300' },
};

/** The "Share with client" card at an album root. */
export function AlbumShareCard({
  albumName, shares, anySubmitted, onRefetch, onManage, onCreate,
}: {
  albumName: string;
  shares: ShareSummary[];
  anySubmitted: boolean;
  onRefetch: () => void;
  onManage: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-primary-500/30 bg-primary-500/[0.07] p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-400">
          <Share2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-100">Share with client</p>
          <p className="text-[11px] text-gray-500">Send clients a link to choose their favourite photos.</p>
        </div>
      </div>
      {shares.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {shares.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={onManage}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition hover:brightness-125 ${SHARE_PILL[s.phase].cls}`}
            >
              {SHARE_PILL[s.phase].label}
              {s.phase !== 'delivery' && ` · ${s.finalCount}/${s.cap} final · ${s.selectedCount} shortlisted`}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <EditedUpload albumName={albumName} onUploaded={onRefetch} tone="subtle" />
        <button
          type="button"
          onClick={onManage}
          className="relative rounded-lg border border-border px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-surface"
        >
          Manage links
          {anySubmitted && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-base" />}
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-on-accent transition hover:bg-primary-500"
        >
          Create link
        </button>
      </div>
    </div>
  );
}

/** The "Edited photos" card inside an album's Edited/ folder. */
export function EditedFolderCard({ albumName, onRefetch, onCreate }: { albumName: string; onRefetch: () => void; onCreate: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-400">
          <Images className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-100">Edited photos</p>
          <p className="text-[11px] text-gray-500">Upload finished JPGs. Clients download these after delivery.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <EditedUpload albumName={albumName} onUploaded={onRefetch} label="Upload" />
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-on-accent transition hover:bg-primary-500"
        >
          Create link
        </button>
      </div>
    </div>
  );
}
