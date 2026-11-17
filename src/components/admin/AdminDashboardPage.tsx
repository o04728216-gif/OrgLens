import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Menu, RefreshCw } from 'lucide-react';
import type {
  AdminDashboardSnapshot,
  AdminSectionId,
  PublicPlatformConfig,
  UserAccountPublic,
} from '../../types';
import { apiFetch } from '../../utils/authClient';
import { AdminLoginGate } from './AdminLoginGate';
import { AdminSidebar } from './AdminSidebar';
import { AdminDevicesPanel } from './panels/AdminDevicesPanel';
import {
  AdminLedgerPanel,
  AdminVouchersPanel,
} from './panels/AdminLedgerAndVouchersPanel';
import { AdminOverridesPanel } from './panels/AdminOverridesPanel';
import { AdminOverviewPanel } from './panels/AdminOverviewPanel';
import { AdminPaymentsPanel } from './panels/AdminPaymentsPanel';
import {
  AdminSettingsPanel,
  AdminSystemPanel,
} from './panels/AdminSettingsAndSystemPanel';
import { AdminUsersPanel } from './panels/AdminUsersPanel';

interface AdminDashboardPageProps {
  user: UserAccountPublic | null;
  publicConfig: PublicPlatformConfig;
  activeSection: AdminSectionId;
  onSelectSection: (section: AdminSectionId) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogin: (identifier: string, password: string) => Promise<UserAccountPublic>;
  onLogout: () => void;
  onReturnToWorkspace: () => void;
  onSyncAuthAndConfig: () => Promise<void>;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  user,
  publicConfig,
  activeSection,
  onSelectSection,
  theme,
  onToggleTheme,
  onLogin,
  onLogout,
  onReturnToWorkspace,
  onSyncAuthAndConfig,
}) => {
  const isAdmin = Boolean(user && (user.role === 'admin' || user.isRootAdmin));

  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/dashboard');
      if (res.ok) {
        const data = (await res.json()) as AdminDashboardSnapshot;
        setSnapshot(data);
      }
    } catch {
      // Ignore transient error
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void fetchSnapshot();
    }
  }, [isAdmin, fetchSnapshot]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([fetchSnapshot(), onSyncAuthAndConfig()]);
  }, [fetchSnapshot, onSyncAuthAndConfig]);

  const showFeedback = useCallback(
    (tone: 'success' | 'error', text: string) => {
      setFeedback({ tone, text });
      window.setTimeout(() => {
        setFeedback((prev) => (prev?.text === text ? null : prev));
      }, 4500);
    },
    []
  );

  if (!isAdmin) {
    return (
      <AdminLoginGate
        currentUser={user}
        config={publicConfig}
        onLogin={onLogin}
        onBackToSite={onReturnToWorkspace}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100">
      <AdminSidebar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        snapshot={snapshot}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnToWorkspace={onReturnToWorkspace}
        onLogout={onLogout}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Contextual Admin Header */}
        <header className="sticky top-0 z-20 h-15 px-4 sm:px-6 lg:px-8 bg-white/85 dark:bg-[#090d16]/85 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Open admin menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="font-semibold text-slate-900 dark:text-white">
                Admin Console
              </span>
              <span className="mx-1.5">·</span>
              <span className="capitalize">
                {activeSection.replace('-', ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 font-mono">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1320px] w-full mx-auto space-y-5">
          {feedback && (
            <div
              role="status"
              className={`rounded-xl px-4 py-3 text-xs font-medium border ${
                feedback.tone === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/70'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {!snapshot ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
              <span className="text-xs">Loading VPS Admin Console...</span>
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <AdminOverviewPanel
                  snapshot={snapshot}
                  onNavigateSection={onSelectSection}
                />
              )}
              {activeSection === 'users' && (
                <AdminUsersPanel
                  users={snapshot.users}
                  monthlyPriceUsdt={snapshot.settings.unlimitedMonthlyPriceUsdt}
                  defaultSignupCoins={snapshot.settings.defaultSignupCoins}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
              {activeSection === 'devices' && (
                <AdminDevicesPanel
                  devices={snapshot.devices}
                  settings={snapshot.settings}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
              {activeSection === 'payments' && (
                <AdminPaymentsPanel
                  payments={snapshot.payments}
                  settings={snapshot.settings}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
              {activeSection === 'directory-overrides' && (
                <AdminOverridesPanel
                  overrides={snapshot.overrides}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
              {activeSection === 'ledger' && (
                <AdminLedgerPanel ledger={snapshot.ledger} />
              )}
              {activeSection === 'vouchers' && (
                <AdminVouchersPanel
                  vouchers={snapshot.vouchers}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
              {activeSection === 'settings' && (
                <AdminSettingsPanel
                  settings={snapshot.settings}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
              {activeSection === 'system' && (
                <AdminSystemPanel
                  snapshot={snapshot}
                  onRefresh={handleRefreshAll}
                  onFeedback={showFeedback}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
