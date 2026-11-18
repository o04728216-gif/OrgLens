import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crown,
  ExternalLink,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  DepartmentCategory,
  EmployeeRecord,
  FilterExplorerResponse,
  GlobalCompanyItem,
  SearchResponse,
  SeniorityLevel,
  SessionMode,
  SidebarFiltersState,
} from '../types';
import { applyExcelEmailFormula } from '../utils/emailFormulas';
import { scrollToListTop } from '../utils/scrollUtils';
import { computeExactSeniorityStats } from '../utils/seniorityStats';
import { CompanyDrilldownHeader } from './directory/CompanyDrilldownHeader';
import {
  PaginationControls,
  PaginationLoadingBanner,
} from './directory/PaginationControls';
import { SwipeableTableContainer } from './directory/SwipeableTableContainer';

interface JobTitleTabProps {
  sessionMode: SessionMode;
  domainResult: SearchResponse | null;
  isDomainLoading: boolean;
  filterResult: FilterExplorerResponse | null;
  isFilterLoading: boolean;
  filters: SidebarFiltersState;
  selectedDepartment: DepartmentCategory | 'All';
  selectedSeniority: SeniorityLevel | 'All';
  onSelectDepartment: (dept: DepartmentCategory | 'All') => void;
  onSelectSeniority: (sen: SeniorityLevel | 'All') => void;
  onSwitchToFilterSession: () => void;
  onFocusDomainInput: () => void;
  filterSelectedCompany?: GlobalCompanyItem | null;
  filterCompanyResult?: SearchResponse | null;
  isFilterCompanyLoading?: boolean;
  onBackToCompaniesList?: () => void;
  globalPage?: number;
  onChangeGlobalPage?: (page: number) => void;
  rolesPage?: number;
  onChangeRolesPage?: (page: number) => void;
  urlRoleQuery?: string;
  onChangeUrlRoleQuery?: (q: string) => void;
}

const ROLES_PER_PAGE = 500;

