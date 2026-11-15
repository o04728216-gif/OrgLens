import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  SearchResponse,
  SeniorityLevel,
  SeniorityStat,
  SessionMode,
  SidebarFiltersState,
} from '../types';
import { applyExcelEmailFormula } from '../utils/emailFormulas';

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
}

const ROLES_PER_PAGE = 500;

const ORDERED_SENIORITY_TIERS: SeniorityLevel[] = [
  'Executive',
  'Director / VP',
  'Lead / Senior',
  'Individual Contributor',
];

function computeExactSeniorityStats(
  employees: EmployeeRecord[]
): SeniorityStat[] {
  const countsMap = new Map<SeniorityLevel, number>(
    ORDERED_SENIORITY_TIERS.map((tier) => [tier, 0])
  );
  for (const emp of employees) {
    countsMap.set(emp.seniority, (countsMap.get(emp.seniority) || 0) + 1);
  }

  const counts = ORDERED_SENIORITY_TIERS.map(
    (tier) => countsMap.get(tier) || 0
  );
  const total = counts.reduce((acc, c) => acc + c, 0);

  if (total <= 0) {
    return ORDERED_SENIORITY_TIERS.map((seniority) => ({
      seniority,
      count: 0,
      percentage: 0,
    }));
  }

  // Largest Remainder method so percentages sum strictly to 100%
  const exactQuotas = counts.map((c) => (c / total) * 100);
  const floors = exactQuotas.map((q) => Math.floor(q));
  let remainderUnits = 100 - floors.reduce((acc, f) => acc + f, 0);

  const rankedIndices = exactQuotas
    .map((q, idx) => ({
      idx,
      rem: q - floors[idx],
      count: counts[idx],
    }))
    .sort((a, b) => {
      if (b.rem !== a.rem) return b.rem - a.rem;
      return b.count - a.count;
    });

  for (let i = 0; i < rankedIndices.length && remainderUnits > 0; i++) {
    if (rankedIndices[i].count > 0) {
      floors[rankedIndices[i].idx] += 1;
      remainderUnits -= 1;
    }
  }

  // Ensure any non-zero seniority tier displays at least 1% while keeping sum === 100%
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0 && floors[i] === 0) {
      let donorIdx = -1;
      for (let j = 0; j < floors.length; j++) {
        if (floors[j] > 1 && (donorIdx === -1 || floors[j] > floors[donorIdx])) {
          donorIdx = j;
        }
      }
      if (donorIdx !== -1) {
        floors[donorIdx] -= 1;
        floors[i] = 1;
      }
    }
  }

  return ORDERED_SENIORITY_TIERS.map((seniority, idx) => ({
    seniority,
    count: counts[idx],
    percentage: floors[idx],
  }));
}

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
}) => {
  const [domainRoleFilter, setDomainRoleFilter] = useState('');
  const [filterSessionRoleFilter, setFilterSessionRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    sessionMode,
    domainResult?.domain,
    filterResult?.fetchedAt,
    selectedDepartment,
    selectedSeniority,
  ]);

  const roleFilter =
    sessionMode === 'domain' ? domainRoleFilter : filterSessionRoleFilter;
  const setRoleFilter = (val: string) => {
    if (sessionMode === 'domain') {
      setDomainRoleFilter(val);
    } else {
      setFilterSessionRoleFilter(val);
    }
    setCurrentPage(1);
  };

  // Resolve session-specific source employees (Domain Session stays 100% isolated from Sidebar Filters)
  const sessionEmployees = useMemo<EmployeeRecord[]>(() => {
    if (sessionMode === 'domain') {
      return domainResult ? domainResult.employees : [];
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
    domainResult,
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

  // Cohort filtered by local role keyword + department (before clicking a Seniority Tier card)
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

  // Exact Seniority Tier Breakdown (counts & percentages always sum to cohortBeforeSenioritySelection.length and 100%)
  const accurateSeniorityStats = useMemo(
    () => computeExactSeniorityStats(cohortBeforeSenioritySelection),
    [cohortBeforeSenioritySelection]
  );

  // Final displayed rows after applying selectedSeniority card toggle
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROLES_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * ROLES_PER_PAGE;

  const displayed = useMemo(
    () => filtered.slice(pageStartIndex, pageStartIndex + ROLES_PER_PAGE),
    [filtered, pageStartIndex]
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

  const isInitialLoading =
    sessionMode === 'domain'
      ? isDomainLoading
      : isFilterLoading && !filterResult;

  if (isInitialLoading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
        <span>Indexing organizational command hierarchy and authority tiers...</span>
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
          Search any company domain above to map its Executive, Director / VP, Lead / Senior, and Individual Contributor tiers with exact counts and percentages.
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
    <div className="space-y-5">
      {/* Exact 4-Tier Seniority Distribution Cards (Executive, Director / VP, Lead / Senior, Individual Contributor) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 px-0.5">
          <span>
            Authority distribution across{' '}
            <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {cohortBeforeSenioritySelection.length.toLocaleString()}
            </strong>{' '}
            {sessionMode === 'domain' && domainResult
              ? `${domainResult.companyName} roles`
              : 'filtered roles'}
          </span>
          {sessionMode === 'filter' && isFilterLoading && (
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing hierarchy...
            </span>
          )}
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
                  setCurrentPage(1);
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
                    {tier.count.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono tabular-nums font-semibold text-sky-700 dark:text-sky-400">
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
            className="w-full pl-9 pr-8 py-2 text-base sm:text-sm rounded-lg bg-white/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
          />
          {roleFilter && (
            <button
              type="button"
              onClick={() => setRoleFilter('')}
              aria-label="Clear role filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
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
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
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

      {/* Accurate Row Count Summary */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {selectedSeniority !== 'All' ? (
            <>
              Filtered to <strong className="text-slate-800 dark:text-slate-200">{selectedSeniority}</strong> tier
            </>
          ) : (
            'All authority tiers ordered Most Important → Least Important'
          )}
        </span>
        <span className="font-mono tabular-nums whitespace-nowrap">
          {filtered.length === 0
            ? 'Showing 0 roles'
            : `Showing ${(pageStartIndex + 1).toLocaleString()}–${(
                pageStartIndex + displayed.length
              ).toLocaleString()} of ${filtered.length.toLocaleString()} roles (500/page)`}
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
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-950/35">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/75 dark:bg-slate-900/75 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th scope="col" className="py-3 px-4 w-16 font-mono">
                  Rank
                </th>
                <th scope="col" className="py-3 px-4">
                  Role &amp; Authority
                </th>
                <th scope="col" className="py-3 px-4">
                  Full Name
                </th>
                {sessionMode === 'filter' && (
                  <th scope="col" className="py-3 px-4 hidden sm:table-cell">
                    Organization
                  </th>
                )}
                <th scope="col" className="py-3 px-4 hidden md:table-cell">
                  Department
                </th>
                <th scope="col" className="py-3 px-4 w-24 text-right">
                  Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-sm">
              {displayed.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-sky-500/[0.04] dark:hover:bg-sky-400/[0.05] transition-colors duration-150"
                >
                  <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500">
                    {emp.displayRank}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {emp.jobTitle}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {emp.seniority}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {emp.fullName}
                  </td>
                  {sessionMode === 'filter' && (
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell whitespace-nowrap">
                      {emp.companyName || emp.domain}
                    </td>
                  )}
                  <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-400 hidden md:table-cell whitespace-nowrap">
                    {emp.department}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <a
                      href={emp.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
                    >
                      View
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              aria-label="Previous roles page"
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
              aria-label="Next roles page"
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
