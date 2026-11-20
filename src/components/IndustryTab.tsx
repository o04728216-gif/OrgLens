import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  Loader2,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  FilterExplorerResponse,
  FilterFacetsResponse,
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
import {
  QuickViewModal,
  type QuickViewTarget,
} from './directory/QuickViewModal';
import { SwipeableTableContainer } from './directory/SwipeableTableContainer';

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
  filterFacets?: FilterFacetsResponse | null;
  coherentTotalCompanies: number;
  globalPage: number;
  onChangeGlobalPage: (page: number) => void;
  isPageCached?: (page: number) => boolean;
  onPrefetchPage?: (page: number) => void;
  onSelectIndustrySlug: (slug: string | null) => void;
  onSelectGlobalCompany: (company: GlobalCompanyItem) => void;
  onPrefetchCompany?: (company: GlobalCompanyItem) => void;
  onSelectDomain: (domain: string) => void;
  onSwitchSessionMode: (mode: SessionMode) => void;
  onFocusDomainInput: () => void;
}

const EMP_SCALE_RANK: Record<string, number> = {
  '10,000+': 1400,
  '5,001 - 10,000': 1200,
  '1,001 - 5,000': 1000,
  '501 - 1,000': 800,
  '201 - 500': 600,
  '51 - 200': 400,
  '1 - 50': 200,
};

const REV_SCALE_RANK: Record<string, number> = {
  '$10B+': 900,
  '$1B - $10B': 780,
  '$500M - $1B': 660,
  '$100M - $500M': 540,
  '$50M - $100M': 420,
  '$10M - $50M': 300,
  '$1M - $10M': 180,
  'Under $1M': 90,
};

function computeClientRelevanceScore(
  comp: GlobalCompanyItem,
  upstreamIdx: number,
  filters: SidebarFiltersState
): number {
  let score = 0;
  const nameQ = filters.companyNameFilter.trim().toLowerCase();
  const indKw = filters.industryKeyword.trim().toLowerCase();
  const locQ = filters.locationQuery.trim().toLowerCase();
  const nameLower = comp.name.toLowerCase();
  const domLower = (comp.domain || '').toLowerCase();

  if (nameQ) {
    if (nameLower === nameQ || domLower === nameQ || domLower === `${nameQ}.com`) {
      score += 60_000;
    } else if (nameLower.startsWith(nameQ) || domLower.startsWith(nameQ)) {
      score += 30_000;
    } else if (nameLower.includes(nameQ) || domLower.includes(nameQ)) {
      score += 12_000;
    }
  }
  if (indKw) {
    const indLower = comp.industry.toLowerCase();
    if (indLower.startsWith(indKw)) score += 8_000;
    else if (indLower.includes(indKw)) score += 4_000;
  }
  if (locQ && comp.location.toLowerCase().includes(locQ)) {
    score += 3_000;
  }

  score += Math.min(8_000, (comp.confirmedEmailCount || 0) * 180);
  if (comp.patternConfidence) score += comp.patternConfidence * 6;
  if (comp.logoUrl) score += 2_200;
  score += EMP_SCALE_RANK[comp.employeeRange] || 150;
  score += REV_SCALE_RANK[comp.revenueRange] || 90;
  score += Math.max(0, 500 - upstreamIdx);
  return score;
}

