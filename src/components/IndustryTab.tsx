import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Loader2,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type {
  DepartmentCategory,
  FilterExplorerResponse,
  GlobalCompaniesResponse,
  GlobalCompanyItem,
  GlobalIndustryOption,
  SearchResponse,
  SessionMode,
  SidebarFiltersState,
} from '../types';
import { truncateIndustry20 } from '../utils/emailFormulas';
import { matchesGeographyFilter } from '../utils/geographyAndRevenue';

interface IndustryTabProps {
  sessionMode: SessionMode;
  domainResult: SearchResponse | null;
  allSnapshots: Record<string, SearchResponse>;
  isDomainLoading: boolean;
  filterResult: FilterExplorerResponse | null;
  isFilterLoading: boolean;
  filters: SidebarFiltersState;
  globalIndustries: GlobalIndustryOption[];
  globalDirectory: GlobalCompaniesResponse | null;
  globalDirectoryLoading: boolean;
  globalPage: number;
  onChangeGlobalPage: (page: number) => void;
  onSelectIndustrySlug: (slug: string | null) => void;
  onSelectGlobalCompany: (company: GlobalCompanyItem) => void;
  onSelectDomain: (domain: string) => void;
  onSwitchSessionMode: (mode: SessionMode) => void;
  onFocusDomainInput: () => void;
}

const DEPT_BAR_COLORS: Record<DepartmentCategory, string> = {
  Leadership: 'bg-amber-500 dark:bg-amber-400',
  Engineering: 'bg-sky-500 dark:bg-sky-400',
  'Product & Design': 'bg-indigo-500 dark:bg-indigo-400',
  'Research & Data': 'bg-blue-600 dark:bg-blue-400',
  'Sales & GTM': 'bg-emerald-500 dark:bg-emerald-400',
  'Operations & Finance': 'bg-teal-500 dark:bg-teal-400',
  General: 'bg-slate-500 dark:bg-slate-400',
};

