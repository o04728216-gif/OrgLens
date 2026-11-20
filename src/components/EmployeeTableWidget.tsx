import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  MailCheck,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  ConfirmedEmailSource,
  EmployeeRecord,
  FilterExplorerResponse,
  GlobalCompanyItem,
  SearchResponse,
  SessionMode,
  SidebarFiltersState,
} from '../types';
import { applyExcelEmailFormula } from '../utils/emailFormulas';
import { copyTextToClipboard, exportEmployeesToCsv } from '../utils/offlineStorage';
import { scrollToListTop } from '../utils/scrollUtils';
import { CompanyDrilldownHeader } from './directory/CompanyDrilldownHeader';
import {
  PaginationControls,
  PaginationLoadingBanner,
} from './directory/PaginationControls';
import { SwipeableTableContainer } from './directory/SwipeableTableContainer';

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
  isPageCached?: (page: number) => boolean;
  onPrefetchPage?: (page: number) => void;
  contactsPage?: number;
  onChangeContactsPage?: (page: number) => void;
  urlLocalQuery?: string;
  onChangeUrlLocalQuery?: (q: string) => void;
  monthlyPriceUsdt?: number;
  onOpenUpgrade?: () => void;
  copyFormat?: 'email_only' | 'name_and_email';
  autoScrollOnPagination?: boolean;
  exportFilenamePrefix?: string;
  coherentMatchedOrgs?: number;
}

interface ComputedRow extends EmployeeRecord {
  resolvedEmail: string;
  resolvedAccuracy: number;
  displayRank: number;
}

const CONTACTS_PER_PAGE = 500;

function formatProvenanceLabel(source?: ConfirmedEmailSource): string {
  switch (source) {
    case 'Company Website':
      return 'Confirmed · Website';
    case 'GitHub Commit':
      return 'Confirmed · GitHub';
    case 'OpenPGP Keyserver':
      return 'Confirmed · OpenPGP';
    case 'NPM Registry':
      return 'Confirmed · NPM';
    case 'Business Registry':
      return 'Confirmed · Registry';
    case 'Admin Verified':
      return 'Confirmed · Verified';
    case 'Public Web Index':
      return 'Confirmed · Public Web';
    default:
      return 'Confirmed · Web';
  }
}

