import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Coins,
  Globe,
  Infinity as InfinityIcon,
  KeyRound,
  Laptop,
  LogOut,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  SubscriptionPlan,
  UserAccountPublic,
  UserRole,
  UserStatus,
} from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminUsersPanelProps {
  users: UserAccountPublic[];
  monthlyPriceUsdt?: number;
  defaultSignupCoins?: number;
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminUsersPanel: React.FC<AdminUsersPanelProps> = ({
  users,
  monthlyPriceUsdt = 15,
  defaultSignupCoins = 50,
  onRefresh,
  onFeedback,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState<'all' | 'starter' | 'unlimited'>(
    'all'
  );
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Comprehensive Create User state (Admin-created users bypass device locks)
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCoins, setNewCoins] = useState(defaultSignupCoins);
  const [newPlan, setNewPlan] = useState<SubscriptionPlan>('starter');
  const [newUnlimitedDays, setNewUnlimitedDays] = useState<string>('30');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newStatus, setNewStatus] = useState<UserStatus>('active');
  const [newAdminNotes, setNewAdminNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Selected user comprehensive editor state
  const [editingUser, setEditingUser] = useState<UserAccountPublic | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editAdminNotes, setEditAdminNotes] = useState('');

  const [exactCoinsInput, setExactCoinsInput] = useState<string>('');
  const [deltaCoinsInput, setDeltaCoinsInput] = useState<string>('');
  const [adjustmentNote, setAdjustmentNote] = useState('');

  const [unlimitedDaysInput, setUnlimitedDaysInput] = useState<string>('30');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');
  const [addDomainsInput, setAddDomainsInput] = useState('');

  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditorForUser = (u: UserAccountPublic) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditEmail(u.email);
    setEditUsername(u.username || '');
    setEditCompanyName(u.companyName || '');
    setEditAdminNotes(u.adminNotes || '');
    setExactCoinsInput(String(u.lensCoins));
    setDeltaCoinsInput('');
    setAdjustmentNote('');
    setCustomExpiryDate(
      u.unlimitedExpiresAt && u.unlimitedExpiresAt !== 'lifetime'
        ? u.unlimitedExpiresAt.slice(0, 10)
        : ''
    );
    setAddDomainsInput('');
    setResetPasswordInput('');
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (filterPlan === 'unlimited' && !u.hasActiveUnlimited) return false;
      if (filterPlan === 'starter' && u.hasActiveUnlimited) return false;
      if (
        q &&
        !u.email.toLowerCase().includes(q) &&
        !u.fullName.toLowerCase().includes(q) &&
        !u.username.toLowerCase().includes(q) &&
        !(u.companyName || '').toLowerCase().includes(q) &&
        !(u.adminNotes || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [users, searchQuery, filterPlan]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          username: newUsername.trim() || undefined,
          fullName: newFullName,
          companyName: newCompany,
          adminNotes: newAdminNotes.trim() || undefined,
          password: newPassword,
          lensCoins: newCoins,
          plan: newPlan,
          unlimitedDays:
            newUnlimitedDays === 'lifetime'
              ? 'lifetime'
              : Number(newUnlimitedDays || 30),
          role: newRole,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create user.');
      setNewEmail('');
      setNewUsername('');
      setNewFullName('');
      setNewCompany('');
      setNewPassword('');
      setNewCoins(defaultSignupCoins);
      setNewPlan('starter');
      setNewUnlimitedDays('30');
      setNewRole('user');
      setNewStatus('active');
      setNewAdminNotes('');
      setShowCreateForm(false);
      await onRefresh();
      onFeedback('success', `Created account ${data.user.email}.`);
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Failed to create user.'
      );
    } finally {
      setCreating(false);
    }
  };

  const patchUser = async (
    userId: string,
    body: Record<string, unknown>,
    successText: string
  ) => {
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Update failed.');
      await onRefresh();
      if (editingUser && editingUser.id === userId && data.user) {
        const u = data.user as UserAccountPublic;
        setEditingUser(u);
        setEditFullName(u.fullName);
        setEditEmail(u.email);
        setEditUsername(u.username || '');
        setEditCompanyName(u.companyName || '');
        setEditAdminNotes(u.adminNotes || '');
        setExactCoinsInput(String(u.lensCoins));
      }
      onFeedback('success', successText);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteUser = async (
    u: UserAccountPublic,
    releaseDevice = true
  ) => {
    if (u.isRootAdmin) return;
    try {
      const res = await apiFetch(
        `/api/admin/users/${u.id}?releaseDevice=${releaseDevice ? 'true' : 'false'}`,
        {
          method: 'DELETE',
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Delete failed.');
      if (editingUser?.id === u.id) setEditingUser(null);
      await onRefresh();
      onFeedback(
        'success',
        `Deleted user ${u.email}${
          releaseDevice ? ' and released bound device lock.' : '.'
        }`
      );
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Users, Profiles &amp; Lens Coin Manager
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Create accounts (bypassing device locks), edit profiles, override
            Lens Coins, customize Unlimited dates, manage unlocked companies,
            revoke sessions, or release bound hardware devices.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>{showCreateForm ? 'Close Create Form' : 'Create User Manually'}</span>
        </button>
      </div>

      {/* Comprehensive Create User Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateUser}
          className="rounded-xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Create New Account Manually (Bypasses Device Anti-Spam Lock)
            </div>
            <span className="text-[11px] text-slate-500">
              Unlimited Worldwide Pro = ${monthlyPriceUsdt}/mo USDT
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="client@company.com"
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Username (Optional)
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="alex_gtm"
                className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Company / Organization
              </label>
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Acme Growth"
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Initial Password *
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Starting Lens Coins
              </label>
              <input
                type="number"
                min={0}
                value={newCoins}
                onChange={(e) => setNewCoins(Number(e.target.value))}
                className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Initial Plan
              </label>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value as SubscriptionPlan)}
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <option value="starter">Starter (Lens Coin Balance)</option>
                <option value="unlimited">
                  Unlimited Worldwide Pro (${monthlyPriceUsdt}/mo)
                </option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Unlimited Duration (If Unlimited)
              </label>
              <select
                value={newUnlimitedDays}
                disabled={newPlan !== 'unlimited'}
                onChange={(e) => setNewUnlimitedDays(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 disabled:opacity-50"
              >
                <option value="30">30 Days (${monthlyPriceUsdt} Monthly)</option>
                <option value="90">90 Days (Quarterly)</option>
                <option value="365">365 Days (Annual)</option>
                <option value="lifetime">Lifetime Unlimited</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Role
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <option value="user">Standard User</option>
                <option value="admin">Delegated Admin</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Initial Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as UserStatus)}
                className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-end gap-2">
              <div className="flex-1">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Internal Admin Notes (Optional)
                </label>
                <input
                  type="text"
                  value={newAdminNotes}
                  onChange={(e) => setNewAdminNotes(e.target.value)}
                  placeholder="Private B2B client contract or onboarding note..."
                  className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap cursor-pointer"
              >
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Plan Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by email, username, name, company, or admin notes..."
            className="w-full rounded-lg pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 self-start">
          {(['all', 'starter', 'unlimited'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setFilterPlan(tier)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                filterPlan === tier
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Comprehensive User Editor Drawer */}
      {editingUser && (
        <div className="rounded-xl p-5 bg-white dark:bg-slate-900 border-2 border-sky-500/60 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Comprehensive User Editor: {editingUser.fullName}</span>
                {editingUser.isRootAdmin && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    · Indestructible Root Admin
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono">
                {editingUser.email} · @{editingUser.username} · Searches:{' '}
                {editingUser.totalSearches} · Coins Spent:{' '}
                {editingUser.totalCoinsUsed} · Active Sessions:{' '}
                {editingUser.activeSessionsCount ?? 0}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Close Editor
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* 1. Identity, Contact & Internal Notes */}
            <div className="rounded-lg p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <UserCog className="h-3.5 w-3.5 text-sky-500" />
                <span>Profile Identity &amp; Admin Notes</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full rounded-md px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="w-full rounded-md px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Private Admin Notes
                </label>
                <input
                  type="text"
                  value={editAdminNotes}
                  onChange={(e) => setEditAdminNotes(e.target.value)}
                  placeholder="Internal account notes..."
                  className="w-full rounded-md px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
              </div>

              <button
                type="button"
                disabled={savingEdit}
                onClick={() =>
                  void patchUser(
                    editingUser.id,
                    {
                      fullName: editFullName,
                      email: editEmail,
                      username: editUsername,
                      companyName: editCompanyName,
                      adminNotes: editAdminNotes,
                    },
                    `Saved profile details for ${editEmail}.`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Profile Fields</span>
              </button>
            </div>

            {/* 2. Lens Coins & Usage Counters */}
            <div className="rounded-lg p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-sky-500" />
                <span>Lens Coins &amp; Usage Counters</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={exactCoinsInput}
                  onChange={(e) => setExactCoinsInput(e.target.value)}
                  className="w-full rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  placeholder="Exact balance"
                />
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={() =>
                    void patchUser(
                      editingUser.id,
                      {
                        exactCoins: Number(exactCoinsInput || 0),
                        adjustmentNote,
                      },
                      `Set ${editingUser.email} balance to ${exactCoinsInput} Lens Coins.`
                    )
                  }
                  className="px-3 py-1.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white whitespace-nowrap cursor-pointer"
                >
                  Set Exact
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={deltaCoinsInput}
                  onChange={(e) => setDeltaCoinsInput(e.target.value)}
                  className="w-full rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  placeholder="+50 or -10"
                />
                <button
                  type="button"
                  disabled={savingEdit || !deltaCoinsInput}
                  onClick={() => {
                    const delta = Number(deltaCoinsInput);
                    if (!Number.isFinite(delta) || delta === 0) return;
                    setDeltaCoinsInput('');
                    void patchUser(
                      editingUser.id,
                      { coinsDelta: delta, adjustmentNote },
                      `Adjusted ${editingUser.email} coins by ${delta}.`
                    );
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md font-semibold bg-slate-900 dark:bg-slate-800 text-white whitespace-nowrap cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add / Deduct</span>
                </button>
              </div>

              <input
                type="text"
                value={adjustmentNote}
                onChange={(e) => setAdjustmentNote(e.target.value)}
                placeholder="Optional ledger note"
                className="w-full rounded-md px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />

              <button
                type="button"
                disabled={savingEdit}
                onClick={() =>
                  void patchUser(
                    editingUser.id,
                    { resetUsageCounters: true },
                    `Reset lookup & spent coin counters for ${editingUser.email}.`
                  )
                }
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-medium border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>
                  Reset Usage Counters ({editingUser.totalSearches} searches ·{' '}
                  {editingUser.totalCoinsUsed} used)
                </span>
              </button>
            </div>

            {/* 3. Unlimited Subscription & Unlocked Companies */}
            <div className="rounded-lg p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <InfinityIcon className="h-3.5 w-3.5 text-emerald-500" />
                <span>
                  Unlimited Worldwide Pro (${monthlyPriceUsdt}/mo) &amp; Unlocked
                  Domains
                </span>
              </div>

              {editingUser.isRootAdmin ? (
                <p className="text-slate-500">
                  Root Admin permanently holds Lifetime Unlimited privileges.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <select
                      value={unlimitedDaysInput}
                      onChange={(e) => setUnlimitedDaysInput(e.target.value)}
                      className="flex-1 rounded-md px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <option value="30">
                        30 Days (${monthlyPriceUsdt} Monthly)
                      </option>
                      <option value="90">90 Days (Quarterly)</option>
                      <option value="365">365 Days (Annual)</option>
                      <option value="lifetime">Lifetime Unlimited</option>
                    </select>
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={() =>
                        void patchUser(
                          editingUser.id,
                          {
                            plan: 'unlimited',
                            unlimitedDays:
                              unlimitedDaysInput === 'lifetime'
                                ? 'lifetime'
                                : Number(unlimitedDaysInput),
                          },
                          `Granted Unlimited access to ${editingUser.email}.`
                        )
                      }
                      className="px-3 py-1.5 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap cursor-pointer"
                    >
                      Grant Unlimited
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={customExpiryDate}
                      onChange={(e) => setCustomExpiryDate(e.target.value)}
                      className="flex-1 rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    />
                    <button
                      type="button"
                      disabled={savingEdit || !customExpiryDate}
                      onClick={() =>
                        void patchUser(
                          editingUser.id,
                          {
                            plan: 'unlimited',
                            customUnlimitedExpiresAt: new Date(
                              `${customExpiryDate}T23:59:59.000Z`
                            ).toISOString(),
                          },
                          `Set custom Unlimited expiry date for ${editingUser.email}.`
                        )
                      }
                      className="px-3 py-1.5 rounded-md font-semibold bg-slate-900 dark:bg-slate-800 text-white whitespace-nowrap cursor-pointer"
                    >
                      Set Expiry Date
                    </button>
                  </div>

                  {editingUser.hasActiveUnlimited && (
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={() =>
                        void patchUser(
                          editingUser.id,
                          { plan: 'starter' },
                          `Reverted ${editingUser.email} to Starter Lens Coin plan.`
                        )
                      }
                      className="w-full py-1.5 px-3 rounded-md font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Revert to Coin Starter Plan
                    </button>
                  )}
                </>
              )}

              {/* Pre-unlock domains for user */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Globe className="h-3 w-3" />
                    <span>
                      Unlocked Domains ({editingUser.unlockedCompaniesCount})
                    </span>
                  </span>
                  {editingUser.unlockedCompaniesCount > 0 && (
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={() =>
                        void patchUser(
                          editingUser.id,
                          { clearUnlockedHistory: true },
                          `Cleared unlocked company history for ${editingUser.email}.`
                        )
                      }
                      className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={addDomainsInput}
                    onChange={(e) => setAddDomainsInput(e.target.value)}
                    placeholder="stripe.com, shopify.com"
                    className="flex-1 rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                  <button
                    type="button"
                    disabled={savingEdit || !addDomainsInput.trim()}
                    onClick={() => {
                      const domains = addDomainsInput
                        .split(/[\s,;]+/)
                        .map((d) => d.trim().toLowerCase())
                        .filter(Boolean);
                      if (!domains.length) return;
                      setAddDomainsInput('');
                      void patchUser(
                        editingUser.id,
                        { addUnlockedDomains: domains },
                        `Unlocked ${domains.length} domain(s) for ${editingUser.email}.`
                      );
                    }}
                    className="px-3 py-1.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white whitespace-nowrap cursor-pointer"
                  >
                    Unlock
                  </button>
                </div>

                {(editingUser.unlockedCompaniesList || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                    {(editingUser.unlockedCompaniesList || []).map((dom) => (
                      <span
                        key={dom}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px]"
                      >
                        <span>{dom}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void patchUser(
                              editingUser.id,
                              { removeUnlockedDomain: dom },
                              `Removed ${dom} from unlocked list.`
                            )
                          }
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          title={`Remove ${dom}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Security, Sessions & Bound Hardware Device */}
            <div className="rounded-lg p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                <span>Password, Sessions &amp; Hardware Device Lock</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  placeholder="Set new password (min 6)"
                  className="flex-1 rounded-md px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
                <button
                  type="button"
                  disabled={savingEdit || resetPasswordInput.trim().length < 6}
                  onClick={() => {
                    const pwd = resetPasswordInput.trim();
                    setResetPasswordInput('');
                    void patchUser(
                      editingUser.id,
                      { newPassword: pwd },
                      `Updated password for ${editingUser.email}.`
                    );
                  }}
                  className="px-3 py-1.5 rounded-md font-semibold bg-slate-900 dark:bg-slate-800 text-white whitespace-nowrap cursor-pointer"
                >
                  Set Password
                </button>
              </div>

              {!editingUser.isRootAdmin && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() =>
                      void patchUser(
                        editingUser.id,
                        {
                          status:
                            editingUser.status === 'active'
                              ? 'suspended'
                              : 'active',
                        },
                        `Updated account status for ${editingUser.email}.`
                      )
                    }
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-md font-medium border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 cursor-pointer"
                  >
                    <Ban className="h-3 w-3" />
                    <span>
                      {editingUser.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() =>
                      void patchUser(
                        editingUser.id,
                        {
                          role: editingUser.role === 'admin' ? 'user' : 'admin',
                        },
                        `Changed role for ${editingUser.email}.`
                      )
                    }
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-md font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    <span>
                      {editingUser.role === 'admin'
                        ? 'Demote User'
                        : 'Make Admin'}
                    </span>
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={savingEdit}
                onClick={() =>
                  void patchUser(
                    editingUser.id,
                    { revokeSessions: true },
                    `Signed out all active sessions for ${editingUser.email}.`
                  )
                }
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              >
                <LogOut className="h-3 w-3" />
                <span>
                  Force Sign Out Active Sessions (
                  {editingUser.activeSessionsCount ?? 0})
                </span>
              </button>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    <Laptop className="h-3 w-3 text-sky-500" />
                    <span className="truncate">
                      {editingUser.registeredDeviceLabel ||
                        'Admin-created (no bound device)'}
                    </span>
                  </div>
                  {editingUser.registeredDeviceStatus && (
                    <div className="text-[10px] font-mono text-slate-500 capitalize">
                      Device status: {editingUser.registeredDeviceStatus}
                    </div>
                  )}
                </div>

                {editingUser.registeredDeviceId &&
                  editingUser.registeredDeviceStatus === 'locked' && (
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={() =>
                        void patchUser(
                          editingUser.id,
                          { releaseDeviceLock: true },
                          `Released signup device lock for ${editingUser.email}.`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap cursor-pointer"
                    >
                      <Unlock className="h-3 w-3" />
                      <span>Release Device</span>
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Data Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <th className="py-3 px-4 font-semibold">User / Organization</th>
              <th className="py-3 px-4 font-semibold">Plan &amp; Device</th>
              <th className="py-3 px-4 font-semibold text-right">Lens Coins</th>
              <th className="py-3 px-4 font-semibold text-right">
                Lookups / Unlocked
              </th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredUsers.map((u) => (
              <tr
                key={u.id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{u.fullName}</span>
                    {u.isRootAdmin && (
                      <span
                        title="Indestructible Root Admin"
                        className="inline-flex items-center shrink-0"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {u.email}
                    {u.companyName ? ` · ${u.companyName}` : ''}
                  </div>
                  {u.adminNotes && (
                    <div className="text-[11px] text-sky-600 dark:text-sky-400 truncate max-w-xs">
                      Note: {u.adminNotes}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {u.isRootAdmin
                      ? 'Root Admin (Lifetime)'
                      : u.role === 'admin'
                      ? 'Delegated Admin'
                      : u.hasActiveUnlimited
                      ? `Unlimited ($${monthlyPriceUsdt} USDT)`
                      : 'Starter (Coins)'}
                  </div>
                  {u.unlimitedExpiresAt &&
                    u.unlimitedExpiresAt !== 'lifetime' &&
                    u.hasActiveUnlimited && (
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Until {new Date(u.unlimitedExpiresAt).toLocaleDateString()}
                      </div>
                    )}
                  {u.registeredDeviceLabel && (
                    <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                      Device: {u.registeredDeviceLabel}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {u.isRootAdmin ? '∞' : u.lensCoins.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {u.totalSearches.toLocaleString()} /{' '}
                  {u.unlockedCompaniesCount.toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  {u.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                      <Ban className="h-3.5 w-3.5" />
                      Suspended
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditorForUser(u)}
                      className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
                    >
                      Edit User
                    </button>
                    {!u.isRootAdmin && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(u, true)}
                        title="Delete user account and release bound device"
                        className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