const CompanyLogoAvatar: React.FC<{ name: string; logoUrl: string | null }> = ({
  name,
  logoUrl,
}) => {
  const [imgError, setImgError] = useState(false);

  const initials = useMemo(() => {
    const words = name
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return 'CO';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }, [name]);

  if (logoUrl && !imgError) {
    return (
      <div className="h-8 w-8 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white flex items-center justify-center overflow-hidden shrink-0">
        <img
          src={logoUrl}
          alt={`${name} logo`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-6 w-6 object-contain"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="h-8 w-8 rounded-lg border border-slate-200/90 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-display text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0"
    >
      {initials}
    </div>
  );
};

export const IndustryTab: React.FC<IndustryTabProps> = ({
  sessionMode,
  domainResult,
  allSnapshots,
  isDomainLoading,
  filterResult,
  isFilterLoading,
  filters,
  globalIndustries,
  globalDirectory,
  globalDirectoryLoading,
  globalPage,
  onChangeGlobalPage,
  onSelectIndustrySlug,
  onSelectGlobalCompany,
  onSelectDomain,
  onSwitchSessionMode,
  onFocusDomainInput,
}) => {
  const [sortBy, setSortBy] = useState<'relevance' | 'name-asc' | 'location'>(
    'relevance'
  );

  // Active directory source in Filter Explorer Session
  const activeDirectorySource = useMemo(() => {
    if (filterResult) {
      return {
        title: filterResult.scopeTitle,
        page: filterResult.page,
        totalPages: filterResult.totalPages,
        totalCompanies: filterResult.totalMatchedCompanies,
        companies: filterResult.companies,
      };
    }
    if (globalDirectory) {
      return {
        title: globalDirectory.industryFullTitle,
        page: globalDirectory.page,
        totalPages: globalDirectory.totalPages,
        totalCompanies: globalDirectory.totalCompanies,
        companies: globalDirectory.companies,
      };
    }
    return null;
  }, [filterResult, globalDirectory]);

  const filteredGlobalCompanies = useMemo(() => {
    if (!activeDirectorySource) return [];
    const nameQ = filters.companyNameFilter.trim().toLowerCase();
    const indKw = filters.industryKeyword.trim().toLowerCase();

    const list = activeDirectorySource.companies.filter((comp) => {
      if (nameQ && !comp.name.toLowerCase().includes(nameQ)) {
        return false;
      }
      if (
        indKw &&
        !comp.industry.toLowerCase().includes(indKw) &&
        !comp.name.toLowerCase().includes(indKw)
      ) {
        return false;
      }
      if (
        filters.employeeRanges.length > 0 &&
        !filters.employeeRanges.includes(comp.employeeRange)
      ) {
        return false;
      }
      if (
        filters.revenueRanges.length > 0 &&
        !filters.revenueRanges.includes(comp.revenueRange)
      ) {
        return false;
      }
      if (
        !matchesGeographyFilter(
          comp.location,
          filters.selectedContinents,
          filters.selectedCountries,
          filters.locationQuery,
          comp.sourceCountrySlug
        )
      ) {
        return false;
      }
      return true;
    });

    const sorted =
      sortBy === 'name-asc'
        ? [...list].sort((a, b) => a.name.localeCompare(b.name))
        : sortBy === 'location'
        ? [...list].sort((a, b) => a.location.localeCompare(b.location))
        : list;

    return sorted.slice(0, 500);
  }, [
    activeDirectorySource,
    filters.companyNameFilter,
    filters.industryKeyword,
    filters.employeeRanges,
    filters.revenueRanges,
    filters.selectedContinents,
    filters.selectedCountries,
    filters.locationQuery,
    sortBy,
  ]);

  const coherentTotalCompanies = useMemo(() => {
    if (!activeDirectorySource) return 0;
    if (filteredGlobalCompanies.length === 0) return 0;
    if (globalPage === 1 && filteredGlobalCompanies.length < 500) {
      return filteredGlobalCompanies.length;
    }
    return Math.max(
      (globalPage - 1) * 500 + filteredGlobalCompanies.length,
      activeDirectorySource.totalCompanies
    );
  }, [activeDirectorySource, filteredGlobalCompanies.length, globalPage]);

  const coherentTotalPages = useMemo(() => {
    if (coherentTotalCompanies === 0) return 1;
    return Math.max(
      1,
      Math.min(2000, Math.ceil(coherentTotalCompanies / 500))
    );
  }, [coherentTotalCompanies]);

  const visiblePageNumbers = useMemo(() => {
    const totalPages = coherentTotalPages;
    const maxButtons = 9;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, globalPage - 4);
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [coherentTotalPages, globalPage]);

  const topIndustriesQuickBar = useMemo(
    () => globalIndustries.slice(0, 8),
    [globalIndustries]
  );

  const snapshotList = useMemo(
    () =>
      Object.values(allSnapshots).sort(
        (a, b) => b.employees.length - a.employees.length
      ),
    [allSnapshots]
  );

  const isDirectoryBusy =
    (isFilterLoading && !filterResult) ||
    (globalDirectoryLoading && !activeDirectorySource);

  // ==================== SESSION 1: DOMAIN LOOKUP INDUSTRY PROFILE ====================
  if (sessionMode === 'domain') {
    if (isDomainLoading) {
      return (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
          <span>Resolving industry classification and workforce composition...</span>
        </div>
      );
    }

    if (!domainResult || domainResult.employees.length === 0) {
      return (
        <div className="py-12 px-4 text-center">
          <Building2 className="mx-auto h-9 w-9 text-sky-600 dark:text-sky-400 mb-3" />
          <h4 className="text-base font-semibold text-slate-900 dark:text-white">
            Domain Industry Profile awaits a company lookup
          </h4>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Search any company domain above to inspect its industry classification and departmental breakdown, or switch to Filter Explorer to browse millions of companies worldwide.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onFocusDomainInput}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              Type a Company Domain
            </button>
            <button
              type="button"
              onClick={() => onSwitchSessionMode('filter')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              Browse Worldwide Companies (Filter Explorer)
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-slate-200/70 dark:border-slate-800/80">
          <div className="md:col-span-2 space-y-2 min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Domain Lookup · Industry Classification
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-snug break-words">
              {domainResult.industry}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {domainResult.companyName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{domainResult.domain}</span>
              {domainResult.headquarters && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{domainResult.headquarters}</span>
                </>
              )}
              {domainResult.revenueRange && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Est. Revenue: {domainResult.revenueRange}
                  </span>
                </>
              )}
            </div>
            {domainResult.companyDescription && (
              <p className="pt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {domainResult.companyDescription}
              </p>
            )}
          </div>

          <div className="flex flex-col justify-between space-y-3 md:text-right min-w-0">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total Indexed Workforce
              </p>
              <p className="mt-1 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {domainResult.employees.length.toLocaleString()}
              </p>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-words">
              Sector:{' '}
              {domainResult.industryTags[0] || domainResult.industry}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Workforce Function Within {domainResult.companyName}
            </h4>
            <div className="space-y-3.5">
              {domainResult.departmentBreakdown.map((item) => {
                const maxDeptCount = Math.max(
                  1,
                  ...domainResult.departmentBreakdown.map((d) => d.count)
                );
                const widthPct = Math.max(
                  5,
                  Math.round((item.count / maxDeptCount) * 100)
                );
                return (
                  <div key={item.department}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {item.department}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {item.count.toLocaleString()} · {item.percentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: widthPct / 100 }}
                        transition={{
                          duration: 0.3,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        style={{ transformOrigin: 'left' }}
                        className={`h-full w-full rounded-full ${DEPT_BAR_COLORS[item.department]}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Searched Companies in Domain Lookup
              </h4>
              <button
                type="button"
                onClick={() => onSwitchSessionMode('filter')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
              >
                <Globe2 className="h-3.5 w-3.5" />
                Explore Worldwide
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-950/35">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/75 dark:bg-slate-900/75 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                      Company
                    </th>
                    <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                      Industry
                    </th>
                    <th
                      scope="col"
                      className="py-2.5 px-4 text-right whitespace-nowrap"
                    >
                      Employees
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {snapshotList.map((snap) => {
                    const isCurrent = snap.domain === domainResult.domain;
                    return (
                      <tr
                        key={snap.domain}
                        onClick={() => onSelectDomain(snap.domain)}
                        className={`cursor-pointer transition-colors ${
                          isCurrent
                            ? 'bg-sky-500/[0.08] dark:bg-sky-400/[0.08]'
                            : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          <div>{snap.companyName}</div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {snap.domain}
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-4 text-xs text-slate-700 dark:text-slate-300"
                          title={snap.industry}
                        >
                          {snap.industry}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {snap.employees.length.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SESSION 2: FILTER EXPLORER WORLDWIDE COMPANIES ====================
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white min-w-0">
          <Globe2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>Filter Explorer · Worldwide Companies</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
          {(isFilterLoading || globalDirectoryLoading) && (
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating...
            </span>
          )}

          {activeDirectorySource && (
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Showing {filteredGlobalCompanies.length.toLocaleString()} on page{' '}
              {activeDirectorySource.page.toLocaleString()} (500/page) ·{' '}
              {coherentTotalCompanies.toLocaleString()} matching
            </span>
          )}

          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Sort
            </span>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as 'relevance' | 'name-asc' | 'location'
                )
              }
              aria-label="Sort companies"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="relevance">Relevance</option>
              <option value="name-asc">Company Name (A–Z)</option>
              <option value="location">City, State / Country</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quick Industry Selector Strip */}
      {topIndustriesQuickBar.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onSelectIndustrySlug(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              filters.selectedIndustrySlugs.length === 0
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-sky-500/40'
            }`}
          >
            <span>All Worldwide</span>
            <span
              className={`ml-1.5 font-mono tabular-nums ${
                filters.selectedIndustrySlugs.length === 0
                  ? 'text-sky-100'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              3.5M+
            </span>
          </button>

          {topIndustriesQuickBar.map((ind) => {
            const active = filters.selectedIndustrySlugs.includes(ind.slug);
            return (
              <button
                key={ind.slug}
                type="button"
                title={ind.fullTitle}
                onClick={() => onSelectIndustrySlug(ind.slug)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-sky-600 bg-sky-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-sky-500/40'
                }`}
              >
                <span>{truncateIndustry20(ind.fullTitle)}</span>
                {ind.companyCount > 0 && (
                  <span
                    className={`ml-1.5 font-mono tabular-nums ${
                      active
                        ? 'text-sky-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {ind.companyCount.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Worldwide Companies HTML <table> */}
      {isDirectoryBusy ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
          <span>Auto-loading matching worldwide companies...</span>
        </div>
      ) : filteredGlobalCompanies.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No companies matched this exact combination of Continent, Country, Industry, or Revenue filters.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjust your sidebar location, headcount, or revenue selections to broaden the directory.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/65 dark:bg-slate-950/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/80 dark:bg-slate-900/80 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th scope="col" className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((s) =>
                        s === 'name-asc' ? 'relevance' : 'name-asc'
                      )
                    }
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Company Name</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </button>
                </th>
                <th scope="col" className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((s) =>
                        s === 'location' ? 'relevance' : 'location'
                      )
                    }
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>City, State / Country</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </button>
                </th>
                <th scope="col" className="py-3 px-4 whitespace-nowrap">
                  Industry
                </th>
                <th
                  scope="col"
                  className="py-3 px-4 text-right whitespace-nowrap"
                >
                  Employees
                </th>
                <th
                  scope="col"
                  className="py-3 px-4 text-right whitespace-nowrap"
                >
                  Revenue
                </th>
                <th
                  scope="col"
                  className="py-3 px-4 text-right whitespace-nowrap"
                >
                  Domain Lookup
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-sm">
              {filteredGlobalCompanies.map((comp) => (
                <tr
                  key={comp.id}
                  onClick={() => onSelectGlobalCompany(comp)}
                  className="hover:bg-sky-500/[0.05] dark:hover:bg-sky-400/[0.06] transition-colors duration-150 cursor-pointer"
                >
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <CompanyLogoAvatar
                        name={comp.name}
                        logoUrl={comp.logoUrl}
                      />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {comp.name}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {comp.location}
                  </td>

                  <td
                    className="py-2.5 px-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap"
                    title={comp.industry}
                  >
                    <span className="block whitespace-nowrap truncate">
                      {truncateIndustry20(comp.industry)}
                    </span>
                  </td>

                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {comp.employeeRange}
                  </td>

                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {comp.revenueRange}
                  </td>

                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGlobalCompany(comp);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>Open Full Roster</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Numbered Pagination (< 1 2 3 4 5 6 7 8 9 >) */}
      {activeDirectorySource && activeDirectorySource.totalPages > 1 && (
        <div className="pt-2 flex items-center justify-center gap-1 flex-wrap">
          <button
            type="button"
            disabled={globalPage <= 1 || isFilterLoading || globalDirectoryLoading}
            onClick={() => onChangeGlobalPage(globalPage - 1)}
            aria-label="Previous page"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {visiblePageNumbers.map((p) => {
            const active = p === globalPage;
            return (
              <button
                key={p}
                type="button"
                disabled={isFilterLoading || globalDirectoryLoading}
                onClick={() => onChangeGlobalPage(p)}
                className={`inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-lg text-xs font-mono tabular-nums font-semibold border transition-colors cursor-pointer ${
                  active
                    ? 'border-sky-600 bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            type="button"
            disabled={
              globalPage >= activeDirectorySource.totalPages ||
              isFilterLoading ||
              globalDirectoryLoading
            }
            onClick={() => onChangeGlobalPage(globalPage + 1)}
            aria-label="Next page"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
