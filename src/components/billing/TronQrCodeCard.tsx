import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy } from 'lucide-react';

interface TronQrCodeCardProps {
  walletAddress: string;
  amountUsdt: number;
  networkLabel: string;
}

export const TronQrCodeCard: React.FC<TronQrCodeCardProps> = ({
  walletAddress,
  amountUsdt,
  networkLabel,
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toString(walletAddress, {
      type: 'svg',
      margin: 1,
      width: 200,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });
    return () => {
      active = false;
    };
  }, [walletAddress]);

  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedWallet(true);
      window.setTimeout(() => setCopiedWallet(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyAmount = async () => {
    try {
      await navigator.clipboard.writeText(String(amountUsdt));
      setCopiedAmount(true);
      window.setTimeout(() => setCopiedAmount(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="rounded-xl p-6 bg-slate-50 dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Settlement Network
          </div>
          <div className="mt-0.5 font-display text-sm font-bold text-rose-600 dark:text-rose-400">
            {networkLabel.toUpperCase()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Exact Monthly Amount
          </div>
          <button
            type="button"
            onClick={() => void handleCopyAmount()}
            className="mt-0.5 inline-flex items-center gap-1.5 font-display text-lg font-bold text-slate-900 dark:text-white font-mono tabular-nums hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
            title="Click to copy exact USDT amount"
          >
            <span>{amountUsdt}.00 USDT</span>
            {copiedAmount ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 opacity-60" />
            )}
          </button>
        </div>
      </div>

      {/* Locally Generated Scannable QR Code */}
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="p-3 rounded-xl bg-white border border-slate-200 shrink-0 shadow-xs">
          {svgMarkup ? (
            <div
              className="w-40 h-40 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
              aria-label={`TRON TRC20 USDT QR Code for ${walletAddress}`}
            />
          ) : (
            <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-400 font-mono">
              TRC20 QR
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-3 w-full">
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Official USDT (TRC20) Deposit Address
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Scan with Binance, TronLink, Trust Wallet, OKX, or Bybit. Send{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                USDT on TRON (TRC20) only
              </strong>
              —do not use ERC20 or BEP20.
            </p>
          </div>

          <div className="rounded-lg p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="font-mono text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-slate-100 break-all select-all">
              {walletAddress}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleCopyWallet()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white transition-colors cursor-pointer"
          >
            {copiedWallet ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Copied TRC20 Wallet Address</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy TRC20 Wallet Address</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
