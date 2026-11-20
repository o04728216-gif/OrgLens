import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Infinity as InfinityIcon,
  Loader2,
  Send,
  ShieldCheck,
  Ticket,
  XCircle,
} from 'lucide-react';
import type {
  CoinLedgerEntry,
  PublicPlatformConfig,
  UsdtPaymentOrder,
  UserAccountPublic,
} from '../../types';
import { TronQrCodeCard } from './TronQrCodeCard';

interface UsdtUpgradePageProps {
  user: UserAccountPublic;
  config: PublicPlatformConfig;
  ledger: CoinLedgerEntry[];
  orders: UsdtPaymentOrder[];
  exhaustedCoinsPrompt?: string | null;
  onBackToWorkspace: () => void;
  onSubmitUsdtPayment: (input: {
    txHash: string;
    senderWallet?: string;
    userNote?: string;
  }) => Promise<{
    order: UsdtPaymentOrder;
    autoActivated: boolean;
    verificationDetails: string;
  }>;
  onRedeemVoucher: (code: string) => Promise<string>;
}

export const UsdtUpgradePage: React.FC<UsdtUpgradePageProps> = ({
  user,
  config,
  ledger,
  orders,
  exhaustedCoinsPrompt,
  onBackToWorkspace,
  onSubmitUsdtPayment,
  onRedeemVoucher,
}) => {
  const [txHash, setTxHash] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState<{
    tone: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const [voucherCode, setVoucherCode] = useState('');
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);
  const [voucherFeedback, setVoucherFeedback] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const [copiedSupportBrief, setCopiedSupportBrief] = useState(false);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentFeedback(null);
    setSubmittingPayment(true);
    try {
      const res = await onSubmitUsdtPayment({
        txHash,
      });
      setTxHash('');
      if (res.autoActivated) {
        setPaymentFeedback({
          tone: 'success',
          text: `On-chain TRON transfer verified! Order ${res.order.orderCode} is approved and Unlimited Company Emails are now active on your account.`,
        });
      } else {
        setPaymentFeedback({
          tone: 'info',
          text: `Order ${res.order.orderCode} received (${res.verificationDetails}). An administrator will confirm your Unlimited upgrade shortly, or contact Support with your Order Code for instant activation.`,
        });
      }
    } catch (err) {
      setPaymentFeedback({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to submit payment verification.',
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleVoucherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;
    setVoucherFeedback(null);
    setRedeemingVoucher(true);
    try {
      const msg = await onRedeemVoucher(voucherCode);
      setVoucherCode('');
      setVoucherFeedback({ tone: 'success', text: msg });
    } catch (err) {
      setVoucherFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to redeem code.',
      });
    } finally {
      setRedeemingVoucher(false);
    }
  };

  const handleCopySupportBrief = async () => {
    const latestOrder = orders[0];
    const summary = [
      `OrgLens USDT (TRC20) Upgrade Support`,
      `Account Email: ${user.email}`,
      latestOrder ? `Order Code: ${latestOrder.orderCode}` : null,
      txHash.trim()
        ? `TxID: ${txHash.trim()}`
        : latestOrder
        ? `TxID: ${latestOrder.txHash}`
        : null,
      `Target Wallet: ${config.usdtWalletAddress}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(summary);
      setCopiedSupportBrief(true);
      window.setTimeout(() => setCopiedSupportBrief(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Navigation Back + Account Balance Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToWorkspace}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Directory Explorer</span>
        </button>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <span>Account: {user.email}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
            {user.hasActiveUnlimited
              ? 'Unlimited Plan Active'
              : `${user.lensCoins.toLocaleString()} Lens Coins Remaining`}
          </span>
        </div>
      </div>

      {/* Contextual Out-of-Coins Callout */}
      {(exhaustedCoinsPrompt ||
        (!user.hasActiveUnlimited && user.lensCoins <= 0)) && (
        <div className="rounded-xl p-4 sm:p-5 bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                You have consumed your {config.defaultSignupCoins} free Lens Coins
              </h2>
              <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                {exhaustedCoinsPrompt ||
                  `Upgrade below for $${config.unlimitedMonthlyPriceUsdt}/month in USDT (TRC20) to unlock unlimited domain lookups and worldwide company email reveals.`}
              </p>
            </div>
          </div>
          <a
            href={config.supportTelegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Support</span>
          </a>
        </div>
      )}

      {/* Main Checkout & Verification Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: USDT TRC20 Deposit & TxID Verification */}
        <div className="lg:col-span-7 rounded-2xl p-6 sm:p-8 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-sky-600 dark:text-sky-400">
              <span>Unlimited B2B Corporate Emails</span>
              <span aria-hidden="true">·</span>
              <span>${config.unlimitedMonthlyPriceUsdt} / Month</span>
              <span aria-hidden="true">·</span>
              <span>{config.usdtNetworkLabel}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
              Upgrade to Unlimited Company Emails for $
              {config.unlimitedMonthlyPriceUsdt} / month in USDT
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Unlock unlimited domain searches, unlimited Filter Explorer company
              reveals, and full CSV exports across 100M+ worldwide organizations
              for {config.subscriptionDurationDays} days.
            </p>
          </div>

          {/* Step 1: QR & Deposit Address */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              01. Transfer {config.unlimitedMonthlyPriceUsdt} USDT via TRON
              Network (TRC20) Only
            </div>
            <TronQrCodeCard
              walletAddress={config.usdtWalletAddress}
              amountUsdt={config.unlimitedMonthlyPriceUsdt}
              networkLabel={config.usdtNetworkLabel}
            />
          </div>

          {/* Step 2: Submit Transaction Hash */}
          <div className="space-y-3 pt-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              02. Submit Your TRON Transaction Hash (TxID) for Activation
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paste the 64-character TRON TxID from your wallet or exchange
              withdrawal history. Confirmed TRC20 transfers to{' '}
              <code className="font-mono text-[11px]">
                {config.usdtWalletAddress}
              </code>{' '}
              are verified against TronScan automatically.
            </p>

            {paymentFeedback && (
              <div
                role="status"
                className={`rounded-lg p-3.5 text-xs font-medium border ${
                  paymentFeedback.tone === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/70'
                    : paymentFeedback.tone === 'info'
                    ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800/70'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70'
                }`}
              >
                {paymentFeedback.text}
              </div>
            )}

            <form onSubmit={handlePaymentSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  TRON Transaction Hash (TxID) *
                </label>
                <input
                  type="text"
                  required
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="e.g. 8f4c9b2e7a1d0c3e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e"
                  className="w-full rounded-lg px-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingPayment}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold bg-lemon-400 hover:bg-lemon-300 disabled:opacity-60 text-petrol-950 border border-lemon-500/40 transition-colors cursor-pointer"
              >
                {submittingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying TRC20 Transaction on TRON...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>
                      Verify ${config.unlimitedMonthlyPriceUsdt} USDT Transfer &amp;
                      Activate Unlimited
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Step 3: Direct Billing Support */}
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                03. Instant Billing &amp; Upgrade Support
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sent from an internal exchange ledger or need custom team seats?
                Reach our billing Support desk directly for rapid activation.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopySupportBrief()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                title="Copy your account email and payment details for Support"
              >
                {copiedSupportBrief ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Details Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Ticket</span>
                  </>
                )}
              </button>

              <a
                href={config.supportTelegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Support</span>
                <ExternalLink className="h-3 w-3 opacity-80" />
              </a>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Balance Summary, Promo Voucher & Activity Ledger */}
        <div className="lg:col-span-5 space-y-6">
          {/* Current Account Wallet Card */}
          <div className="rounded-2xl p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Current Plan &amp; Balance
                </div>
                <div className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {user.hasActiveUnlimited ? (
                    <>
                      <InfinityIcon className="h-5 w-5 text-emerald-500" />
                      <span>Unlimited Pro Active</span>
                    </>
                  ) : (
                    <>
                      <Coins className="h-5 w-5 text-sky-500" />
                      <span className="font-mono tabular-nums">
                        {user.lensCoins.toLocaleString()} Lens Coins
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Unlocked Orgs
                </div>
                <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {user.unlockedCompaniesCount.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Coins Used
                </div>
                <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {user.totalCoinsUsed.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Plan Expiry
                </div>
                <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {user.unlimitedExpiresAt === 'lifetime'
                    ? 'Lifetime'
                    : user.unlimitedExpiresAt && user.hasActiveUnlimited
                    ? new Date(user.unlimitedExpiresAt).toLocaleDateString()
                    : 'Coin Tier'}
                </div>
              </div>
            </div>

            {/* Promo / Voucher Redeemer */}
            <form
              onSubmit={handleVoucherSubmit}
              className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2"
            >
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Have a Promo or Top-Up Voucher Code?
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Enter voucher code"
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-mono uppercase bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
                <button
                  type="submit"
                  disabled={redeemingVoucher || !voucherCode.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  <span>{redeemingVoucher ? 'Applying...' : 'Redeem'}</span>
                </button>
              </div>
              {voucherFeedback && (
                <p
                  className={`text-xs ${
                    voucherFeedback.tone === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {voucherFeedback.text}
                </p>
              )}
            </form>
          </div>

          {/* Submitted USDT Orders */}
          {orders.length > 0 && (
            <div className="rounded-2xl p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Your USDT (TRC20) Upgrade Orders
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {orders.map((ord) => (
                  <div key={ord.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {ord.orderCode} · ${ord.amountUsdt} USDT
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        {ord.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approved
                          </span>
                        ) : ord.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                            <XCircle className="h-3.5 w-3.5" />
                            Declined
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Clock className="h-3.5 w-3.5" />
                            Pending Review
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      TxID: {ord.txHash}
                    </div>
                    {ord.adminNote && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        {ord.adminNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Lens Coin Activity Ledger */}
          <div className="rounded-2xl p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Recent Lens Coin Activity
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                0-result lookups = 0 coins
              </span>
            </div>

            {ledger.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                Your Lens Coin transactions will appear here as you reveal
                companies.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1 text-xs">
                {ledger.slice(0, 25).map((entry) => (
                  <div
                    key={entry.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-800 dark:text-slate-200 truncate">
                        {entry.note}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        {new Date(entry.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`font-mono tabular-nums font-semibold shrink-0 ${
                        entry.delta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : entry.delta < 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
