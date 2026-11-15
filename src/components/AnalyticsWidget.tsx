import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, FilterX } from 'lucide-react';
import type {
  DepartmentCategory,
  SearchResponse,
  SeniorityLevel,
} from '../types';

interface AnalyticsWidgetProps {
  currentResult: SearchResponse | null;
  allSnapshots: Record<string, SearchResponse>;
  selectedDepartment: DepartmentCategory | 'All';
  selectedSeniority: SeniorityLevel | 'All';
  onSelectDepartment: (dept: DepartmentCategory | 'All') => void;
  onSelectSeniority: (sen: SeniorityLevel | 'All') => void;
  onSelectDomain: (domain: string) => void;
}

const DEPT_COLORS: Record<DepartmentCategory, string> = {
  Engineering: 'bg-sky-500 dark:bg-sky-400',
  'Product & Design': 'bg-indigo-500 dark:bg-indigo-400',
  Leadership: 'bg-amber-500 dark:bg-amber-400',
  'Sales & GTM': 'bg-emerald-500 dark:bg-emerald-400',
  'Operations & Finance': 'bg-teal-500 dark:bg-teal-400',
  'Research & Data': 'bg-blue-600 dark:bg-blue-400',
  General: 'bg-slate-500 dark:bg-slate-400',
};

const SENIORITY_SEGMENTS: Record<SeniorityLevel, string> = {
  Executive: 'bg-amber-500 dark:bg-amber-400',
  'Director / VP': 'bg-sky-500 dark:bg-sky-400',
  'Lead / Senior': 'bg-indigo-500 dark:bg-indigo-400',
  'Individual Contributor': 'bg-slate-400 dark:bg-slate-500',
};

