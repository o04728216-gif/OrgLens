import React from 'react';
import { FolderClock, RefreshCw, Trash2 } from 'lucide-react';
import type { SearchResponse } from '../types';

interface SavedDomainsWidgetProps {
  snapshots: Record<string, SearchResponse>;
  activeDomain: string | null;
  isOffline: boolean;
  onSelectSnapshot: (domain: string) => void;
  onRefreshSnapshot: (domain: string) => void;
  onDeleteSnapshot: (domain: string) => void;
}

function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  );
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export const SavedDomainsWidget: React.FC<SavedDomainsWidgetProps> = ({
  snapshots,
  activeDomain,
  isOffline,
  onSelectSnapshot,
  onRefreshSnapshot,
  onDeleteSnapshot,
}) => {
  const entries = Object.values(snapshots).sort(
    (a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime()
  );

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <FolderClock className="mx-auto h-7 w-7 text-slate-400 dark:text-slate-500 mb-2.5" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          No cached company snapshots yet
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Every domain you search is saved locally for instant offline browsing.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
      {entries.map((snap) => {
        const isCurrent = activeDomain === snap.domain;
        return (
          <div
            key={snap.domain}
            className={`py-3 flex items-center justify-between gap-4 transition-colors ${
              isCurrent ? 'text-sky-600 dark:text-sky-400' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectSnapshot(snap.domain)}
              className="flex-1 min-w-0 text-left group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-sm font-semibold truncate ${
                    isCurrent
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400'
                  }`}
                >
                  {snap.domain}
                </span>
                <span aria-hidden="true" className="text-slate-400 text-xs">
                  ·
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  {snap.employees.length} profiles
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{snap.companyName}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Saved {formatRelativeTime(snap.fetchedAt)}</span>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={isOffline}
                onClick={() => onRefreshSnapshot(snap.domain)}
                title={isOffline ? 'Reconnect to refresh live data' : 'Re-scrape live results'}
                aria-label={`Refresh ${snap.domain}`}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteSnapshot(snap.domain)}
                title="Remove local snapshot"
                aria-label={`Delete ${snap.domain} snapshot`}
                className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
