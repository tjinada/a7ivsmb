import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, Copy, Loader2, Send, Star, FolderPlus, Users, Images } from 'lucide-react';
import type { JobPatch, JobStep, JobSummary, AlbumFormats } from '@sonycam/shared';
import { toast } from '@/components/Toast';
import { useAppConfig } from '@/lib/useAppConfig';
import { useQueryClient } from '@tanstack/react-query';
import { useBrowse, useAlbums, useShares, useCreateAlbum, useInvalidateGallery } from '@/features/gallery/api';
import { AlbumDialog } from '@/features/gallery/AlbumDialog';
import { ShareDialog } from '@/features/gallery/ShareDialog';
import { ConfirmDialog } from '@/features/gallery/ConfirmDialog';
import { EditedUpload } from '@/features/gallery/EditedUpload';
import { editedPath } from '@/features/gallery/AlbumPanel';
import { useShareActions } from '@/features/shares/useShareActions';
import { STRIP, jobKeys, useUpdateJob, useRemoveJob, useDeliverJob } from './api';

const PRIMARY = 'flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-2 text-xs font-semibold text-on-accent transition hover:bg-primary-400 disabled:opacity-50';
const BTN = 'flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-base disabled:opacity-50';
const GHOST = 'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-400 transition hover:text-gray-200 disabled:opacity-50';

