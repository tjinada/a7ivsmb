import { useMemo, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import type { TransferEvent } from '@sonycam/shared';

// Drawn in this fixed coordinate space and stretched to the card width.
// Strokes opt out of the stretch so they stay an even thickness.
const W = 300;
const H = 80;

/** Width of one throughput sample. Wide enough to swallow the jitter from
 *  concurrent streams, narrow enough to resolve a slowdown within a minute. */
const BUCKET_MS = 15_000;

/** One time window. Null values mean nothing arrived in that window, which
 *  draws as a break in the line rather than a misleading drop to zero. */
interface Bucket {
  mbps: number | null;
  filingMs: number | null;
}

/** Polyline through `values`, starting a fresh segment after every null. */
function buildPath(values: (number | null)[], max: number): string {
  if (values.length < 2 || max <= 0) return '';
  const step = W / (values.length - 1);
  let d = '';
  let drawing = false;
  values.forEach((v, i) => {
    if (v === null) {
      drawing = false;
      return;
    }
    const y = H - (v / max) * H;
    d += `${drawing ? 'L' : 'M'}${(i * step).toFixed(1)} ${y.toFixed(1)} `;
    drawing = true;
  });
  return d.trim();
}

/**
 * Group arrivals into fixed wall-clock windows and reduce each to a throughput
 * figure. Throughput is only meaningful in aggregate: the camera opens two FTP
 * connections and streams a shot's RAW and JPG concurrently, so an individual
 * file has no well-defined rate — two files finishing milliseconds apart would
 * each appear impossibly fast. Summing bytes over a fixed window is immune to
 * however many connections happen to be in flight.
 */
function bucketize(transfers: TransferEvent[]): Bucket[] {
  if (transfers.length < 2) return [];
  const sorted = [...transfers].sort((a, b) => a.receivedAt - b.receivedAt);
  const t0 = sorted[0].receivedAt;
  const tEnd = sorted[sorted.length - 1].receivedAt;
  const count = Math.floor((tEnd - t0) / BUCKET_MS) + 1;

  const bytes = new Array<number>(count).fill(0);
  const filing = new Array<number>(count).fill(0);
  const files = new Array<number>(count).fill(0);
  for (const t of sorted) {
    const i = Math.min(count - 1, Math.floor((t.receivedAt - t0) / BUCKET_MS));
    bytes[i] += t.size;
    filing[i] += t.filingMs;
    files[i] += 1;
  }

  const out: Bucket[] = [];
  for (let i = 0; i < count; i += 1) {
    // The newest window is still filling, so a partial one reads artificially
    // low. Drop it until it holds at least half a window of arrivals.
    const partial = i === count - 1 && tEnd - (t0 + i * BUCKET_MS) < BUCKET_MS / 2;
    if (partial) break;
    out.push({
      mbps: files[i] === 0 ? null : bytes[i] / (BUCKET_MS / 1000) / 1024 / 1024,
      filingMs: files[i] === 0 ? null : filing[i] / files[i],
    });
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-100">{value}</p>
    </div>
  );
}

/**
 * Aggregate throughput over time, plus the average time each file spent being
 * filed. Reading the two together separates the network from the array:
 * throughput decaying while filing stays flat points at the camera or the
 * Wi-Fi link, whereas filing time climbing points at the disks falling behind.
 */
export function TransferSpeedChart({ transfers }: { transfers: TransferEvent[] }) {
  const [open, setOpen] = useState(true);

  const stats = useMemo(() => {
    const buckets = bucketize(transfers);
    const active = buckets.map((b) => b.mbps).filter((v): v is number => v !== null);
    const tail = mean(active.slice(-2));
    return {
      buckets,
      active,
      now: tail,
      avg: mean(active),
      peak: active.length ? Math.max(...active) : 0,
      slowestFile: transfers.length ? Math.max(...transfers.map((t) => t.filingMs)) : 0,
      // Compared against the run's median rather than its mean, so one idle
      // stretch or a single fast burst can't move the reference point.
      fading: active.length >= 6 && tail < median(active) * 0.7,
    };
  }, [transfers]);

  const { buckets, active, now, avg, peak, slowestFile, fading } = stats;
  const peakFilingAvg = Math.max(
    0,
    ...buckets.map((b) => b.filingMs).filter((v): v is number => v !== null),
  );
  const speedPath = buildPath(buckets.map((b) => b.mbps), peak);
  const filingPath = buildPath(buckets.map((b) => b.filingMs), peakFilingAvg);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Activity className="h-3.5 w-3.5 flex-shrink-0 text-primary-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Transfer speed
        </span>
        {active.length > 0 && (
          <span className="text-[11px] text-gray-400">{now.toFixed(1)} MB/s</span>
        )}
        {fading && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            slowing
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2.5">
          {active.length < 2 ? (
            <p className="py-4 text-center text-xs text-gray-500">
              Not enough transfers yet &mdash; this needs about half a minute of arrivals.
            </p>
          ) : (
            <>
              <div className="mb-2.5 grid grid-cols-4 gap-2">
                <Stat label="Now" value={`${now.toFixed(1)} MB/s`} />
                <Stat label="Average" value={`${avg.toFixed(1)} MB/s`} />
                <Stat label="Peak" value={`${peak.toFixed(1)} MB/s`} />
                <Stat label="Slowest file" value={`${(slowestFile / 1000).toFixed(2)}s`} />
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-24 w-full"
                role="img"
                aria-label="Transfer throughput and filing time over time"
              >
                <path
                  d={filingPath}
                  fill="none"
                  stroke="rgb(245 158 11)"
                  strokeOpacity="0.55"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={speedPath}
                  fill="none"
                  stroke="rgb(96 165 250)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-blue-400" /> Throughput
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-amber-500/60" /> Filing time
                </span>
                <span className="ml-auto">
                  {transfers.length} arrivals &middot; {BUCKET_MS / 1000}s buckets
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
