import React, { useState } from 'react';
import {
  Download,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AdminDashboardSnapshot,
  PlatformSettings,
} from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminSettingsPanelProps {
  settings: PlatformSettings;
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminSettingsPanel: React.FC<AdminSettingsPanelProps> = ({
  settings,
  onRefresh,
  onFeedback,
}) => {
  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save settings.');
      setDraft(data.settings);
      await onRefresh();
      onFeedback(
        'success',
        'Updated Lens Coin economy, USDT (TRC20) wallet, and platform settings.'
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to save settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Lens Coin Economy, USDT Wallet &amp; Site Configuration
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Customize signup coin allocation, lookup costs, TRC20 receiving
          wallet, monthly price, Support URL, device anti-spam rules, and
          site-wide banners.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-xl p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-6 text-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              New User Signup Bonus (Lens Coins)
            </label>
            <input
              type="number"
              min={0}
              value={draft.defaultSignupCoins}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defaultSignupCoins: Number(e.target.value),
                })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Domain Search Cost (Lens Coins)
            </label>
            <input
              type="number"
              min={0}
              value={draft.domainSearchCoinCost}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  domainSearchCoinCost: Number(e.target.value),
                })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Filter Explorer Company Click Cost
            </label>
            <input
              type="number"
              min={0}
              value={draft.filterCompanyCoinCost}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  filterCompanyCoinCost: Number(e.target.value),
                })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Unlimited Monthly Price (USDT)
            </label>
            <input
              type="number"
              min={1}
              value={draft.unlimitedMonthlyPriceUsdt}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  unlimitedMonthlyPriceUsdt: Number(e.target.value),
                })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Subscription Duration (Days)
            </label>
            <input
              type="number"
              min={1}
              value={draft.subscriptionDurationDays}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  subscriptionDurationDays: Number(e.target.value),
                })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Network Label
            </label>
            <input
              type="text"
              value={draft.usdtNetworkLabel}
              onChange={(e) =>
                setDraft({ ...draft, usdtNetworkLabel: e.target.value })
              }
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Receiving USDT (TRC20) Wallet Address
            </label>
            <input
              type="text"
              value={draft.usdtWalletAddress}
              onChange={(e) =>
                setDraft({ ...draft, usdtWalletAddress: e.target.value })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Support URL
            </label>
            <input
              type="text"
              value={draft.supportTelegramUrl}
              onChange={(e) =>
                setDraft({ ...draft, supportTelegramUrl: e.target.value })
              }
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Global Workspace Announcement Banner (Optional)
          </label>
          <input
            type="text"
            value={draft.announcementBanner}
            onChange={(e) =>
              setDraft({ ...draft, announcementBanner: e.target.value })
            }
            placeholder="Leave empty to hide banner across the app"
            className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enforceOneAccountPerDevice}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  enforceOneAccountPerDevice: e.target.checked,
                })
              }
            />
            <span>Enforce 1 account per physical device (anti-spam)</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.strictHardwareFingerprintLock}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  strictHardwareFingerprintLock: e.target.checked,
                })
              }
            />
            <span>Strict hardware fingerprint lock across wiped storage</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.autoApproveVerifiedTronTx}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  autoApproveVerifiedTronTx: e.target.checked,
                })
              }
            />
            <span>Auto-activate TronScan verified USDT transfers</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.allowNewRegistrations}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  allowNewRegistrations: e.target.checked,
                })
              }
            />
            <span>Allow new public account registrations</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.chargeRepeatCompanyLookups}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  chargeRepeatCompanyLookups: e.target.checked,
                })
              }
            />
            <span>Charge coins again on repeat lookups of same company</span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving Settings...' : 'Save Platform Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

