import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import type {
  EmployeeRecord,
  FilterExplorerResponse,
  GlobalCompanyItem,
  SearchResponse,
  SessionMode,
  SidebarFiltersState,
} from '../types';
import {
  applyExcelEmailFormula,
  getExcelFormulaDefinition,
} from '../utils/emailFormulas';
import { copyTextToClipboard, exportEmployeesToCsv } from '../utils/offlineStorage';
import { scrollToListTop } from '../utils/scrollUtils';

interface EmployeeTableWidgetProps {
  sessionMode: SessionMode;
  domainResult: SearchResponse | null;
  isDomainLoading: boolean;
  loadingDomain: string;
  filterResult: FilterExplorerResponse | null;
  isFilterLoading: boolean;
  filters: SidebarFiltersState;
  onSwitchToFilterSession: () => void;
  onFocusDomainInput: () => void;
  onInspectDomainFromFilter?: (domain: string) => void;
  filterSelectedCompany?: GlobalCompanyItem | null;
  filterCompanyResult?: SearchResponse | null;
  isFilterCompanyLoading?: boolean;
  filterCompanyError?: string | null;
  onBackToCompaniesList?: () => void;
  onSelectCompanyFromFilterContact?: (company: {
    slug: string;
    name: string;
    domain: string;
  }) => void;
  globalPage?: number;
  onChangeGlobalPage?: (page: number) => void;
}

interface ComputedRow extends EmployeeRecord {
  resolvedEmail: string;
  resolvedAccuracy: number;
  displayRank: number;
}

const CONTACTS_PER_PAGE = 500;

