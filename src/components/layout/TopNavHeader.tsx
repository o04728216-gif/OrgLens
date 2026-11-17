import React from 'react';
import { Globe, Search } from 'lucide-react';
import type { PrimaryTab, SessionMode } from '../../types';

export interface PrimaryTabConfig {
  id: PrimaryTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
}

interface TopNavHeaderProps {
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
}

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({
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
}) => {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/75 dark:bg-[#090d16]/75 border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
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
          aria-label="Primary tabs"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {primaryTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
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
              showWidgetsDrawer
                ? 'text-slate-900 dark:text-white font-semibold underline'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Widgets &amp; Sync
          </button>
        </nav>

        {/* Zone 3: Single Contextual Primary Action */}
        <div className="flex items-center shrink-0">
          {sessionMode === 'domain' ? (
            <button
              type="button"
              onClick={onOpenWorldwideExplorer}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>
                Worldwide Explorer
                {typeof totalMatchedCompanies === 'number'
                  ? ` (${totalMatchedCompanies.toLocaleString()} Orgs)`
                  : ''}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onFocusDomainLookup}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Lookup Domain</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
