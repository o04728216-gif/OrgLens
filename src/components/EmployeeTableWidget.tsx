import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
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
  SearchResponse,
  SessionMode,
  SidebarFiltersState,
} from '../types';
import {
  applyExcelEmailFormula,
  getExcelFormulaDefinition,
} from '../utils/emailFormulas';
import { copyTextToClipboard, exportEmployeesToCsv } from '../utils/offlineStorage';

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
}) => {
  const [domainLocalQuery, setDomainLocalQuery] = useState('');
  const [filterLocalQuery, setFilterLocalQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedNamesCount, setCopiedNamesCount] = useState<number | null>(null);
  const [copiedEmailsCount, setCopiedEmailsCount] = useState<number | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    sessionMode,
    domainResult?.domain,
    filterResult?.fetchedAt,
    filters.contactSearch,
    filters.roleKeyword,
    filters.seniorities,
    filters.departments,
    filters.minAccuracy,
    filters.maxAccuracy,
  ]);

  const localQuery =
    sessionMode === 'domain' ? domainLocalQuery : filterLocalQuery;
  const setLocalQuery = (val: string) => {
    if (sessionMode === 'domain') {
      setDomainLocalQuery(val);
    } else {
      setFilterLocalQuery(val);
    }
    setCurrentPage(1);
  };

  // Domain Session exclusively uses the domain's detected corporate format (completely isolated from Sidebar Filters)
  const domainFormulaDef = useMemo(() => {
    if (!domainResult) return null;
    return getExcelFormulaDefinition(
      domainResult.emailPattern.detectedFormulaId
    );
  }, [domainResult]);

  // Compute active rows cleanly separated by sessionMode
  const filteredEmployees = useMemo<ComputedRow[]>(() => {
    const qLocal = localQuery.trim().toLowerCase();

    if (sessionMode === 'domain') {
      if (!domainResult) return [];
      const formulaId = domainResult.emailPattern.detectedFormulaId;

      const rows = domainResult.employees
        .map((emp) => {
          const resolvedEmail =
            emp.email ||
            applyExcelEmailFormula(emp.fullName, domainResult.domain, formulaId);
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

    // Filter Explorer Session: uses live filterResult + instant client filter reactivity
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
    domainResult,
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

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEmployees.length / CONTACTS_PER_PAGE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * CONTACTS_PER_PAGE;

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

  const coherentTotalContacts = useMemo(() => {
    if (sessionMode === 'domain') return filteredEmployees.length;
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
  }, [sessionMode, filterResult, filteredEmployees.length]);

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
      : isFilterLoading && !filterResult;

  if (isInitialLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {sessionMode === 'domain' ? (
              <>
                Indexing full roster, MX mail servers, and corporate email format
                for{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {loadingDomain || 'company'}
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
          Domain Lookup runs in its own isolated session: it detects the organization&apos;s verified email format, calculates accuracy scores, and ranks every contact from executive leadership to entry-level roles.
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

  return (
    <div className="space-y-4">
      {/* Top Session Metadata Line */}
      {sessionMode === 'domain' && domainResult ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 px-1">
          <span className="font-semibold text-slate-900 dark:text-white">
            Detected Format:{' '}
            {domainFormulaDef?.label || domainResult.emailPattern.formulaLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
            {domainResult.emailPattern.patternConfidence}% Pattern Accuracy
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {domainResult.emailPattern.mxVerified
              ? `MX Verified (${domainResult.emailPattern.mxProvider})`
              : 'Standard Domain Routing'}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 px-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
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
            {coherentTotalContacts > filteredEmployees.length && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {filteredEmployees.length.toLocaleString()} Loaded in Current Batch
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
              sessionMode === 'domain' && domainResult
                ? `Search ${domainResult.employees.length.toLocaleString()} names, titles, or @${domainResult.domain} emails...`
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
          {/* Retain Copy Full Name List Button */}
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

          {/* Retain Copy Email List Button */}
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
                  sessionMode === 'domain' && domainResult
                    ? domainResult.domain
                    : 'filtered-contacts',
                  sessionMode === 'domain'
                    ? 'auto'
                    : filters.emailFormulaOverride,
                  domainResult?.emailPattern.detectedFormulaId
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

      {/* Full Names + Emails + Job Title + Accuracy % HTML <table> */}
      {filteredEmployees.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {sessionMode === 'domain'
              ? 'No contacts in this domain match your quick search.'
              : 'No contacts matched this exact combination of sidebar filters.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {sessionMode === 'domain'
              ? 'Clear the quick search input above to view the full organization roster.'
              : 'Broaden your Accuracy Score, Role, Location, or Revenue selection in the left sidebar.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-950/35">
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
                      {sessionMode === 'filter' && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="truncate max-w-44">
                            {emp.companyName || emp.domain}
                          </span>
                          {onInspectDomainFromFilter && emp.domain && (
                            <>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectDomainFromFilter(emp.domain)
                                }
                                className="font-mono text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 hover:underline cursor-pointer"
                              >
                                {emp.domain}
                              </button>
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
      )}

      {/* 500/Page Pagination Bar */}
      {totalPages > 1 && (
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Page {safePage.toLocaleString()} of {totalPages.toLocaleString()} · 500/page
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Previous contacts page"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {visiblePageNumbers.map((pg) => (
              <button
                key={pg}
                type="button"
                onClick={() => setCurrentPage(pg)}
                className={`min-w-8 h-8 px-2 rounded-lg text-xs font-mono tabular-nums font-medium transition-colors cursor-pointer ${
                  pg === safePage
                    ? 'bg-sky-600 text-white'
                    : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {pg}
              </button>
            ))}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
