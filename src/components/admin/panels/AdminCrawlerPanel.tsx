import React, { useState } from 'react';
import {
  Database,
  ExternalLink,
  Globe2,
  Loader2,
  MailCheck,
  Pause,
  Play,
  Radar,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { CrawlerVaultStats } from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminCrawlerPanelProps {
  crawlerStats?: CrawlerVaultStats;
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminCrawlerPanel: React.FC<AdminCrawlerPanelProps> = ({
  crawlerStats,
  onRefresh,
  onFeedback,
}) => {
  const [runningBurst, setRunningBurst] = useState<number | null>(null);
  const [togglingDaemon, setTogglingDaemon] = useState(false);

  const handleRunCrawlBurst = async (
    burstPages: number,
    refreshFederationTotals = false
  ) => {
    setRunningBurst(burstPages);
    try {
      const res = await apiFetch('/api/admin/crawler/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ burstPages, refreshFederationTotals }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to trigger crawler cycle.');
      }
      const addedOrgs = Number(
        payload?.summary?.companiesIndexed ??
          payload?.summary?.companiesIngested ??
          0
      );
      const addedEmails = Number(payload?.summary?.confirmedEmailsFound || 0);
      await onRefresh();
      onFeedback(
        'success',
        `Crawl cycle completed: +${addedOrgs.toLocaleString()} real companies indexed and +${addedEmails.toLocaleString()} confirmed emails persisted to local SQLite vault.`
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Crawler burst failed.'
      );
    } finally {
      setRunningBurst(null);
    }
  };

  const handleToggleDaemon = async (enabled: boolean) => {
    setTogglingDaemon(true);
    try {
      const res = await apiFetch('/api/admin/crawler/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to update crawler daemon.');
      }
      await onRefresh();
      onFeedback(
        'success',
        enabled
          ? 'Worldwide background crawler daemon resumed.'
          : 'Worldwide background crawler daemon paused.'
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Daemon toggle failed.'
      );
    } finally {
      setTogglingDaemon(false);
    }
  };

  if (!crawlerStats) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        <span className="text-xs">Loading Worldwide Crawler &amp; SQLite Vault...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Radar className="h-6 w-6 text-sky-500 shrink-0" />
            <span>Worldwide Company &amp; Confirmed Email Crawler</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Self-hosted SQLite Vault:{' '}
            <code className="font-mono text-slate-700 dark:text-slate-300">
              {crawlerStats.sqliteFilePath}
            </code>{' '}
            · 100% real corporate registries &amp; live confirmed email feeds
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={togglingDaemon}
            onClick={() => void handleToggleDaemon(!crawlerStats.daemonRunning)}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              crawlerStats.daemonRunning
                ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/55'
                : 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/55'
            }`}
          >
            {togglingDaemon ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : crawlerStats.daemonRunning ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>
              {crawlerStats.daemonRunning ? 'Pause Daemon' : 'Resume Daemon'}
            </span>
          </button>

          <button
            type="button"
            disabled={runningBurst !== null}
            onClick={() => void handleRunCrawlBurst(2, false)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors cursor-pointer"
          >
            {runningBurst === 2 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            <span>Crawl 2x Burst Now</span>
          </button>

          <button
            type="button"
            disabled={runningBurst !== null}
            onClick={() => void handleRunCrawlBurst(5, true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {runningBurst === 5 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>Sync Registries &amp; 5x Deep Crawl</span>
          </button>
        </div>
      </div>

      {/* 4-Column Real Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Live Federated Catalog</span>
            <Globe2 className="h-4 w-4 text-sky-500" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {crawlerStats.liveFederatedCatalogTotal.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Real worldwide entities across {crawlerStats.registries.length} live APIs
          </div>
        </div>

        <div className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Persisted in Local SQLite Vault</span>
            <Database className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {crawlerStats.vaultCompaniesCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Domains &amp; companies cached locally on VPS disk
          </div>
        </div>

        <div className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Real Confirmed Emails</span>
            <MailCheck className="h-4 w-4 text-sky-500" />
          </div>
          <div className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {crawlerStats.confirmedContactsCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Across {crawlerStats.confirmedDomainsCount.toLocaleString()} verified corporate domains
          </div>
        </div>

        <div className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Background Daemon Status</span>
            <Radar
              className={`h-4 w-4 ${
                crawlerStats.daemonRunning
                  ? 'text-emerald-500'
                  : 'text-amber-500'
              }`}
            />
          </div>
          <div className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {crawlerStats.daemonActiveCycle
              ? 'Crawling Now...'
              : crawlerStats.daemonRunning
              ? 'Active · Continuous'
              : 'Paused'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {crawlerStats.totalCyclesRun.toLocaleString()} cycles ·{' '}
            {crawlerStats.lastCycleAt
              ? `Last ${new Date(crawlerStats.lastCycleAt).toLocaleTimeString()}`
              : 'Booting first cycle'}
          </div>
        </div>
      </div>

      {/* Federated Registries Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Live Worldwide Corporate Registries &amp; Domain Feeds
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Official government company registers, LEI financial entities, scholarly institutions, and global top-domain feeds
            </p>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {crawlerStats.registries.map((reg) => (
            <div key={reg.registryKey} className="p-4 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {reg.label}
                </div>
                <span className="font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                  {reg.liveReportedTotal.toLocaleString()} live
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <span>Vault Indexed: {reg.vaultIndexedCount.toLocaleString()}</span>
                <a
                  href={reg.endpointUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
                >
                  <span>API Source</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4">Registry / Open Corporate Source</th>
                <th className="py-3 px-4 text-right">Live Reported Entities</th>
                <th className="py-3 px-4 text-right">Persisted in Vault</th>
                <th className="py-3 px-4">Upstream Endpoint</th>
                <th className="py-3 px-4 text-right">Last Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {crawlerStats.registries.map((reg) => (
                <tr
                  key={reg.registryKey}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    {reg.label}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
                    {reg.liveReportedTotal.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {reg.vaultIndexedCount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                    <a
                      href={reg.endpointUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                    >
                      <span className="truncate max-w-[260px]">
                        {reg.endpointUrl}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {reg.lastSyncedAt
                      ? new Date(reg.lastSyncedAt).toLocaleTimeString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Crawler Stream Cursors */}
      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Continuous Ingestion Stream Cursors
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Resumable byte-range and pagination cursors persisted across server restarts
          </p>
        </div>

        {crawlerStats.streams.length === 0 ? (
          <p className="px-5 py-8 text-xs text-slate-500 dark:text-slate-400 text-center">
            No stream cursors recorded yet — click &ldquo;Crawl 2x Burst Now&rdquo; above to advance all streams immediately.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Stream Key</th>
                  <th className="py-3 px-4">Current Cursor</th>
                  <th className="py-3 px-4 text-right">Items Ingested</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {crawlerStats.streams.map((st) => (
                  <tr
                    key={st.streamKey}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {st.streamKey}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {st.cursorValue}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {st.itemsIngested.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                      {st.lastStatus}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {st.lastCrawledAt
                        ? new Date(st.lastCrawledAt).toLocaleTimeString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
