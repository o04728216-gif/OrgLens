import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CloudOff,
  Globe,
  LayoutGrid,
  Loader2,
  Moon,
  Search,
  Smartphone,
  Sun,
} from 'lucide-react';
import { MobileFilterTriggerButton } from '../FilterSidebar';
import type { SearchResponse, SessionMode } from '../../types';

export interface StatusBannerState {
  tone: 'info' | 'warning' | 'error' | 'success';
  text: string;
}

interface HeroDomainSearchSectionProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  domainInput: string;
  onChangeDomainInput: (val: string) => void;
  onSubmitDomain: (e: React.FormEvent) => void;
  isDomainLoading: boolean;
  sessionMode: SessionMode;
  currentDomainResult: SearchResponse | null;
  onRefreshCurrentDomain: (domain: string) => void;
  activeFilterCount: number;
  onOpenMobileFilters: () => void;
  showWidgetsDrawer: boolean;
  onToggleWidgetsDrawer: () => void;
  effectiveOffline: boolean;
  pendingSyncCount: number;
  onToggleSimulateOffline: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  isInstallable: boolean;
  onInstallApp: () => void;
  statusBanner: StatusBannerState | null;
  onDismissStatusBanner: () => void;
}

export const HeroDomainSearchSection: React.FC<HeroDomainSearchSectionProps> = ({
  searchInputRef,
  domainInput,
  onChangeDomainInput,
  onSubmitDomain,
  isDomainLoading,
  sessionMode,
  currentDomainResult,
  onRefreshCurrentDomain,
  activeFilterCount,
  onOpenMobileFilters,
  showWidgetsDrawer,
  onToggleWidgetsDrawer,
  effectiveOffline,
  pendingSyncCount,
  onToggleSimulateOffline,
  theme,
  onToggleTheme,
  isInstallable,
  onInstallApp,
  statusBanner,
  onDismissStatusBanner,
}) => {
  return (
    <section className="rounded-2xl bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700/90 p-4 sm:p-6 shadow-xs">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="max-w-2xl min-w-0">
          <h1
            style={{ textWrap: 'balance' }}
            className="font-display text-xl sm:text-2xl lg:text-[26px] font-bold tracking-tight text-petrol-900 dark:text-bone-50"
          >
            Find any company employees email address
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-bone-300">
            Type any company domain below to pull verified work emails, or switch to Filter Explorer to browse worldwide organizations.
          </p>
        </div>

        {/* Mobile Filter Trigger + Utility Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <MobileFilterTriggerButton
            activeCount={activeFilterCount}
            onClick={onOpenMobileFilters}
          />

          <button
            type="button"
            onClick={onToggleWidgetsDrawer}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
              showWidgetsDrawer
                ? 'border-petrol-700 bg-petrol-700 text-bone-50 dark:border-lemon-400 dark:bg-lemon-400 dark:text-petrol-950 font-semibold'
                : 'border-bone-300 dark:border-petrol-700 bg-bone-100 dark:bg-petrol-950/70 text-petrol-800 dark:text-bone-200 hover:bg-bone-200 dark:hover:bg-petrol-800'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Saved &amp; Widgets
          </button>

          <button
            type="button"
            onClick={onToggleSimulateOffline}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
              effectiveOffline
                ? 'border-lemon-500 bg-lemon-100 dark:bg-lemon-500/20 text-petrol-950 dark:text-lemon-200 font-semibold'
                : 'border-bone-300 dark:border-petrol-700 bg-bone-100 dark:bg-petrol-950/70 text-petrol-800 dark:text-bone-200 hover:bg-bone-200 dark:hover:bg-petrol-800'
            }`}
          >
            <CloudOff className="h-3.5 w-3.5" />
            {effectiveOffline
              ? `Offline${pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ''}`
              : 'Test Offline'}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-bone-300 dark:border-petrol-700 bg-bone-100 dark:bg-petrol-950/70 text-petrol-800 dark:text-bone-200 hover:bg-bone-200 dark:hover:bg-petrol-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-lemon-300" />
                Bone Light
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-petrol-700" />
                Petrol Dark
              </>
            )}
          </button>

          {isInstallable && (
            <button
              type="button"
              onClick={onInstallApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-petrol-600/40 bg-petrol-100 dark:bg-petrol-800 text-petrol-800 dark:text-lemon-300 hover:bg-petrol-200/70 dark:hover:bg-petrol-700 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Install App
            </button>
          )}
        </div>
      </div>

      {/* Domain Search Form — Unmistakable Lemon Yellow Search Action */}
      <form onSubmit={onSubmitDomain} className="mt-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-petrol-500 dark:text-lemon-300" />
            <input
              ref={searchInputRef}
              type="text"
              value={domainInput}
              onChange={(e) => onChangeDomainInput(e.target.value)}
              placeholder="Enter any company domain (e.g., shopify.com, vercel.com)"
              aria-label="Company domain name"
              className="w-full min-h-[46px] sm:min-h-0 pl-10 pr-4 py-2.5 rounded-xl font-mono text-base sm:text-sm bg-bone-100 dark:bg-petrol-950 border border-bone-300 dark:border-petrol-700 text-petrol-900 dark:text-bone-50 placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lemon-400/70 focus:border-petrol-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isDomainLoading}
              className="min-h-[46px] sm:min-h-0 flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-lemon-400 hover:bg-lemon-300 text-petrol-950 border border-lemon-500/40 disabled:opacity-60 shadow-xs transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isDomainLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : effectiveOffline ? (
                <>
                  <CloudOff className="h-4 w-4" />
                  Queue Lookup
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search Domain
                </>
              )}
            </button>

            {sessionMode === 'domain' &&
              currentDomainResult &&
              !effectiveOffline && (
                <button
                  type="button"
                  disabled={isDomainLoading}
                  onClick={() =>
                    onRefreshCurrentDomain(currentDomainResult.domain)
                  }
                  title="Refresh organization directory and verified contacts"
                  className="min-h-[46px] sm:min-h-0 px-4 py-2.5 rounded-xl text-sm font-medium border border-bone-300 dark:border-petrol-700 bg-bone-100 dark:bg-petrol-950 text-petrol-800 dark:text-bone-200 hover:bg-bone-200 dark:hover:bg-petrol-800 disabled:opacity-50 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Refresh
                </button>
              )}
          </div>
        </div>
      </form>

      {/* Status Feedback Banner */}
      <AnimatePresence mode="wait">
        {statusBanner && (
          <motion.div
            key={statusBanner.text}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className={`mt-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-3 border ${
              statusBanner.tone === 'error'
                ? 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                : statusBanner.tone === 'warning'
                ? 'border-lemon-500/50 bg-lemon-100/70 dark:bg-lemon-500/15 text-petrol-950 dark:text-lemon-200'
                : statusBanner.tone === 'success'
                ? 'border-emerald-600/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                : 'border-petrol-500/35 bg-petrol-100/70 dark:bg-petrol-800/80 text-petrol-900 dark:text-bone-100'
            }`}
          >
            <span>{statusBanner.text}</span>
            <button
              type="button"
              onClick={onDismissStatusBanner}
              className="text-current opacity-70 hover:opacity-100 underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
