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
  hasFilterTotals,
  isFilterLoading,
  isFilterCompanyLoading,
  onSelectDomainSession,
  onSelectFilterSession,
  onSelectTab,
}) => {
  return (
    <>
      {/* Dual-Session Switcher Bar: Domain Lookup vs Filter Explorer */}
      <div className="flex items-center px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700/90">
        <div className="grid grid-cols-2 gap-1.5 w-full p-1 rounded-lg bg-bone-200 dark:bg-petrol-950 border border-bone-300/80 dark:border-petrol-800">
          <button
            type="button"
            onClick={onSelectDomainSession}
            className={`min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap overflow-hidden ${
              sessionMode === 'domain'
                ? 'bg-petrol-700 text-bone-50 dark:bg-petrol-700 dark:text-bone-50 shadow-xs'
                : 'text-slate-600 dark:text-bone-300 hover:text-petrol-900 dark:hover:text-bone-50'
            }`}
          >
            <Globe
              className={`h-4 w-4 shrink-0 ${
                sessionMode === 'domain'
                  ? 'text-lemon-300'
                  : 'text-petrol-600 dark:text-petrol-400'
              }`}
            />
            <span className="truncate">Domain Lookup</span>
            <span
              className={`hidden md:inline font-mono tabular-nums text-xs truncate ${
                sessionMode === 'domain'
                  ? 'text-lemon-200'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
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
                ? 'bg-petrol-700 text-bone-50 dark:bg-petrol-700 dark:text-bone-50 shadow-xs'
                : 'text-slate-600 dark:text-bone-300 hover:text-petrol-900 dark:hover:text-bone-50'
            }`}
          >
            {isFilterCompanyLoading || (isFilterLoading && !hasFilterTotals) ? (
              <Loader2
                className={`h-4 w-4 animate-spin shrink-0 ${
                  sessionMode === 'filter'
                    ? 'text-lemon-300'
                    : 'text-petrol-600 dark:text-lemon-300'
                }`}
              />
            ) : (
              <SlidersHorizontal
                className={`h-4 w-4 shrink-0 ${
                  sessionMode === 'filter'
                    ? 'text-lemon-300'
                    : 'text-petrol-600 dark:text-petrol-400'
                }`}
              />
            )}
            <span className="truncate">Filter Explorer</span>
          </button>
        </div>
      </div>

      {/* Three Primary Result Tabs — Petrol Active Fill with Crisp Lemon Yellow Bottom Signal */}
      <div
        ref={resultsTopRef}
        role="tablist"
        aria-label="Directory result tabs"
        className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700/90"
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
              className={`relative min-h-[42px] sm:min-h-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap overflow-hidden ${
                active
                  ? 'bg-petrol-700 text-bone-50 dark:bg-petrol-700 dark:text-bone-50 shadow-xs'
                  : 'text-slate-600 dark:text-bone-300 hover:text-petrol-900 dark:hover:text-bone-50 hover:bg-bone-200/80 dark:hover:bg-petrol-800/70'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  active ? 'text-lemon-300' : 'text-petrol-600 dark:text-petrol-400'
                }`}
              />
              <span className="sm:hidden truncate">{mobileShortLabel}</span>
              <span className="hidden sm:inline truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`hidden lg:inline font-mono tabular-nums text-xs truncate max-w-44 ${
                    active
                      ? 'text-lemon-200'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  · {tab.badge}
                </span>
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-lemon-400"
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
