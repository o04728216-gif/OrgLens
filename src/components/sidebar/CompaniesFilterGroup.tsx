import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type {
  FilterFacetsResponse,
  GlobalIndustryOption,
  SidebarFiltersState,
} from '../../types';
import { truncateIndustry20 } from '../../utils/emailFormulas';
import { COMPANY_REVENUE_RANGES } from '../../utils/geographyAndRevenue';
import { SidebarAccordionCard } from './SidebarAccordionCard';
import {
  EMPLOYEE_RANGE_OPTIONS,
  countEnteredTerms,
  type AccordionSectionId,
} from './sidebarConstants';

interface CompaniesFilterGroupProps {
  filters: SidebarFiltersState;
  sectionCounts: Record<AccordionSectionId, number>;
  sidebarSearch: string;
  globalIndustries: GlobalIndustryOption[];
  industriesLoading: boolean;
  filterFacets?: FilterFacetsResponse | null;
  isSectionOpen: (id: AccordionSectionId) => boolean;
  onToggleSection: (id: AccordionSectionId) => void;
  onChangeFilters: (
    updater: (prev: SidebarFiltersState) => SidebarFiltersState
  ) => void;
  onSelectIndustryFilter: (slugs: string[]) => void;
  onActivateCompanyDirectory: () => void;
  onDomainDirectLookup: (domain: string) => void;
  onCloseMobile: () => void;
}

