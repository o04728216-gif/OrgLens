import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Building2,
  Globe2,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  DepartmentCategory,
  SearchResponse,
  SessionMode,
} from '../../types';

interface DomainIndustryProfileProps {
  domainResult: SearchResponse | null;
  allSnapshots: Record<string, SearchResponse>;
  isDomainLoading: boolean;
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

export const DomainIndustryProfile: React.FC<DomainIndustryProfileProps> = ({
  domainResult,
  allSnapshots,
  isDomainLoading,
  onSelectDomain,
  onSwitchSessionMode,
  onFocusDomainInput,
}) => {
  const snapshotList = useMemo(
    () =>
      Object.values(allSnapshots).sort(
        (a, b) => b.employees.length - a.employees.length
      ),
    [allSnapshots]
  );

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
          Search any company domain above to inspect its industry classification
          and departmental breakdown, or switch to Filter Explorer to browse
          millions of companies worldwide.
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
            Sector: {domainResult.industryTags[0] || domainResult.industry}
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
};