export const AnalyticsWidget: React.FC<AnalyticsWidgetProps> = ({
  currentResult,
  allSnapshots,
  selectedDepartment,
  selectedSeniority,
  onSelectDepartment,
  onSelectSeniority,
  onSelectDomain,
}) => {
  const snapshotList = Object.values(allSnapshots).sort(
    (a, b) => b.employees.length - a.employees.length
  );
  const maxSnapshotCount = Math.max(
    1,
    ...snapshotList.map((item) => item.employees.length)
  );

  if (!currentResult || currentResult.employees.length === 0) {
    return (
      <div className="py-10 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500 mb-3" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Workforce distribution charts populate automatically once a company domain is queried.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Click any bar in the charts to filter the employee table in real time.
        </p>
      </div>
    );
  }

  const maxDeptCount = Math.max(
    1,
    ...currentResult.departmentBreakdown.map((d) => d.count)
  );

  const hasActiveChartFilter =
    selectedDepartment !== 'All' || selectedSeniority !== 'All';

  return (
    <div className="space-y-8">
      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pb-6 border-b border-slate-200/70 dark:border-slate-800/80">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Indexed Profiles</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
            {currentResult.employees.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {currentResult.domain}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Primary Function</p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-white truncate">
            {currentResult.departmentBreakdown[0]?.department || 'General'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {currentResult.departmentBreakdown[0]?.percentage || 0}% of sample
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Leadership & Senior</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
            {currentResult.seniorityBreakdown
              .filter((s) => s.seniority !== 'Individual Contributor')
              .reduce((acc, s) => acc + s.count, 0)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Lead, Director, or Executive
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Index Latency</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
            {currentResult.durationMs}ms
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {currentResult.cached ? 'Local/Server cache' : 'Live HTML scrape'}
          </p>
        </div>
      </div>

      {hasActiveChartFilter && (
        <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-300 pb-2">
          <span>
            Filtering directory by{' '}
            <strong className="font-semibold">
              {[
                selectedDepartment !== 'All' ? selectedDepartment : null,
                selectedSeniority !== 'All' ? selectedSeniority : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => {
              onSelectDepartment('All');
              onSelectSeniority('All');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FilterX className="h-3.5 w-3.5" />
            Clear chart filter
          </button>
        </div>
      )}

      {/* Two-Column Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Department Breakdown */}
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Department Distribution
            </h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Click a bar to filter rows
            </span>
          </div>
          <div className="space-y-3">
            {currentResult.departmentBreakdown.map((item) => {
              const isSelected = selectedDepartment === item.department;
              const widthRatio = Math.max(6, Math.round((item.count / maxDeptCount) * 100));
              return (
                <button
                  key={item.department}
                  type="button"
                  onClick={() =>
                    onSelectDepartment(isSelected ? 'All' : item.department)
                  }
                  className={`w-full text-left group rounded-lg p-2 -mx-2 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    isSelected
                      ? 'bg-sky-500/10 dark:bg-sky-400/10'
                      : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span
                      className={`font-medium transition-colors ${
                        isSelected
                          ? 'text-sky-700 dark:text-sky-300'
                          : 'text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white'
                      }`}
                    >
                      {item.department}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {item.count} · {item.percentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: widthRatio / 100 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      style={{ transformOrigin: 'left' }}
                      className={`h-full w-full rounded-full ${DEPT_COLORS[item.department]}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Seniority Composition + Multi-Domain Benchmark */}
        <div className="space-y-7">
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Seniority Composition
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {currentResult.employees.length} total
              </span>
            </div>

            {/* Stacked Proportion Bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800 gap-0.5">
              {currentResult.seniorityBreakdown.map((tier) => (
                <motion.button
                  key={tier.seniority}
                  type="button"
                  title={`${tier.seniority}: ${tier.count} (${tier.percentage}%)`}
                  onClick={() =>
                    onSelectSeniority(
                      selectedSeniority === tier.seniority ? 'All' : tier.seniority
                    )
                  }
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{ width: `${Math.max(tier.percentage, 5)}%` }}
                  className={`h-full cursor-pointer transition-opacity hover:opacity-80 ${
                    SENIORITY_SEGMENTS[tier.seniority]
                  }`}
                />
              ))}
            </div>

            {/* Interactive Legend List */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {currentResult.seniorityBreakdown.map((tier) => {
                const active = selectedSeniority === tier.seniority;
                return (
                  <button
                    key={tier.seniority}
                    type="button"
                    onClick={() =>
                      onSelectSeniority(active ? 'All' : tier.seniority)
                    }
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors duration-150 cursor-pointer border ${
                      active
                        ? 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200'
                        : 'border-slate-200/70 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className={`h-2 w-2 rounded-xs shrink-0 ${
                          SENIORITY_SEGMENTS[tier.seniority]
                        }`}
                      />
                      <span className="truncate font-medium">{tier.seniority}</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 ml-2 shrink-0">
                      {tier.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-Domain Volume Comparison */}
          {snapshotList.length > 1 && (
            <div className="pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Indexed Volume Across Domains
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {snapshotList.length} companies
                </span>
              </div>
              <div className="space-y-2">
                {snapshotList.slice(0, 4).map((snap) => {
                  const isCurrent = snap.domain === currentResult.domain;
                  const ratio = Math.max(
                    8,
                    Math.round((snap.employees.length / maxSnapshotCount) * 100)
                  );
                  return (
                    <button
                      key={snap.domain}
                      type="button"
                      onClick={() => onSelectDomain(snap.domain)}
                      className="w-full flex items-center gap-3 text-xs py-1 group cursor-pointer"
                    >
                      <span
                        className={`w-28 truncate text-left font-mono ${
                          isCurrent
                            ? 'font-semibold text-sky-600 dark:text-sky-400'
                            : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'
                        }`}
                      >
                        {snap.domain}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${ratio}%` }}
                          className={`h-full rounded-full transition-opacity ${
                            isCurrent
                              ? 'bg-sky-500 dark:bg-sky-400'
                              : 'bg-slate-400 dark:bg-slate-600 group-hover:opacity-90'
                          }`}
                        />
                      </div>
                      <span className="w-8 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {snap.employees.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
