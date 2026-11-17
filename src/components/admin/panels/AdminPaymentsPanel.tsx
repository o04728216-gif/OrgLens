import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  PlusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { PlatformSettings, UsdtPaymentOrder } from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminPaymentsPanelProps {
  payments: UsdtPaymentOrder[];
  settings: PlatformSettings;
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminPaymentsPanel: React.FC<AdminPaymentsPanelProps> = ({
  payments,
  settings,
  onRefresh,
  onFeedback,
}) => {
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected'
  >('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Manual offline grant form
  const [manualEmail, setManualEmail] = useState('');
  const [manualAmount, setManualAmount] = useState(
    settings.unlimitedMonthlyPriceUsdt
  );
  const [manualTx, setManualTx] = useState('');
  const [manualDays, setManualDays] = useState<string>('30');
  const [manualNote, setManualNote] = useState('');
  const [grantingManual, setGrantingManual] = useState(false);

  const filtered = payments.filter((p) =>
    statusFilter === 'all' ? true : p.status === statusFilter
  );

  const handleReview = async (
    orderId: string,
    action: 'approved' | 'rejected'
  ) => {
    setBusyId(orderId);
    try {
      const res = await apiFetch(`/api/admin/payments/${orderId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          durationDays: settings.subscriptionDurationDays,
          adminNote:
            action === 'approved'
              ? 'Approved manually by Administrator'
              : 'Declined by Administrator — please contact Support',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update order.');
      await onRefresh();
      onFeedback(
        'success',
        `Order ${data.order.orderCode} marked as ${action}.`
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Order review failed.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReverifyOnChain = async (orderId: string) => {
    setBusyId(orderId);
    try {
      const res = await apiFetch(`/api/admin/payments/${orderId}/reverify`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Re-verification failed.');
      await onRefresh();
      onFeedback(
        data.verification?.verified ? 'success' : 'error',
        data.verification?.details || 'Checked TronScan.'
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'TronScan check failed.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantingManual(true);
    try {
      const res = await apiFetch('/api/admin/payments/manual-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmailOrId: manualEmail,
          amountUsdt: manualAmount,
          txHash: manualTx,
          durationDays:
            manualDays === 'lifetime' ? 'lifetime' : Number(manualDays),
          adminNote: manualNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Manual grant failed.');
      setManualEmail('');
      setManualTx('');
      setManualNote('');
      await onRefresh();
      onFeedback(
        'success',
        `Activated Unlimited plan for ${data.order.userEmail} (${data.order.orderCode}).`
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Manual grant failed.'
      );
    } finally {
      setGrantingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          USDT (TRC20) Payments &amp; Manual Activations
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Active receiving wallet:{' '}
          <code className="font-mono text-slate-800 dark:text-slate-200">
            {settings.usdtWalletAddress}
          </code>{' '}
          ({settings.usdtNetworkLabel})
        </p>
      </div>

      {/* Record Manual Direct USDT Payment */}
      <form
        onSubmit={handleManualGrant}
        className="rounded-xl p-5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3"
      >
        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <PlusCircle className="h-4 w-4 text-emerald-500" />
          <span>
            Record Direct Support USDT Payment &amp; Activate User Immediately
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <input
            type="text"
            required
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            placeholder="User Email *"
            className="rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
          <input
            type="number"
            min={1}
            value={manualAmount}
            onChange={(e) => setManualAmount(Number(e.target.value))}
            placeholder="USDT Amount"
            className="rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
          <input
            type="text"
            value={manualTx}
            onChange={(e) => setManualTx(e.target.value)}
            placeholder="TxID or Support Ref"
            className="rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
          <select
            value={manualDays}
            onChange={(e) => setManualDays(e.target.value)}
            className="rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            <option value="30">30 Days Unlimited</option>
            <option value="90">90 Days Unlimited</option>
            <option value="365">365 Days Unlimited</option>
            <option value="lifetime">Lifetime Unlimited</option>
          </select>
          <button
            type="submit"
            disabled={grantingManual}
            className="rounded-lg px-4 py-2 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
          >
            {grantingManual ? 'Activating...' : 'Grant Unlimited'}
          </button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
              statusFilter === st
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500">
            No USDT payment submissions match this filter.
          </p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Order / User</th>
                <th className="py-3 px-4 font-semibold">Amount</th>
                <th className="py-3 px-4 font-semibold">TRON TxID &amp; Note</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((ord) => (
                <tr key={ord.id}>
                  <td className="py-3.5 px-4">
                    <div className="font-mono font-semibold text-slate-900 dark:text-white">
                      {ord.orderCode}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      {ord.userEmail}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {new Date(ord.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    ${ord.amountUsdt} USDT
                    <div className="text-[11px] font-normal text-slate-500">
                      {ord.network} · {ord.durationDays}d
                    </div>
                  </td>
                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                      <span className="truncate">{ord.txHash}</span>
                      {/^[a-fA-F0-9]{64}$/.test(ord.txHash) && (
                        <a
                          href={`https://tronscan.org/#/transaction/${ord.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Inspect on TronScan"
                          className="text-sky-500 hover:text-sky-400 shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {ord.onChainDetails && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {ord.onChainDetails}
                      </div>
                    )}
                    {ord.userNote && (
                      <div className="text-[11px] text-sky-600 dark:text-sky-400 mt-0.5">
                        User note: {ord.userNote}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {ord.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approved
                      </span>
                    ) : ord.status === 'rejected' ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                        <XCircle className="h-3.5 w-3.5" />
                        Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                        <Clock className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === ord.id}
                        onClick={() => void handleReverifyOnChain(ord.id)}
                        title="Re-check transaction on TronScan"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            busyId === ord.id ? 'animate-spin' : ''
                          }`}
                        />
                      </button>

                      {ord.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={busyId === ord.id}
                          onClick={() => void handleReview(ord.id, 'approved')}
                          className="px-2.5 py-1.5 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                        >
                          Approve
                        </button>
                      )}

                      {ord.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busyId === ord.id}
                          onClick={() => void handleReview(ord.id, 'rejected')}
                          className="px-2.5 py-1.5 rounded-md font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                        >
                          Reject
                        </button>
                      )}
                    </div>
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