export const JobTitleTab: React.FC<JobTitleTabProps> = ({
  sessionMode,
  domainResult,
  isDomainLoading,
  filterResult,
  isFilterLoading,
  filters,
  selectedDepartment,
  selectedSeniority,
  onSelectDepartment,
  onSelectSeniority,
  onSwitchToFilterSession,
  onFocusDomainInput,
  filterSelectedCompany = null,
  filterCompanyResult = null,
  isFilterCompanyLoading = false,
  onBackToCompaniesList,
  globalPage = 1,
  onChangeGlobalPage,
  rolesPage,
  onChangeRolesPage,
  urlRoleQuery,
  onChangeUrlRoleQuery,
}) => {
  const [internalRoleFilter, setInternalRoleFilter] = useState('');
  const [internalPage, setInternalPage] = useState(1);
  const [requestedServerPage, setRequestedServerPage] = useState<number | null>(
    null
  );
  const [localPageLoadingTarget, setLocalPageLoadingTarget] = useState<
    number | null
  >(null);
  const localPageTimerRef = useRef<number | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  const roleFilter =
    urlRoleQuery !== undefined ? urlRoleQuery : internalRoleFilter;
  const currentPage = rolesPage !== undefined ? rolesPage : internalPage;

  const updateCurrentPage = (pg: number) => {
    if (onChangeRolesPage) {
      onChangeRolesPage(pg);
    } else {
      setInternalPage(pg);
    }
  };

  const setRoleFilter = (val: string) => {
    if (onChangeUrlRoleQuery) {
      onChangeUrlRoleQuery(val);
    } else {
      setInternalRoleFilter(val);
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

  const sessionEmployees = useMemo<EmployeeRecord[]>(() => {
    if (sessionMode === 'domain' || isViewingFilterCompany) {
      return activeSingleCompanyResult
        ? activeSingleCompanyResult.employees
        : [];
    }
    if (!filterResult) return [];

    const sidebarRole = filters.roleKeyword.trim().toLowerCase();
    const sidebarContact = filters.contactSearch.trim().toLowerCase();

    return filterResult.employees.filter((emp) => {
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

      if (
        resolvedAccuracy < filters.minAccuracy ||
        resolvedAccuracy > filters.maxAccuracy
      ) {
        return false;
      }
      if (
        filters.departments.length > 0 &&
        !filters.departments.includes(emp.department)
      ) {
        return false;
      }
      if (
        filters.seniorities.length > 0 &&
        !filters.seniorities.includes(emp.seniority)
      ) {
        return false;
      }
      if (sidebarRole && !emp.jobTitle.toLowerCase().includes(sidebarRole)) {
        return false;
      }
      if (
        sidebarContact &&
        !emp.fullName.toLowerCase().includes(sidebarContact) &&
        !resolvedEmail.toLowerCase().includes(sidebarContact) &&
        !(emp.companyName || '').toLowerCase().includes(sidebarContact)
      ) {
        return false;
      }
      return true;
    });
  }, [
    sessionMode,
    isViewingFilterCompany,
    activeSingleCompanyResult,
    filterResult,
    filters.minAccuracy,
    filters.maxAccuracy,
    filters.departments,
    filters.seniorities,
    filters.roleKeyword,
    filters.contactSearch,
    filters.emailFormulaOverride,
  ]);

  const departmentsAvailable = useMemo<Array<DepartmentCategory | 'All'>>(() => {
    if (sessionEmployees.length === 0) return ['All'];
    return [
      'All',
      ...Array.from(new Set(sessionEmployees.map((e) => e.department))),
    ];
  }, [sessionEmployees]);

  const cohortBeforeSenioritySelection = useMemo(() => {
    const q = roleFilter.trim().toLowerCase();
    return sessionEmployees.filter((emp) => {
      if (selectedDepartment !== 'All' && emp.department !== selectedDepartment) {
        return false;
      }
      if (!q) return true;
      return (
        emp.jobTitle.toLowerCase().includes(q) ||
        emp.fullName.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        (emp.companyName || '').toLowerCase().includes(q)
      );
    });
  }, [sessionEmployees, selectedDepartment, roleFilter]);

  const accurateSeniorityStats = useMemo(
    () => computeExactSeniorityStats(cohortBeforeSenioritySelection),
    [cohortBeforeSenioritySelection]
  );

  const filtered = useMemo(() => {
    const list =
      selectedSeniority === 'All'
        ? cohortBeforeSenioritySelection
        : cohortBeforeSenioritySelection.filter(
            (emp) => emp.seniority === selectedSeniority
          );
    return list.map((emp, idx) => ({
      ...emp,
      displayRank:
        selectedDepartment === 'All' &&
        selectedSeniority === 'All' &&
        !roleFilter.trim() &&
        sessionMode === 'domain'
          ? emp.rank
          : idx + 1,
    }));
  }, [
    cohortBeforeSenioritySelection,
    selectedSeniority,
    selectedDepartment,
    roleFilter,
    sessionMode,
  ]);

  const localTotalPages = Math.max(
    1,
    Math.ceil(filtered.length / ROLES_PER_PAGE)
  );
  const useServerBatchPagination =
    sessionMode === 'filter' &&
    !isViewingFilterCompany &&
    localTotalPages <= 1 &&
    selectedDepartment === 'All' &&
    selectedSeniority === 'All' &&
    !roleFilter.trim() &&
    (filterResult?.totalPages || 1) > 1 &&
    Boolean(onChangeGlobalPage);

  const totalPages = useServerBatchPagination
    ? Math.max(1, filterResult?.totalPages || 1)
    : localTotalPages;

  const safePage = useServerBatchPagination
    ? Math.min(Math.max(1, globalPage), totalPages)
    : Math.min(Math.max(1, currentPage), totalPages);

  const pageStartIndex = useServerBatchPagination
    ? 0
    : (safePage - 1) * ROLES_PER_PAGE;

  const displayed = useMemo(
    () => filtered.slice(pageStartIndex, pageStartIndex + ROLES_PER_PAGE),
    [filtered, pageStartIndex]
  );

  const isPaginationLoading = useServerBatchPagination
    ? requestedServerPage !== null ||
      (isFilterLoading &&
        Boolean(filterResult && filterResult.page !== globalPage))
    : localPageLoadingTarget !== null;

  const targetPaginationPage = useServerBatchPagination
    ? requestedServerPage ?? globalPage
    : localPageLoadingTarget ?? safePage;

  const handleSelectRolesPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(totalPages, nextPage));
    scrollToListTop(listTopRef.current);

    if (useServerBatchPagination && onChangeGlobalPage) {
      if (bounded === globalPage && !isPaginationLoading) return;
      setRequestedServerPage(bounded);
      onChangeGlobalPage(bounded);
      return;
    }

    if (bounded === safePage) return;
    if (localPageTimerRef.current !== null) {
      window.clearTimeout(localPageTimerRef.current);
    }
    setLocalPageLoadingTarget(bounded);
    localPageTimerRef.current = window.setTimeout(() => {
      updateCurrentPage(bounded);
      setLocalPageLoadingTarget(null);
      localPageTimerRef.current = null;
    }, 170);
  };

  const isInitialLoading =
    sessionMode === 'domain'
      ? isDomainLoading
      : isViewingFilterCompany
      ? isFilterCompanyLoading
      : isFilterLoading && !filterResult;

  if (isInitialLoading) {
    return (
      <div className="space-y-4">
        {isViewingFilterCompany && filterSelectedCompany && (
          <CompanyDrilldownHeader
            company={filterSelectedCompany}
            companyResult={activeSingleCompanyResult}
            onBackToCompaniesList={onBackToCompaniesList}
          />
        )}
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
          <span>Indexing organizational command hierarchy and authority tiers...</span>
        </div>
      </div>
    );
  }

  if (sessionMode === 'domain' && !domainResult) {
    return (
      <div className="py-12 px-4 text-center">
        <Crown className="mx-auto h-9 w-9 text-sky-600 dark:text-sky-400 mb-3" />
        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
          Command Hierarchy awaits a company domain lookup
        </h4>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Search any company domain above to map its Executive, Director / VP,
          Lead / Senior, and Individual Contributor authority tiers.
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
    <div ref={listTopRef} className="space-y-5 scroll-mt-24">
      {isViewingFilterCompany && filterSelectedCompany && (
        <CompanyDrilldownHeader
          company={filterSelectedCompany}
          companyResult={activeSingleCompanyResult}
          onBackToCompaniesList={onBackToCompaniesList}
        />
      )}

      {/* Exact 4-Tier Seniority Distribution Cards */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 px-0.5">
          <span>
            Authority distribution
            {(sessionMode === 'domain' || isViewingFilterCompany) &&
            activeSingleCompanyResult
              ? ` · ${activeSingleCompanyResult.companyName}`
              : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {accurateSeniorityStats.map((tier) => {
            const active = selectedSeniority === tier.seniority;
            return (
              <button
                key={tier.seniority}
                type="button"
                onClick={() => {
                  onSelectSeniority(active ? 'All' : tier.seniority);
                  updateCurrentPage(1);
                }}
                className={`text-left p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                  active
                    ? 'border-sky-500/60 bg-sky-500/12 shadow-xs'
                    : 'border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/45 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                  {tier.seniority}
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {tier.percentage}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar + Department Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            placeholder="Filter hierarchy by role or name (e.g., CEO, VP, Director, Engineer)..."
            aria-label="Filter command hierarchy"
            className="w-full min-h-[44px] sm:min-h-0 pl-9 pr-8 py-2 text-base sm:text-sm rounded-lg bg-white/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
          />
          {roleFilter && (
            <button
              type="button"
              onClick={() => setRoleFilter('')}
              aria-label="Clear role filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100/90 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800/80 overflow-x-auto max-w-full">
          {departmentsAvailable.map((dept) => {
            const active = selectedDepartment === dept;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => {
                  onSelectDepartment(dept);
                  updateCurrentPage(1);
                }}
                className={`min-h-[36px] sm:min-h-0 px-3 py-1.5 sm:px-2.5 sm:py-1 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </div>

      {/* Authority Ordering Summary */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {selectedSeniority !== 'All' ? (
            <>
              Filtered to{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {selectedSeniority}
              </strong>{' '}
              tier
            </>
          ) : (
            'All authority tiers ordered Most Important → Least Important'
          )}
        </span>
      </div>

      {/* Ranked Command Hierarchy HTML <table> */}
      {filtered.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No roles match the selected authority tier or search filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {isPaginationLoading && (
            <PaginationLoadingBanner
              message={`Loading page ${targetPaginationPage.toLocaleString()} of ${totalPages.toLocaleString()}...`}
              rightMeta={
                useServerBatchPagination
                  ? 'Fetching hierarchy batch on demand'
                  : 'Loading 500 roles'
              }
            />
          )}
          <div
            aria-busy={isPaginationLoading}
            className={`relative transition-opacity duration-150 ${
              isPaginationLoading ? 'opacity-55 pointer-events-none' : ''
            }`}
          >
            {/* Mobile Touch Cards (md:hidden) */}
            <div className="md:hidden space-y-2.5">
            {displayed.map((emp) => (
                <div
                  key={emp.id}
                  className="rounded-xl p-3.5 border border-slate-200/85 dark:border-slate-800/85 bg-white/85 dark:bg-slate-950/55 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                        #{emp.displayRank}
                      </span>
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {emp.jobTitle}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      {emp.fullName}
                    </p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>{emp.seniority}</span>
                      <span aria-hidden="true">·</span>
                      <span>{emp.department}</span>
                      {sessionMode === 'filter' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{emp.companyName || emp.domain}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <a
                    href={emp.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400"
                  >
                    <span>Profile</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
            ))}
          </div>

          {/* Desktop Compact & Seamlessly Swipeable Table (hidden md:block) */}
          <SwipeableTableContainer compactHint="Drag left/right, Shift+Scroll, or tap arrows to view all hierarchy columns">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/75 dark:bg-slate-900/75 text-[11px] uppercase tracking-wide font-semibold text-slate-600 dark:text-slate-300">
                  <th scope="col" className="py-2.5 px-3 w-12 font-mono">
                    #
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Role &amp; Authority
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Full Name
                  </th>
                  {sessionMode === 'filter' && (
                    <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                      Organization
                    </th>
                  )}
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Department
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                    Profile
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-xs sm:text-sm">
                {displayed.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-sky-500/[0.04] dark:hover:bg-sky-400/[0.05] transition-colors duration-150"
                    >
                      <td className="py-2 px-3 font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500">
                        {emp.displayRank}
                      </td>
                      <td className="py-2 px-3 max-w-[260px]" title={emp.jobTitle}>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {emp.jobTitle}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {emp.seniority}
                        </div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap max-w-[190px]">
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[175px] block">
                          {emp.fullName}
                        </span>
                      </td>
                      {sessionMode === 'filter' && (
                        <td className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[170px]">
                          <span className="block truncate">
                            {emp.companyName || emp.domain}
                          </span>
                        </td>
                      )}
                      <td className="py-2 px-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {emp.department}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <a
                          href={emp.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
                        >
                          <span>View</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </SwipeableTableContainer>
          </div>
        </div>
      )}

      <PaginationControls
        currentPage={safePage}
        totalPages={totalPages}
        isLoading={isPaginationLoading}
        targetPage={targetPaginationPage}
        perPageLabel={
          useServerBatchPagination ? '500 orgs/batch' : '500/page'
        }
        loadingLabel={`Loading page ${targetPaginationPage.toLocaleString()}...`}
        onSelectPage={handleSelectRolesPage}
      />
    </div>
  );
};
