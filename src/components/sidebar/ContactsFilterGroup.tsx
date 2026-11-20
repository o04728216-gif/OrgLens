import React from 'react';
import type { SidebarFiltersState } from '../../types';
import { SidebarAccordionCard } from './SidebarAccordionCard';
import {
  DEPARTMENT_OPTIONS,
  SENIORITY_OPTIONS,
  countEnteredTerms,
  type AccordionSectionId,
} from './sidebarConstants';

interface ContactsFilterGroupProps {
  filters: SidebarFiltersState;
  sectionCounts: Record<AccordionSectionId, number>;
  sidebarSearch: string;
  isSectionOpen: (id: AccordionSectionId) => boolean;
  onToggleSection: (id: AccordionSectionId) => void;
  onChangeFilters: (
    updater: (prev: SidebarFiltersState) => SidebarFiltersState
  ) => void;
}

export const ContactsFilterGroup: React.FC<ContactsFilterGroupProps> = ({
  filters,
  sectionCounts,
  sidebarSearch,
  isSectionOpen,
  onToggleSection,
  onChangeFilters,
}) => {
  const q = sidebarSearch.trim().toLowerCase();

  const matchesQuickFilter = (keywords: string, extraMatch = false): boolean => {
    if (!q) return true;
    return extraMatch || keywords.toLowerCase().includes(q);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white px-0.5">
        Contacts
      </h3>

      {/* 1. Contact Name or Email */}
      {matchesQuickFilter('contact name email address person') && (
        <SidebarAccordionCard
          id="contact-name"
          label="Contact Name or Email"
          selectedCount={sectionCounts['contact-name']}
          opened={isSectionOpen('contact-name')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Name or Email Filter</span>
              <span
                className={`font-mono tabular-nums ${
                  sectionCounts['contact-name'] > 0
                    ? 'font-semibold text-sky-600 dark:text-sky-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {sectionCounts['contact-name']} selected
              </span>
            </div>
            <input
              type="text"
              value={filters.contactSearch}
              onChange={(e) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  contactSearch: e.target.value,
                }))
              }
              placeholder="Filter by full name or email..."
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
        </SidebarAccordionCard>
      )}

      {/* 2. Current Role & Seniority */}
      {matchesQuickFilter(
        'current role job title seniority department ceo vp engineer director lead executive sales operations finance research product',
        SENIORITY_OPTIONS.some((s) => s.toLowerCase().includes(q)) ||
          DEPARTMENT_OPTIONS.some((d) => d.toLowerCase().includes(q))
      ) && (
        <SidebarAccordionCard
          id="current-role"
          label="Current Role"
          selectedCount={sectionCounts['current-role']}
          totalOptions={SENIORITY_OPTIONS.length + DEPARTMENT_OPTIONS.length}
          opened={isSectionOpen('current-role')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2 space-y-3 border-t border-slate-200/60 dark:border-slate-800/60">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <label>Job Title Keyword</label>
                {countEnteredTerms(filters.roleKeyword) > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                    {countEnteredTerms(filters.roleKeyword)}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={filters.roleKeyword}
                onChange={(e) =>
                  onChangeFilters((prev) => ({
                    ...prev,
                    roleKeyword: e.target.value,
                  }))
                }
                placeholder="e.g., Chief, VP, Director, Product"
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>Seniority Level</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    filters.seniorities.length > 0
                      ? 'font-semibold text-sky-600 dark:text-sky-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {filters.seniorities.length > 0
                    ? `${filters.seniorities.length}/${SENIORITY_OPTIONS.length}`
                    : SENIORITY_OPTIONS.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {SENIORITY_OPTIONS.map((level) => {
                  const checked = filters.seniorities.includes(level);
                  return (
                    <label
                      key={level}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeFilters((prev) => ({
                            ...prev,
                            seniorities: checked
                              ? prev.seniorities.filter((s) => s !== level)
                              : [...prev.seniorities, level],
                          }))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{level}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>Department</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    filters.departments.length > 0
                      ? 'font-semibold text-sky-600 dark:text-sky-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {filters.departments.length > 0
                    ? `${filters.departments.length}/${DEPARTMENT_OPTIONS.length}`
                    : DEPARTMENT_OPTIONS.length}
                </span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {DEPARTMENT_OPTIONS.map((dept) => {
                  const checked = filters.departments.includes(dept);
                  return (
                    <label
                      key={dept}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeFilters((prev) => ({
                            ...prev,
                            departments: checked
                              ? prev.departments.filter((d) => d !== dept)
                              : [...prev.departments, dept],
                          }))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{dept}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </SidebarAccordionCard>
      )}

      {/* 3. Accuracy Score */}
      {matchesQuickFilter(
        'accuracy score confidence verified percentage 75 85 90 99'
      ) && (
        <SidebarAccordionCard
          id="accuracy-score"
          label="Accuracy Score"
          selectedCount={sectionCounts['accuracy-score']}
          totalOptions={4}
          opened={isSectionOpen('accuracy-score')}
          onToggle={onToggleSection}
        >
          <div className="px-3.5 pb-3.5 pt-2 space-y-2.5 border-t border-bone-200/80 dark:border-petrol-800/80">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'All (50–99%)', min: 50, max: 99 },
                { label: '75–99%', min: 75, max: 99 },
                { label: '85–99%', min: 85, max: 99 },
                { label: '90%+', min: 90, max: 99 },
                { label: '99% Verified', min: 99, max: 99 },
              ].map((preset) => {
                const active =
                  filters.minAccuracy === preset.min &&
                  filters.maxAccuracy === preset.max;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onChangeFilters((prev) => ({
                        ...prev,
                        minAccuracy: preset.min,
                        maxAccuracy: preset.max,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-petrol-700 text-bone-50 dark:bg-lemon-400 dark:text-petrol-950'
                        : 'bg-bone-50 dark:bg-petrol-950 border border-bone-300 dark:border-petrol-700 text-petrol-800 dark:text-bone-200 hover:border-petrol-600 dark:hover:border-lemon-400/70'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-bone-200/75">
                <span>Minimum Accuracy</span>
                <span className="font-mono tabular-nums font-semibold text-petrol-900 dark:text-lemon-300">
                  {filters.minAccuracy}% – {filters.maxAccuracy}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                value={filters.minAccuracy}
                onChange={(e) => {
                  const nextMin = Number(e.target.value);
                  onChangeFilters((prev) => ({
                    ...prev,
                    minAccuracy: nextMin,
                    maxAccuracy: Math.max(nextMin, prev.maxAccuracy),
                  }));
                }}
                aria-label="Minimum email accuracy percentage"
                className="w-full accent-petrol-700 dark:accent-lemon-400 cursor-pointer"
              />
            </div>
          </div>
        </SidebarAccordionCard>
      )}
    </div>
  );
};
