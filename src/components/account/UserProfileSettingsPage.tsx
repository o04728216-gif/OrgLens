import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  Coins,
  Download,
  Eye,
  EyeOff,
  Globe,
  Infinity as InfinityIcon,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Ticket,
  UserCog,
} from 'lucide-react';
import type {
  CoinLedgerEntry,
  PublicPlatformConfig,
  UserAccountPublic,
  UserWorkspacePreferences,
} from '../../types';

type ProfileTabId = 'identity' | 'security' | 'preferences' | 'vault';

interface UserProfileSettingsPageProps {
  user: UserAccountPublic;
  config: PublicPlatformConfig;
  ledger: CoinLedgerEntry[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onBackToWorkspace: () => void;
  onOpenUpgrade: () => void;
  onOpenUnlockedDomain: (domain: string) => void;
  onUpdateProfile: (input: {
    fullName?: string;
    username?: string;
    companyName?: string;
    jobTitle?: string;
    preferences?: Partial<UserWorkspacePreferences>;
  }) => Promise<UserAccountPublic>;
  onChangePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<string>;
  onRotateSession: () => Promise<string>;
  onRedeemVoucher: (code: string) => Promise<string>;
  onLogout: () => void;
}

function evaluatePasswordStrength(pwd: string): {
  score: number;
  label: string;
  barClass: string;
} {
  if (!pwd) {
    return { score: 0, label: 'Enter new password', barClass: 'bg-slate-300' };
  }
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 10) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 1) {
    return { score: 1, label: 'Basic (6+ chars)', barClass: 'bg-amber-500' };
  }
  if (score === 2) {
    return { score: 2, label: 'Good', barClass: 'bg-sky-500' };
  }
  if (score === 3) {
    return { score: 3, label: 'Strong', barClass: 'bg-emerald-500' };
  }
  return { score: 4, label: 'Enterprise Grade', barClass: 'bg-emerald-500' };
}

