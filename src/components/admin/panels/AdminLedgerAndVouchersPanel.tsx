import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import type { CoinLedgerEntry, PromoVoucher } from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminLedgerPanelProps {
  ledger: CoinLedgerEntry[];
}

export const AdminLedgerPanel: React.FC<AdminLedgerPanelProps> = ({
  ledger,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ledger;
    return ledger.filter(
      (item) =>
        item.userEmail.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q) ||
        (item.targetDomain || '').toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q)
    );
  }, [ledger, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Lens Coin &amp; Lookup Audit Ledger
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Complete audit trail of signup bonuses, domain searches, Filter
            Explorer clicks, 0-result non-charged lookups, and admin overrides.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by email, domain, or reason..."
            className="w-full rounded-lg pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          />
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500">
            No matching ledger entries found.
          </p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">Event / Target</th>
                <th className="py-3 px-4 font-semibold text-right">Delta</th>
                <th className="py-3 px-4 font-semibold text-right">
                  Balance After
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-800 dark:text-slate-200">
                    {entry.userEmail}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                    {entry.note}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                      entry.delta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : entry.delta < 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {entry.balanceAfter >= 900000
                      ? '∞'
                      : entry.balanceAfter.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

interface AdminVouchersPanelProps {
  vouchers: PromoVoucher[];
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminVouchersPanel: React.FC<AdminVouchersPanelProps> = ({
  vouchers,
  onRefresh,
  onFeedback,
}) => {
  const [code, setCode] = useState('');
  const [rewardType, setRewardType] = useState<'coins' | 'unlimited_days'>(
    'coins'
  );
  const [rewardValue, setRewardValue] = useState(50);
  const [maxUses, setMaxUses] = useState(100);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          rewardType,
          rewardValue,
          maxUses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create voucher.');
      setCode('');
      await onRefresh();
      onFeedback('success', `Created promo code ${data.voucher.code}.`);
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to create voucher.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (v: PromoVoucher) => {
    try {
      const res = await apiFetch(`/api/admin/vouchers/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !v.active }),
      });
      if (!res.ok) throw new Error('Failed to toggle voucher.');
      await onRefresh();
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to update voucher.'
      );
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/admin/vouchers/${id}`, { method: 'DELETE' });
    await onRefresh();
    onFeedback('success', 'Voucher deleted.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Promo &amp; Top-Up Voucher Codes
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Generate redeemable codes that grant bonus Lens Coins or Unlimited
          subscription days.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end text-xs"
      >
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Voucher Code *
          </label>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. PARTNER100"
            className="w-full rounded-lg px-3 py-2 font-mono uppercase bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Reward Type
          </label>
          <select
            value={rewardType}
            onChange={(e) =>
              setRewardType(e.target.value as 'coins' | 'unlimited_days')
            }
            className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            <option value="coins">Bonus Lens Coins</option>
            <option value="unlimited_days">Unlimited Access Days</option>
          </select>
        </div>
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            {rewardType === 'coins' ? 'Coins Granted' : 'Days Granted'}
          </label>
          <input
            type="number"
            min={1}
            value={rewardValue}
            onChange={(e) => setRewardValue(Number(e.target.value))}
            className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Max Redemptions
          </label>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{creating ? 'Creating...' : 'Create Voucher'}</span>
        </button>
      </form>

      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <th className="py-3 px-4 font-semibold">Code</th>
              <th className="py-3 px-4 font-semibold">Reward</th>
              <th className="py-3 px-4 font-semibold text-right">Redeemed</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                  {v.code}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {v.rewardType === 'coins'
                    ? `+${v.rewardValue} Lens Coins`
                    : `${v.rewardValue} Days Unlimited`}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {v.usedCount} / {v.maxUses}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={
                      v.active
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-slate-400'
                    }
                  >
                    {v.active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggle(v)}
                      className="px-2.5 py-1 rounded-md font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {v.active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(v.id)}
                      className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
