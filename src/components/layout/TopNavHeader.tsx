import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Coins,
  Infinity as InfinityIcon,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';
import type {
  GlobalCompanyItem,
  PrimaryTab,
  TopLevelAppView,
  UserAccountPublic,
} from '../../types';
import { TopBarQuickSearch } from './TopBarQuickSearch';

export interface PrimaryTabConfig {
  id: PrimaryTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
}

interface TopNavHeaderProps {
  user: UserAccountPublic;
  monthlyPriceUsdt?: number;
  appView: TopLevelAppView;
  onBrandClick: () => void;
  onQuickSearchSelectCompany: (company: GlobalCompanyItem) => void;
  onQuickSearchShowMore: (query: string) => void;
  onQuickSearchDirectDomain: (domain: string) => void;
  onOpenProfile: () => void;
  onOpenUpgrade: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({
  user,
  monthlyPriceUsdt = 15,
  appView,
  onBrandClick,
  onQuickSearchSelectCompany,
  onQuickSearchShowMore,
  onQuickSearchDirectDomain,
  onOpenProfile,
  onOpenUpgrade,
  onOpenAdmin,
  onLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const isLowCoins = !user.hasActiveUnlimited && user.lensCoins <= 5;
  const isOutOfCoins = !user.hasActiveUnlimited && user.lensCoins <= 0;

  return (
    <header className="sticky top-0 z-30 bg-petrol-700/96 dark:bg-petrol-900/96 backdrop-blur-md border-b border-petrol-600/80 dark:border-petrol-800">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 sm:gap-4 px-3.5 sm:px-6 lg:px-8 h-15 sm:h-16">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="/domain-lookup/full-names-emails"
          onClick={(e) => {
            e.preventDefault();
            onBrandClick();
          }}
          className="font-display text-lg font-bold tracking-tight text-bone-50 whitespace-nowrap shrink-0"
        >
          OrgLens
        </a>

        {/* Zone 2: Quick Company & Domain Auto-Suggest Search */}
        <TopBarQuickSearch
          onSelectCompany={onQuickSearchSelectCompany}
          onShowMore={onQuickSearchShowMore}
          onDirectDomainLookup={onQuickSearchDirectDomain}
        />

        {/* Zone 3: Top-Right Lemon Coin CTA + Account Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={onOpenUpgrade}
            title={
              user.hasActiveUnlimited
                ? 'Unlimited Plan Active — View Billing & Lens Coin Ledger'
                : `${user.lensCoins} Lens Coins remaining — Click to upgrade for Unlimited ($${monthlyPriceUsdt}/mo USDT)`
            }
            className={`min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              user.hasActiveUnlimited
                ? 'bg-lemon-400 hover:bg-lemon-300 text-petrol-950 border-lemon-400'
                : isOutOfCoins
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-600'
                : isLowCoins
                ? 'bg-amber-400 hover:bg-amber-300 text-petrol-950 border-amber-400'
                : 'bg-lemon-400 hover:bg-lemon-300 text-petrol-950 border-lemon-400'
            }`}
          >
            {user.hasActiveUnlimited ? (
              <>
                <InfinityIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono tabular-nums">Unlimited</span>
              </>
            ) : (
              <>
                <Coins className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono tabular-nums text-sm leading-none">
                  {user.lensCoins.toLocaleString()}
                </span>
                <span className="hidden sm:inline">
                  {user.lensCoins === 1 ? 'Lens Coin' : 'Lens Coins'}
                </span>
                <span className="sm:hidden">
                  {user.lensCoins === 1 ? 'Coin' : 'Coins'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            title="Account Profile, Password & Single-Device Settings"
            aria-label="Account Settings"
            className={`min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              appView === 'profile'
                ? 'bg-bone-50 text-petrol-900 border-bone-50 font-semibold'
                : 'bg-petrol-800/80 hover:bg-petrol-600 text-bone-100 border-petrol-600/80'
            }`}
          >
            <UserCog className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-petrol-800/80 hover:bg-petrol-600 text-bone-100 border border-petrol-600/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="max-w-[76px] sm:max-w-[110px] truncate">{user.fullName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-lemon-300" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700 shadow-lg py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-bone-200 dark:border-petrol-800">
                  <div className="text-xs font-semibold text-petrol-900 dark:text-bone-50 truncate">
                    {user.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {user.email}
                  </div>
                  <div className="text-[11px] text-petrol-700 dark:text-lemon-300 mt-1 font-mono tabular-nums font-semibold">
                    {user.hasActiveUnlimited
                      ? 'Unlimited Plan Active'
                      : `${user.lensCoins.toLocaleString()} Lens Coins left`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenProfile();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors text-left cursor-pointer ${
                    appView === 'profile'
                      ? 'bg-petrol-100 dark:bg-petrol-800 text-petrol-900 dark:text-lemon-300 font-semibold'
                      : 'text-petrol-800 dark:text-bone-200 hover:bg-bone-200/70 dark:hover:bg-petrol-800/80'
                  }`}
                >
                  <UserCog className="h-3.5 w-3.5 text-petrol-600 dark:text-lemon-300 shrink-0" />
                  <span>Profile &amp; Settings</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenUpgrade();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-petrol-800 dark:text-bone-200 hover:bg-bone-200/70 dark:hover:bg-petrol-800/80 transition-colors text-left cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-petrol-600 dark:text-lemon-300 shrink-0" />
                  <span>
                    {user.hasActiveUnlimited
                      ? 'Billing & Lens Coin Ledger'
                      : `Upgrade Unlimited ($${monthlyPriceUsdt}/mo USDT)`}
                  </span>
                </button>

                {(user.role === 'admin' || user.isRootAdmin) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAdmin();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-petrol-800 dark:text-bone-200 hover:bg-bone-200/70 dark:hover:bg-petrol-800/80 transition-colors text-left cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Admin Console</span>
                  </button>
                )}

                <div className="my-1 border-t border-bone-200 dark:border-petrol-800" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
