import React from 'react';
import { CloudOff, RefreshCw, Trash2, Wifi } from 'lucide-react';
import type { SyncQueueItem } from '../types';

interface OfflineSyncWidgetProps {
  queue: SyncQueueItem[];
  isOffline: boolean;
  simulateOffline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  onToggleSimulateOffline: () => void;
  onTriggerSyncNow: () => void;
  onRemoveQueueItem: (id: string) => void;
  onClearSynced: () => void;
}

export const OfflineSyncWidget: React.FC<OfflineSyncWidgetProps> = ({
  queue,
  isOffline,
  simulateOffline,
  isSyncing,
  lastSyncedAt,
  onToggleSimulateOffline,
  onTriggerSyncNow,
  onRemoveQueueItem,
  onClearSynced,
}) => {
  const pendingCount = queue.filter(
    (item) => item.status === 'pending' || item.status === 'failed'
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          {isOffline ? (
            <CloudOff className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <div className="text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {isOffline
                ? 'Offline Mode Active — Searches queue locally'
                : 'Connected — Automatic background sync ready'}
            </span>
            {lastSyncedAt && (
              <span className="text-slate-500 dark:text-slate-400 ml-2 font-mono tabular-nums">
                · Last sync {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSimulateOffline}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
              simulateOffline
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                : 'border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/70'
            }`}
          >
            {simulateOffline ? 'Restore Connection' : 'Simulate Offline'}
          </button>

          {pendingCount > 0 && !isOffline && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={onTriggerSyncNow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : `Sync ${pendingCount} Now`}
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="py-5 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Offline sync queue is empty. Toggle <strong className="text-slate-700 dark:text-slate-300">Simulate Offline</strong> and submit any company domain to test offline queueing and automatic reconnect sync.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              {queue.length} queued lookup{queue.length === 1 ? '' : 's'}
            </span>
            {queue.some((q) => q.status === 'synced') && (
              <button
                type="button"
                onClick={onClearSynced}
                className="hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
            {queue.map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.domain}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span
                      className={`font-medium ${
                        item.status === 'synced'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.status === 'syncing'
                          ? 'text-sky-600 dark:text-sky-400'
                          : item.status === 'failed'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {item.status === 'synced'
                        ? 'Synced'
                        : item.status === 'syncing'
                        ? 'Syncing...'
                        : item.status === 'failed'
                        ? 'Retry pending'
                        : 'Queued offline'}
                    </span>
                  </div>
                  {item.errorMessage && (
                    <p className="mt-0.5 text-rose-600 dark:text-rose-400">
                      {item.errorMessage}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveQueueItem(item.id)}
                  aria-label={`Remove ${item.domain} from queue`}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
