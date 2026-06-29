import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { api } from '@/api/client';

type Tone = 'primary' | 'subtle';

/**
 * Owner-only control to upload edited JPGs into an album's Edited/ folder. Each
 * file is sent as a raw body to its own endpoint, sequentially, so one bad file
 * (wrong type, too large) doesn't sink the batch. Shows a real progress bar
 * (bytes uploaded across the whole batch). Calls `onUploaded` once the run
 * finishes so the caller can refetch the gallery.
 */
export function EditedUpload({
  albumName,
  onUploaded,
  label = 'Upload edited',
  tone = 'primary',
}: {
  albumName: string;
  onUploaded: () => void;
  label?: string;
  tone?: Tone;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [filePct, setFilePct] = useState(0); // progress of the file in flight
  const [errors, setErrors] = useState<string[]>([]);

  const pick = () => {
    if (!busy) inputRef.current?.click();
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file later
    if (files.length === 0) return;

    setBusy(true);
    setErrors([]);
    setDone(0);
    setTotal(files.length);
    setFilePct(0);
    const failed: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setFilePct(0);
      try {
        await api.post(
          `/gallery/albums/${encodeURIComponent(albumName)}/edited/${encodeURIComponent(file.name)}`,
          file,
          {
            headers: { 'Content-Type': file.type || 'image/jpeg' },
            onUploadProgress: (ev) => {
              if (ev.total) setFilePct(Math.round((ev.loaded / ev.total) * 100));
            },
          },
        );
      } catch (err) {
        const msg =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'upload failed';
        failed.push(`${file.name}: ${msg}`);
      }
      setDone(i + 1);
    }

    setErrors(failed);
    setBusy(false);
    onUploaded();
  };

  // Overall batch progress: completed files plus the in-flight file's fraction.
  const overall = total > 0 ? Math.round(((done + filePct / 100) / total) * 100) : 0;

  const cls =
    tone === 'primary'
      ? 'rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500 disabled:opacity-50'
      : 'rounded-lg border border-border px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-surface disabled:opacity-50';

  return (
    <div className="flex flex-col items-start gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        className="hidden"
        onChange={onFiles}
      />
      <button type="button" onClick={pick} disabled={busy} className={`flex items-center gap-1.5 ${cls}`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? `Uploading ${Math.min(done + 1, total)}/${total}…` : label}
      </button>

      {busy && (
        <div className="w-full min-w-[200px] max-w-[260px]">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary-500 transition-[width] duration-150"
              style={{ width: `${overall}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="text-[11px] text-red-400">
          {errors.length} file{errors.length === 1 ? '' : 's'} failed: {errors.slice(0, 2).join('; ')}
          {errors.length > 2 ? '…' : ''}
        </div>
      )}
    </div>
  );
}