interface AdminSystemPanelProps {
  snapshot: AdminDashboardSnapshot;
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminSystemPanel: React.FC<AdminSystemPanelProps> = ({
  snapshot,
  onRefresh,
  onFeedback,
}) => {
  const { cacheStats, rootAdminShield } = snapshot;
  const [flushing, setFlushing] = useState(false);

  // Root Admin security credentials update
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState(rootAdminShield.rootEmail);
  const [newUsername, setNewUsername] = useState(rootAdminShield.rootUsername);
  const [newPassword, setNewPassword] = useState('');
  const [updatingRoot, setUpdatingRoot] = useState(false);

  const handleFlushCache = async (
    target: 'all' | 'domains' | 'patterns' | 'rosters' | 'directory' | 'mx'
  ) => {
    setFlushing(true);
    try {
      const res = await apiFetch('/api/admin/cache/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) throw new Error('Cache flush failed.');
      await onRefresh();
      onFeedback('success', `Flushed ${target} server memory cache.`);
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to flush cache.'
      );
    } finally {
      setFlushing(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const res = await apiFetch('/api/admin/backup/export');
      if (!res.ok) throw new Error('Backup export failed.');
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orglens-vps-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onFeedback('success', 'Downloaded full VPS JSON backup.');
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Export failed.'
      );
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiFetch('/api/admin/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Restore failed.');
      await onRefresh();
      onFeedback(
        'success',
        'Restored VPS backup while preserving Root Admin indestructibility.'
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Invalid backup JSON file.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleUpdateRootCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingRoot(true);
    try {
      const res = await apiFetch('/api/admin/root-security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newEmail,
          newUsername,
          newPassword: newPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Update failed.');
      setCurrentPassword('');
      setNewPassword('');
      await onRefresh();
      onFeedback('success', 'Updated Root Admin credentials securely.');
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to update Root Admin.'
      );
    } finally {
      setUpdatingRoot(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Memory Caches, VPS Backup &amp; Indestructible Root Shield
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Inspect and flush live discovery caches, export/restore your local VPS
          JSON store, and rotate Root Admin credentials safely.
        </p>
      </div>

      {/* Indestructible Root Admin Credentials */}
      <form
        onSubmit={handleUpdateRootCredentials}
        className="rounded-xl p-6 bg-white dark:bg-slate-900/80 border border-emerald-500/40 space-y-4 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Indestructible Root Admin Account ({rootAdminShield.rootAdminId})</span>
          </div>
          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
            Self-Destruct Protection: LOCKED ON
          </span>
        </div>

        <p className="text-slate-500 dark:text-slate-400">
          This account cannot be deleted, suspended, demoted, or wiped by backup
          imports. Rotate your email, username, or password below.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Root Email
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Root Username
            </label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Verify current password"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              New Password (min 8 chars)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updatingRoot}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>
              {updatingRoot
                ? 'Updating Credentials...'
                : 'Update Root Admin Security'}
            </span>
          </button>
        </div>
      </form>

      {/* Cache Inspector & Flush */}
      <div className="rounded-xl p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Live Discovery Memory Caches
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Clear cached lookups or domain verification records to force
              fresh web discovery.
            </p>
          </div>
          <button
            type="button"
            disabled={flushing}
            onClick={() => void handleFlushCache('all')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Flush All Caches</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Domain Results',
              val: cacheStats.domainCache,
              key: 'domains' as const,
            },
            {
              label: 'Domain Routing',
              val: cacheStats.emailPatternCache,
              key: 'patterns' as const,
            },
            {
              label: 'Quick Org Rosters',
              val: cacheStats.quickRosterCache,
              key: 'rosters' as const,
            },
            {
              label: 'DNS MX Records',
              val: cacheStats.mxVerificationCache,
              key: 'mx' as const,
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-lg p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-slate-500">{c.label}</div>
                <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-white">
                  {c.val.toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                disabled={flushing}
                onClick={() => void handleFlushCache(c.key)}
                title={`Flush ${c.label}`}
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* VPS Portable Backup & Restore */}
      <div className="rounded-xl p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        <div className="space-y-1">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Portable VPS Snapshot Backup &amp; Restore
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Active file: <code className="font-mono">{rootAdminShield.storageFilePath}</code>{' '}
            · Automatic .bak recovery:{' '}
            {rootAdminShield.backupFileExists ? 'Ready' : 'Created on next write'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold bg-slate-900 dark:bg-slate-800 text-white cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON Backup</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <span>Restore JSON</span>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => void handleImportBackup(e)}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
