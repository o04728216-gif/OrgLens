import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FolderSearch,
  Gauge,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Search,
  SlidersHorizontal,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import type {
  GlobalIndustryOption,
  SearchResponse,
  SidebarFiltersState,
} from '../types';
import { CompaniesFilterGroup } from './sidebar/CompaniesFilterGroup';
import { ContactsFilterGroup } from './sidebar/ContactsFilterGroup';
import { LocationsFilterGroup } from './sidebar/LocationsFilterGroup';
import {
  countActiveSidebarFilters,
  getSidebarSectionSelectedCounts,
  INITIAL_SIDEBAR_FILTERS,
  type AccordionSectionId,
} from './sidebar/sidebarConstants';

export {
  countActiveSidebarFilters,
  getSidebarSectionSelectedCounts,
  INITIAL_SIDEBAR_FILTERS,
};

interface FilterSidebarProps {
  filters: SidebarFiltersState;
  onChangeFilters: (
    updater: (prev: SidebarFiltersState) => SidebarFiltersState
  ) => void;
  onResetFilters: () => void;
  globalIndustries: GlobalIndustryOption[];
  industriesLoading: boolean;
  onSelectIndustryFilter: (slugs: string[]) => void;
  onActivateCompanyDirectory: () => void;
  onDomainDirectLookup: (domain: string) => void;
  onBulkDomainsUpload: (domains: string[]) => void;
  snapshots: Record<string, SearchResponse>;
  activeDomain: string | null;
  onSelectSavedSnapshot: (domain: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isFilterLoading?: boolean;
}

const COLLAPSED_SECTION_ICONS: ReadonlyArray<{
  id: AccordionSectionId;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'contact-name', label: 'Contact Name or Email', Icon: Users },
  { id: 'current-role', label: 'Current Role & Seniority', Icon: Briefcase },
  { id: 'email-formula', label: 'Email Format', Icon: Mail },
  { id: 'accuracy-score', label: 'Accuracy Score', Icon: Gauge },
  { id: 'company-name', label: 'Company Name', Icon: FolderSearch },
  { id: 'industry', label: 'Worldwide Industry Filter', Icon: Globe2 },
  { id: 'employee-count', label: 'Employee Count', Icon: Building2 },
  { id: 'company-revenue', label: 'Company Revenue', Icon: DollarSign },
  { id: 'locations', label: 'Continents & Countries', Icon: MapPin },
];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onChangeFilters,
  onResetFilters,
  globalIndustries,
  industriesLoading,
  onSelectIndustryFilter,
  onActivateCompanyDirectory,
  onDomainDirectLookup,
  onBulkDomainsUpload,
  snapshots,
  activeDomain,
  onSelectSavedSnapshot,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  isFilterLoading = false,
}) => {
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showSavedMenu, setShowSavedMenu] = useState(false);

  // All filter sections collapsed on first load
  const [openSections, setOpenSections] = useState<
    Record<AccordionSectionId, boolean>
  >({
    'contact-name': false,
    'current-role': false,
    'email-formula': false,
    'accuracy-score': false,
    'company-name': false,
    industry: false,
    'employee-count': false,
    'company-revenue': false,
    locations: false,
  });

  const [searchClosedSections, setSearchClosedSections] = useState<
    Partial<Record<AccordionSectionId, boolean>>
  >({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionCounts = useMemo(
    () => getSidebarSectionSelectedCounts(filters),
    [filters]
  );
  const activeCount = useMemo(
    () => Object.values(sectionCounts).reduce((sum, n) => sum + n, 0),
    [sectionCounts]
  );

  const isSectionOpen = (id: AccordionSectionId): boolean => {
    if (sidebarSearch.trim()) {
      return !searchClosedSections[id];
    }
    return Boolean(openSections[id]);
  };

  const toggleSection = (id: AccordionSectionId) => {
    if (sidebarSearch.trim()) {
      setSearchClosedSections((prev) => ({ ...prev, [id]: !prev[id] }));
      return;
    }
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rawTokens = text
        .split(/[\r\n,;|\t\s]+/)
        .map((t) =>
          t
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0]
            .replace(/^@/, '')
        )
        .filter((d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d));

      const uniqueDomains = Array.from(new Set(rawTokens)).slice(0, 12);
      if (uniqueDomains.length > 0) {
        onBulkDomainsUpload(uniqueDomains);
      }
    } finally {
      e.target.value = '';
    }
  };

  const savedSnapshotEntries = useMemo(
    () =>
      Object.values(snapshots).sort(
        (a, b) => b.employees.length - a.employees.length
      ),
    [snapshots]
  );

  const expandAndFocusSection = (section: AccordionSectionId) => {
    onToggleCollapse();
    setOpenSections((prev) => ({ ...prev, [section]: true }));
  };

  const renderExpandedBody = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Filters
          </span>
          {activeCount > 0 && (
            <span className="font-mono tabular-nums text-xs font-semibold text-sky-600 dark:text-sky-400">
              · {activeCount}
            </span>
          )}
          {isFilterLoading && (
            <Loader2
              aria-label="Auto-loading filtered results"
              className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400 shrink-0"
            />
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="ml-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse filter sidebar"
            title="Collapse sidebar"
            className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close filter drawer"
            className="lg:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 py-3 space-y-2.5 border-b border-slate-200/70 dark:border-slate-800/70">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={sidebarSearch}
            onChange={(e) => {
              setSidebarSearch(e.target.value);
              setSearchClosedSections({});
            }}
            placeholder="Search filters or values"
            aria-label="Search filters or values"
            className="w-full pl-8 pr-7 py-2 text-xs rounded-lg bg-white dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
          />
          {sidebarSearch && (
            <button
              type="button"
              onClick={() => {
                setSidebarSearch('');
                setSearchClosedSections({});
              }}
              aria-label="Clear sidebar search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => void handleFileUpload(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Upload list
          </button>

          <span
            className="text-slate-300 dark:text-slate-700"
            aria-hidden="true"
          >
            |
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSavedMenu((v) => !v)}
              className="inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>My Searches ({savedSnapshotEntries.length})</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {showSavedMenu && (
              <div className="absolute right-0 mt-1.5 w-56 z-30 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-1.5 max-h-56 overflow-y-auto">
                {savedSnapshotEntries.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400">
                    Searched domains appear here automatically.
                  </p>
                ) : (
                  savedSnapshotEntries.map((snap) => (
                    <button
                      key={snap.domain}
                      type="button"
                      onClick={() => {
                        onSelectSavedSnapshot(snap.domain);
                        setShowSavedMenu(false);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        activeDomain === snap.domain
                          ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{snap.companyName}</span>
                      <span className="font-mono tabular-nums text-slate-400 shrink-0">
                        {snap.employees.length.toLocaleString()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-20 space-y-5">
        <ContactsFilterGroup
          filters={filters}
          sectionCounts={sectionCounts}
          sidebarSearch={sidebarSearch}
          isSectionOpen={isSectionOpen}
          onToggleSection={toggleSection}
          onChangeFilters={onChangeFilters}
        />

        <CompaniesFilterGroup
          filters={filters}
          sectionCounts={sectionCounts}
          sidebarSearch={sidebarSearch}
          globalIndustries={globalIndustries}
          industriesLoading={industriesLoading}
          isSectionOpen={isSectionOpen}
          onToggleSection={toggleSection}
          onChangeFilters={onChangeFilters}
          onSelectIndustryFilter={onSelectIndustryFilter}
          onActivateCompanyDirectory={onActivateCompanyDirectory}
          onDomainDirectLookup={onDomainDirectLookup}
          onCloseMobile={onCloseMobile}
        />

        <LocationsFilterGroup
          filters={filters}
          sectionCounts={sectionCounts}
          sidebarSearch={sidebarSearch}
          isSectionOpen={isSectionOpen}
          onToggleSection={toggleSection}
          onChangeFilters={onChangeFilters}
          onActivateCompanyDirectory={onActivateCompanyDirectory}
        />
      </div>
    </div>
  );

  return (
    <>
      <aside
        aria-label="Directory filters"
        className={`hidden lg:flex flex-col shrink-0 sticky top-20 self-start h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] min-h-0 rounded-2xl backdrop-blur-xl bg-white/85 dark:bg-slate-900/75 border border-slate-200/85 dark:border-slate-800/85 shadow-xs overflow-hidden transition-[width] duration-200 ease-out ${
          collapsed ? 'w-14' : 'w-76'
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center h-full min-h-0 overflow-y-auto overscroll-contain py-3.5 gap-2.5">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand filter sidebar"
              title="Expand filters"
              className="flex items-center justify-center h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {activeCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] font-bold text-sky-600 dark:text-sky-400 shrink-0">
                {activeCount}
              </span>
            )}

            <div className="w-7 h-px bg-slate-200 dark:bg-slate-800 shrink-0" />

            {COLLAPSED_SECTION_ICONS.map(({ id, label, Icon }) => {
              const count = sectionCounts[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => expandAndFocusSection(id)}
                  title={count > 0 ? `${label} (${count} selected)` : label}
                  aria-label={
                    count > 0 ? `${label} (${count} selected)` : label
                  }
                  className={`relative p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
                    count > 0
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                      : 'text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {count > 0 && (
                    <span className="absolute -top-1 -right-1 px-1 min-w-4 h-4 inline-flex items-center justify-center rounded-md bg-sky-600 text-white font-mono tabular-nums text-[10px] font-bold leading-none">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          renderExpandedBody()
        )}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              aria-label="Mobile filters drawer"
              className="relative z-10 w-[88vw] max-w-80 h-[100dvh] max-h-[100dvh] flex flex-col min-h-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              {renderExpandedBody()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export const MobileFilterTriggerButton: React.FC<{
  activeCount: number;
  onClick: () => void;
}> = ({ activeCount, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="lg:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
  >
    <SlidersHorizontal className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
    <span>Filters</span>
    {activeCount > 0 && (
      <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
        · {activeCount}
      </span>
    )}
  </button>
);
