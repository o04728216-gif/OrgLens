import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Users,
} from 'lucide-react';
import type {
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
import { copyTextToClipboard } from '../utils/offlineStorage';
import { scrollToListTop } from '../utils/scrollUtils';
import { CompanyLogoAvatar } from './directory/CompanyLogoAvatar';
import { DomainIndustryProfile } from './directory/DomainIndustryProfile';
import {
  PaginationControls,
  PaginationLoadingBanner,
} from './directory/PaginationControls';

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
  const [sortBy, setSortBy] = useState<
    'relevance' | 'name-asc' | 'website-asc' | 'location'
  >('relevance');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAllCompaniesCount, setCopiedAllCompaniesCount] = useState<
    number | null
  >(null);
  const [copiedAllWebsitesCount, setCopiedAllWebsitesCount] = useState<
    number | null
  >(null);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFilterLoading && !globalDirectoryLoading) {
      setRequestedPage(null);
    }
  }, [isFilterLoading, globalDirectoryLoading]);

  const triggerRowCopy = async (key: string, value: string) => {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    }
  };

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
        : sortBy === 'website-asc'
        ? [...list].sort((a, b) =>
            (a.domain || `${a.slug}.com`).localeCompare(
              b.domain || `${b.slug}.com`
            )
          )
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

  const topIndustriesQuickBar = useMemo(
    () => globalIndustries.slice(0, 8),
    [globalIndustries]
  );

  const isDirectoryBusy =
    (isFilterLoading && !filterResult) ||
    (globalDirectoryLoading && !activeDirectorySource);

  const isPaginationLoading =
    !isDirectoryBusy &&
    (isFilterLoading || globalDirectoryLoading) &&
    (requestedPage !== null ||
      Boolean(
        activeDirectorySource && activeDirectorySource.page !== globalPage
      ));

  const targetPaginationPage = requestedPage ?? globalPage;

  const handleSelectPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(coherentTotalPages, nextPage));
    if (bounded === globalPage && !isPaginationLoading) {
      scrollToListTop(listTopRef.current);
      return;
    }
    setRequestedPage(bounded);
    scrollToListTop(listTopRef.current);
    onChangeGlobalPage(bounded);
  };

  if (sessionMode === 'domain') {
    return (
      <DomainIndustryProfile
        domainResult={domainResult}
        allSnapshots={allSnapshots}
        isDomainLoading={isDomainLoading}
        onSelectDomain={onSelectDomain}
        onSwitchSessionMode={onSwitchSessionMode}
        onFocusDomainInput={onFocusDomainInput}
      />
    );
  }

  return (
    <div ref={listTopRef} className="space-y-4 scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white min-w-0">
          <Globe2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>Filter Explorer · Worldwide Companies</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
          {(isFilterLoading || globalDirectoryLoading) && (
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-semibold">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isPaginationLoading
                ? `Loading page ${targetPaginationPage.toLocaleString()}...`
                : 'Updating...'}
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
                  e.target.value as
                    | 'relevance'
                    | 'name-asc'
                    | 'website-asc'
                    | 'location'
                )
              }
              aria-label="Sort companies"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="relevance">Relevance</option>
              <option value="name-asc">Company Name (A–Z)</option>
              <option value="website-asc">Website (A–Z)</option>
              <option value="location">City, State / Country</option>
            </select>
          </div>
        </div>
      </div>

      {/* Copy-First Bulk Toolbar */}
      {filteredGlobalCompanies.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const text = filteredGlobalCompanies
                  .map((c) => c.name)
                  .join('\n');
                const ok = await copyTextToClipboard(text);
                if (ok) {
                  setCopiedAllCompaniesCount(filteredGlobalCompanies.length);
                  window.setTimeout(
                    () => setCopiedAllCompaniesCount(null),
                    2400
                  );
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                copiedAllCompaniesCount !== null
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
              }`}
            >
              {copiedAllCompaniesCount !== null ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied {copiedAllCompaniesCount.toLocaleString()} Companies
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Company List ({filteredGlobalCompanies.length.toLocaleString()})
                </>
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                const text = filteredGlobalCompanies
                  .map(
                    (c) =>
                      c.websiteUrl || `https://${c.domain || `${c.slug}.com`}`
                  )
                  .join('\n');
                const ok = await copyTextToClipboard(text);
                if (ok) {
                  setCopiedAllWebsitesCount(filteredGlobalCompanies.length);
                  window.setTimeout(
                    () => setCopiedAllWebsitesCount(null),
                    2400
                  );
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                copiedAllWebsitesCount !== null
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {copiedAllWebsitesCount !== null ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied {copiedAllWebsitesCount.toLocaleString()} Websites
                </>
              ) : (
                <>
                  <Globe2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  Copy Website List ({filteredGlobalCompanies.length.toLocaleString()})
                </>
              )}
            </button>
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            Copy any company or website first, or click a company name to view Full Names &amp; Emails
          </span>
        </div>
      )}

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

      {isPaginationLoading && (
        <PaginationLoadingBanner
          message={`Loading page ${targetPaginationPage.toLocaleString()} of ${coherentTotalPages.toLocaleString()}...`}
          rightMeta="Fetching next 500 companies"
        />
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
        <div className="relative rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/65 dark:bg-slate-950/40">
          {isPaginationLoading && (
            <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-md bg-white/95 dark:bg-slate-900/95 border border-sky-500/40 shadow-sm text-xs font-semibold text-slate-900 dark:text-white">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
                <span>
                  Loading page {targetPaginationPage.toLocaleString()}...
                </span>
              </div>
            </div>
          )}
          <div
            className={`overflow-x-auto rounded-xl transition-opacity duration-150 ${
              isPaginationLoading
                ? 'opacity-45 pointer-events-none'
                : 'opacity-100'
            }`}
          >
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
                          s === 'website-asc' ? 'relevance' : 'website-asc'
                        )
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <span>Website</span>
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
                    Names &amp; Emails
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-sm">
                {filteredGlobalCompanies.map((comp) => {
                  const companyDomain = comp.domain || `${comp.slug}.com`;
                  const websiteHref =
                    comp.websiteUrl || `https://${companyDomain}`;
                  const nameCopyId = `name:${comp.id}`;
                  const webCopyId = `web:${comp.id}`;
                  const isNameCopied = copiedKey === nameCopyId;
                  const isWebCopied = copiedKey === webCopyId;

                  return (
                    <tr
                      key={comp.id}
                      className="hover:bg-sky-500/[0.04] dark:hover:bg-sky-400/[0.05] transition-colors duration-150"
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <CompanyLogoAvatar
                            name={comp.name}
                            logoUrl={comp.logoUrl}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void triggerRowCopy(nameCopyId, comp.name);
                            }}
                            title={`Copy "${comp.name}" first`}
                            aria-label={`Copy company name ${comp.name}`}
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-md border transition-colors cursor-pointer shrink-0 ${
                              isNameCopied
                                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-500/40'
                            }`}
                          >
                            {isNameCopied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const selectedText = window
                                .getSelection()
                                ?.toString()
                                .trim();
                              if (selectedText) return;
                              onSelectGlobalCompany(comp);
                            }}
                            title={`Click to view all Full Names & Emails at ${comp.name}`}
                            className="font-semibold text-left text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors cursor-pointer select-text"
                          >
                            {comp.name}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void triggerRowCopy(webCopyId, websiteHref);
                            }}
                            title={`Copy ${websiteHref} first`}
                            aria-label={`Copy website link ${websiteHref}`}
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-md border transition-colors cursor-pointer shrink-0 ${
                              isWebCopied
                                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-500/40'
                            }`}
                          >
                            {isWebCopied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                          <div>
                            <a
                              href={websiteHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                const selectedText = window
                                  .getSelection()
                                  ?.toString()
                                  .trim();
                                if (selectedText) {
                                  e.preventDefault();
                                }
                              }}
                              title={`Visit ${websiteHref}`}
                              className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 hover:underline underline-offset-4 select-text"
                            >
                              <span>{companyDomain}</span>
                              <ExternalLink className="h-3 w-3 opacity-75 shrink-0" />
                            </a>
                          </div>
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
                          onClick={() => onSelectGlobalCompany(comp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>View Emails</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeDirectorySource && (
        <PaginationControls
          currentPage={globalPage}
          totalPages={coherentTotalPages}
          isLoading={isPaginationLoading}
          targetPage={targetPaginationPage}
          perPageLabel="500/page"
          onSelectPage={handleSelectPage}
        />
      )}
    </div>
  );
};
