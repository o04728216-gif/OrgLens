import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FolderSearch,
  Gauge,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import type {
  DepartmentCategory,
  GlobalIndustryOption,
  SearchResponse,
  SeniorityLevel,
  SidebarFiltersState,
} from '../types';
import {
  EMAIL_FORMULAS,
  truncateIndustry20,
  type EmailFormulaId,
} from '../utils/emailFormulas';
import {
  COMPANY_REVENUE_RANGES,
  CONTINENTS_CATALOG,
} from '../utils/geographyAndRevenue';

interface FilterSidebarProps {
  filters: SidebarFiltersState;
  onChangeFilters: (
    updater: (prev: SidebarFiltersState) => SidebarFiltersState
  ) => void;
  onResetFilters: () => void;
  globalIndustries: GlobalIndustryOption[];
  industriesLoading: boolean;
  onSelectIndustryFilter: (slugs: string[]) => void;
  onActivateCompanyDirectory: () => void;
  onDomainDirectLookup: (domain: string) => void;
  onBulkDomainsUpload: (domains: string[]) => void;
  snapshots: Record<string, SearchResponse>;
  activeDomain: string | null;
  onSelectSavedSnapshot: (domain: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isFilterLoading?: boolean;
}

const SENIORITY_OPTIONS: SeniorityLevel[] = [
  'Executive',
  'Director / VP',
  'Lead / Senior',
  'Individual Contributor',
];

const DEPARTMENT_OPTIONS: DepartmentCategory[] = [
  'Leadership',
  'Engineering',
  'Product & Design',
  'Research & Data',
  'Sales & GTM',
  'Operations & Finance',
  'General',
];

const EMPLOYEE_RANGE_OPTIONS = [
  '1 - 50',
  '51 - 200',
  '201 - 500',
  '501 - 1,000',
  '1,001 - 5,000',
  '5,001 - 10,000',
  '10,000+',
];

type AccordionSectionId =
  | 'contact-name'
  | 'current-role'
  | 'email-formula'
  | 'accuracy-score'
  | 'company-name'
  | 'industry'
  | 'employee-count'
  | 'company-revenue'
  | 'locations';

export function countActiveSidebarFilters(f: SidebarFiltersState): number {
  let count = 0;
  if (f.contactSearch.trim()) count++;
  if (f.roleKeyword.trim()) count++;
  if (f.seniorities.length > 0) count++;
  if (f.departments.length > 0) count++;
  if (f.minAccuracy > 50 || f.maxAccuracy < 99) count++;
  if (f.emailFormulaOverride !== 'auto') count++;
  if (f.companyNameFilter.trim()) count++;
  if (f.selectedIndustrySlugs.length > 0) count++;
  if (f.industryKeyword.trim()) count++;
  if (f.employeeRanges.length > 0) count++;
  if (f.revenueRanges.length > 0) count++;
  if (f.selectedContinents.length > 0) count++;
  if (f.selectedCountries.length > 0) count++;
  if (f.locationQuery.trim()) count++;
  return count;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onChangeFilters,
  onResetFilters,
  globalIndustries,
  industriesLoading,
  onSelectIndustryFilter,
  onActivateCompanyDirectory,
  onDomainDirectLookup,
  onBulkDomainsUpload,
  snapshots,
  activeDomain,
  onSelectSavedSnapshot,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  isFilterLoading = false,
}) => {
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [industrySearch, setIndustrySearch] = useState('');
  const [locationTreeSearch, setLocationTreeSearch] = useState('');
  const [showSavedMenu, setShowSavedMenu] = useState(false);

  const [openSections, setOpenSections] = useState<
    Record<AccordionSectionId, boolean>
  >({
    'contact-name': false,
    'current-role': false,
    'email-formula': false,
    'accuracy-score': true,
    'company-name': false,
    industry: true,
    'employee-count': false,
    'company-revenue': false,
    locations: true,
  });

  // Track which Continents have their Country dropdown expanded
  const [expandedContinents, setExpandedContinents] = useState<
    Record<string, boolean>
  >({
    'north-america': true,
    europe: false,
    asia: false,
    'south-america': false,
    africa: false,
    oceania: false,
    antarctica: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeCount = useMemo(
    () => countActiveSidebarFilters(filters),
    [filters]
  );

  const toggleSection = (id: AccordionSectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleContinentDropdown = (continentId: string) => {
    setExpandedContinents((prev) => ({
      ...prev,
      [continentId]: !prev[continentId],
    }));
  };

  const filteredGlobalIndustries = useMemo(() => {
    const q = (industrySearch || sidebarSearch).trim().toLowerCase();
    if (!q) return globalIndustries;
    return globalIndustries.filter(
      (ind) =>
        ind.fullTitle.toLowerCase().includes(q) ||
        ind.rawTitle.toLowerCase().includes(q) ||
        ind.slug.toLowerCase().includes(q)
    );
  }, [globalIndustries, industrySearch, sidebarSearch]);

  // Filter Continents & Countries tree dynamically when searching in Locations
  const filteredContinentsTree = useMemo(() => {
    const q = locationTreeSearch.trim().toLowerCase();
    if (!q) return CONTINENTS_CATALOG;

    return CONTINENTS_CATALOG.map((continent) => {
      const continentMatches = continent.name.toLowerCase().includes(q);
      const matchingCountries = continentMatches
        ? continent.countries
        : continent.countries.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(q)))
          );
      return {
        ...continent,
        countries: matchingCountries,
      };
    }).filter((c) => c.countries.length > 0);
  }, [locationTreeSearch]);

  const matchesQuickFilter = (keywords: string): boolean => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return true;
    return keywords.toLowerCase().includes(q);
  };

  const handleToggleIndustrySlug = (slug: string) => {
    const exists = filters.selectedIndustrySlugs.includes(slug);
    const nextSlugs = exists
      ? filters.selectedIndustrySlugs.filter((s) => s !== slug)
      : filters.industryMatchMode === 'primary'
      ? [slug]
      : [...filters.selectedIndustrySlugs, slug];

    onSelectIndustryFilter(nextSlugs);
  };

  const handleToggleContinentCheckbox = (continentName: string) => {
    onChangeFilters((prev) => {
      const isSelected = prev.selectedContinents.includes(continentName);
      return {
        ...prev,
        selectedContinents: isSelected
          ? prev.selectedContinents.filter((c) => c !== continentName)
          : [...prev.selectedContinents, continentName],
      };
    });
    onActivateCompanyDirectory();
  };

  const handleToggleCountryCheckbox = (countryName: string) => {
    onChangeFilters((prev) => {
      const isSelected = prev.selectedCountries.includes(countryName);
      return {
        ...prev,
        selectedCountries: isSelected
          ? prev.selectedCountries.filter((c) => c !== countryName)
          : [...prev.selectedCountries, countryName],
      };
    });
    onActivateCompanyDirectory();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rawTokens = text
        .split(/[\r\n,;|\t\s]+/)
        .map((t) =>
          t
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0]
            .replace(/^@/, '')
        )
        .filter((d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d));

      const uniqueDomains = Array.from(new Set(rawTokens)).slice(0, 12);
      if (uniqueDomains.length > 0) {
        onBulkDomainsUpload(uniqueDomains);
      }
    } finally {
      e.target.value = '';
    }
  };

  const savedSnapshotEntries = useMemo(
    () =>
      Object.values(snapshots).sort(
        (a, b) => b.employees.length - a.employees.length
      ),
    [snapshots]
  );

  const renderExpandedBody = () => (
    <div className="flex flex-col h-full min-h-0">
      {/* Top Header: Filters Count + Clear All + Collapse Button */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Filters
          </span>
          {activeCount > 0 && (
            <span className="font-mono tabular-nums text-xs font-semibold text-sky-600 dark:text-sky-400">
              · {activeCount}
            </span>
          )}
          {isFilterLoading && (
            <Loader2
              aria-label="Auto-loading filtered results"
              className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400 shrink-0"
            />
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="ml-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse filter sidebar"
            title="Collapse sidebar"
            className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close filter drawer"
            className="lg:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search Filters or Values + Upload List / My Searches */}
      <div className="shrink-0 px-4 py-3 space-y-2.5 border-b border-slate-200/70 dark:border-slate-800/70">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Search filters or values"
            aria-label="Search filters or values"
            className="w-full pl-8 pr-7 py-2 text-xs rounded-lg bg-white dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
          />
          {sidebarSearch && (
            <button
              type="button"
              onClick={() => setSidebarSearch('')}
              aria-label="Clear sidebar search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => void handleFileUpload(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Upload list
          </button>

          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            |
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSavedMenu((v) => !v)}
              className="inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>My Searches ({savedSnapshotEntries.length})</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {showSavedMenu && (
              <div className="absolute right-0 mt-1.5 w-56 z-30 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-1.5 max-h-56 overflow-y-auto">
                {savedSnapshotEntries.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400">
                    Searched domains appear here automatically.
                  </p>
                ) : (
                  savedSnapshotEntries.map((snap) => (
                    <button
                      key={snap.domain}
                      type="button"
                      onClick={() => {
                        onSelectSavedSnapshot(snap.domain);
                        setShowSavedMenu(false);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        activeDomain === snap.domain
                          ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{snap.companyName}</span>
                      <span className="font-mono tabular-nums text-slate-400 shrink-0">
                        {snap.employees.length.toLocaleString()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Filter Sections (100% Free to Use — Smooth Scroll to End) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-20 space-y-5">
        {/* ==================== CONTACTS GROUP ==================== */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white px-0.5">
            Contacts
          </h3>

          {/* 1. Contact Name or Email */}
          {matchesQuickFilter('contact name email address person') && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('contact-name')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Contact Name or Email</span>
                {openSections['contact-name'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['contact-name'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-800/60">
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
              )}
            </div>
          )}

          {/* 2. Current Role & Seniority */}
          {matchesQuickFilter(
            'current role job title seniority department ceo vp engineer'
          ) && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('current-role')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Current Role</span>
                {openSections['current-role'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['current-role'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-3 border-t border-slate-200/60 dark:border-slate-800/60">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Job Title Keyword
                    </label>
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
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      Seniority Level
                    </p>
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
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      Department
                    </p>
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
              )}
            </div>
          )}

          {/* 3. Corporate Email Format Patterns */}
          {matchesQuickFilter(
            'contact info email format pattern corporate address domain'
          ) && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('email-formula')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Email Format ({EMAIL_FORMULAS.length} Patterns)</span>
                {openSections['email-formula'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['email-formula'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-800/60">
                  <select
                    value={filters.emailFormulaOverride}
                    onChange={(e) =>
                      onChangeFilters((prev) => ({
                        ...prev,
                        emailFormulaOverride: e.target.value as
                          | EmailFormulaId
                          | 'auto',
                      }))
                    }
                    aria-label="Select corporate email format"
                    className="w-full px-2.5 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value="auto">
                      Auto-Detect Company Format (Intelligent)
                    </option>
                    {EMAIL_FORMULAS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label} ({f.exampleLocal}@domain)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 4. Accuracy Score */}
          {matchesQuickFilter('accuracy score confidence verified percentage 75 99') && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('accuracy-score')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Accuracy Score</span>
                {openSections['accuracy-score'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['accuracy-score'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { label: 'All (50–99%)', min: 50, max: 99 },
                      { label: '75–99%', min: 75, max: 99 },
                      { label: '85–99%', min: 85, max: 99 },
                      { label: '90%+', min: 90, max: 99 },
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-sky-600 text-white'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-sky-500/50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Minimum Accuracy</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                        {filters.minAccuracy}% – {filters.maxAccuracy}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={98}
                      value={filters.minAccuracy}
                      onChange={(e) =>
                        onChangeFilters((prev) => ({
                          ...prev,
                          minAccuracy: Number(e.target.value),
                        }))
                      }
                      aria-label="Minimum email accuracy percentage"
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ==================== COMPANIES GROUP ==================== */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white px-0.5">
            Companies
          </h3>

          {/* 5. Company Name */}
          {matchesQuickFilter('company name domain website') && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('company-name')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Company Name</span>
                {openSections['company-name'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['company-name'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-800/60">
                  <input
                    type="text"
                    value={filters.companyNameFilter}
                    onChange={(e) =>
                      onChangeFilters((prev) => ({
                        ...prev,
                        companyNameFilter: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        filters.companyNameFilter.includes('.')
                      ) {
                        e.preventDefault();
                        onDomainDirectLookup(filters.companyNameFilter);
                        onCloseMobile();
                      }
                    }}
                    placeholder="Filter name or press Enter on domain..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              )}
            </div>
          )}

          {/* 6. Industry (Worldwide Global Company List Trigger, Any | Primary, Full Industry Titles) */}
          {matchesQuickFilter(
            'industry company sector retail software banking healthcare'
          ) && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('industry')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Industry</span>
                {openSections.industry ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>

              {openSections.industry && (
                <div className="px-3.5 pb-3.5 pt-2.5 space-y-3 border-t border-slate-200/60 dark:border-slate-800/60">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Company Industry
                    </p>
                    <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-200/75 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800">
                      {(['any', 'primary'] as const).map((mode) => {
                        const active = filters.industryMatchMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() =>
                              onChangeFilters((prev) => ({
                                ...prev,
                                industryMatchMode: mode,
                                selectedIndustrySlugs:
                                  mode === 'primary' &&
                                  prev.selectedIndustrySlugs.length > 1
                                    ? [prev.selectedIndustrySlugs[0]]
                                    : prev.selectedIndustrySlugs,
                              }))
                            }
                            className={`py-1 text-xs font-semibold rounded-md transition-all cursor-pointer capitalize ${
                              active
                                ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={industrySearch}
                      onChange={(e) => setIndustrySearch(e.target.value)}
                      placeholder="Search for an industry"
                      aria-label="Search for an industry"
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                    {industrySearch && (
                      <button
                        type="button"
                        onClick={() => setIndustrySearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {filters.selectedIndustrySlugs.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Selected Worldwide Industry:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {filters.selectedIndustrySlugs.map((slug) => {
                          const found = globalIndustries.find(
                            (g) => g.slug === slug
                          );
                          const fullLabel = found ? found.fullTitle : slug;
                          return (
                            <button
                              key={slug}
                              type="button"
                              title={fullLabel}
                              onClick={() => handleToggleIndustrySlug(slug)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer text-left max-w-full overflow-hidden"
                            >
                              <span className="whitespace-nowrap truncate">
                                {truncateIndustry20(fullLabel)}
                              </span>
                              <X className="h-3 w-3 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2 space-y-1">
                    {industriesLoading ? (
                      <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        Loading global industries...
                      </p>
                    ) : filteredGlobalIndustries.length === 0 ? (
                      <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                        No matching industry found.
                      </p>
                    ) : (
                      filteredGlobalIndustries.map((ind) => {
                        const checked = filters.selectedIndustrySlugs.includes(
                          ind.slug
                        );
                        return (
                          <label
                            key={ind.slug}
                            title={ind.fullTitle}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors overflow-hidden ${
                              checked
                                ? 'bg-sky-500/10 text-slate-900 dark:text-white font-semibold'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0 overflow-hidden">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  handleToggleIndustrySlug(ind.slug)
                                }
                                className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                              />
                              <span className="whitespace-nowrap truncate">
                                {truncateIndustry20(ind.fullTitle)}
                              </span>
                            </span>
                            {ind.companyCount > 0 && (
                              <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
                                {ind.companyCount.toLocaleString()}
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Industry Keywords
                    </label>
                    <input
                      type="text"
                      value={filters.industryKeyword}
                      onChange={(e) =>
                        onChangeFilters((prev) => ({
                          ...prev,
                          industryKeyword: e.target.value,
                        }))
                      }
                      placeholder="e.g., Cybersecurity, Payments, Cloud"
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. Employee Count */}
          {matchesQuickFilter(
            'employee count size headcount 50 200 500 1000 10000'
          ) && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('employee-count')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Employee Count</span>
                {openSections['employee-count'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['employee-count'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                  {EMPLOYEE_RANGE_OPTIONS.map((range) => {
                    const checked = filters.employeeRanges.includes(range);
                    return (
                      <label
                        key={range}
                        className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            onChangeFilters((prev) => ({
                              ...prev,
                              employeeRanges: checked
                                ? prev.employeeRanges.filter((r) => r !== range)
                                : [...prev.employeeRanges, range],
                            }));
                            onActivateCompanyDirectory();
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span>{range}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 8. Company Revenue */}
          {matchesQuickFilter(
            'company revenue annual sales turnover million billion $1m $10m $50m $100m $1b $10b'
          ) && (
            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('company-revenue')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Company Revenue</span>
                  {filters.revenueRanges.length > 0 && (
                    <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
                      · {filters.revenueRanges.length}
                    </span>
                  )}
                </span>
                {openSections['company-revenue'] ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>
              {openSections['company-revenue'] && (
                <div className="px-3.5 pb-3.5 pt-2 space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                  {COMPANY_REVENUE_RANGES.map((revRange) => {
                    const checked = filters.revenueRanges.includes(revRange);
                    return (
                      <label
                        key={revRange}
                        className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            onChangeFilters((prev) => ({
                              ...prev,
                              revenueRanges: checked
                                ? prev.revenueRanges.filter((r) => r !== revRange)
                                : [...prev.revenueRanges, revRange],
                            }));
                            onActivateCompanyDirectory();
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span>{revRange}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ==================== LOCATIONS GROUP (ALL 7 CONTINENTS + COUNTRY DROPDOWNS) ==================== */}
        {matchesQuickFilter(
          'locations continents countries north america europe asia south america africa oceania antarctica city state'
        ) && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white px-0.5">
              Locations
            </h3>

            <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => toggleSection('locations')}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Continents &amp; Countries</span>
                  {filters.selectedContinents.length +
                    filters.selectedCountries.length >
                    0 && (
                    <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
                      ·{' '}
                      {filters.selectedContinents.length +
                        filters.selectedCountries.length}
                    </span>
                  )}
                </span>
                {openSections.locations ? (
                  <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
              </button>

              {openSections.locations && (
                <div className="px-3.5 pb-3.5 pt-2.5 space-y-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                  {/* Search Continents / Countries */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={locationTreeSearch}
                      onChange={(e) => setLocationTreeSearch(e.target.value)}
                      placeholder="Search continent or country..."
                      aria-label="Search continent or country"
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                    {locationTreeSearch && (
                      <button
                        type="button"
                        onClick={() => setLocationTreeSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Active Selected Continent / Country Removal Buttons */}
                  {(filters.selectedContinents.length > 0 ||
                    filters.selectedCountries.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {filters.selectedContinents.map((cont) => (
                        <button
                          key={`cont-${cont}`}
                          type="button"
                          onClick={() => handleToggleContinentCheckbox(cont)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer"
                        >
                          <span>{cont}</span>
                          <X className="h-3 w-3 shrink-0" />
                        </button>
                      ))}
                      {filters.selectedCountries.map((ctry) => (
                        <button
                          key={`ctry-${ctry}`}
                          type="button"
                          onClick={() => handleToggleCountryCheckbox(ctry)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer"
                        >
                          <span>{ctry}</span>
                          <X className="h-3 w-3 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* All 7 Continents Tree with Expandable Country Dropdowns */}
                  <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-1.5 space-y-1">
                    {filteredContinentsTree.map((continent) => {
                      const isExpanded =
                        Boolean(locationTreeSearch.trim()) ||
                        Boolean(expandedContinents[continent.id]);
                      const continentChecked =
                        filters.selectedContinents.includes(continent.name);
                      const checkedCountriesCount = continent.countries.filter(
                        (c) => filters.selectedCountries.includes(c.name)
                      ).length;

                      return (
                        <div key={continent.id} className="rounded-md">
                          {/* Continent Header Row with Dropdown Toggle + Checkbox */}
                          <div className="flex items-center justify-between gap-1.5 px-1.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleContinentDropdown(continent.id)
                                }
                                aria-label={`${
                                  isExpanded ? 'Collapse' : 'Expand'
                                } ${continent.name} countries`}
                                className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer truncate">
                                <input
                                  type="checkbox"
                                  checked={continentChecked}
                                  onChange={() =>
                                    handleToggleContinentCheckbox(
                                      continent.name
                                    )
                                  }
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                                />
                                <span className="truncate">{continent.name}</span>
                              </label>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                toggleContinentDropdown(continent.id)
                              }
                              className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer shrink-0"
                            >
                              {checkedCountriesCount > 0
                                ? `${checkedCountriesCount}/${continent.countries.length}`
                                : continent.countries.length}
                            </button>
                          </div>

                          {/* Country Dropdown List under Continent */}
                          {isExpanded && (
                            <div className="pl-6 pr-2 py-1 space-y-1 border-l border-slate-200/80 dark:border-slate-800 ml-3 my-0.5">
                              {continent.countries.map((country) => {
                                const cChecked =
                                  continentChecked ||
                                  filters.selectedCountries.includes(
                                    country.name
                                  );
                                return (
                                  <label
                                    key={country.name}
                                    className="flex items-center gap-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={cChecked}
                                      onChange={() => {
                                        if (continentChecked) {
                                          // Switch from whole-continent to individual countries minus the unchecked one
                                          onChangeFilters((prev) => ({
                                            ...prev,
                                            selectedContinents:
                                              prev.selectedContinents.filter(
                                                (c) => c !== continent.name
                                              ),
                                            selectedCountries: Array.from(
                                              new Set([
                                                ...prev.selectedCountries,
                                                ...continent.countries
                                                  .map((ct) => ct.name)
                                                  .filter(
                                                    (n) => n !== country.name
                                                  ),
                                              ])
                                            ),
                                          }));
                                          onActivateCompanyDirectory();
                                        } else {
                                          handleToggleCountryCheckbox(
                                            country.name
                                          );
                                        }
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                                    />
                                    <span className="truncate">
                                      {country.name}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Specific City / State Filter Input */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Specific City or State
                    </label>
                    <input
                      type="text"
                      value={filters.locationQuery}
                      onChange={(e) => {
                        onChangeFilters((prev) => ({
                          ...prev,
                          locationQuery: e.target.value,
                        }));
                        if (e.target.value.trim()) {
                          onActivateCompanyDirectory();
                        }
                      }}
                      placeholder="e.g., Austin, London, Lagos, Tokyo..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const expandAndFocusSection = (section: AccordionSectionId) => {
    onToggleCollapse();
    setOpenSections((prev) => ({ ...prev, [section]: true }));
  };

  return (
    <>
      {/* ==================== DESKTOP SIDEBAR (PC) ==================== */}
      <aside
        aria-label="Directory filters"
        className={`hidden lg:flex flex-col shrink-0 sticky top-20 self-start h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] min-h-0 rounded-2xl backdrop-blur-xl bg-white/85 dark:bg-slate-900/75 border border-slate-200/85 dark:border-slate-800/85 shadow-xs overflow-hidden transition-[width] duration-200 ease-out ${
          collapsed ? 'w-14' : 'w-76'
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center h-full min-h-0 overflow-y-auto overscroll-contain py-3.5 gap-2.5">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand filter sidebar"
              title="Expand filters"
              className="flex items-center justify-center h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {activeCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] font-bold text-sky-600 dark:text-sky-400 shrink-0">
                {activeCount}
              </span>
            )}

            <div className="w-7 h-px bg-slate-200 dark:bg-slate-800 shrink-0" />

            <button
              type="button"
              onClick={() => expandAndFocusSection('contact-name')}
              title="Contact Name or Email"
              aria-label="Filter by Contact Name or Email"
              className="p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Users className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('current-role')}
              title="Current Role & Seniority"
              aria-label="Filter by Current Role"
              className="p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Briefcase className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('email-formula')}
              title="Corporate Email Format"
              aria-label="Corporate Email Format"
              className="p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Mail className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('accuracy-score')}
              title="Accuracy Score"
              aria-label="Filter by Accuracy Score"
              className="p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Gauge className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('industry')}
              title="Worldwide Industry Filter"
              aria-label="Filter by Worldwide Industry"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                filters.selectedIndustrySlugs.length > 0
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800'
              }`}
            >
              <Globe2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('employee-count')}
              title="Employee Count"
              aria-label="Filter by Employee Count"
              className="p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Building2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('company-revenue')}
              title="Company Revenue"
              aria-label="Filter by Company Revenue"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                filters.revenueRanges.length > 0
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800'
              }`}
            >
              <DollarSign className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('locations')}
              title="Continents & Countries"
              aria-label="Filter by Continents and Countries"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                filters.selectedContinents.length +
                  filters.selectedCountries.length >
                0
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800'
              }`}
            >
              <MapPin className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => expandAndFocusSection('company-name')}
              title="Company Search"
              aria-label="Filter by Company Name"
              className="p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <FolderSearch className="h-4 w-4" />
            </button>
          </div>
        ) : (
          renderExpandedBody()
        )}
      </aside>

      {/* ==================== MOBILE SLIDE-OVER DRAWER ==================== */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              aria-label="Mobile filters drawer"
              className="relative z-10 w-[88vw] max-w-80 h-[100dvh] max-h-[100dvh] flex flex-col min-h-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              {renderExpandedBody()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export const MobileFilterTriggerButton: React.FC<{
  activeCount: number;
  onClick: () => void;
}> = ({ activeCount, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="lg:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
  >
    <SlidersHorizontal className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
    <span>Filters</span>
    {activeCount > 0 && (
      <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
        · {activeCount}
      </span>
    )}
  </button>
);
