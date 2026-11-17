import { useCallback, useEffect, useState } from 'react';
import type { SearchResponse, SessionMode, SyncQueueItem } from '../types';
import type { StatusBannerState } from '../components/layout/HeroDomainSearchSection';
import { apiFetch, loadAuthToken } from '../utils/authClient';
import { loadSyncQueue, saveSyncQueue } from '../utils/offlineStorage';

interface UseOfflineSyncQueueParams {
  onSyncedResults: (results: SearchResponse[]) => void;
  onBalanceUpdated?: (balance: number) => void;
  setActiveDomain: (domain: string) => void;
  setSessionMode: (mode: SessionMode) => void;
  setStatusBanner: (banner: StatusBannerState | null) => void;
}

export function useOfflineSyncQueue({
  onSyncedResults,
  onBalanceUpdated,
  setActiveDomain,
  setSessionMode,
  setStatusBanner,
}: UseOfflineSyncQueueParams) {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOffline, setSimulateOffline] = useState(false);
  const effectiveOffline = !browserOnline || simulateOffline;

  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() =>
    loadSyncQueue()
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    saveSyncQueue(syncQueue);
  }, [syncQueue]);

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const queueDomainOffline = useCallback((domain: string) => {
    setSyncQueue((prev) => {
      const exists = prev.find(
        (item) =>
          item.domain === domain &&
          (item.status === 'pending' || item.status === 'syncing')
      );
      if (exists) return prev;
      return [
        {
          id: `${domain}-${Date.now()}`,
          domain,
          queuedAt: new Date().toISOString(),
          status: 'pending',
        },
        ...prev,
      ];
    });
  }, []);

  const syncPendingQueue = useCallback(async () => {
    if (effectiveOffline || isSyncing || !loadAuthToken()) return;
    const pendingItems = syncQueue.filter(
      (item) => item.status === 'pending' || item.status === 'failed'
    );
    if (pendingItems.length === 0) return;

    setIsSyncing(true);
    const domainsToSync = Array.from(
      new Set(pendingItems.map((i) => i.domain))
    );

    setSyncQueue((prev) =>
      prev.map((item) =>
        domainsToSync.includes(item.domain) && item.status !== 'synced'
          ? { ...item, status: 'syncing', errorMessage: undefined }
          : item
      )
    );

    try {
      const res = await apiFetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: domainsToSync }),
      });

      if (!res.ok) {
        throw new Error('Batch sync endpoint returned an error.');
      }

      const payload: {
        syncedAt: string;
        results: SearchResponse[];
        errors: Record<string, string>;
        balanceRemaining?: number;
      } = await res.json();

      if (
        typeof payload.balanceRemaining === 'number' &&
        onBalanceUpdated
      ) {
        onBalanceUpdated(payload.balanceRemaining);
      }

      const nonEmptyResults = payload.results.filter(
        (r) => r.employees.length > 0
      );

      if (nonEmptyResults.length > 0) {
        onSyncedResults(nonEmptyResults);
        setActiveDomain(nonEmptyResults[0].domain);
        setSessionMode('domain');
      }

      const syncedDomains = new Set(payload.results.map((r) => r.domain));
      setSyncQueue((prev) =>
        prev.map((item) => {
          if (syncedDomains.has(item.domain)) {
            return { ...item, status: 'synced', errorMessage: undefined };
          }
          if (payload.errors[item.domain]) {
            return {
              ...item,
              status: 'failed',
              errorMessage: payload.errors[item.domain],
            };
          }
          return item;
        })
      );

      setLastSyncedAt(payload.syncedAt);
      setStatusBanner({
        tone: 'success',
        text: `Synced ${payload.results.length} domain${
          payload.results.length === 1 ? '' : 's'
        } with ranked employees and verified corporate emails.`,
      });
    } catch (err) {
      setSyncQueue((prev) =>
        prev.map((item) =>
          item.status === 'syncing'
            ? {
                ...item,
                status: 'failed',
                errorMessage:
                  err instanceof Error ? err.message : 'Sync failed',
              }
            : item
        )
      );
    } finally {
      setIsSyncing(false);
    }
  }, [
    effectiveOffline,
    isSyncing,
    onBalanceUpdated,
    onSyncedResults,
    setActiveDomain,
    setSessionMode,
    setStatusBanner,
    syncQueue,
  ]);

  useEffect(() => {
    if (!effectiveOffline) {
      const hasPending = syncQueue.some((i) => i.status === 'pending');
      if (hasPending) {
        void syncPendingQueue();
      }
    }
  }, [effectiveOffline, syncPendingQueue, syncQueue]);

  const pendingSyncCount = syncQueue.filter(
    (q) => q.status === 'pending' || q.status === 'failed'
  ).length;

  return {
    effectiveOffline,
    simulateOffline,
    setSimulateOffline,
    syncQueue,
    setSyncQueue,
    isSyncing,
    lastSyncedAt,
    pendingSyncCount,
    queueDomainOffline,
    syncPendingQueue,
  };
}