export const CompaniesFilterGroup: React.FC<CompaniesFilterGroupProps> = ({
  filters,
  sectionCounts,
  sidebarSearch,
  globalIndustries,
  industriesLoading,
  filterFacets = null,
  isSectionOpen,
  onToggleSection,
  onChangeFilters,
  onSelectIndustryFilter,
  onActivateCompanyDirectory,
  onDomainDirectLookup,
  onCloseMobile,
}) => {
  const [industrySearch, setIndustrySearch] = useState('');
  const q = sidebarSearch.trim().toLowerCase();

  const filteredGlobalIndustries = useMemo(() => {
    const query = (industrySearch || sidebarSearch).trim().toLowerCase();
    if (!query) return globalIndustries;
    return globalIndustries.filter(
      (ind) =>
        ind.fullTitle.toLowerCase().includes(query) ||
        ind.rawTitle.toLowerCase().includes(query) ||
        ind.slug.toLowerCase().includes(query)
    );
  }, [globalIndustries, industrySearch, sidebarSearch]);

  const matchesQuickFilter = (keywords: string, extraMatch = false): boolean => {
    if (!q) return true;
    return extraMatch || keywords.toLowerCase().includes(q);
  };

  const handleToggleIndustrySlug = (slug: string) => {
    const exists = filters.selectedIndustrySlugs.includes(slug);
    const nextSlugs = exists
      ? filters.selectedIndustrySlugs.filter((s) => s !== slug)
      : filters.industryMatchMode === 'primary'
      ? [slug]
      : [...filters.selectedIndustrySlugs, slug];

    onSelectIndustryFilter(nextSlugs);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white px-0.5">
        Companies
      </h3>

      {/* 5. Company Name */}
      {matchesQuickFilter('company name domain website') && (
        <SidebarAccordionCard
          id="company-name"
          label="Company Name"
          selectedCount={sectionCounts['company-name']}
          opened={isSectionOpen('company-name')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Organization or Domain</span>
              <span
                className={`font-mono tabular-nums ${
                  sectionCounts['company-name'] > 0
                    ? 'font-semibold text-sky-600 dark:text-sky-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {sectionCounts['company-name']} selected
              </span>
            </div>
            <input
              type="text"
              value={filters.companyNameFilter}
              onChange={(e) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  companyNameFilter: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  filters.companyNameFilter.includes('.')
                ) {
                  e.preventDefault();
                  onDomainDirectLookup(filters.companyNameFilter);
                  onCloseMobile();
                }
              }}
              placeholder="Filter name or press Enter on domain..."
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
        </SidebarAccordionCard>
      )}

      {/* 6. Industry */}
      {matchesQuickFilter(
        'industry company sector retail software banking healthcare',
        Boolean(q) && filteredGlobalIndustries.length > 0
      ) && (
        <SidebarAccordionCard
          id="industry"
          label="Industry"
          selectedCount={sectionCounts.industry}
          totalOptions={globalIndustries.length || undefined}
          opened={isSectionOpen('industry')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2.5 space-y-3 border-t border-slate-200/60 dark:border-slate-800/60">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Company Industry
                </p>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    filters.selectedIndustrySlugs.length > 0
                      ? 'font-semibold text-sky-600 dark:text-sky-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {filters.selectedIndustrySlugs.length > 0
                    ? `${filters.selectedIndustrySlugs.length}/${
                        globalIndustries.length ||
                        filters.selectedIndustrySlugs.length
                      }`
                    : globalIndustries.length || ''}
                </span>
              </div>
              <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-200/75 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800">
                {(['any', 'primary'] as const).map((mode) => {
                  const active = filters.industryMatchMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        onChangeFilters((prev) => ({
                          ...prev,
                          industryMatchMode: mode,
                          selectedIndustrySlugs:
                            mode === 'primary' &&
                            prev.selectedIndustrySlugs.length > 1
                              ? [prev.selectedIndustrySlugs[0]]
                              : prev.selectedIndustrySlugs,
                        }))
                      }
                      className={`py-1 text-xs font-semibold rounded-md transition-all cursor-pointer capitalize ${
                        active
                          ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={industrySearch}
                onChange={(e) => setIndustrySearch(e.target.value)}
                placeholder="Search for an industry"
                aria-label="Search for an industry"
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
              {industrySearch && (
                <button
                  type="button"
                  onClick={() => setIndustrySearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {filters.selectedIndustrySlugs.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Selected Worldwide Industry (
                  {filters.selectedIndustrySlugs.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {filters.selectedIndustrySlugs.map((slug) => {
                    const found = globalIndustries.find((g) => g.slug === slug);
                    const fullLabel = found ? found.fullTitle : slug;
                    return (
                      <button
                        key={slug}
                        type="button"
                        title={fullLabel}
                        onClick={() => handleToggleIndustrySlug(slug)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer text-left max-w-full overflow-hidden"
                      >
                        <span className="whitespace-nowrap truncate">
                          {truncateIndustry20(fullLabel)}
                        </span>
                        <X className="h-3 w-3 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2 space-y-1">
              {industriesLoading && globalIndustries.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  Loading global industries...
                </p>
              ) : filteredGlobalIndustries.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  No matching industry found.
                </p>
              ) : (
                filteredGlobalIndustries.map((ind) => {
                  const checked = filters.selectedIndustrySlugs.includes(
                    ind.slug
                  );
                  const liveIndCount =
                    filterFacets?.industryCounts?.[ind.slug] ??
                    ind.companyCount;
                  return (
                    <label
                      key={ind.slug}
                      title={ind.fullTitle}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors overflow-hidden ${
                        checked
                          ? 'bg-sky-500/10 text-slate-900 dark:text-white font-semibold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleIndustrySlug(ind.slug)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                        />
                        <span className="whitespace-nowrap truncate">
                          {truncateIndustry20(ind.fullTitle)}
                        </span>
                      </span>
                      {liveIndCount >= 0 && (
                        <span
                          className={`font-mono tabular-nums text-[11px] shrink-0 whitespace-nowrap ${
                            checked
                              ? 'text-sky-600 dark:text-sky-400 font-semibold'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {liveIndCount.toLocaleString()}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Industry Keywords
                </label>
                {countEnteredTerms(filters.industryKeyword) > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                    {countEnteredTerms(filters.industryKeyword)}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={filters.industryKeyword}
                onChange={(e) =>
                  onChangeFilters((prev) => ({
                    ...prev,
                    industryKeyword: e.target.value,
                  }))
                }
                placeholder="e.g., Cybersecurity, Payments, Cloud"
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
          </div>
        </SidebarAccordionCard>
      )}

      {/* 7. Employee Count */}
      {matchesQuickFilter(
        'employee count size headcount 50 200 500 1000 5000 10000',
        EMPLOYEE_RANGE_OPTIONS.some((r) => r.toLowerCase().includes(q))
      ) && (
        <SidebarAccordionCard
          id="employee-count"
          label="Employee Count"
          selectedCount={sectionCounts['employee-count']}
          totalOptions={EMPLOYEE_RANGE_OPTIONS.length}
          opened={isSectionOpen('employee-count')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2 space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
            {EMPLOYEE_RANGE_OPTIONS.map((range) => {
              const checked = filters.employeeRanges.includes(range);
              const bracketCount = filterFacets?.employeeRangeCounts?.[range];
              return (
                <label
                  key={range}
                  className={`flex items-center justify-between gap-2 py-0.5 text-xs font-mono tabular-nums cursor-pointer ${
                    checked
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        onChangeFilters((prev) => ({
                          ...prev,
                          employeeRanges: checked
                            ? prev.employeeRanges.filter((r) => r !== range)
                            : [...prev.employeeRanges, range],
                        }));
                        onActivateCompanyDirectory();
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                    />
                    <span className="truncate">{range}</span>
                  </span>
                  {typeof bracketCount === 'number' && (
                    <span
                      className={`text-[11px] shrink-0 ${
                        checked
                          ? 'text-sky-600 dark:text-sky-400 font-semibold'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {bracketCount.toLocaleString()}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </SidebarAccordionCard>
      )}

      {/* 8. Company Revenue */}
      {matchesQuickFilter(
        'company revenue annual sales turnover million billion $1m $10m $50m $100m $1b $10b',
        COMPANY_REVENUE_RANGES.some((r) => r.toLowerCase().includes(q))
      ) && (
        <SidebarAccordionCard
          id="company-revenue"
          label="Company Revenue"
          selectedCount={sectionCounts['company-revenue']}
          totalOptions={COMPANY_REVENUE_RANGES.length}
          opened={isSectionOpen('company-revenue')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2 space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
            {COMPANY_REVENUE_RANGES.map((revRange) => {
              const checked = filters.revenueRanges.includes(revRange);
              const revCount = filterFacets?.revenueRangeCounts?.[revRange];
              return (
                <label
                  key={revRange}
                  className={`flex items-center justify-between gap-2 py-0.5 text-xs font-mono tabular-nums cursor-pointer ${
                    checked
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        onChangeFilters((prev) => ({
                          ...prev,
                          revenueRanges: checked
                            ? prev.revenueRanges.filter((r) => r !== revRange)
                            : [...prev.revenueRanges, revRange],
                        }));
                        onActivateCompanyDirectory();
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                    />
                    <span className="truncate">{revRange}</span>
                  </span>
                  {typeof revCount === 'number' && (
                    <span
                      className={`text-[11px] shrink-0 ${
                        checked
                          ? 'text-sky-600 dark:text-sky-400 font-semibold'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {revCount.toLocaleString()}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </SidebarAccordionCard>
      )}
    </div>
  );
};