const PREV: Partial<Record<JobStep, JobStep>> = { edit: 'cull', pick: 'edit', deliver: 'pick' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

/** Four dots for cull → edit → picks → send; all ticked once delivered. */
export function JobStepper({ step }: { step: JobStep }) {
  const cur = step === 'done' ? STRIP.length : STRIP.findIndex((s) => s.step === step);
  return (
    <ol className="flex items-start">
      {STRIP.map((s, i) => {
        const done = i < cur;
        const on = i === cur;
        return (
          <li key={s.step} className="relative flex flex-1 flex-col items-center gap-1.5">
            {i < STRIP.length - 1 && (
              <span className={`absolute left-1/2 top-[11px] h-0.5 w-full ${done ? 'bg-emerald-500' : 'bg-border'}`} />
            )}
            <span
              className={`relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
                on ? 'border-primary-500 bg-primary-500 text-on-accent'
                  : done ? 'border-emerald-500 bg-base text-emerald-400'
                    : 'border-border-strong bg-base text-gray-500'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`text-[11px] ${on ? 'font-semibold text-primary-400' : done ? 'text-gray-300' : 'text-gray-500'}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The workflow header on a dated folder or an album page: the stepper and one
 * card for the current step with its single primary action. The card is the
 * same on both pages; it links across when the work lives on the other one.
 */
export function JobPanel({ job, here }: { job: JobSummary; here: 'folder' | 'album' }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<null | 'album' | 'proofing' | 'delivery' | 'remove'>(null);
  const update = useUpdateJob({ onError: toast.error });
  const remove = useRemoveJob({ onError: toast.error });
  const deliver = useDeliverJob({ onDone: () => toast.success('Final photos sent'), onError: toast.error });

  const patch = (p: JobPatch, after?: () => void) =>
    update.mutate({ id: job.id, patch: p }, { onSuccess: () => after?.() });
  const busy = update.isPending || deliver.isPending;
  const prev = PREV[job.step];
  const albumHref = job.albumPath ? `/gallery?path=${encodeURIComponent(job.albumPath)}` : '';
  const folderHref = `/gallery?path=${encodeURIComponent(job.folderPath)}`;

  return (
    <div className="mb-4 space-y-3">
      <JobStepper step={job.step} />

      <div className={`rounded-2xl border bg-surface p-3.5 ${job.step === 'done' || job.waitingOnClient ? 'border-border' : 'border-primary-500/70'}`}>
        <StepBody job={job} here={here} busy={busy} patch={patch} openDialog={setDialog} onDeliver={() => deliver.mutate(job)} delivering={deliver.isPending} />

        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          {prev && (
            <button type="button" disabled={busy} onClick={() => patch({ step: prev })} className={GHOST}>
              <ChevronLeft className="h-3.5 w-3.5" /> Back to {STRIP.find((s) => s.step === prev)?.label.toLowerCase()}
            </button>
          )}
          <span className="flex-1" />
          {here === 'folder' && albumHref && <Link to={albumHref} className={GHOST}><Images className="h-3.5 w-3.5" /> Open album</Link>}
          {here === 'album' && <Link to={folderHref} className={GHOST}>Shoot folder</Link>}
          <button type="button" onClick={() => setDialog('remove')} className={GHOST}>Stop tracking</button>
        </div>
      </div>

      {dialog === 'album' && (
        <CullAlbumDialog
          folderPath={job.folderPath}
          onCancel={() => setDialog(null)}
          onCreated={(albumPath) => {
            setDialog(null);
            patch({ albumPath, step: 'edit' }, () => navigate(`/gallery?path=${encodeURIComponent(albumPath)}`));
          }}
        />
      )}
      {(dialog === 'proofing' || dialog === 'delivery') && job.albumPath && job.albumName && (
        <ShareDialog
          albumPath={job.albumPath}
          albumName={job.albumName}
          fixedKind={dialog}
          onClose={() => setDialog(null)}
          onCreated={(share) =>
            patch(dialog === 'proofing' ? { pickMode: 'client', shareId: share.id } : { shareId: share.id, step: 'done' })}
        />
      )}
      {dialog === 'remove' && (
        <ConfirmDialog
          title="Stop tracking this shoot?"
          message="Removes the workflow only. The folder, album, edits and any client link stay as they are."
          confirmLabel="Stop tracking"
          busy={remove.isPending}
          onConfirm={() => remove.mutate(job.id, { onSuccess: () => setDialog(null) })}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function StepBody({
  job, here, busy, patch, openDialog, onDeliver, delivering,
}: {
  job: JobSummary;
  here: 'folder' | 'album';
  busy: boolean;
  patch: (p: JobPatch, after?: () => void) => void;
  openDialog: (d: 'album' | 'proofing' | 'delivery') => void;
  onDeliver: () => void;
  delivering: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidateGallery = useInvalidateGallery();
  const share = job.share;
  const afterUpload = () => { void invalidateGallery(); void qc.invalidateQueries({ queryKey: jobKeys.all }); };

  switch (job.step) {
    case 'cull':
      return (
        <Card title="Cull the shoot" sub="Rate and reject, then make the album from your keepers.">
          <Stats items={[[job.shots, 'shots'], [job.unrated, 'unrated']]} />
          <Actions>
            <button type="button" className={PRIMARY} onClick={() => navigate(`/cull?path=${encodeURIComponent(job.folderPath)}`)}>
              <Star className="h-3.5 w-3.5" /> Cull
            </button>
            <button type="button" className={BTN} onClick={() => openDialog('album')}><FolderPlus className="h-3.5 w-3.5" /> Create album</button>
          </Actions>
          <ExistingAlbum busy={busy} onPick={(albumPath) => patch({ albumPath, step: 'edit' }, () => navigate(`/gallery?path=${encodeURIComponent(albumPath)}`))} />
        </Card>
      );

    case 'edit':
      return (
        <Card title="Edit in Lightroom" sub="Load the album’s Selected folder, export your edits into Edited. Skip anything you don’t like.">
          <Stats items={[[job.edited, 'edited'], [job.shots, 'selected']]} />
          <Actions>
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => patch({ step: 'pick' })}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Done editing
            </button>
            {job.albumName && <CopyEditedPath albumName={job.albumName} />}
            {job.albumName && here === 'album' && <EditedUpload albumName={job.albumName} onUploaded={afterUpload} label="Upload" tone="subtle" />}
          </Actions>
        </Card>
      );

    case 'pick': {
      if (job.pickMode === 'client' && share) {
        if (share.phase === 'proofing') {
          return (
            <Card title="Waiting for the client" sub={`Link sent ${shortDate(share.createdAt)} · ${plural(share.selectedCount, 'shortlisted', 'shortlisted')} · ${share.finalCount} of ${share.cap} final picks`}>
              <ShareLinkActions share={share} />
            </Card>
          );
        }
        return (
          <Card title={`The client picked ${plural(share.finalCount, 'photo')}`} sub="Check the picks, then move on to sending the finals.">
            <Actions>
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => patch({ step: 'deliver' })}>
                <Send className="h-3.5 w-3.5" /> Continue to send
              </button>
              <Link to={`/shares?album=${encodeURIComponent(share.albumPath)}`} className={BTN}>View picks</Link>
            </Actions>
          </Card>
        );
      }
      return <PickChoice job={job} busy={busy} patch={patch} onSendForPicks={() => openDialog('proofing')} />;
    }

    case 'deliver': {
      const viaClient = job.pickMode === 'client' && share;
      const ready = !!share && share.phase === 'delivery';
      return (
        <Card
          title="Send the final photos"
          sub={viaClient ? `${plural(share.finalCount, 'pick')} unlock for full-resolution download on the client’s link.` : `All ${job.edited} edited photos go out on a download link. No picking.`}
        >
          <Actions>
            {viaClient || ready ? (
              <button type="button" className={PRIMARY} disabled={busy} onClick={onDeliver}>
                {delivering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {ready ? 'Mark as delivered' : 'Send final photos'}
              </button>
            ) : (
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => openDialog('delivery')}>
                <Send className="h-3.5 w-3.5" /> Send final photos
              </button>
            )}
          </Actions>
        </Card>
      );
    }

    case 'done':
      return (
        <Card title={`Delivered ${shortDate(job.stepAt.done)}`} sub={share ? `${plural(share.kind === 'delivery' ? share.previewCount : share.finalCount, 'photo')} on the client’s link.` : 'The client link has been disabled.'}>
          {share && <ShareLinkActions share={share} />}
        </Card>
      );
  }
}

/** Step ③ before it's resolved: client picks, or skip straight to sending. */
function PickChoice({
  job, busy, patch, onSendForPicks,
}: {
  job: JobSummary;
  busy: boolean;
  patch: (p: JobPatch) => void;
  onSendForPicks: () => void;
}) {
  // A proofing link made for this album before the workflow existed can be adopted.
  const existing = (useShares().data ?? []).find((s) => s.albumPath === job.albumPath && s.kind === 'proofing');
  return (
    <Card title="Does the client pick?" sub={`${plural(job.edited, 'edited photo')} ready.`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice icon={<Users className="h-4 w-4" />} title="Send for picks" sub="Proofing link with a limit. They shortlist, then choose their finals." onClick={onSendForPicks} disabled={busy} primary />
        <Choice icon={<Send className="h-4 w-4" />} title="Skip — deliver everything" sub={`No picking. All ${job.edited} go out at the next step.`} onClick={() => patch({ pickMode: 'all', step: 'deliver' })} disabled={busy} />
      </div>
      {existing && (
        <button type="button" disabled={busy} onClick={() => patch({ pickMode: 'client', shareId: existing.id })} className={`${GHOST} mt-2`}>
          Use the client link you already sent ({existing.selectedCount} shortlisted)
        </button>
      )}
    </Card>
  );
}

/** Make the album from the shoot's starred photos (the JPG bucket, or RAW). */
function CullAlbumDialog({ folderPath, onCancel, onCreated }: { folderPath: string; onCancel: () => void; onCreated: (albumPath: string) => void }) {
  const here = useBrowse(folderPath);
  const jpg = useBrowse(`${folderPath}/JPG`, true, { retry: false });
  const raw = useBrowse(`${folderPath}/RAW`, true, { retry: false });
  const albums = useAlbums();
  const create = useCreateAlbum({ onSuccess: (r) => r && onCreated(r.path), onError: toast.error });
  const items = [
    ...(here.data?.items ?? []),
    ...((jpg.data?.items.length ?? 0) > 0 ? jpg.data!.items : raw.data?.items ?? []),
  ];
  if (here.isLoading || jpg.isLoading) {
    return (
      <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  return (
    <AlbumDialog
      starred
      sourceItems={items}
      existingAlbums={albums.data ?? []}
      busy={create.isPending}
      onConfirm={(o: { name: string; paths: string[]; formats: AlbumFormats }) => o.paths.length > 0 && create.mutate(o)}
      onCancel={onCancel}
    />
  );
}

/** Link a folder culled before workflows existed to the album it became. */
function ExistingAlbum({ busy, onPick }: { busy: boolean; onPick: (albumPath: string) => void }) {
  const [open, setOpen] = useState(false);
  const albums = useAlbums(open);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={`${GHOST} mt-1`}>Already made the album? Link it…</button>;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {albums.isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
      {(albums.data ?? []).map((a) => (
        <button key={a.path} type="button" disabled={busy} onClick={() => onPick(a.path)} className="rounded-md bg-base px-2 py-1 text-xs text-gray-300 transition hover:text-gray-100 disabled:opacity-50">
          {a.name}
        </button>
      ))}
    </div>
  );
}

function CopyEditedPath({ albumName }: { albumName: string }) {
  const { pathPrefix } = useAppConfig();
  const [copied, setCopied] = useState(false);
  if (!pathPrefix) return null;
  const p = editedPath(pathPrefix, albumName);
  const copy = async () => {
    try { await navigator.clipboard.writeText(p); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt('Copy this path', p); }
  };
  return (
    <button type="button" onClick={copy} className={BTN} title={p}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy folder path'}
    </button>
  );
}

function ShareLinkActions({ share }: { share: NonNullable<JobSummary['share']> }) {
  const actions = useShareActions();
  return (
    <Actions>
      <button type="button" onClick={() => actions.copyLink(share)} className={BTN}>
        {actions.copiedId === share.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {actions.copiedId === share.id ? 'Copied' : 'Copy link'}
      </button>
      <Link to={`/shares?album=${encodeURIComponent(share.albumPath)}`} className={BTN}>Manage</Link>
    </Actions>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-100">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{sub}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Stats({ items }: { items: [number, string][] }) {
  return (
    <div className="mb-3 flex gap-5 tabular-nums">
      {items.map(([n, label]) => (
        <div key={label}>
          <p className="text-xl font-semibold leading-tight text-gray-100">{n}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-2">{children}</div>;
}

function Choice({ icon, title, sub, onClick, disabled, primary }: { icon: ReactNode; title: string; sub: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
        primary ? 'border-primary-500 bg-primary-500/10 hover:bg-primary-500/15' : 'border-border-strong hover:bg-base'
      }`}
    >
      <span className={primary ? 'text-primary-400' : 'text-gray-400'}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-100">{title}</span>
        <span className="block text-xs text-gray-400">{sub}</span>
      </span>
    </button>
  );
}