function formatCompactCatalogTotal(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
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
  filterFacets = null,
  coherentTotalCompanies,
  globalPage,
  onChangeGlobalPage,
  isPageCached,
  onPrefetchPage,
  onSelectIndustrySlug,
  onSelectGlobalCompany,
  onPrefetchCompany,
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
  const [pageTransitionDir, setPageTransitionDir] = useState<1 | -1>(1);
  const pendingPageSnapRef = useRef(false);
  const [quickViewTarget, setQuickViewTarget] = useState<QuickViewTarget | null>(
    null
  );
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
    if (globalDirectory) {
      return {
        title: globalDirectory.industryFullTitle,
        page: globalDirectory.page,
        totalPages: globalDirectory.totalPages,
        totalCompanies: globalDirectory.totalCompanies,
        liveFederatedTotal: globalDirectory.liveFederatedCatalogTotal,
        vaultCount: globalDirectory.vaultCompaniesCount,
        companies: globalDirectory.companies,
      };
    }
    if (filterResult) {
      return {
        title: filterResult.scopeTitle,
        page: filterResult.page,
        totalPages: filterResult.totalPages,
        totalCompanies: filterResult.totalMatchedCompanies,
        liveFederatedTotal: filterResult.liveFederatedCatalogTotal,
        vaultCount: filterResult.vaultCompaniesCount,
        companies: filterResult.companies,
      };
    }
    return null;
  }, [filterResult, globalDirectory]);

  const filteredGlobalCompanies = useMemo(() => {
    if (!activeDirectorySource) return [];
    // Keep ONLY companies with real verified domains — never synthesize slug.com
    let realDomainRows = activeDirectorySource.companies.filter((comp) =>
      Boolean(comp.domain && comp.domain.includes('.'))
    );

    // Apply immediate client-side narrowing ONLY on filter changes (never during pagination turns!)
    const isPagingNow =
      requestedPage !== null ||
      (globalDirectoryLoading && activeDirectorySource.page !== globalPage);

    if (globalDirectoryLoading && !isPagingNow) {
      const nameQ = filters.companyNameFilter.trim().toLowerCase();
      const indQ = filters.industryKeyword.trim().toLowerCase();
      const locQ = filters.locationQuery.trim();
      const hasGeo =
        filters.selectedContinents.length > 0 ||
        filters.selectedCountries.length > 0 ||
        Boolean(locQ);

      realDomainRows = realDomainRows.filter((comp) => {
        if (nameQ) {
          const hay = `${comp.name} ${comp.domain || ''} ${comp.slug || ''}`.toLowerCase();
          if (!hay.includes(nameQ)) return false;
        }
        if (indQ) {
          const indHay = `${comp.industry || ''} ${comp.name}`.toLowerCase();
          if (!indHay.includes(indQ)) return false;
        }
        if (hasGeo) {
          if (
            !matchesGeographyFilter(
              comp.location || '',
              filters.selectedContinents,
              filters.selectedCountries,
              locQ,
              comp.sourceCountrySlug
            )
          ) {
            return false;
          }
        }
        if (
          filters.employeeRanges.length > 0 &&
          comp.employeeRange &&
          !filters.employeeRanges.includes(comp.employeeRange)
        ) {
          return false;
        }
        if (
          filters.revenueRanges.length > 0 &&
          comp.revenueRange &&
          !filters.revenueRanges.includes(comp.revenueRange)
        ) {
          return false;
        }
        return true;
      });
    }

    const sorted =
      sortBy === 'name-asc'
        ? [...realDomainRows].sort((a, b) => a.name.localeCompare(b.name))
        : sortBy === 'website-asc'
        ? [...realDomainRows].sort((a, b) =>
            (a.domain || '').localeCompare(b.domain || '')
          )
        : sortBy === 'location'
        ? [...realDomainRows].sort((a, b) =>
            a.location.localeCompare(b.location)
          )
        : realDomainRows
            .map((comp, idx) => ({
              comp,
              rel: computeClientRelevanceScore(comp, idx, filters),
            }))
            .sort(
              (a, b) => b.rel - a.rel || a.comp.name.localeCompare(b.comp.name)
            )
            .map((entry) => entry.comp);

    return sorted.slice(0, 500);
  }, [
    activeDirectorySource,
    globalDirectoryLoading,
    requestedPage,
    globalPage,
    sortBy,
    filters.companyNameFilter,
    filters.industryKeyword,
    filters.locationQuery,
    filters.selectedContinents,
    filters.selectedCountries,
    filters.employeeRanges,
    filters.revenueRanges,
  ]);

  const effectiveTotalCompanies = useMemo(() => {
    if (coherentTotalCompanies > 0) return coherentTotalCompanies;
    if (filterFacets) return filterFacets.totalMatchedCompanies;
    if (activeDirectorySource) return activeDirectorySource.totalCompanies;
    return 0;
  }, [coherentTotalCompanies, filterFacets, activeDirectorySource]);

  const hasNonIndustryScopeFilters = Boolean(
    filters.selectedContinents.length > 0 ||
      filters.selectedCountries.length > 0 ||
      filters.employeeRanges.length > 0 ||
      filters.revenueRanges.length > 0 ||
      filters.companyNameFilter.trim() ||
      filters.locationQuery.trim() ||
      filters.industryKeyword.trim()
  );

  const allPillCount = useMemo(() => {
    if (!hasNonIndustryScopeFilters) {
      return (
        filterFacets?.liveFederatedCatalogTotal ||
        filterResult?.liveFederatedCatalogTotal ||
        globalDirectory?.liveFederatedCatalogTotal ||
        effectiveTotalCompanies
      );
    }
    if (filters.selectedIndustrySlugs.length === 0) {
      return effectiveTotalCompanies;
    }
    return effectiveTotalCompanies;
  }, [
    hasNonIndustryScopeFilters,
    filters.selectedIndustrySlugs.length,
    filterFacets?.liveFederatedCatalogTotal,
    filterResult?.liveFederatedCatalogTotal,
    globalDirectory?.liveFederatedCatalogTotal,
    effectiveTotalCompanies,
  ]);

  const hasFreeTextSearch = Boolean(
    filters.companyNameFilter.trim() ||
      filters.locationQuery.trim() ||
      filters.industryKeyword.trim()
  );

  const coherentTotalPages = useMemo(() => {
    if (
      activeDirectorySource &&
      (hasFreeTextSearch ||
        (activeDirectorySource.page === globalPage &&
          activeDirectorySource.companies.length < 500))
    ) {
      return Math.max(1, activeDirectorySource.totalPages || 1);
    }
    if (effectiveTotalCompanies === 0) return 1;
    return Math.max(
      1,
      Math.min(20000, Math.ceil(effectiveTotalCompanies / 500))
    );
  }, [hasFreeTextSearch, activeDirectorySource, globalPage, effectiveTotalCompanies]);

  const topIndustriesQuickBar = useMemo(
    () => globalIndustries.slice(0, 8),
    [globalIndustries]
  );

  const isDirectoryBusy = globalDirectoryLoading && !activeDirectorySource;

  const isPaginationLoading =
    !isDirectoryBusy &&
    (requestedPage !== null ||
      (globalDirectoryLoading &&
        Boolean(
          activeDirectorySource && activeDirectorySource.page !== globalPage
        )));

  const targetPaginationPage = requestedPage ?? globalPage;
  const renderedDirectoryPage = activeDirectorySource?.page ?? globalPage;

  useLayoutEffect(() => {
    if (!pendingPageSnapRef.current) return;
    pendingPageSnapRef.current = false;
    scrollToListTop(listTopRef.current, 88, 'instant');
  }, [renderedDirectoryPage]);

  const handleSelectPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(coherentTotalPages, nextPage));
    if (bounded === globalPage && !isPaginationLoading) {
      scrollToListTop(listTopRef.current, 88, 'instant');
      return;
    }
    setPageTransitionDir(bounded >= globalPage ? 1 : -1);
    pendingPageSnapRef.current = true;
    // Instant 0ms swap for already-fetched/prefetched pages — zero loading dim or spinner!
    if (isPageCached?.(bounded)) {
      setRequestedPage(null);
    } else {
      setRequestedPage(bounded);
      // Reposition cleanly without physical scroll-up drag while server fetches the page
      scrollToListTop(listTopRef.current, 88, 'instant');
    }
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

  const compactAllScopeLabel = formatCompactCatalogTotal(allPillCount);

  return (
    <div ref={listTopRef} className="space-y-4 scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white min-w-0">
          <Globe2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>Filter Explorer · Worldwide Companies</span>
          {globalDirectoryLoading && !isPaginationLoading && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Updating...</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
          {(activeDirectorySource || filterFacets) && (
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {activeDirectorySource
                ? `Showing ${filteredGlobalCompanies.length.toLocaleString()} on page ${activeDirectorySource.page.toLocaleString()} (500/page) · `
                : `Page ${globalPage.toLocaleString()} (500/page) · `}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {effectiveTotalCompanies.toLocaleString()}
              </strong>{' '}
              matching
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
              className="min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
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
              className={`min-h-[42px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                  .map((c) => c.websiteUrl || (c.domain ? `https://${c.domain}` : ''))
                  .filter(Boolean)
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
              className={`min-h-[42px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
            Copy any company or website first, or tap a company to reveal Full Names &amp; Emails
          </span>
        </div>
      )}

      {/* Quick Industry Selector Strip */}
      {topIndustriesQuickBar.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onSelectIndustrySlug(null)}
            className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              filters.selectedIndustrySlugs.length === 0
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-sky-500/40'
            }`}
          >
            <span>
              {hasNonIndustryScopeFilters ? 'All Industries' : 'All Worldwide'}
            </span>
            {compactAllScopeLabel &&
              (!hasNonIndustryScopeFilters ||
                filters.selectedIndustrySlugs.length === 0) && (
                <span
                  className={`ml-1.5 font-mono tabular-nums ${
                    filters.selectedIndustrySlugs.length === 0
                      ? 'text-sky-100'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {compactAllScopeLabel}
                </span>
              )}
          </button>

          {topIndustriesQuickBar.map((ind) => {
            const active = filters.selectedIndustrySlugs.includes(ind.slug);
            const liveCount =
              filterFacets?.industryCounts?.[ind.slug] ?? ind.companyCount;
            return (
              <button
                key={ind.slug}
                type="button"
                title={ind.fullTitle}
                onClick={() => onSelectIndustrySlug(ind.slug)}
                className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-sky-600 bg-sky-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-sky-500/40'
                }`}
              >
                <span>{truncateIndustry20(ind.fullTitle)}</span>
                {liveCount >= 0 && (
                  <span
                    className={`ml-1.5 font-mono tabular-nums ${
                      active
                        ? 'text-sky-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {liveCount.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Worldwide Companies: Mobile Touch Cards (md:hidden) + Desktop HTML <table> (hidden md:block) */}
      {isDirectoryBusy ||
      (globalDirectoryLoading && filteredGlobalCompanies.length === 0) ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
          <span>
            {isPaginationLoading
              ? `Loading page ${targetPaginationPage.toLocaleString()} (500 companies/page)...`
              : 'Loading matching worldwide companies...'}
          </span>
        </div>
      ) : filteredGlobalCompanies.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {globalPage > 1
              ? `No additional companies were found on page ${globalPage.toLocaleString()} for this filter.`
              : 'No companies matched this exact combination of Continent, Country, Industry, or Revenue filters.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {globalPage > 1
              ? 'Return to an earlier page or broaden your sidebar filters to inspect more organizations.'
              : 'Adjust your sidebar location, headcount, or revenue selections to broaden the directory.'}
          </p>
          {globalPage > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectPage(globalPage - 1)}
                className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Previous Page ({(globalPage - 1).toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => handleSelectPage(1)}
                className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
              >
                Return to Page 1
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {isPaginationLoading && (
            <PaginationLoadingBanner
              message={`Loading page ${targetPaginationPage.toLocaleString()} of ${coherentTotalPages.toLocaleString()}...`}
              rightMeta="Fetching 500 companies on demand"
            />
          )}
          <motion.div
            key={`companies-page-${renderedDirectoryPage}`}
            initial={{ opacity: 0, y: pageTransitionDir > 0 ? 14 : -10 }}
            animate={{ opacity: isPaginationLoading ? 0.55 : 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            aria-busy={isPaginationLoading}
            className={`relative ${
              isPaginationLoading ? 'pointer-events-none' : ''
            }`}
          >
            {/* Mobile Touch Cards (md:hidden) */}
            <div className="md:hidden space-y-2.5">
            {filteredGlobalCompanies.map((comp) => {
              const companyDomain = comp.domain || '';
              const websiteHref =
                comp.websiteUrl ||
                (companyDomain ? `https://${companyDomain}` : '');
              const nameCopyId = `name:${comp.id}`;
              const webCopyId = `web:${comp.id}`;
              const isNameCopied = copiedKey === nameCopyId;
              const isWebCopied = copiedKey === webCopyId;

              return (
                <div
                  key={comp.id}
                  className="rounded-xl p-3.5 border border-slate-200/85 dark:border-slate-800/85 bg-white/85 dark:bg-slate-950/55 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <CompanyLogoAvatar
                        name={comp.name}
                        logoUrl={comp.logoUrl}
                      />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onTouchStart={() => onPrefetchCompany?.(comp)}
                          onClick={() => onSelectGlobalCompany(comp)}
                          className="font-semibold text-sm text-left text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 hover:underline leading-snug cursor-pointer"
                        >
                          {comp.name}
                        </button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                          <a
                            href={websiteHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sky-700 dark:text-sky-400 inline-flex items-center gap-1"
                          >
                            <span className="truncate max-w-[180px]">
                              {companyDomain}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{comp.location}</span>
                    {comp.industry && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{truncateIndustry20(comp.industry)}</span>
                      </>
                    )}
                    {comp.employeeRange && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {comp.employeeRange} emp
                        </span>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => void triggerRowCopy(nameCopyId, comp.name)}
                      className={`min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        isNameCopied
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isNameCopied ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{isNameCopied ? 'Copied' : 'Name'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void triggerRowCopy(webCopyId, websiteHref)
                      }
                      className={`min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        isWebCopied
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isWebCopied ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{isWebCopied ? 'Copied' : 'Web'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setQuickViewTarget({ kind: 'company', company: comp })
                      }
                      className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                      <span>Quick</span>
                    </button>

                    <button
                      type="button"
                      onTouchStart={() => onPrefetchCompany?.(comp)}
                      onClick={() => onSelectGlobalCompany(comp)}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
                    >
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span>Emails</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Compact & Seamlessly Swipeable Table (hidden md:block) */}
          <SwipeableTableContainer compactHint="Drag left/right, Shift+Scroll, or use arrows to swipe all company columns">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/80 dark:bg-slate-900/80 text-[11px] uppercase tracking-wide font-semibold text-slate-600 dark:text-slate-300">
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
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
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
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
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        setSortBy((s) =>
                          s === 'location' ? 'relevance' : 'location'
                        )
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <span>Location</span>
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Industry
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 px-3 text-right whitespace-nowrap"
                  >
                    Staff
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 px-3 text-right whitespace-nowrap"
                  >
                    Revenue
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 px-3 text-right whitespace-nowrap"
                  >
                    QuickView &amp; Emails
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-xs sm:text-sm">
                {filteredGlobalCompanies.map((comp) => {
                  const companyDomain = comp.domain || '';
                  const websiteHref =
                    comp.websiteUrl ||
                    (companyDomain ? `https://${companyDomain}` : '');
                  const nameCopyId = `name:${comp.id}`;
                  const webCopyId = `web:${comp.id}`;
                  const isNameCopied = copiedKey === nameCopyId;
                  const isWebCopied = copiedKey === webCopyId;

                  return (
                    <tr
                      key={comp.id}
                      className="hover:bg-sky-500/[0.04] dark:hover:bg-sky-400/[0.05] transition-colors duration-150"
                    >
                      <td className="py-2 px-3 whitespace-nowrap max-w-[230px]">
                        <div className="flex items-center gap-2 min-w-0">
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
                          <div className="min-w-0 truncate">
                            <button
                              type="button"
                              onMouseEnter={() => onPrefetchCompany?.(comp)}
                              onClick={() => {
                                const selectedText = window
                                  .getSelection()
                                  ?.toString()
                                  .trim();
                                if (selectedText) return;
                                onSelectGlobalCompany(comp);
                              }}
                              title={comp.name}
                              className="font-semibold text-left text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors cursor-pointer select-text truncate max-w-[145px] block"
                            >
                              {comp.name}
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap max-w-[185px]">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs min-w-0">
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
                            className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 hover:underline underline-offset-4 select-text truncate max-w-[130px]"
                          >
                            <span className="truncate">{companyDomain}</span>
                            <ExternalLink className="h-3 w-3 opacity-75 shrink-0" />
                          </a>
                        </div>
                      </td>

                      <td
                        className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[165px]"
                        title={comp.location}
                      >
                        <span className="block truncate">{comp.location}</span>
                      </td>

                      <td
                        className="py-2 px-3 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[160px]"
                        title={comp.industry}
                      >
                        <span className="block whitespace-nowrap truncate">
                          {truncateIndustry20(comp.industry)}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {comp.employeeRange}
                      </td>

                      <td className="py-2 px-3 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {comp.revenueRange}
                      </td>

                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onMouseEnter={() => onPrefetchCompany?.(comp)}
                            onClick={() =>
                              setQuickViewTarget({
                                kind: 'company',
                                company: comp,
                              })
                            }
                            title={`QuickView ${comp.name}`}
                            aria-label={`QuickView ${comp.name}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:border-sky-500/50 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Quick</span>
                          </button>

                          <button
                            type="button"
                            onMouseEnter={() => onPrefetchCompany?.(comp)}
                            onClick={() => onSelectGlobalCompany(comp)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span>Emails</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SwipeableTableContainer>
          </motion.div>
        </div>
      )}

      {activeDirectorySource && (
        <PaginationControls
          currentPage={globalPage}
          totalPages={coherentTotalPages}
          isLoading={isPaginationLoading}
          targetPage={targetPaginationPage}
          perPageLabel="500/page"
          loadingLabel={`Loading page ${targetPaginationPage.toLocaleString()}...`}
          onSelectPage={handleSelectPage}
          onPrefetchPage={onPrefetchPage}
        />
      )}

      <QuickViewModal
        target={quickViewTarget}
        allSnapshots={allSnapshots}
        onClose={() => setQuickViewTarget(null)}
        onOpenFullCompany={onSelectGlobalCompany}
      />
    </div>
  );
};
