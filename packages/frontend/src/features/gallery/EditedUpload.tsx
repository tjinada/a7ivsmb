import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { api } from '@/api/client';

type Tone = 'primary' | 'subtle';

/**
 * Owner-only control to upload edited JPGs into an album's Edited/ folder. Each
 * file is sent as a raw body to its own endpoint, sequentially, so one bad file
 * (wrong type, too large) doesn't sink the batch. Calls `onUploaded` once the
 * run finishes so the caller can refetch the gallery.
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
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
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
    setProgress({ done: 0, total: files.length });
    const failed: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      try {
        await api.post(
          `/gallery/albums/${encodeURIComponent(albumName)}/edited/${encodeURIComponent(file.name)}`,
          file,
          { headers: { 'Content-Type': file.type || 'image/jpeg' } },
        );
      } catch (err) {
        const msg =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'upload failed';
        failed.push(`${file.name}: ${msg}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }

    setErrors(failed);
    setBusy(false);
    onUploaded();
  };

  const cls =
    tone === 'primary'
      ? 'rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500 disabled:opacity-50'
      : 'rounded-lg border border-border px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-surface disabled:opacity-50';

  return (
    <div className="flex flex-col items-start gap-1">
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
        {busy ? `Uploading ${progress.done}/${progress.total}…` : label}
      </button>
      {errors.length > 0 && (
        <div className="text-[11px] text-red-400">
          {errors.length} file{errors.length === 1 ? '' : 's'} failed: {errors.slice(0, 2).join('; ')}
          {errors.length > 2 ? '…' : ''}
        </div>
      )}
    </div>
  );
}