export const UserProfileSettingsPage: React.FC<UserProfileSettingsPageProps> = ({
  user,
  config,
  ledger,
  theme,
  onToggleTheme,
  onBackToWorkspace,
  onOpenUpgrade,
  onOpenUnlockedDomain,
  onUpdateProfile,
  onChangePassword,
  onRotateSession,
  onRedeemVoucher,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTabId>('identity');

  // Identity form state (Email is strictly read-only)
  const [fullName, setFullName] = useState(user.fullName);
  const [username, setUsername] = useState(user.username);
  const [companyName, setCompanyName] = useState(user.companyName || '');
  const [jobTitle, setJobTitle] = useState(user.jobTitle || '');
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Workspace preferences state
  const [defaultSessionMode, setDefaultSessionMode] = useState<'domain' | 'filter'>(
    user.preferences?.defaultSessionMode || 'domain'
  );
  const [copyFormat, setCopyFormat] = useState<'email_only' | 'name_and_email'>(
    user.preferences?.copyFormat || 'email_only'
  );
  const [exportFilenamePrefix, setExportFilenamePrefix] = useState(
    user.preferences?.exportFilenamePrefix || 'orglens-contacts'
  );
  const [autoScrollOnPagination, setAutoScrollOnPagination] = useState(
    user.preferences?.autoScrollOnPagination ?? true
  );
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Password change state (Password only — email cannot be changed)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [rotatingSession, setRotatingSession] = useState(false);

  // Vault & Voucher state
  const [vaultQuery, setVaultQuery] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);

  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const showToast = (tone: 'success' | 'error', text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const cleanUnlockedDomains = useMemo(() => {
    const raw = user.unlockedCompaniesList || [];
    const seen = new Set<string>();
    const domains: string[] = [];
    for (const item of raw) {
      if (!item || item.startsWith('slug:')) continue;
      const clean = item.trim().toLowerCase();
      if (clean.includes('.') && !seen.has(clean)) {
        seen.add(clean);
        domains.push(clean);
      }
    }
    return domains;
  }, [user.unlockedCompaniesList]);

  const filteredVaultDomains = useMemo(() => {
    const q = vaultQuery.trim().toLowerCase();
    if (!q) return cleanUnlockedDomains;
    return cleanUnlockedDomains.filter((d) => d.includes(q));
  }, [cleanUnlockedDomains, vaultQuery]);

  const pwdStrength = evaluatePasswordStrength(newPassword);

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIdentity(true);
    setFeedback(null);
    try {
      await onUpdateProfile({
        fullName,
        username,
        companyName,
        jobTitle,
      });
      showToast('success', 'Profile identity saved.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to save profile.'
      );
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setFeedback(null);
    try {
      await onUpdateProfile({
        preferences: {
          defaultSessionMode,
          copyFormat,
          exportFilenamePrefix,
          autoScrollOnPagination,
        },
      });
      showToast('success', 'Workspace and export preferences saved.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to save preferences.'
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (newPassword.trim().length < 6) {
      showToast('error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('error', 'New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const msg = await onChangePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('success', msg);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Password update failed.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRotateSessionClick = async () => {
    setRotatingSession(true);
    setFeedback(null);
    try {
      const msg = await onRotateSession();
      showToast('success', msg);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Session rotation failed.'
      );
    } finally {
      setRotatingSession(false);
    }
  };

  const handleRedeemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;
    setRedeemingVoucher(true);
    setFeedback(null);
    try {
      const msg = await onRedeemVoucher(voucherCode);
      setVoucherCode('');
      showToast('success', msg);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Voucher redemption failed.'
      );
    } finally {
      setRedeemingVoucher(false);
    }
  };

  const handleExportUnlockedDomainsCsv = () => {
    if (!cleanUnlockedDomains.length) return;
    const rows = [
      'domain,status',
      ...cleanUnlockedDomains.map((d) => `${d},unlocked`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilenamePrefix || 'orglens'}-unlocked-domains.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{
    id: ProfileTabId;
    label: string;
    sub: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'identity',
      label: 'Profile & Identity',
      sub: 'Name, @handle & organization',
      icon: UserCog,
    },
    {
      id: 'security',
      label: 'Password & Device Lock',
      sub: 'Change password & 1-device session',
      icon: KeyRound,
    },
    {
      id: 'preferences',
      label: 'Workspace Preferences',
      sub: 'Copy style, exports & theme',
      icon: Sliders,
    },
    {
      id: 'vault',
      label: 'Unlocked Companies & Plan',
      sub: `${cleanUnlockedDomains.length} domains · Coins & vouchers`,
      icon: Building2,
    },
  ];

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Top Return & Account Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Directory Explorer</span>
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Profile &amp; Account Settings
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={config.supportTelegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Send className="h-3.5 w-3.5 text-sky-500" />
            <span>Support</span>
          </a>

          <button
            type="button"
            onClick={onOpenUpgrade}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              {user.hasActiveUnlimited
                ? 'Billing & Plan Details'
                : `Upgrade Unlimited ($${config.unlimitedMonthlyPriceUsdt}/mo)`}
            </span>
          </button>
        </div>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Signed-In Account
          </div>
          <div className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white truncate">
            {user.fullName}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
            {user.email}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Active Plan &amp; Balance
          </div>
          <div className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            {user.hasActiveUnlimited ? (
              <>
                <InfinityIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Unlimited Worldwide Pro</span>
              </>
            ) : (
              <>
                <Coins className="h-4 w-4 text-sky-500 shrink-0" />
                <span className="font-mono tabular-nums">
                  {user.lensCoins.toLocaleString()} Lens Coins
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {user.hasActiveUnlimited && user.unlimitedExpiresAt
              ? user.unlimitedExpiresAt === 'lifetime'
                ? 'Lifetime Unlimited Active'
                : `Valid until ${new Date(
                    user.unlimitedExpiresAt
                  ).toLocaleDateString()}`
              : `${user.totalCoinsUsed.toLocaleString()} coins used · ${user.totalSearches.toLocaleString()} lookups`}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Single-Device Login Lock
          </div>
          <div className="mt-1 font-display text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>1 Active Device Enforced</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
            {user.activeSessionDeviceLabel || 'Current Workstation'}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Unlocked Companies Vault
          </div>
          <div className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {cleanUnlockedDomains.length.toLocaleString()} Organizations
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Instant 0-coin repeat directory access
          </div>
        </div>
      </div>

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

      {/* Main 2-Column Settings Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Rail */}
        <aside className="lg:col-span-3 rounded-xl p-2.5 bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3.5 py-3 rounded-lg transition-colors flex items-start gap-3 cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <Icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    active ? 'text-white' : 'text-sky-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{tab.label}</div>
                  <div
                    className={`text-[11px] truncate mt-0.5 ${
                      active
                        ? 'text-sky-100'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tab.sub}
                  </div>
                </div>
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign Out of Workstation</span>
            </button>
          </div>
        </aside>

        {/* Right Active Settings Panel */}
        <div className="lg:col-span-9 space-y-6">
          {activeTab === 'identity' && (
            <form
              onSubmit={handleSaveIdentity}
              className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-6"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Profile Identity &amp; Organization
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Update your workspace display name, sign-in username handle,
                  and B2B organization details. Your registered email address is
                  permanently locked for account security.
                </p>
              </div>

              {/* Strictly Read-Only Locked Email Field */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Registered Email Address
                  </label>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3" />
                    <span>Locked · Cannot be changed</span>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    readOnly
                    aria-readonly="true"
                    className="w-full rounded-lg pl-3.5 pr-10 py-2.5 text-sm font-mono bg-slate-100 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed select-all"
                  />
                  <Lock className="h-4 w-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Users can change their password under Password &amp; Device
                  Lock, while account email addresses remain permanently bound.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Username Handle *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                      @
                    </span>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={32}
                      value={username}
                      onChange={(e) =>
                        setUsername(
                          e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '')
                        )
                      }
                      placeholder="alex_morgan"
                      className="w-full rounded-lg pl-8 pr-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Company / Organization
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Revenue Ops"
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Job Title / Role
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Head of Outbound Growth"
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Member since {new Date(user.createdAt).toLocaleDateString()} ·
                  Last sign-in {new Date(user.lastLoginAt).toLocaleString()}
                </div>

                <button
                  type="submit"
                  disabled={savingIdentity}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
                >
                  {savingIdentity ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Profile Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Password Change Card (Strictly Password Only) */}
              <form
                onSubmit={handlePasswordSubmit}
                className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-5"
              >
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Change Account Password
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Rotate your password at any time. Updating your password
                    keeps this workstation signed in and immediately invalidates
                    any older session token.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Current Password *
                  </label>
                  <div className="relative max-w-md">
                    <input
                      type={showCurrentPwd ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full rounded-lg pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPwd((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showCurrentPwd ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      New Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPwd ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full rounded-lg pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPwd((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showNewPwd ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    <div className="mt-2 space-y-1">
                      <div className="grid grid-cols-4 gap-1 h-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`rounded-full transition-colors ${
                              pwdStrength.score >= step
                                ? pwdStrength.barClass
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Strength: {pwdStrength.label}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Confirm New Password *
                    </label>
                    <input
                      type={showNewPwd ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                    {confirmPassword && (
                      <div
                        className={`mt-2 text-[11px] font-medium ${
                          confirmPassword === newPassword
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {confirmPassword === newPassword
                          ? 'Passwords match'
                          : 'Passwords do not match yet'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
                  >
                    {savingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4" />
                        <span>Update Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Single-Device Active Login Shield Monitor */}
              <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Single-Device Session Enforcement Active</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Current Authorized Workstation
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                      OrgLens allows only one active device login per account at
                      a time. If someone signs in to your account on another
                      computer or phone, any previously signed-in device is
                      automatically logged out immediately.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={rotatingSession}
                    onClick={() => void handleRotateSessionClick()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        rotatingSession ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Rotate Session Key</span>
                  </button>
                </div>

                <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3">
                    <Laptop className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {user.activeSessionDeviceLabel ||
                          'Current Browser Workstation'}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        Timezone: {user.activeSessionTimezone || 'Local'} ·
                        Active Sessions: {user.activeSessionsCount ?? 1} / 1 max
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {user.activeSessionStartedAt
                      ? `Signed in ${new Date(
                          user.activeSessionStartedAt
                        ).toLocaleString()}`
                      : 'Verified Active Now'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <form
              onSubmit={handleSavePreferences}
              className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-6"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Workspace &amp; Export Preferences
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tailor how OrgLens opens, copies corporate emails, names your
                  exported CSV files, and renders your workspace theme.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Default Session on Sign-In
                  </label>
                  <select
                    value={defaultSessionMode}
                    onChange={(e) =>
                      setDefaultSessionMode(
                        e.target.value as 'domain' | 'filter'
                      )
                    }
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="domain">Domain Lookup</option>
                    <option value="filter">Worldwide Filter Explorer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    One-Click Email Copy Format
                  </label>
                  <select
                    value={copyFormat}
                    onChange={(e) =>
                      setCopyFormat(
                        e.target.value as 'email_only' | 'name_and_email'
                      )
                    }
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="email_only">
                      Address only (alex@company.com)
                    </option>
                    <option value="name_and_email">
                      Full Name + Email (Alex Morgan &lt;alex@company.com&gt;)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    CSV Export Filename Prefix
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={exportFilenamePrefix}
                    onChange={(e) => setExportFilenamePrefix(e.target.value)}
                    placeholder="orglens-contacts"
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Interface Appearance
                  </label>
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      {theme === 'dark' ? (
                        <>
                          <Moon className="h-4 w-4 text-sky-400" />
                          <span>Dark Workspace Active</span>
                        </>
                      ) : (
                        <>
                          <Sun className="h-4 w-4 text-amber-500" />
                          <span>Light Workspace Active</span>
                        </>
                      )}
                    </span>
                    <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                      Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                    </span>
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScrollOnPagination}
                  onChange={(e) => setAutoScrollOnPagination(e.target.checked)}
                  className="rounded"
                />
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Automatically scroll back to the top of the directory table
                  when switching pagination pages
                </span>
              </label>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPrefs}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
                >
                  {savingPrefs ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Preferences...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Save Workspace Preferences</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'vault' && (
            <div className="space-y-6">
              {/* Promo Voucher Redemption + Quick Upgrade */}
              <div className="rounded-2xl p-6 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-sky-500" />
                      <span>Redeem Promo or Bonus Coin Voucher</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Have a promotional voucher code? Redeem it here for instant
                      Lens Coins or Unlimited Worldwide Pro days.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleRedeemSubmit}
                  className="flex flex-col sm:flex-row gap-2.5"
                >
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) =>
                      setVoucherCode(e.target.value.toUpperCase())
                    }
                    placeholder="ENTER VOUCHER CODE"
                    className="flex-1 rounded-lg px-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={redeemingVoucher || !voucherCode.trim()}
                    className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:opacity-50 text-white whitespace-nowrap cursor-pointer"
                  >
                    {redeemingVoucher ? 'Redeeming...' : 'Redeem Code'}
                  </button>
                </form>
              </div>

              {/* Unlocked Companies Vault */}
              <div className="rounded-2xl p-6 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Unlocked Companies Vault ({cleanUnlockedDomains.length})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Re-open any previously unlocked corporate domain with zero
                      additional Lens Coin charge.
                    </p>
                  </div>

                  {cleanUnlockedDomains.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExportUnlockedDomainsCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Domains CSV</span>
                    </button>
                  )}
                </div>

                {cleanUnlockedDomains.length > 0 && (
                  <div className="relative max-w-sm">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={vaultQuery}
                      onChange={(e) => setVaultQuery(e.target.value)}
                      placeholder="Filter unlocked domains..."
                      className="w-full rounded-lg pl-8.5 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                )}

                {filteredVaultDomains.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    {cleanUnlockedDomains.length === 0
                      ? 'Companies you search or reveal in Filter Explorer will appear here for instant 0-coin re-access.'
                      : 'No unlocked domains match your filter.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                    {filteredVaultDomains.map((dom) => (
                      <button
                        key={dom}
                        type="button"
                        onClick={() => onOpenUnlockedDomain(dom)}
                        className="group flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 hover:bg-sky-50/70 dark:bg-slate-950 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 transition-colors text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Globe className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {dom}
                          </span>
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-sky-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Coin Activity Preview */}
              {ledger.length > 0 && (
                <div className="rounded-2xl p-6 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Recent Account Activity
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-60 overflow-y-auto">
                    {ledger.slice(0, 12).map((entry) => (
                      <div
                        key={entry.id}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {entry.note}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-400">
                            {new Date(entry.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span
                          className={`font-mono tabular-nums font-semibold shrink-0 ${
                            entry.delta > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : entry.delta < 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
