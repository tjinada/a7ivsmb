import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import type { JobSummary } from '@sonycam/shared';
import { prettyDate } from '@/lib/dates';
import { AuthImage } from '@/features/gallery/AuthImage';
import { thumbUrl } from '@/features/gallery/mediaUrl';
import { STRIP, useJobs, needsOwner, daysInStep } from './api';

type Filter = 'active' | 'waiting' | 'done';

const PILL_ON = 'h-8 rounded-full bg-gray-100 px-3 text-xs font-semibold text-on-accent';
const PILL = 'h-8 rounded-full border border-border-strong px-3 text-xs font-medium text-gray-200 transition hover:bg-surface';

const STEP_LABEL: Record<JobSummary['step'], string> = {
  cull: '① Cull', edit: '② Edit', pick: '③ Picks', deliver: '④ Send finals', done: 'Delivered',
};

function filterOf(j: JobSummary): Filter {
  return j.step === 'done' ? 'done' : j.waitingOnClient ? 'waiting' : 'active';
}

/** Where a row opens: the folder while culling, the album after. */
function hrefOf(j: JobSummary): string {
  return `/gallery?path=${encodeURIComponent(j.albumPath ?? j.folderPath)}`;
}

function inStep(j: JobSummary): string {
  if (j.step === 'done') return '';
  const d = daysInStep(j);
  return d === 0 ? 'today' : `${d} d`;
}

/** Every shoot in the workflow, and where each one stands. */
export function JobsPage() {
  const jobsQuery = useJobs();
  const [filter, setFilter] = useState<Filter>('active');
  const jobs = jobsQuery.data ?? [];
  const counts = { active: 0, waiting: 0, done: 0 };
  jobs.forEach((j) => { counts[filterOf(j)] += 1; });
  const shown = jobs.filter((j) => filterOf(j) === filter);

  return (
    <div className="mx-auto max-w-3xl p-4 xl:max-w-6xl">
      <h1 className="text-xl font-semibold tracking-tight">Shoots</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        {([['active', 'Needs you'], ['waiting', 'Waiting on client'], ['done', 'Done']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`flex items-center gap-1.5 ${filter === f ? PILL_ON : PILL}`}>
            {f === 'active' && counts.active > 0 && <span className="h-2 w-2 rounded-full bg-primary-500" />}
            {label} · {counts[f]}
          </button>
        ))}
      </div>

      {/* One column; two side by side on wide screens. */}
      <div className="mt-6 grid gap-x-5 gap-y-5 xl:grid-cols-2">
        {jobsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 xl:col-span-2"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400 xl:col-span-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface"><ListChecks className="h-7 w-7 text-gray-600" /></div>
            <p className="max-w-xs text-sm">
              {jobs.length === 0 ? 'No shoots tracked yet. Open a dated folder and tap Track this shoot.' : 'Nothing here.'}
            </p>
          </div>
        ) : (
          shown.map((j) => <JobRow key={j.id} job={j} />)
        )}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: JobSummary }) {
  const you = needsOwner(job);
  const cur = job.step === 'done' ? STRIP.length : STRIP.findIndex((s) => s.step === job.step);
  return (
    <Link
      to={hrefOf(job)}
      className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3.5 transition hover:border-border-strong ${
        you ? 'border-primary-500/60' : 'border-border'
      }`}
    >
      {job.cover ? (
        <AuthImage src={thumbUrl(job.cover)} alt="" className={`h-11 w-11 flex-none overflow-hidden rounded-xl bg-base ${job.step === 'done' ? 'opacity-70' : ''}`} />
      ) : (
        <div className="h-11 w-11 flex-none rounded-xl bg-base" />
      )}
      <div className="min-w-0 flex-1">
        {/* Line 1: what it is and where it stands. */}
        <div className="flex min-w-0 items-center gap-2">
          <p className={`truncate text-sm font-semibold ${job.step === 'done' ? 'text-gray-400' : 'text-gray-100'}`}>
            {job.albumName ?? prettyDate(job.folderPath.split('/').pop() ?? job.folderPath)}
          </p>
          <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-medium ${
            you ? 'bg-primary-500/15 text-primary-400' : job.step === 'done' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.06] text-gray-400'
          }`}>
            {job.waitingOnClient ? '③ Waiting for client' : STEP_LABEL[job.step]}
          </span>
          <span className="hidden flex-none gap-1 sm:flex" aria-hidden>
            {STRIP.map((s, i) => (
              <span key={s.step} className={`h-1.5 w-1.5 rounded-full ${i < cur ? 'bg-emerald-500' : i === cur ? 'bg-primary-500' : 'bg-border-strong'}`} />
            ))}
          </span>
        </div>
        {/* Line 2: the numbers. */}
        <p className="mt-0.5 truncate text-xs tabular-nums text-gray-500">
          {job.folderPath}
          {job.albumPath ? ` · ${job.edited} of ${job.shots} edited` : ` · ${job.shots} shots · no album yet`}
          {inStep(job) && ` · ${inStep(job)} in step`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-none text-gray-600" />
    </Link>
  );
}
