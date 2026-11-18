import React from 'react';
import { Globe, Loader2, SlidersHorizontal } from 'lucide-react';
import type {
  PrimaryTab,
  SearchResponse,
  SessionMode,
} from '../../types';
import type { PrimaryTabConfig } from './TopNavHeader';

interface SessionAndTabsBarProps {
  resultsTopRef: React.RefObject<HTMLDivElement | null>;
  sessionMode: SessionMode;
  activeTab: PrimaryTab;
  primaryTabs: PrimaryTabConfig[];
  currentDomainResult: SearchResponse | null;
  coherentMatchedOrgs: number;
  hasFilterTotals: boolean;
  activeFilterCount: number;
  isFilterLoading: boolean;
  isFilterCompanyLoading: boolean;
  onSelectDomainSession: () => void;
  onSelectFilterSession: () => void;
  onSelectTab: (tab: PrimaryTab) => void;
}

export const SessionAndTabsBar: React.FC<SessionAndTabsBarProps> = ({
  resultsTopRef,
  sessionMode,
  activeTab,
  primaryTabs,
  currentDomainResult,
  coherentMatchedOrgs,
  hasFilterTotals,
  activeFilterCount,
  isFilterLoading,
  isFilterCompanyLoading,
  onSelectDomainSession,
  onSelectFilterSession,
  onSelectTab,
}) => {
  return (
    <>
      {/* Dual-Session Switcher Bar: Domain Lookup vs Filter Explorer */}
      <div className="flex items-center px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl backdrop-blur-xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/85 dark:border-slate-800/85">
        <div className="grid grid-cols-2 gap-1.5 w-full p-1 rounded-lg bg-slate-100 dark:bg-slate-950/75 border border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={onSelectDomainSession}
            className={`min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap overflow-hidden ${
              sessionMode === 'domain'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="truncate">Domain Lookup</span>
            <span className="hidden md:inline font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 truncate">
              {currentDomainResult
                ? `· ${currentDomainResult.domain} (${currentDomainResult.employees.length.toLocaleString()})`
                : '· Ready'}
            </span>
          </button>

          <button
            type="button"
            onClick={onSelectFilterSession}
            className={`min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap overflow-hidden ${
              sessionMode === 'filter'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isFilterCompanyLoading || (isFilterLoading && !hasFilterTotals) ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
            ) : (
              <SlidersHorizontal className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            )}
            <span className="truncate">Filter Explorer</span>
            <span className="hidden md:inline font-mono tabular-nums text-xs text-sky-700 dark:text-sky-400 truncate">
              {hasFilterTotals
                ? `· ${coherentMatchedOrgs.toLocaleString()} Orgs`
                : activeFilterCount > 0
                ? `· ${activeFilterCount} Filters`
                : '· Worldwide'}
            </span>
          </button>
        </div>
      </div>

      {/* Three Primary Result Tabs */}
      <div
        ref={resultsTopRef}
        role="tablist"
        aria-label="Directory result tabs"
        className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl backdrop-blur-xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/85 dark:border-slate-800/85"
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const mobileShortLabel =
            tab.id === 'full-names-emails'
              ? 'Emails'
              : tab.id === 'command-hierarchy'
              ? 'Hierarchy'
              : tab.label;

          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[42px] sm:min-h-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap overflow-hidden ${
                active
                  ? 'bg-slate-900 text-white dark:bg-sky-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="sm:hidden truncate">{mobileShortLabel}</span>
              <span className="hidden sm:inline truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`hidden lg:inline font-mono tabular-nums text-xs truncate max-w-44 ${
                    active
                      ? 'text-slate-300 dark:text-sky-100'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  · {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
