import { useMemo, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import type { TransferEvent } from '@sonycam/shared';

// Drawn in this fixed coordinate space and stretched to the card width.
// Strokes opt out of the stretch so they stay an even thickness.
const W = 300;
const H = 80;

/** One arrival, oldest first. `mbps` is null when the camera paused long
 *  enough that throughput couldn't be derived from the gap to the previous
 *  file, so the line breaks there instead of reading as a dip to zero. */
interface Point {
  mbps: number | null;
  filingMs: number;
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-100">{value}</p>
    </div>
  );
}

/**
 * Throughput per arrival, plus the time each file spent being filed. Reading
 * the two together separates the network from the array: throughput decaying
 * while filing stays flat points at the camera or the Wi-Fi link, whereas
 * filing time climbing points at the disks falling behind the transfers.
 */
export function TransferSpeedChart({ transfers }: { transfers: TransferEvent[] }) {
  const [open, setOpen] = useState(true);

  const stats = useMemo(() => {
    // The API returns newest-first; the chart reads left to right in arrival order.
    const points: Point[] = [...transfers].reverse().map((t) => ({
      mbps: t.bytesPerSec === null ? null : t.bytesPerSec / 1024 / 1024,
      filingMs: t.filingMs,
    }));
    const measured = points.map((p) => p.mbps).filter((v): v is number => v !== null);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      points,
      measuredCount: measured.length,
      peak: measured.length ? Math.max(...measured) : 0,
      avg: mean(measured),
      recent: mean(measured.slice(-10)),
      peakFiling: points.length ? Math.max(...points.map((p) => p.filingMs)) : 0,
    };
  }, [transfers]);

  const { points, measuredCount, peak, avg, recent, peakFiling } = stats;
  const speedPath = buildPath(points.map((p) => p.mbps), peak);
  const filingPath = buildPath(points.map((p) => p.filingMs), peakFiling);
  // A run that starts fast and decays shows up as the tail falling well under
  // the run's own average — the exact shape worth flagging in the header.
  const fading = measuredCount >= 12 && recent < avg * 0.7;

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
        {measuredCount > 0 && (
          <span className="text-[11px] text-gray-400">{recent.toFixed(1)} MB/s</span>
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
          {measuredCount < 2 ? (
            <p className="py-4 text-center text-xs text-gray-500">
              Not enough back-to-back transfers yet. Send a burst from the camera.
            </p>
          ) : (
            <>
              <div className="mb-2.5 grid grid-cols-4 gap-2">
                <Stat label="Now" value={`${recent.toFixed(1)} MB/s`} />
                <Stat label="Average" value={`${avg.toFixed(1)} MB/s`} />
                <Stat label="Peak" value={`${peak.toFixed(1)} MB/s`} />
                <Stat label="Slowest file" value={`${(peakFiling / 1000).toFixed(1)}s`} />
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-24 w-full"
                role="img"
                aria-label="Transfer throughput and filing time over recent arrivals"
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
                <span className="ml-auto">{points.length} arrivals</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
