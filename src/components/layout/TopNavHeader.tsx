import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Coins,
  Globe,
  Infinity as InfinityIcon,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';
import type {
  PrimaryTab,
  SessionMode,
  TopLevelAppView,
  UserAccountPublic,
} from '../../types';

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
  sessionMode: SessionMode;
  activeTab: PrimaryTab;
  primaryTabs: PrimaryTabConfig[];
  showWidgetsDrawer: boolean;
  totalMatchedCompanies?: number;
  onBrandClick: () => void;
  onSelectTab: (tab: PrimaryTab) => void;
  onToggleWidgetsDrawer: () => void;
  onOpenWorldwideExplorer: () => void;
  onFocusDomainLookup: () => void;
  onOpenProfile: () => void;
  onOpenUpgrade: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({
  user,
  monthlyPriceUsdt = 15,
  appView,
  sessionMode,
  activeTab,
  primaryTabs,
  showWidgetsDrawer,
  totalMatchedCompanies,
  onBrandClick,
  onSelectTab,
  onToggleWidgetsDrawer,
  onOpenWorldwideExplorer,
  onFocusDomainLookup,
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
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-[#090d16]/80 border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-6 px-4 sm:px-6 lg:px-8 h-16">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="/domain-lookup/full-names-emails"
          onClick={(e) => {
            e.preventDefault();
            onBrandClick();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          OrgLens
        </a>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {primaryTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                appView === 'workspace' && activeTab === tab.id
                  ? 'text-slate-900 dark:text-white font-semibold underline'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleWidgetsDrawer}
            className={`underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              appView === 'workspace' && showWidgetsDrawer
                ? 'text-slate-900 dark:text-white font-semibold underline'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Widgets &amp; Sync
          </button>
          {sessionMode === 'domain' ? (
            <button
              type="button"
              onClick={onOpenWorldwideExplorer}
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline text-sky-700 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>
                Worldwide Explorer
                {typeof totalMatchedCompanies === 'number'
                  ? ` (${totalMatchedCompanies.toLocaleString()})`
                  : ''}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onFocusDomainLookup}
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline text-sky-700 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Domain Lookup</span>
            </button>
          )}
        </nav>

        {/* Zone 3: Top-Right Lens Coin Counter + Account Menu */}
        <div className="flex items-center gap-2.5 shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={onOpenUpgrade}
            title={
              user.hasActiveUnlimited
                ? 'Unlimited Plan Active — View Billing & Lens Coin Ledger'
                : `${user.lensCoins} Lens Coins remaining — Click to upgrade for Unlimited ($${monthlyPriceUsdt}/mo USDT)`
            }
            className={`inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              user.hasActiveUnlimited
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600'
                : isOutOfCoins
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-600'
                : isLowCoins
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-500'
                : 'bg-sky-600 hover:bg-sky-500 text-white border-sky-600'
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
                <span>
                  {user.lensCoins === 1 ? 'Lens Coin' : 'Lens Coins'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            title="Account Profile, Password & Single-Device Settings"
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              appView === 'profile'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/80'
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
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Single-Device Active Session" />
              <span className="max-w-[110px] truncate">{user.fullName}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {user.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {user.email}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
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
                      ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <UserCog className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span>Profile &amp; Settings</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenUpgrade();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-sky-500 shrink-0" />
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
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Admin Console</span>
                  </button>
                )}

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

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
