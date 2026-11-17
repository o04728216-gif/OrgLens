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
    <section className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/85 dark:border-slate-800/85 p-4 sm:p-7 shadow-xs">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="max-w-2xl min-w-0">
          <h1
            style={{ textWrap: 'balance' }}
            className="font-display text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white"
          >
            Corporate email finder &amp; Worldwide company explorer
          </h1>
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
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                : 'border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                : 'border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                Light
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-slate-700" />
                Dark
              </>
            )}
          </button>

          {isInstallable && (
            <button
              type="button"
              onClick={onInstallApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Install App
            </button>
          )}
        </div>
      </div>

      {/* Domain Search Form */}
      <form onSubmit={onSubmitDomain} className="mt-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={domainInput}
              onChange={(e) => onChangeDomainInput(e.target.value)}
              placeholder="Enter any company domain (e.g., shopify.com, vercel.com)"
              aria-label="Company domain name"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl font-mono text-base sm:text-sm bg-white dark:bg-slate-950/80 border border-slate-300/90 dark:border-slate-800 text-slate-900 dark:text-white placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isDomainLoading}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-60 shadow-xs transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
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
                  title="Force fresh full-organization & live web email format detection"
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
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
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                : statusBanner.tone === 'success'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200'
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