function getAccuracyTierLabel(
  pct: number,
  verifiedOnWeb?: boolean,
  emailSource?: ConfirmedEmailSource
): {
  label: string;
  colorClass: string;
} {
  if (verifiedOnWeb || emailSource) {
    return {
      label: formatProvenanceLabel(emailSource),
      colorClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
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
    label: 'Directory',
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
  filterSelectedCompany = null,
  filterCompanyResult = null,
  isFilterCompanyLoading = false,
  filterCompanyError = null,
  onBackToCompaniesList,
  onSelectCompanyFromFilterContact,
  globalPage = 1,
  onChangeGlobalPage,
  isPageCached,
  onPrefetchPage,
  contactsPage,
  onChangeContactsPage,
  urlLocalQuery,
  onChangeUrlLocalQuery,
  monthlyPriceUsdt = 15,
  onOpenUpgrade,
  copyFormat = 'email_only',
  autoScrollOnPagination = true,
  exportFilenamePrefix = 'orglens',
  coherentMatchedOrgs,
}) => {
  const [internalQuery, setInternalQuery] = useState('');
  const [internalPage, setInternalPage] = useState(1);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [requestedServerPage, setRequestedServerPage] = useState<number | null>(
    null
  );
  const [localPageLoadingTarget, setLocalPageLoadingTarget] = useState<
    number | null
  >(null);
  const localPageTimerRef = useRef<number | null>(null);
  const [copiedNamesCount, setCopiedNamesCount] = useState<number | null>(null);
  const [copiedEmailsCount, setCopiedEmailsCount] = useState<number | null>(null);
  const [copiedConfirmedCount, setCopiedConfirmedCount] = useState<
    number | null
  >(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [pageTransitionDir, setPageTransitionDir] = useState<1 | -1>(1);
  const pendingPageSnapRef = useRef(false);
  const listTopRef = useRef<HTMLDivElement>(null);

  const localQuery =
    urlLocalQuery !== undefined ? urlLocalQuery : internalQuery;
  const currentPage =
    contactsPage !== undefined ? contactsPage : internalPage;

  const updateCurrentPage = (pg: number) => {
    if (onChangeContactsPage) {
      onChangeContactsPage(pg);
    } else {
      setInternalPage(pg);
    }
  };

  const setLocalQuery = (val: string) => {
    if (onChangeUrlLocalQuery) {
      onChangeUrlLocalQuery(val);
    } else {
      setInternalQuery(val);
    }
    updateCurrentPage(1);
  };

  useEffect(() => {
    if (!isFilterLoading) {
      setRequestedServerPage(null);
    }
  }, [isFilterLoading]);

  useEffect(() => {
    return () => {
      if (localPageTimerRef.current !== null) {
        window.clearTimeout(localPageTimerRef.current);
      }
    };
  }, []);

  const isViewingFilterCompany =
    sessionMode === 'filter' && Boolean(filterSelectedCompany);

  const activeSingleCompanyResult =
    sessionMode === 'domain'
      ? domainResult
      : isViewingFilterCompany
      ? filterCompanyResult
      : null;

  // Reset confirmed-only toggle if target company changes
  useEffect(() => {
    setConfirmedOnly(false);
  }, [activeSingleCompanyResult?.domain, sessionMode]);

  const baseFilteredEmployees = useMemo<ComputedRow[]>(() => {
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
          const isConfirmed = Boolean(emp.emailVerifiedOnWeb || emp.emailSource);
          const keepExactEmail =
            isConfirmed || (formulaId === detectedId && Boolean(emp.email));
          const resolvedEmail = keepExactEmail
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

    if (!filterResult) return [];
    const qContact = filters.contactSearch.trim().toLowerCase();
    const qRole = filters.roleKeyword.trim().toLowerCase();

    const rows = filterResult.employees
      .map((emp) => {
        const isServerMasked = emp.email.includes('*');
        const isConfirmed = Boolean(emp.emailVerifiedOnWeb || emp.emailSource);
        const resolvedEmail =
          isServerMasked ||
          isConfirmed ||
          filters.emailFormulaOverride === 'auto'
            ? emp.email
            : applyExcelEmailFormula(
                emp.fullName,
                emp.domain,
                filters.emailFormulaOverride
              );
        const resolvedAccuracy =
          isConfirmed || filters.emailFormulaOverride === 'auto'
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

    const hasClientNarrowing = Boolean(
      qLocal ||
        qContact ||
        qRole ||
        filters.seniorities.length > 0 ||
        filters.departments.length > 0 ||
        filters.minAccuracy > 0 ||
        filters.maxAccuracy < 100
    );

    return rows.map((row, index) => ({
      ...row,
      displayRank:
        !hasClientNarrowing && row.rank > 0 ? row.rank : index + 1,
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

  const webVerifiedCount = useMemo(
    () =>
      baseFilteredEmployees.filter((emp) =>
        Boolean(emp.emailVerifiedOnWeb || emp.emailSource)
      ).length,
    [baseFilteredEmployees]
  );

  const filteredEmployees = useMemo(() => {
    if (!confirmedOnly || webVerifiedCount === 0) {
      return baseFilteredEmployees;
    }
    return baseFilteredEmployees
      .filter((emp) => Boolean(emp.emailVerifiedOnWeb || emp.emailSource))
      .map((row, idx) => ({
        ...row,
        displayRank: idx + 1,
      }));
  }, [baseFilteredEmployees, confirmedOnly, webVerifiedCount]);

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
    !confirmedOnly &&
    localTotalPages <= 1 &&
    totalCompanyBatches > 1 &&
    Boolean(onChangeGlobalPage);

  const totalPages = useServerBatchPagination
    ? totalCompanyBatches
    : localTotalPages;

  const safePage = useServerBatchPagination
    ? activeCompanyBatch
    : Math.min(Math.max(1, currentPage), totalPages);

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

  const isServerBatchLoading =
    sessionMode === 'filter' &&
    !isViewingFilterCompany &&
    (requestedServerPage !== null ||
      (isFilterLoading &&
        Boolean(filterResult && filterResult.page !== globalPage)));

  const isPaginationLoading =
    isServerBatchLoading || localPageLoadingTarget !== null;

  const targetCompanyBatch = requestedServerPage ?? activeCompanyBatch;
  const targetPaginationPage = useServerBatchPagination
    ? targetCompanyBatch
    : localPageLoadingTarget ?? safePage;

  const renderedContactsPageKey = useServerBatchPagination
    ? `server-${filterResult?.page ?? globalPage}`
    : `local-${safePage}`;

  useLayoutEffect(() => {
    if (!pendingPageSnapRef.current) return;
    pendingPageSnapRef.current = false;
    if (autoScrollOnPagination) {
      scrollToListTop(listTopRef.current, 88, 'instant');
    }
  }, [renderedContactsPageKey, autoScrollOnPagination]);

  const handleSelectCompanyBatch = (nextBatch: number) => {
    if (!onChangeGlobalPage) return;
    const bounded = Math.max(1, Math.min(totalCompanyBatches, nextBatch));
    if (bounded === globalPage && !isServerBatchLoading) {
      if (autoScrollOnPagination) {
        scrollToListTop(listTopRef.current, 88, 'instant');
      }
      return;
    }
    setPageTransitionDir(bounded >= globalPage ? 1 : -1);
    pendingPageSnapRef.current = true;
    if (isPageCached?.(bounded)) {
      setRequestedServerPage(null);
    } else {
      setRequestedServerPage(bounded);
      if (autoScrollOnPagination) {
        scrollToListTop(listTopRef.current, 88, 'instant');
      }
    }
    updateCurrentPage(1);
    onChangeGlobalPage(bounded);
  };

  const handleSelectContactsPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(totalPages, nextPage));

    if (useServerBatchPagination && onChangeGlobalPage) {
      handleSelectCompanyBatch(bounded);
      return;
    }

    if (bounded === safePage) {
      if (autoScrollOnPagination) {
        scrollToListTop(listTopRef.current, 88, 'instant');
      }
      return;
    }
    setPageTransitionDir(bounded >= safePage ? 1 : -1);
    pendingPageSnapRef.current = true;
    if (localPageTimerRef.current !== null) {
      window.clearTimeout(localPageTimerRef.current);
      localPageTimerRef.current = null;
    }
    setLocalPageLoadingTarget(null);
    updateCurrentPage(bounded);
  };

  const effectiveMatchedCompanies =
    typeof coherentMatchedOrgs === 'number'
      ? coherentMatchedOrgs
      : filterResult?.totalMatchedCompanies || 0;

  const handleCopyFullNameList = async () => {
    if (filteredEmployees.length === 0) return;
    const namesOnly = filteredEmployees.map((emp) => emp.fullName).join('\n');
    const ok = await copyTextToClipboard(namesOnly);
    if (ok) {
      setCopiedNamesCount(filteredEmployees.length);
      window.setTimeout(() => setCopiedNamesCount(null), 2600);
    }
  };

  const formatCopiedRecipient = (fullName: string, email: string) =>
    copyFormat === 'name_and_email' ? `"${fullName}" <${email}>` : email;

  const handleCopyEmailList = async () => {
    const emailsOnly = filteredEmployees
      .filter((emp) => Boolean(emp.resolvedEmail))
      .map((emp) => formatCopiedRecipient(emp.fullName, emp.resolvedEmail))
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

  const handleCopyConfirmedEmails = async () => {
    const confirmedRows = baseFilteredEmployees.filter(
      (emp) =>
        Boolean(emp.emailVerifiedOnWeb || emp.emailSource) &&
        Boolean(emp.resolvedEmail) &&
        !emp.resolvedEmail.includes('*')
    );
    if (confirmedRows.length === 0) return;
    const text = confirmedRows
      .map((emp) => formatCopiedRecipient(emp.fullName, emp.resolvedEmail))
      .join('\n');
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedConfirmedCount(confirmedRows.length);
      window.setTimeout(() => setCopiedConfirmedCount(null), 2600);
    }
  };

  const handleCopySingleEmail = async (
    id: string,
    fullName: string,
    email: string
  ) => {
    if (!email) return;
    const ok = await copyTextToClipboard(formatCopiedRecipient(fullName, email));
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

  if (isInitialLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        {isViewingFilterCompany && filterSelectedCompany && (
          <CompanyDrilldownHeader
            company={filterSelectedCompany}
            companyResult={activeSingleCompanyResult}
            onBackToCompaniesList={onBackToCompaniesList}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {sessionMode === 'domain' || isViewingFilterCompany ? (
              <>
                Crawling confirmed corporate emails, MX servers, and full roster
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
                Auto-loading verified contacts, confirmed emails, and job titles
                matching your active filters...
              </>
            )}
          </span>
          <span className="font-mono tabular-nums">
            Ranking Most Important → Least Important
          </span>
        </div>

        <div className="space-y-2.5 md:hidden">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 animate-pulse space-y-2.5"
            >
              <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3.5 w-52 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-10 w-full rounded-lg bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/60 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 w-14">Rank</th>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Email Address</th>
                <th className="py-3 px-4">Job Title</th>
                <th className="py-3 px-4 w-32 text-right">Verification</th>
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

  if (sessionMode === 'domain' && !domainResult) {
    return (
      <div className="py-12 px-4 text-center">
        <Users className="mx-auto h-9 w-9 text-sky-600 dark:text-sky-400 mb-3" />
        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
          Enter any company domain above to extract Full Names, Confirmed Emails &amp; Job Titles
        </h4>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Domain Lookup crawls real published corporate addresses across company websites, developer registries, OpenPGP keyservers, and mail servers, ranking every contact from leadership to entry-level roles.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onFocusDomainInput}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            Type a Company Domain
          </button>
          <button
            type="button"
            onClick={onSwitchToFilterSession}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            Open Filter Explorer
          </button>
        </div>
      </div>
    );
  }

  if (
    isViewingFilterCompany &&
    filterCompanyError &&
    !activeSingleCompanyResult
  ) {
    return (
      <div className="space-y-4">
        {filterSelectedCompany && (
          <CompanyDrilldownHeader
            company={filterSelectedCompany}
            companyResult={activeSingleCompanyResult}
            onBackToCompaniesList={onBackToCompaniesList}
          />
        )}
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {filterCompanyError}
          </p>
          {onBackToCompaniesList && (
            <button
              type="button"
              onClick={onBackToCompaniesList}
              className="mt-4 min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
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
      {isViewingFilterCompany && filterSelectedCompany && (
        <CompanyDrilldownHeader
          company={filterSelectedCompany}
          companyResult={activeSingleCompanyResult}
          onBackToCompaniesList={onBackToCompaniesList}
        />
      )}

      {/* Zero Coins Notice */}
      {sessionMode === 'filter' &&
        !isViewingFilterCompany &&
        filterResult?.emailsMaskedForZeroCoins && (
          <div className="rounded-xl px-4 py-3 bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <span className="text-amber-900 dark:text-amber-200 font-medium">
              You have 0 Lens Coins remaining. Upgrade for ${monthlyPriceUsdt}
              /month in USDT (TRC20) to reveal unlimited worldwide company
              emails.
            </span>
            {onOpenUpgrade && (
              <button
                type="button"
                onClick={onOpenUpgrade}
                className="min-h-[40px] px-3.5 py-2 rounded-lg font-semibold bg-sky-600 hover:bg-sky-500 text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                Upgrade Unlimited (${monthlyPriceUsdt}/mo USDT)
              </button>
            )}
          </div>
        )}

      {/* Top Session Metadata Line + Segmented Confirmed Emails Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 px-0.5">
        {(sessionMode === 'domain' || isViewingFilterCompany) &&
        activeSingleCompanyResult ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {activeSingleCompanyResult.companyName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
              {activeSingleCompanyResult.emailPattern.patternConfidence}%
              Verification Confidence
            </span>
            {webVerifiedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
                  {webVerifiedCount.toLocaleString()} Real Confirmed Emails
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {activeSingleCompanyResult.emailPattern.mxVerified
                ? `MX Verified (${activeSingleCompanyResult.emailPattern.mxProvider})`
                : 'Standard Domain Routing'}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 min-w-0">
            {onBackToCompaniesList && (
              <button
                type="button"
                onClick={onBackToCompaniesList}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer mr-1 whitespace-nowrap"
              >
                <Building2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                Companies List
              </button>
            )}
            <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
              Filter Explorer
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
              {effectiveMatchedCompanies.toLocaleString()} Orgs
            </span>
            {webVerifiedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                  {webVerifiedCount.toLocaleString()} Confirmed Emails
                </span>
              </>
            )}
            {totalCompanyBatches > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  Batch {activeCompanyBatch.toLocaleString()}/
                  {totalCompanyBatches.toLocaleString()}
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 shrink-0">

          {webVerifiedCount > 0 && (
            <div
              role="group"
              aria-label="Filter by confirmed email status"
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950/80 border border-slate-200/90 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => {
                  setConfirmedOnly(false);
                  updateCurrentPage(1);
                }}
                className={`min-h-[36px] sm:min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  !confirmedOnly
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All ({baseFilteredEmployees.length.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmedOnly(true);
                  updateCurrentPage(1);
                }}
                className={`min-h-[36px] sm:min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  confirmedOnly
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <MailCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Confirmed Only ({webVerifiedCount.toLocaleString()})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar: Search Input + Domain-Only Copy Buttons + Batch Stepper + Export CSV */}
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
            className="w-full min-h-[44px] sm:min-h-0 pl-9 pr-8 py-2 text-base sm:text-sm rounded-lg bg-white/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
          />
          {localQuery && (
            <button
              type="button"
              onClick={() => setLocalQuery('')}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Domain Lookup Only: Copy Full Name List, Copy Email List & Copy Confirmed */}
          {sessionMode === 'domain' && (
            <>
              <button
                type="button"
                disabled={filteredEmployees.length === 0}
                onClick={() => void handleCopyFullNameList()}
                className={`min-h-[42px] sm:min-h-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  copiedNamesCount !== null
                    ? 'bg-emerald-600 text-white'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
                }`}
              >
                {copiedNamesCount !== null ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied {copiedNamesCount.toLocaleString()} Names
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
                className={`min-h-[42px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
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

              {webVerifiedCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleCopyConfirmedEmails()}
                  className={`min-h-[42px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    copiedConfirmedCount !== null
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60'
                  }`}
                >
                  {copiedConfirmedCount !== null ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied {copiedConfirmedCount.toLocaleString()} Confirmed
                    </>
                  ) : (
                    <>
                      <MailCheck className="h-3.5 w-3.5" />
                      Copy Confirmed ({webVerifiedCount.toLocaleString()})
                    </>
                  )}
                </button>
              )}
            </>
          )}

          {/* Filter Explorer Multi-Batch Stepper */}
          {sessionMode === 'filter' &&
            !isViewingFilterCompany &&
            totalCompanyBatches > 1 &&
            onChangeGlobalPage && (
              <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60">
                <button
                  type="button"
                  disabled={activeCompanyBatch <= 1 || isServerBatchLoading}
                  onMouseEnter={() => {
                    if (activeCompanyBatch > 1) {
                      onPrefetchPage?.(activeCompanyBatch - 1);
                    }
                  }}
                  onTouchStart={() => {
                    if (activeCompanyBatch > 1) {
                      onPrefetchPage?.(activeCompanyBatch - 1);
                    }
                  }}
                  onClick={() =>
                    handleSelectCompanyBatch(activeCompanyBatch - 1)
                  }
                  title="Load previous 500-contact page"
                  className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev Page
                </button>
                <span className="px-2 text-xs font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400 whitespace-nowrap inline-flex items-center gap-1.5">
                  {isServerBatchLoading && (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  )}
                  <span>
                    Page {activeCompanyBatch.toLocaleString()} /{' '}
                    {totalCompanyBatches.toLocaleString()}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={
                    activeCompanyBatch >= totalCompanyBatches ||
                    isServerBatchLoading
                  }
                  onMouseEnter={() => {
                    if (activeCompanyBatch < totalCompanyBatches) {
                      onPrefetchPage?.(activeCompanyBatch + 1);
                    }
                  }}
                  onTouchStart={() => {
                    if (activeCompanyBatch < totalCompanyBatches) {
                      onPrefetchPage?.(activeCompanyBatch + 1);
                    }
                  }}
                  onClick={() =>
                    handleSelectCompanyBatch(activeCompanyBatch + 1)
                  }
                  title="Load next 500-contact page"
                  className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
                >
                  Next Page
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

          {/* Export CSV */}
          {filteredEmployees.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const baseSlug =
                  (sessionMode === 'domain' || isViewingFilterCompany) &&
                  activeSingleCompanyResult
                    ? activeSingleCompanyResult.domain
                    : 'filtered-contacts';
                const cleanCustomPrefix = exportFilenamePrefix?.trim();
                const fullPrefix =
                  cleanCustomPrefix && cleanCustomPrefix !== 'orglens'
                    ? `${cleanCustomPrefix}-${baseSlug}`
                    : baseSlug;
                exportEmployeesToCsv(
                  filteredEmployees.map((emp) => ({
                    ...emp,
                    rank: emp.displayRank,
                    email: emp.resolvedEmail,
                    emailAccuracy: emp.resolvedAccuracy,
                  })),
                  fullPrefix,
                  sessionMode === 'domain'
                    ? 'auto'
                    : filters.emailFormulaOverride,
                  activeSingleCompanyResult?.emailPattern.detectedFormulaId
                );
              }}
              className="min-h-[42px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
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
          {confirmedOnly ? (
            <>
              Showing{' '}
              <strong className="text-emerald-700 dark:text-emerald-400">
                Real Confirmed Emails
              </strong>{' '}
              discovered on public web &amp; registries
            </>
          ) : (
            <>
              Ordered from{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                Most Important → Least Important
              </strong>
            </>
          )}
        </span>
        <span className="font-mono tabular-nums whitespace-nowrap">
          {filteredEmployees.length === 0
            ? isFilterLoading || isServerBatchLoading
              ? `Loading page ${targetPaginationPage.toLocaleString()} (500/page)...`
              : 'Showing 0 contacts'
            : useServerBatchPagination && displayedEmployees.length > 0
            ? `Showing #${displayedEmployees[0].displayRank.toLocaleString()}–#${displayedEmployees[
                displayedEmployees.length - 1
              ].displayRank.toLocaleString()} (${displayedEmployees.length.toLocaleString()} on page ${safePage.toLocaleString()} · 500/page)`
            : `Showing ${(pageStartIndex + 1).toLocaleString()}–${(
                pageStartIndex + displayedEmployees.length
              ).toLocaleString()} of ${filteredEmployees.length.toLocaleString()} contacts (500/page)`}
        </span>
      </div>

      {/* Contacts View: Mobile Cards (< md) + Desktop HTML <table> (md+) */}
      {filteredEmployees.length === 0 && (isFilterLoading || isServerBatchLoading) ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
          <span>
            Loading page {targetPaginationPage.toLocaleString()} contacts (500/page)...
          </span>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {confirmedOnly
              ? 'No confirmed emails match your current search filter.'
              : sessionMode === 'domain' || isViewingFilterCompany
              ? localQuery
                ? 'No contacts in this company match your quick search.'
                : 'No publicly indexed employee records were found for this organization.'
              : globalPage > 1
              ? `No additional indexed contacts were found on page ${globalPage.toLocaleString()} for this filter.`
              : 'No contacts matched this exact combination of sidebar filters.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {confirmedOnly
              ? 'Switch back to All Contacts to inspect the full organization directory.'
              : sessionMode === 'domain' || isViewingFilterCompany
              ? localQuery
                ? 'Clear the quick search input above to view the full organization roster.'
                : 'Return to Companies List to select another organization.'
              : globalPage > 1
              ? 'Return to an earlier page or broaden your sidebar filters to load more verified contacts.'
              : 'Broaden your Accuracy Score, Role, Location, or Revenue selection in the left sidebar.'}
          </p>
          {sessionMode === 'filter' &&
            !isViewingFilterCompany &&
            !confirmedOnly &&
            globalPage > 1 &&
            onChangeGlobalPage && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectCompanyBatch(globalPage - 1)}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Previous Page ({(globalPage - 1).toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCompanyBatch(1)}
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
              message={`Loading page ${targetPaginationPage.toLocaleString()} of ${totalPages.toLocaleString()}...`}
              rightMeta={
                useServerBatchPagination
                  ? 'Fetching contacts batch on demand'
                  : 'Loading 500 contacts'
              }
            />
          )}
          <motion.div
            key={`contacts-${renderedContactsPageKey}`}
            initial={{ opacity: 0, y: pageTransitionDir > 0 ? 14 : -10 }}
            animate={{ opacity: isPaginationLoading ? 0.55 : 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            aria-busy={isPaginationLoading}
            className={`relative ${
              isPaginationLoading ? 'pointer-events-none' : ''
            }`}
          >
            {/* Mobile Touch Cards (md:hidden) — Full unshortened email display */}
            <div className="md:hidden space-y-2.5">
            {displayedEmployees.map((emp) => {
              const tier = getAccuracyTierLabel(
                emp.resolvedAccuracy,
                emp.emailVerifiedOnWeb,
                emp.emailSource
              );
              const isRowCopied = copiedRowId === emp.id;

              return (
                <div
                  key={emp.id}
                  className="rounded-xl p-3.5 border border-slate-200/85 dark:border-slate-800/85 bg-white/85 dark:bg-slate-950/55 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                          #{emp.displayRank}
                        </span>
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {emp.fullName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                        {emp.jobTitle}
                      </p>
                      {sessionMode === 'filter' && !isViewingFilterCompany && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-1">
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
                              className="font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 underline underline-offset-2 cursor-pointer"
                            >
                              {emp.companyName || emp.domain}
                            </button>
                          ) : (
                            <span>{emp.companyName || emp.domain}</span>
                          )}
                          {emp.domain && (
                            <>
                              <span aria-hidden="true">·</span>
                              <a
                                href={`https://${emp.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-sky-600 dark:text-sky-400 inline-flex items-center gap-0.5"
                              >
                                <span>{emp.domain}</span>
                                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-mono tabular-nums font-semibold ${tier.colorClass}`}
                      >
                        {(emp.resolvedAccuracy >= 90 ||
                          emp.emailVerifiedOnWeb ||
                          emp.emailSource) && (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{emp.resolvedAccuracy}%</span>
                      </span>
                    </div>
                  </div>

                  {emp.resolvedEmail ? (
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopySingleEmail(
                          emp.id,
                          emp.fullName,
                          emp.resolvedEmail
                        )
                      }
                      className={`w-full min-h-[44px] px-3 py-2 rounded-lg border font-mono text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isRowCopied
                          ? 'border-emerald-600 bg-emerald-600 text-white font-semibold'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-slate-800 dark:text-slate-100 active:bg-sky-500/10'
                      }`}
                    >
                      <span className="break-all text-left">{emp.resolvedEmail}</span>
                      <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold shrink-0">
                        {isRowCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                            <span className="text-sky-700 dark:text-sky-400">
                              Copy
                            </span>
                          </>
                        )}
                      </span>
                    </button>
                  ) : (
                    <div className="text-xs text-slate-400 font-mono">—</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Compact & Seamlessly Swipeable Table (hidden md:block) — Full unshortened emails */}
          <SwipeableTableContainer compactHint="Drag left/right, Shift+Scroll, or tap arrows to view all contact columns">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/75 dark:bg-slate-900/75 text-[11px] uppercase tracking-wide font-semibold text-slate-600 dark:text-slate-300">
                  <th scope="col" className="py-2.5 px-3 w-12 font-mono">
                    #
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Full Name
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Email Address
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Job Title
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 px-3 text-right whitespace-nowrap"
                  >
                    Verification
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-xs sm:text-sm">
                {displayedEmployees.map((emp) => {
                  const tier = getAccuracyTierLabel(
                    emp.resolvedAccuracy,
                    emp.emailVerifiedOnWeb,
                    emp.emailSource
                  );
                  const isRowCopied = copiedRowId === emp.id;

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-sky-500/[0.04] dark:hover:bg-sky-400/[0.05] transition-colors duration-150"
                    >
                      <td className="py-2 px-3 font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {emp.displayRank}
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap max-w-[210px]">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[195px] block">
                          {emp.fullName}
                        </span>
                        {sessionMode === 'filter' && !isViewingFilterCompany && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                            {onSelectCompanyFromFilterContact && emp.domain ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectCompanyFromFilterContact({
                                    slug:
                                      emp.domain.split('.')[0] || emp.domain,
                                    name: emp.companyName || emp.domain,
                                    domain: emp.domain,
                                  })
                                }
                                className="truncate max-w-36 font-medium text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:underline cursor-pointer"
                              >
                                {emp.companyName || emp.domain}
                              </button>
                            ) : (
                              <span className="truncate max-w-36">
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
                                  <span className="truncate max-w-[110px]">
                                    {emp.domain}
                                  </span>
                                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                </a>
                              </>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-3 font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {emp.resolvedEmail ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopySingleEmail(
                                emp.id,
                                emp.fullName,
                                emp.resolvedEmail
                              )
                            }
                            title={
                              copyFormat === 'name_and_email'
                                ? 'Click to copy "Full Name" <email>'
                                : 'Click to copy email address'
                            }
                            className="group inline-flex items-center gap-1.5 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer text-left whitespace-nowrap"
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

                      <td
                        className="py-2 px-3 text-xs text-slate-700 dark:text-slate-300 max-w-[240px]"
                        title={emp.jobTitle}
                      >
                        <span className="block truncate">{emp.jobTitle}</span>
                      </td>

                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <span
                            className={`inline-flex items-center justify-end gap-1 text-xs font-mono tabular-nums font-semibold ${tier.colorClass}`}
                          >
                            {(emp.resolvedAccuracy >= 90 ||
                              emp.emailVerifiedOnWeb ||
                              emp.emailSource) && (
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span>{emp.resolvedAccuracy}%</span>
                            <span className="font-sans font-normal text-slate-500 dark:text-slate-400 hidden xl:inline">
                              · {tier.label}
                            </span>
                          </span>
                          {emp.emailSourceUrl && (
                            <a
                              href={emp.emailSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open public verification source"
                              aria-label="Open public verification source"
                              className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
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

      {/* 500/Page Pagination Bar */}
      <PaginationControls
        currentPage={safePage}
        totalPages={totalPages}
        isLoading={isPaginationLoading}
        targetPage={targetPaginationPage}
        perPageLabel="500/page"
        loadingLabel={`Loading page ${targetPaginationPage.toLocaleString()}...`}
        onSelectPage={handleSelectContactsPage}
        onPrefetchPage={useServerBatchPagination ? onPrefetchPage : undefined}
      />
    </div>
  );
};
