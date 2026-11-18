import React from 'react';
import {
  ArrowRight,
  Coins,
  CreditCard,
  Laptop,
  Radar,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { AdminDashboardSnapshot, AdminSectionId } from '../../../types';

interface AdminOverviewPanelProps {
  snapshot: AdminDashboardSnapshot;
  onNavigateSection: (sec: AdminSectionId) => void;
}

export const AdminOverviewPanel: React.FC<AdminOverviewPanelProps> = ({
  snapshot,
  onNavigateSection,
}) => {
  const { stats, rootAdminShield, payments, ledger } = snapshot;
  const pendingOrders = payments.filter((p) => p.status === 'pending');

  const kpis = [
    {
      label: 'Registered Users',
      value: stats.totalUsers.toLocaleString(),
      sub: `${stats.activeUsers} active · ${stats.suspendedUsers} suspended`,
      action: () => onNavigateSection('users'),
    },
    {
      label: 'Unlimited Subscribers',
      value: stats.unlimitedSubscribers.toLocaleString(),
      sub: `$${stats.estimatedMonthlyRevenueUsdt.toLocaleString()} USDT approved volume`,
      action: () => onNavigateSection('payments'),
    },
    {
      label: 'Device Anti-Spam Lock',
      value: stats.registeredDevicesCount.toLocaleString(),
      sub: `${stats.blockedSpamSignupsCount.toLocaleString()} duplicate device signups blocked`,
      action: () => onNavigateSection('devices'),
    },
    {
      label: 'Lens Coins in Circulation',
      value: stats.totalCoinsInCirculation.toLocaleString(),
      sub: `${stats.totalCoinsConsumed.toLocaleString()} coins consumed across ${stats.totalLookupsExecuted.toLocaleString()} lookups`,
      action: () => onNavigateSection('ledger'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Executive Operations Overview
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Local VPS storage: <code className="font-mono">{rootAdminShield.storageFilePath}</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateSection('users')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-800 hover:opacity-90 text-white transition-opacity cursor-pointer"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Create &amp; Edit Users</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('devices')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Laptop className="h-3.5 w-3.5 text-sky-500" />
            <span>Device Anti-Spam</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('crawler')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer"
          >
            <Radar className="h-3.5 w-3.5" />
            <span>
              Worldwide Crawler
              {snapshot.crawlerStats
                ? ` (${snapshot.crawlerStats.vaultCompaniesCount.toLocaleString()} Vault)`
                : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('directory-overrides')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
          >
            <span>Manual Company Fixes</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.action}
            className="text-left rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-sky-500/60 transition-colors cursor-pointer space-y-2"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>{kpi.label}</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-60" />
            </div>
            <div className="font-display text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {kpi.value}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {kpi.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Root Admin Password Notice if Default */}
      {rootAdminShield.usingDefaultPassword && (
        <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Root Admin is using the initial bootstrap password
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Update your custom Root Admin password under Cache, Backup &amp;
                Root Shield to lock down production access while keeping your
                account permanently indestructible.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateSection('system')}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Set Custom Admin Password
          </button>
        </div>
      )}

      {/* Two-Column Actionable Feeds: Pending USDT Orders & Latest Coin Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-sky-500" />
              <span>Pending USDT (TRC20) Orders ({pendingOrders.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection('payments')}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Open Payment Queue
            </button>
          </div>

          {pendingOrders.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No pending USDT upgrade orders waiting for review.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {pendingOrders.slice(0, 6).map((ord) => (
                <div
                  key={ord.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {ord.userEmail} · {ord.orderCode}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      TxID: {ord.txHash}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateSection('payments')}
                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shrink-0 cursor-pointer"
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="h-4 w-4 text-sky-500" />
              <span>Latest Lens Coin &amp; Lookup Activity</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection('ledger')}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Full Audit Log
            </button>
          </div>

          {ledger.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No Lens Coin transactions recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {ledger.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white truncate">
                      {item.userEmail}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.note}
                    </div>
                  </div>
                  <span
                    className={`font-mono tabular-nums font-semibold shrink-0 ${
                      item.delta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.delta < 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.delta > 0 ? `+${item.delta}` : item.delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
