import { useState, type ReactNode } from 'react';
import {
  Folder, ChevronRight, RefreshCw, Home, CheckSquare, MoreVertical, CalendarDays,
  FolderPlus, Trash2, Pencil, CalendarClock,
} from 'lucide-react';
import { prettyDate } from '@/lib/dates';

export type GalleryView = 'folders' | 'timeline';

export interface MenuAction {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

const ICON_BTN = 'flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-gray-200';

/**
 * Top bar of the gallery: folders/timeline toggle, breadcrumb, and the right
 * hand actions (select, refresh, overflow menu). Purely presentational — the
 * page decides which menu actions apply where.
 */
export function GalleryToolbar({
  view, onView, path, onPath, selecting, onSelect, onCancelSelect,
  canSelect, isFetching, onRefresh, menu,
}: {
  view: GalleryView;
  onView: (v: GalleryView) => void;
  path: string;
  onPath: (p: string) => void;
  selecting: boolean;
  onSelect: () => void;
  onCancelSelect: () => void;
  canSelect: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  menu: MenuAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isTimeline = view === 'timeline';
  const crumbs = [
    { name: 'Home', path: '' },
    ...(path ? path.split('/').map((seg, i, arr) => ({ name: seg, path: arr.slice(0, i + 1).join('/') })) : []),
  ];

  return (
    <div className="flex flex-shrink-0 items-center border-b border-border bg-base px-3 py-2.5 text-sm">
      <div className="mr-2 flex flex-shrink-0 rounded-lg bg-surface p-0.5">
        <ToggleBtn active={!isTimeline} label="Folders" onClick={() => onView('folders')}><Folder className="h-4 w-4" /></ToggleBtn>
        <ToggleBtn active={isTimeline} label="Timeline" onClick={() => onView('timeline')}><CalendarDays className="h-4 w-4" /></ToggleBtn>
      </div>

      {isTimeline ? (
        <span className="min-w-0 flex-1 truncate font-medium text-gray-100">All photos</span>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={c.path} className="flex items-center gap-1.5 whitespace-nowrap">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />}
                <button
                  type="button"
                  onClick={() => onPath(c.path)}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition ${
                    isLast ? 'font-medium text-gray-100' : 'text-primary-500 hover:bg-surface'
                  }`}
                >
                  {i === 0 && <Home className="h-3.5 w-3.5" />}
                  {prettyDate(c.name, false)}
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative ml-2 flex flex-shrink-0 items-center gap-1">
        {selecting ? (
          <button type="button" onClick={onCancelSelect} className="rounded-md px-2 py-1 text-xs font-medium text-primary-500">
            Cancel
          </button>
        ) : (
          <>
            {canSelect && (
              <button type="button" onClick={onSelect} aria-label="Select" className={ICON_BTN}>
                <CheckSquare className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onRefresh} aria-label="Refresh" className={ICON_BTN}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            {menu.length > 0 && (
              <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More actions" className={ICON_BTN}>
                <MoreVertical className="h-4 w-4" />
              </button>
            )}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                  {menu.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setMenuOpen(false); m.onSelect(); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                        m.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-200 hover:bg-surface hover:brightness-125'
                      }`}
                    >
                      {m.icon}
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-7 w-8 items-center justify-center rounded-md transition ${
        active ? 'bg-primary-500 text-on-accent' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

/** Icon set for the overflow menu, so the page doesn't import lucide for it. */
export const MenuIcons = {
  rename: <Pencil className="h-4 w-4 text-primary-500" />,
  trash: <Trash2 className="h-4 w-4" />,
  album: <FolderPlus className="h-4 w-4 text-primary-500" />,
  backfill: <CalendarClock className="h-4 w-4 text-primary-500" />,
};