function getAccuracyTierLabel(pct: number): {
  label: string;
  colorClass: string;
} {
  if (pct >= 90) {
    return {
      label: 'Verified',
      colorClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (pct >= 80) {
    return {
      label: 'High',
      colorClass: 'text-sky-700 dark:text-sky-400',
    };
  }
  return {
    label: 'Estimated',
    colorClass: 'text-amber-700 dark:text-amber-400',
  };
}

export const EmployeeTableWidget: React.FC<EmployeeTableWidgetProps> = ({
  sessionMode,
  domainResult,
  isDomainLoading,
  loadingDomain,
  filterResult,
  isFilterLoading,
  filters,
  onSwitchToFilterSession,
  onFocusDomainInput,
  onInspectDomainFromFilter,
  filterSelectedCompany = null,
  filterCompanyResult = null,
  isFilterCompanyLoading = false,
  filterCompanyError = null,
  onBackToCompaniesList,
  onSelectCompanyFromFilterContact,
  globalPage = 1,
  onChangeGlobalPage,
}) => {
  const [domainLocalQuery, setDomainLocalQuery] = useState('');
  const [filterLocalQuery, setFilterLocalQuery] = useState('');
  const [filterCompanyLocalQuery, setFilterCompanyLocalQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [transitioningPage, setTransitioningPage] = useState<number | null>(
    null
  );
  const [requestedServerPage, setRequestedServerPage] = useState<number | null>(
    null
  );
  const [copiedNamesCount, setCopiedNamesCount] = useState<number | null>(null);
  const [copiedEmailsCount, setCopiedEmailsCount] = useState<number | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [copiedHeaderMeta, setCopiedHeaderMeta] = useState<
    'name' | 'website' | null
  >(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const pageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pageTimerRef.current !== null) {
        window.clearTimeout(pageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFilterLoading) {
      setRequestedServerPage(null);
    }
  }, [isFilterLoading]);

  const isViewingFilterCompany =
    sessionMode === 'filter' && Boolean(filterSelectedCompany);

  // Active single-company SearchResponse (either Domain Lookup OR a clicked company inside Filter Explorer)
  const activeSingleCompanyResult =
    sessionMode === 'domain'
      ? domainResult
      : isViewingFilterCompany
      ? filterCompanyResult
      : null;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    sessionMode,
    domainResult?.domain,
    filterSelectedCompany?.slug,
    filterCompanyResult?.domain,
    filterResult?.fetchedAt,
    filters.contactSearch,
    filters.roleKeyword,
    filters.seniorities,
    filters.departments,
    filters.minAccuracy,
    filters.maxAccuracy,
  ]);

  useEffect(() => {
    setFilterCompanyLocalQuery('');
  }, [filterSelectedCompany?.slug]);

  const localQuery =
    sessionMode === 'domain'
      ? domainLocalQuery
      : isViewingFilterCompany
      ? filterCompanyLocalQuery
      : filterLocalQuery;

  const setLocalQuery = (val: string) => {
    if (sessionMode === 'domain') {
      setDomainLocalQuery(val);
    } else if (isViewingFilterCompany) {
      setFilterCompanyLocalQuery(val);
    } else {
      setFilterLocalQuery(val);
    }
    setCurrentPage(1);
  };

  // Detected corporate format for either Domain Lookup or a clicked Filter Explorer company
  const domainFormulaDef = useMemo(() => {
    if (!activeSingleCompanyResult) return null;
    return getExcelFormulaDefinition(
      activeSingleCompanyResult.emailPattern.detectedFormulaId
    );
  }, [activeSingleCompanyResult]);

  // Compute active rows cleanly separated by mode (Domain Lookup, Clicked Filter Company, or Multi-Company Filter Cohort)
  const filteredEmployees = useMemo<ComputedRow[]>(() => {
    const qLocal = localQuery.trim().toLowerCase();

    if (sessionMode === 'domain' || isViewingFilterCompany) {
      if (!activeSingleCompanyResult) return [];
      const detectedId =
        activeSingleCompanyResult.emailPattern.detectedFormulaId;
      const formulaId =
        isViewingFilterCompany && filters.emailFormulaOverride !== 'auto'
          ? filters.emailFormulaOverride
          : detectedId;

      const rows = activeSingleCompanyResult.employees
        .map((emp) => {
          const resolvedEmail =
            formulaId === detectedId && emp.email
              ? emp.email
              : applyExcelEmailFormula(
                  emp.fullName,
                  activeSingleCompanyResult.domain,
                  formulaId
                );
          return {
            ...emp,
            resolvedEmail,
            resolvedAccuracy: emp.emailAccuracy,
            displayRank: emp.rank,
          };
        })
        .filter((emp) => {
          if (!qLocal) return true;
          return (
            emp.fullName.toLowerCase().includes(qLocal) ||
            emp.resolvedEmail.toLowerCase().includes(qLocal) ||
            emp.jobTitle.toLowerCase().includes(qLocal)
          );
        });

      return rows.map((row, index) => ({
        ...row,
        displayRank: qLocal ? index + 1 : row.rank,
      }));
    }

    // Filter Explorer Cohort: uses live filterResult + instant client filter reactivity
    if (!filterResult) return [];
    const qContact = filters.contactSearch.trim().toLowerCase();
    const qRole = filters.roleKeyword.trim().toLowerCase();

    const rows = filterResult.employees
      .map((emp) => {
        const resolvedEmail =
          filters.emailFormulaOverride === 'auto'
            ? emp.email
            : applyExcelEmailFormula(
                emp.fullName,
                emp.domain,
                filters.emailFormulaOverride
              );
        const resolvedAccuracy =
          filters.emailFormulaOverride === 'auto'
            ? emp.emailAccuracy
            : emp.email === resolvedEmail
            ? emp.emailAccuracy
            : Math.max(62, emp.emailAccuracy);

        return {
          ...emp,
          resolvedEmail,
          resolvedAccuracy,
          displayRank: emp.rank,
        };
      })
      .filter((emp) => {
        if (
          emp.resolvedAccuracy < filters.minAccuracy ||
          emp.resolvedAccuracy > filters.maxAccuracy
        ) {
          return false;
        }
        if (
          filters.seniorities.length > 0 &&
          !filters.seniorities.includes(emp.seniority)
        ) {
          return false;
        }
        if (
          filters.departments.length > 0 &&
          !filters.departments.includes(emp.department)
        ) {
          return false;
        }
        if (qRole && !emp.jobTitle.toLowerCase().includes(qRole)) {
          return false;
        }
        if (
          qContact &&
          !emp.fullName.toLowerCase().includes(qContact) &&
          !emp.resolvedEmail.toLowerCase().includes(qContact) &&
          !(emp.companyName || '').toLowerCase().includes(qContact)
        ) {
          return false;
        }
        if (
          qLocal &&
          !emp.fullName.toLowerCase().includes(qLocal) &&
          !emp.resolvedEmail.toLowerCase().includes(qLocal) &&
          !emp.jobTitle.toLowerCase().includes(qLocal) &&
          !(emp.companyName || '').toLowerCase().includes(qLocal)
        ) {
          return false;
        }
        return true;
      });

    return rows.map((row, index) => ({
      ...row,
      displayRank: index + 1,
    }));
  }, [
    sessionMode,
    isViewingFilterCompany,
    activeSingleCompanyResult,
    filterResult,
    localQuery,
    filters.contactSearch,
    filters.roleKeyword,
    filters.seniorities,
    filters.departments,
    filters.minAccuracy,
    filters.maxAccuracy,
    filters.emailFormulaOverride,
  ]);

  const totalCompanyBatches = Math.max(1, filterResult?.totalPages || 1);
  const activeCompanyBatch = Math.min(
    Math.max(1, globalPage),
    totalCompanyBatches
  );

  const localTotalPages = Math.max(
    1,
    Math.ceil(filteredEmployees.length / CONTACTS_PER_PAGE)
  );
  const useServerBatchPagination =
    sessionMode === 'filter' &&
    !isViewingFilterCompany &&
    localTotalPages <= 1 &&
    totalCompanyBatches > 1 &&
    Boolean(onChangeGlobalPage);

  const totalPages = useServerBatchPagination
    ? totalCompanyBatches
    : localTotalPages;

  const safePage = useServerBatchPagination
    ? activeCompanyBatch
    : Math.min(currentPage, totalPages);

  const pageStartIndex = useServerBatchPagination
    ? 0
    : (safePage - 1) * CONTACTS_PER_PAGE;

  const displayedEmployees = useMemo(
    () =>
      filteredEmployees.slice(
        pageStartIndex,
        pageStartIndex + CONTACTS_PER_PAGE
      ),
    [filteredEmployees, pageStartIndex]
  );

  const visiblePageNumbers = useMemo(() => {
    const maxButtons = 9;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, safePage - 4);
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, safePage]);

  const isServerBatchLoading =
    sessionMode === 'filter' &&
    !isViewingFilterCompany &&
    isFilterLoading &&
    (requestedServerPage !== null ||
      Boolean(filterResult && filterResult.page !== globalPage));

  const isPaginationLoading = isServerBatchLoading || transitioningPage !== null;

  const targetCompanyBatch = requestedServerPage ?? activeCompanyBatch;
  const targetPaginationPage = useServerBatchPagination
    ? targetCompanyBatch
    : transitioningPage ?? safePage;

  const handleSelectCompanyBatch = (nextBatch: number) => {
    if (!onChangeGlobalPage) return;
    const bounded = Math.max(1, Math.min(totalCompanyBatches, nextBatch));
    scrollToListTop(listTopRef.current);
    if (bounded === globalPage && !isServerBatchLoading) return;
    setRequestedServerPage(bounded);
    setCurrentPage(1);
    onChangeGlobalPage(bounded);
  };

  const handleSelectContactsPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(totalPages, nextPage));
    scrollToListTop(listTopRef.current);

    if (useServerBatchPagination && onChangeGlobalPage) {
      handleSelectCompanyBatch(bounded);
      return;
    }

    if (bounded === safePage && transitioningPage === null) return;
    if (pageTimerRef.current !== null) {
      window.clearTimeout(pageTimerRef.current);
    }
    setTransitioningPage(bounded);
    pageTimerRef.current = window.setTimeout(() => {
      setCurrentPage(bounded);
      setTransitioningPage(null);
      pageTimerRef.current = null;
    }, 220);
  };

  const coherentTotalContacts = useMemo(() => {
    if (sessionMode === 'domain' || isViewingFilterCompany) {
      return filteredEmployees.length;
    }
    if (!filterResult) return 0;
    if (
      filterResult.totalMatchedCompanies === 0 ||
      filteredEmployees.length === 0
    ) {
      return 0;
    }
    const serverLoaded = filterResult.employees.length;
    const baseTotal = filterResult.totalMatchedContacts || serverLoaded;
    if (serverLoaded === 0) return baseTotal;
    const ratio = filteredEmployees.length / serverLoaded;
    return Math.max(filteredEmployees.length, Math.round(baseTotal * ratio));
  }, [sessionMode, isViewingFilterCompany, filterResult, filteredEmployees.length]);

  const handleCopyFullNameList = async () => {
    if (filteredEmployees.length === 0) return;
    const namesOnly = filteredEmployees.map((emp) => emp.fullName).join('\n');
    const ok = await copyTextToClipboard(namesOnly);
    if (ok) {
      setCopiedNamesCount(filteredEmployees.length);
      window.setTimeout(() => setCopiedNamesCount(null), 2600);
    }
  };

  const handleCopyEmailList = async () => {
    const emailsOnly = filteredEmployees
      .map((emp) => emp.resolvedEmail)
      .filter(Boolean)
      .join('\n');
    if (!emailsOnly) return;
    const ok = await copyTextToClipboard(emailsOnly);
    if (ok) {
      const validEmailCount = filteredEmployees.filter((emp) =>
        Boolean(emp.resolvedEmail)
      ).length;
      setCopiedEmailsCount(validEmailCount);
      window.setTimeout(() => setCopiedEmailsCount(null), 2600);
    }
  };

  const handleCopySingleEmail = async (id: string, email: string) => {
    if (!email) return;
    const ok = await copyTextToClipboard(email);
    if (ok) {
      setCopiedRowId(id);
      window.setTimeout(() => setCopiedRowId(null), 1800);
    }
  };

  const isInitialLoading =
    sessionMode === 'domain'
      ? isDomainLoading
      : isViewingFilterCompany
      ? isFilterCompanyLoading
      : isFilterLoading && !filterResult;

  const selectedCompanyDomain =
    activeSingleCompanyResult?.domain ||
    filterSelectedCompany?.domain ||
    (filterSelectedCompany?.slug ? `${filterSelectedCompany.slug}.com` : '');
  const selectedCompanyWebsiteUrl =
    filterSelectedCompany?.websiteUrl ||
    (selectedCompanyDomain ? `https://${selectedCompanyDomain}` : '');

  const renderFilterCompanyBackBar = () => {
    if (!isViewingFilterCompany || !filterSelectedCompany) return null;
    const displayName =
      activeSingleCompanyResult?.companyName || filterSelectedCompany.name;

    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {onBackToCompaniesList && (
            <button
              type="button"
              onClick={onBackToCompaniesList}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-slate-800 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Companies List
            </button>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {displayName}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyTextToClipboard(displayName);
                  if (ok) {
                    setCopiedHeaderMeta('name');
                    window.setTimeout(() => setCopiedHeaderMeta(null), 1800);
                  }
                }}
                title={`Copy "${displayName}"`}
                aria-label={`Copy ${displayName}`}
                className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer shrink-0"
              >
                {copiedHeaderMeta === 'name' ? (
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>

              {selectedCompanyDomain && (
                <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(
                        selectedCompanyWebsiteUrl
                      );
                      if (ok) {
                        setCopiedHeaderMeta('website');
                        window.setTimeout(
                          () => setCopiedHeaderMeta(null),
                          1800
                        );
                      }
                    }}
                    title={`Copy ${selectedCompanyWebsiteUrl}`}
                    aria-label={`Copy ${selectedCompanyWebsiteUrl}`}
                    className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedHeaderMeta === 'website' ? (
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <a
                    href={selectedCompanyWebsiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline underline-offset-4"
                  >
                    <span>{selectedCompanyDomain}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {activeSingleCompanyResult?.headquarters ||
                filterSelectedCompany.location}
              {(activeSingleCompanyResult?.industry ||
                filterSelectedCompany.industry) &&
                ` · ${
                  activeSingleCompanyResult?.industry ||
                  filterSelectedCompany.industry
                }`}
            </p>
          </div>
        </div>
      </div>
    );
  };

  if (isInitialLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        {renderFilterCompanyBackBar()}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {sessionMode === 'domain' || isViewingFilterCompany ? (
              <>
                Indexing full roster, MX mail servers, and corporate email format
                for{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {isViewingFilterCompany
                    ? filterSelectedCompany?.name || 'company'
                    : loadingDomain || 'company'}
                </strong>
                ...
              </>
            ) : (
              <>
                Auto-loading live contacts, corporate emails, and job titles
                matching your active filters...
              </>
            )}
          </span>
          <span className="font-mono tabular-nums">
            Ranking Most Important → Least Important
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/60 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 w-14">Rank</th>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Email Address</th>
                <th className="py-3 px-4">Job Title</th>
                <th className="py-3 px-4 w-32 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {Array.from({ length: 8 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-3 px-4">
                    <div className="h-4 w-7 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="ml-auto h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Domain Lookup Session Empty State (no domain autofilled on boot!)
  if (sessionMode === 'domain' && !domainResult) {
    return (
      <div className="py-12 px-4 text-center">
        <Users className="mx-auto h-9 w-9 text-sky-600 dark:text-sky-400 mb-3" />
        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
          Enter any company domain above to extract Full Names, Emails &amp; Job Titles
        </h4>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Domain Lookup detects the organization&apos;s verified email format, calculates accuracy scores, and ranks every contact from executive leadership to entry-level roles.
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
            onClick={onSwitchToFilterSession}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            Open Filter Explorer
          </button>
        </div>
      </div>
    );
  }

  if (isViewingFilterCompany && filterCompanyError && !activeSingleCompanyResult) {
    return (
      <div className="space-y-4">
        {renderFilterCompanyBackBar()}
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {filterCompanyError}
          </p>
          {onBackToCompaniesList && (
            <button
              type="button"
              onClick={onBackToCompaniesList}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Companies List
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={listTopRef} className="space-y-4 scroll-mt-24">
      {renderFilterCompanyBackBar()}

      {/* Top Session Metadata Line */}
      {(sessionMode === 'domain' || isViewingFilterCompany) &&
      activeSingleCompanyResult ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 px-1">
          <span className="font-semibold text-slate-900 dark:text-white">
            Detected Format:{' '}
            {domainFormulaDef?.label ||
              activeSingleCompanyResult.emailPattern.formulaLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
            {activeSingleCompanyResult.emailPattern.patternConfidence}% Pattern
            Accuracy
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {activeSingleCompanyResult.emailPattern.mxVerified
              ? `MX Verified (${activeSingleCompanyResult.emailPattern.mxProvider})`
              : 'Standard Domain Routing'}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 px-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            {onBackToCompaniesList && (
              <button
                type="button"
                onClick={onBackToCompaniesList}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer mr-1 whitespace-nowrap"
              >
                <Building2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                Companies List
              </button>
            )}
            <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
              Filter Explorer:
            </span>
            <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
              {coherentTotalContacts.toLocaleString()} Total Contacts
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {(filterResult?.totalMatchedCompanies || 0).toLocaleString()}{' '}
              Matching Companies
            </span>
            {totalCompanyBatches > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  Company Batch {activeCompanyBatch.toLocaleString()} of{' '}
                  {totalCompanyBatches.toLocaleString()} (
                  {filteredEmployees.length.toLocaleString()} Contacts from{' '}
                  {(filterResult?.companies.length || 0).toLocaleString()} Orgs)
                </span>
              </>
            )}
          </div>

          {isFilterLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 shrink-0">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Auto-updating filters...
            </span>
          )}
        </div>
      )}

      {/* Toolbar: Search Input + Copy Full Name List + Copy Email List + Export CSV */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={
              (sessionMode === 'domain' || isViewingFilterCompany) &&
              activeSingleCompanyResult
                ? `Search ${activeSingleCompanyResult.employees.length.toLocaleString()} names, titles, or @${activeSingleCompanyResult.domain} emails...`
                : 'Refine filtered names, emails, job titles, or companies...'
            }
            aria-label="Filter full names, emails, and job titles"
            className="w-full pl-9 pr-8 py-2 text-base sm:text-sm rounded-lg bg-white/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
          />
          {localQuery && (
            <button
              type="button"
              onClick={() => setLocalQuery('')}
              aria-label="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Domain Lookup Only: Copy Full Name List & Copy Email List */}
          {sessionMode === 'domain' && (
            <>
              <button
                type="button"
                disabled={filteredEmployees.length === 0}
                onClick={() => void handleCopyFullNameList()}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  copiedNamesCount !== null
                    ? 'bg-emerald-600 text-white'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
                }`}
              >
                {copiedNamesCount !== null ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied {copiedNamesCount.toLocaleString()} Full Names
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Full Name List ({filteredEmployees.length.toLocaleString()})
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={filteredEmployees.length === 0}
                onClick={() => void handleCopyEmailList()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  copiedEmailsCount !== null
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {copiedEmailsCount !== null ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied {copiedEmailsCount.toLocaleString()} Emails
                  </>
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5" />
                    Copy Email List ({filteredEmployees.length.toLocaleString()})
                  </>
                )}
              </button>
            </>
          )}

          {/* Filter Explorer Multi-Batch Stepper: Load next/previous 500-company batch on demand */}
          {sessionMode === 'filter' &&
            !isViewingFilterCompany &&
            totalCompanyBatches > 1 &&
            onChangeGlobalPage && (
              <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60">
                <button
                  type="button"
                  disabled={activeCompanyBatch <= 1 || isServerBatchLoading}
                  onClick={() =>
                    handleSelectCompanyBatch(activeCompanyBatch - 1)
                  }
                  title="Load previous 500-company batch"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev Batch
                </button>
                <span className="px-2 text-xs font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400 whitespace-nowrap">
                  Batch {(isServerBatchLoading
                    ? targetCompanyBatch
                    : activeCompanyBatch
                  ).toLocaleString()}{' '}
                  / {totalCompanyBatches.toLocaleString()}
                </span>
                <button
                  type="button"
                  disabled={
                    activeCompanyBatch >= totalCompanyBatches ||
                    isServerBatchLoading
                  }
                  onClick={() =>
                    handleSelectCompanyBatch(activeCompanyBatch + 1)
                  }
                  title="Load next 500-company batch"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
                >
                  Next Batch
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

          {/* Export CSV */}
          {filteredEmployees.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportEmployeesToCsv(
                  filteredEmployees.map((emp) => ({
                    ...emp,
                    rank: emp.displayRank,
                    email: emp.resolvedEmail,
                    emailAccuracy: emp.resolvedAccuracy,
                  })),
                  (sessionMode === 'domain' || isViewingFilterCompany) &&
                    activeSingleCompanyResult
                    ? activeSingleCompanyResult.domain
                    : 'filtered-contacts',
                  sessionMode === 'domain'
                    ? 'auto'
                    : filters.emailFormulaOverride,
                  activeSingleCompanyResult?.emailPattern.detectedFormulaId
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Ordering & Accurate Count Summary Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          Ordered from{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            Most Important → Least Important
          </strong>
        </span>
        <span className="font-mono tabular-nums whitespace-nowrap">
          {filteredEmployees.length === 0
            ? 'Showing 0 contacts'
            : `Showing ${(pageStartIndex + 1).toLocaleString()}–${(
                pageStartIndex + displayedEmployees.length
              ).toLocaleString()} of ${filteredEmployees.length.toLocaleString()} contacts (500/page)`}
        </span>
      </div>

      {isPaginationLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-sky-500/40 bg-sky-500/10 dark:bg-sky-500/15 text-xs font-semibold text-sky-800 dark:text-sky-200"
        >
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
            <span>
              {isServerBatchLoading
                ? `Loading Company Batch ${targetCompanyBatch.toLocaleString()} of ${totalCompanyBatches.toLocaleString()} (500 matching companies)...`
                : `Loading page ${targetPaginationPage.toLocaleString()} of ${totalPages.toLocaleString()}...`}
            </span>
          </span>
          <span className="font-mono tabular-nums text-[11px] text-sky-700/85 dark:text-sky-300/85">
            {isServerBatchLoading ? '500 companies/batch' : '500 contacts/page'}
          </span>
        </div>
      )}

      {/* Full Names + Emails + Job Title + Accuracy % HTML <table> */}
      {filteredEmployees.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {sessionMode === 'domain' || isViewingFilterCompany
              ? localQuery
                ? 'No contacts in this company match your quick search.'
                : 'No publicly indexed employee records were found for this organization.'
              : 'No contacts matched this exact combination of sidebar filters.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {sessionMode === 'domain' || isViewingFilterCompany
              ? localQuery
                ? 'Clear the quick search input above to view the full organization roster.'
                : 'Return to Companies List to select another organization.'
              : 'Broaden your Accuracy Score, Role, Location, or Revenue selection in the left sidebar.'}
          </p>
        </div>
      ) : (
        <div className="relative rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-950/35">
          {isPaginationLoading && (
            <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-md bg-white/95 dark:bg-slate-900/95 border border-sky-500/40 shadow-sm text-xs font-semibold text-slate-900 dark:text-white">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
                <span>
                  {isServerBatchLoading
                    ? `Loading Company Batch ${targetCompanyBatch.toLocaleString()}...`
                    : `Loading page ${targetPaginationPage.toLocaleString()}...`}
                </span>
              </div>
            </div>
          )}
          <div
            className={`overflow-x-auto rounded-xl transition-opacity duration-150 ${
              isPaginationLoading ? 'opacity-45 pointer-events-none' : 'opacity-100'
            }`}
          >
            <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/75 dark:bg-slate-900/75 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th scope="col" className="py-3 px-4 w-14 font-mono">
                  Rank
                </th>
                <th scope="col" className="py-3 px-4">
                  Full Name
                </th>
                <th scope="col" className="py-3 px-4">
                  Email Address
                </th>
                <th scope="col" className="py-3 px-4">
                  Job Title
                </th>
                <th
                  scope="col"
                  className="py-3 px-4 text-right whitespace-nowrap"
                >
                  Accuracy
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-sm">
              {displayedEmployees.map((emp) => {
                const tier = getAccuracyTierLabel(emp.resolvedAccuracy);
                const isRowCopied = copiedRowId === emp.id;

                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-sky-500/[0.04] dark:hover:bg-sky-400/[0.05] transition-colors duration-150"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {emp.displayRank}
                    </td>

                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {emp.fullName}
                      </div>
                      {sessionMode === 'filter' && !isViewingFilterCompany && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          {onSelectCompanyFromFilterContact && emp.domain ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSelectCompanyFromFilterContact({
                                  slug: emp.domain.split('.')[0] || emp.domain,
                                  name: emp.companyName || emp.domain,
                                  domain: emp.domain,
                                })
                              }
                              className="truncate max-w-44 font-medium text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:underline cursor-pointer"
                            >
                              {emp.companyName || emp.domain}
                            </button>
                          ) : (
                            <span className="truncate max-w-44">
                              {emp.companyName || emp.domain}
                            </span>
                          )}
                          {emp.domain && (
                            <>
                              <span aria-hidden="true">·</span>
                              <a
                                href={`https://${emp.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>{emp.domain}</span>
                                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-4 font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {emp.resolvedEmail ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopySingleEmail(
                              emp.id,
                              emp.resolvedEmail
                            )
                          }
                          title="Click to copy email address"
                          className="group inline-flex items-center gap-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer text-left"
                        >
                          <span>{emp.resolvedEmail}</span>
                          {isRowCopied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-75 transition-opacity shrink-0" />
                          )}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 min-w-48">
                      {emp.jobTitle}
                    </td>

                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-end gap-1.5 text-xs font-mono tabular-nums font-semibold ${tier.colorClass}`}
                      >
                        {emp.resolvedAccuracy >= 90 && (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{emp.resolvedAccuracy}%</span>
                        <span className="font-sans font-normal text-slate-500 dark:text-slate-400 hidden sm:inline">
                          · {tier.label}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* 500/Page Pagination Bar */}
      {totalPages > 1 && (
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {isPaginationLoading ? (
              <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-sky-600 dark:text-sky-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Loading page {targetPaginationPage.toLocaleString()} of{' '}
                {totalPages.toLocaleString()}...
              </span>
            ) : (
              <>
                Page {safePage.toLocaleString()} of{' '}
                {totalPages.toLocaleString()} · 500/page
              </>
            )}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              disabled={safePage <= 1 || isPaginationLoading}
              onClick={() => handleSelectContactsPage(safePage - 1)}
              aria-label="Previous contacts page"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {visiblePageNumbers.map((pg) => {
              const isTargetLoading =
                isPaginationLoading && pg === targetPaginationPage;
              return (
                <button
                  key={pg}
                  type="button"
                  disabled={isPaginationLoading}
                  onClick={() => handleSelectContactsPage(pg)}
                  className={`inline-flex items-center justify-center gap-1.5 min-w-8 h-8 px-2 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer ${
                    pg === safePage || isTargetLoading
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isTargetLoading && (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  )}
                  <span>{pg}</span>
                </button>
              );
            })}
            <button
              type="button"
              disabled={safePage >= totalPages || isPaginationLoading}
              onClick={() => handleSelectContactsPage(safePage + 1)}
              aria-label="Next contacts page"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
