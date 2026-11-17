import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, Crown, Users } from 'lucide-react';
import type {
  DepartmentCategory,
  FilterExplorerResponse,
  GlobalCompaniesResponse,
  GlobalCompanyItem,
  GlobalIndustryOption,
  PrimaryTab,
  SearchResponse,
  SeniorityLevel,
  SessionMode,
  SidebarFiltersState,
  WidgetConfig,
  WidgetId,
} from './types';
import {
  DEFAULT_WIDGETS,
  loadSavedTheme,
  loadSnapshots,
  loadWidgetConfigs,
  saveSnapshots,
  saveTheme,
  saveWidgetConfigs,
} from './utils/offlineStorage';
import { EmployeeTableWidget } from './components/EmployeeTableWidget';
import { JobTitleTab } from './components/JobTitleTab';
import { IndustryTab } from './components/IndustryTab';
import {
  FilterSidebar,
  countActiveSidebarFilters,
} from './components/FilterSidebar';
import { INITIAL_SIDEBAR_FILTERS } from './components/sidebar/sidebarConstants';
import { applyExcelEmailFormula } from './utils/emailFormulas';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useOfflineSyncQueue } from './hooks/useOfflineSyncQueue';
import { useUrlRouterSync } from './hooks/useUrlRouterSync';
import { scrollToListTop } from './utils/scrollUtils';
import { parseUrlToAppState, type UrlRoutedState } from './utils/urlRouter';
import {
  TopNavHeader,
  type PrimaryTabConfig,
} from './components/layout/TopNavHeader';
import {
  HeroDomainSearchSection,
  type StatusBannerState,
} from './components/layout/HeroDomainSearchSection';
import { RouteAddressBar } from './components/layout/RouteAddressBar';
import { SessionAndTabsBar } from './components/layout/SessionAndTabsBar';
import { WidgetsDrawerBoard } from './components/layout/WidgetsDrawerBoard';

function sanitizeClientDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .replace(/^@/, '');
}

export default function App() {
  const initialRoute = useMemo<UrlRoutedState>(() => {
    if (typeof window === 'undefined') {
      return {
        sessionMode: 'domain',
        activeTab: 'full-names-emails',
        activeDomain: null,
        filters: INITIAL_SIDEBAR_FILTERS,
        globalPage: 1,
        contactsPage: 1,
        rolesPage: 1,
        localSearchQuery: '',
        selectedDepartment: 'All',
        selectedSeniority: 'All',
        filterSelectedCompany: null,
        showWidgetsDrawer: false,
      };
    }
    return parseUrlToAppState(window.location, INITIAL_SIDEBAR_FILTERS);
  }, []);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadSavedTheme());
  const [activeTab, setActiveTab] = useState<PrimaryTab>(initialRoute.activeTab);
  const [sessionMode, setSessionMode] = useState<SessionMode>(
    initialRoute.sessionMode
  );
  const [showWidgetsDrawer, setShowWidgetsDrawer] = useState<boolean>(
    initialRoute.showWidgetsDrawer
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [filters, setFilters] = useState<SidebarFiltersState>(
    initialRoute.filters
  );

  const [globalPage, setGlobalPage] = useState<number>(initialRoute.globalPage);
  const [contactsPage, setContactsPage] = useState<number>(
    initialRoute.contactsPage
  );
  const [rolesPage, setRolesPage] = useState<number>(initialRoute.rolesPage);
  const [localSearchQuery, setLocalSearchQuery] = useState<string>(
    initialRoute.localSearchQuery
  );

  const [globalIndustries, setGlobalIndustries] = useState<
    GlobalIndustryOption[]
  >([]);
  const [industriesLoading, setIndustriesLoading] = useState(false);
  const [globalDirectory, setGlobalDirectory] =
    useState<GlobalCompaniesResponse | null>(null);
  const [globalDirectoryLoading, setGlobalDirectoryLoading] = useState(false);
  const [filterExplorerResult, setFilterExplorerResult] =
    useState<FilterExplorerResponse | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(false);

  const [filterSelectedCompany, setFilterSelectedCompany] =
    useState<GlobalCompanyItem | null>(initialRoute.filterSelectedCompany);
  const [filterCompanyResult, setFilterCompanyResult] =
    useState<SearchResponse | null>(null);
  const [isFilterCompanyLoading, setIsFilterCompanyLoading] = useState(false);
  const [filterCompanyError, setFilterCompanyError] = useState<string | null>(
    null
  );
  const filterCompanyAbortRef = useRef<AbortController | null>(null);

  const [domainInput, setDomainInput] = useState<string>(
    initialRoute.activeDomain || ''
  );
  const [snapshots, setSnapshots] = useState<Record<string, SearchResponse>>(
    () => loadSnapshots()
  );
  const [activeDomain, setActiveDomain] = useState<string | null>(
    initialRoute.activeDomain
  );

  const [isDomainLoading, setIsDomainLoading] = useState(false);
  const [loadingDomain, setLoadingDomain] = useState('');
  const [statusBanner, setStatusBanner] = useState<StatusBannerState | null>(
    null
  );

  const [domainSelectedDepartment, setDomainSelectedDepartment] = useState<
    DepartmentCategory | 'All'
  >(
    initialRoute.sessionMode === 'domain'
      ? initialRoute.selectedDepartment
      : 'All'
  );
  const [domainSelectedSeniority, setDomainSelectedSeniority] = useState<
    SeniorityLevel | 'All'
  >(
    initialRoute.sessionMode === 'domain'
      ? initialRoute.selectedSeniority
      : 'All'
  );
  const [filterSelectedDepartment, setFilterSelectedDepartment] = useState<
    DepartmentCategory | 'All'
  >(
    initialRoute.sessionMode === 'filter'
      ? initialRoute.selectedDepartment
      : 'All'
  );
  const [filterSelectedSeniority, setFilterSelectedSeniority] = useState<
    SeniorityLevel | 'All'
  >(
    initialRoute.sessionMode === 'filter'
      ? initialRoute.selectedSeniority
      : 'All'
  );

  const [widgets, setWidgets] = useState<WidgetConfig[]>(() =>
    loadWidgetConfigs()
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const { isInstallable, install } = usePWAInstall();

  const handleSyncedResults = useCallback((results: SearchResponse[]) => {
    setSnapshots((prev) => {
      const next = { ...prev };
      for (const r of results) {
        next[r.domain] = r;
      }
      return next;
    });
  }, []);

  const {
    effectiveOffline,
    simulateOffline,
    setSimulateOffline,
    syncQueue,
    setSyncQueue,
    isSyncing,
    lastSyncedAt,
    pendingSyncCount,
    queueDomainOffline,
    syncPendingQueue,
  } = useOfflineSyncQueue({
    onSyncedResults: handleSyncedResults,
    setActiveDomain,
    setSessionMode,
    setStatusBanner,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveSnapshots(snapshots);
  }, [snapshots]);

  useEffect(() => {
    saveWidgetConfigs(widgets);
  }, [widgets]);

  useEffect(() => {
    if (effectiveOffline) return;
    let cancelled = false;
    setIndustriesLoading(true);
    fetch('/api/industries')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled && Array.isArray(payload?.industries)) {
          setGlobalIndustries(payload.industries);
        }
      })
      .catch(() => {
        // Non-fatal
      })
      .finally(() => {
        if (!cancelled) setIndustriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveOffline]);

  const activeFilterCount = useMemo(
    () => countActiveSidebarFilters(filters),
    [filters]
  );

  const [debouncedTextFilters, setDebouncedTextFilters] = useState(() => ({
    companyNameFilter: initialRoute.filters.companyNameFilter.trim(),
    industryKeyword: initialRoute.filters.industryKeyword.trim(),
    locationQuery: initialRoute.filters.locationQuery.trim(),
    contactSearch: initialRoute.filters.contactSearch.trim(),
    roleKeyword: initialRoute.filters.roleKeyword.trim(),
    minAccuracy: initialRoute.filters.minAccuracy,
    maxAccuracy: initialRoute.filters.maxAccuracy,
  }));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedTextFilters({
        companyNameFilter: filters.companyNameFilter.trim(),
        industryKeyword: filters.industryKeyword.trim(),
        locationQuery: filters.locationQuery.trim(),
        contactSearch: filters.contactSearch.trim(),
        roleKeyword: filters.roleKeyword.trim(),
        minAccuracy: filters.minAccuracy,
        maxAccuracy: filters.maxAccuracy,
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [
    filters.companyNameFilter,
    filters.industryKeyword,
    filters.locationQuery,
    filters.contactSearch,
    filters.roleKeyword,
    filters.minAccuracy,
    filters.maxAccuracy,
  ]);

  const selectedSlugsKey = filters.selectedIndustrySlugs.join(',');
  const selectedCountriesKey = filters.selectedCountries.join('|');
  const selectedContinentsKey = filters.selectedContinents.join('|');
  const selectedSenioritiesKey = filters.seniorities.join('|');
  const selectedDepartmentsKey = filters.departments.join('|');
  const selectedEmpRangesKey = filters.employeeRanges.join('|');
  const selectedRevRangesKey = filters.revenueRanges.join('|');

  useEffect(() => {
    if (effectiveOffline) return;
    if (sessionMode !== 'filter' && activeFilterCount === 0) {
      return;
    }

    const controller = new AbortController();
    setIsFilterLoading(true);
    setGlobalDirectoryLoading(true);

    const params = new URLSearchParams();
    if (selectedSlugsKey) params.set('slugs', selectedSlugsKey);
    if (selectedCountriesKey) params.set('countries', selectedCountriesKey);
    if (selectedContinentsKey) params.set('continents', selectedContinentsKey);
    if (debouncedTextFilters.companyNameFilter) {
      params.set('q', debouncedTextFilters.companyNameFilter);
    }
    if (debouncedTextFilters.industryKeyword) {
      params.set('industryKeyword', debouncedTextFilters.industryKeyword);
    }
    if (filters.industryMatchMode) {
      params.set('industryMatchMode', filters.industryMatchMode);
    }
    if (selectedEmpRangesKey) {
      params.set('employeeRanges', selectedEmpRangesKey);
    }
    if (selectedRevRangesKey) {
      params.set('revenueRanges', selectedRevRangesKey);
    }
    if (debouncedTextFilters.locationQuery) {
      params.set('locationQuery', debouncedTextFilters.locationQuery);
    }
    if (debouncedTextFilters.contactSearch) {
      params.set('contactSearch', debouncedTextFilters.contactSearch);
    }
    if (debouncedTextFilters.roleKeyword) {
      params.set('roleKeyword', debouncedTextFilters.roleKeyword);
    }
    if (selectedSenioritiesKey) {
      params.set('seniorities', selectedSenioritiesKey);
    }
    if (selectedDepartmentsKey) {
      params.set('departments', selectedDepartmentsKey);
    }
    params.set('minAccuracy', String(debouncedTextFilters.minAccuracy));
    params.set('maxAccuracy', String(debouncedTextFilters.maxAccuracy));
    params.set('emailFormulaOverride', filters.emailFormulaOverride);
    params.set('page', String(globalPage));

    fetch(`/api/filter-explorer?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: FilterExplorerResponse | null) => {
        if (
          !controller.signal.aborted &&
          payload &&
          Array.isArray(payload.employees)
        ) {
          setFilterExplorerResult(payload);
          setGlobalDirectory({
            industrySlug: selectedSlugsKey || 'all',
            industryFullTitle: payload.scopeTitle,
            page: payload.page,
            perPage: 500,
            totalCompanies: payload.totalMatchedCompanies,
            totalPages: payload.totalPages,
            companies: payload.companies,
          });
        }
      })
      .catch(() => {
        // Aborted or transient network issue
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFilterLoading(false);
          setGlobalDirectoryLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    sessionMode,
    activeFilterCount,
    selectedSlugsKey,
    selectedCountriesKey,
    selectedContinentsKey,
    selectedSenioritiesKey,
    selectedDepartmentsKey,
    selectedEmpRangesKey,
    selectedRevRangesKey,
    filters.industryMatchMode,
    filters.emailFormulaOverride,
    debouncedTextFilters,
    globalPage,
    effectiveOffline,
  ]);

  const handleChangeFilters = useCallback(
    (updater: (prev: SidebarFiltersState) => SidebarFiltersState) => {
      setFilters(updater);
      filterCompanyAbortRef.current?.abort();
      setIsFilterCompanyLoading(false);
      setFilterSelectedCompany(null);
      setFilterCompanyResult(null);
      setFilterCompanyError(null);
      setSessionMode((prevMode) => {
        if (prevMode !== 'filter') {
          setActiveTab('industry');
        }
        return 'filter';
      });
      setFilterSelectedDepartment('All');
      setFilterSelectedSeniority('All');
      setGlobalPage(1);
      setContactsPage(1);
      setRolesPage(1);
    },
    []
  );

  const currentDomainResult = useMemo(() => {
    if (!activeDomain) return null;
    return snapshots[activeDomain] || null;
  }, [activeDomain, snapshots]);

  const activeFilteredContacts = useMemo(() => {
    if (!filterExplorerResult) return [];
    const qContact = filters.contactSearch.trim().toLowerCase();
    const qRole = filters.roleKeyword.trim().toLowerCase();

    return filterExplorerResult.employees.filter((emp) => {
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
        !resolvedEmail.toLowerCase().includes(qContact) &&
        !(emp.companyName || '').toLowerCase().includes(qContact)
      ) {
        return false;
      }
      return true;
    });
  }, [
    filterExplorerResult,
    filters.contactSearch,
    filters.roleKeyword,
    filters.seniorities,
    filters.departments,
    filters.minAccuracy,
    filters.maxAccuracy,
    filters.emailFormulaOverride,
  ]);

  const activeTotalMatchedContacts = useMemo(() => {
    if (!filterExplorerResult) return 0;
    if (
      filterExplorerResult.totalMatchedCompanies === 0 ||
      activeFilteredContacts.length === 0
    ) {
      return 0;
    }
    const serverLoadedCount = filterExplorerResult.employees.length;
    const baseTotal =
      filterExplorerResult.totalMatchedContacts || serverLoadedCount;
    if (serverLoadedCount === 0) return baseTotal;
    const clientRatio = activeFilteredContacts.length / serverLoadedCount;
    return Math.max(
      activeFilteredContacts.length,
      Math.round(baseTotal * clientRatio)
    );
  }, [filterExplorerResult, activeFilteredContacts.length]);

  const activeAnalyticsResult = useMemo<SearchResponse | null>(() => {
    if (sessionMode === 'domain') return currentDomainResult;
    if (filterSelectedCompany && filterCompanyResult) {
      return filterCompanyResult;
    }
    if (!filterExplorerResult || activeFilteredContacts.length === 0) {
      return null;
    }
    return {
      domain: 'filter-explorer',
      companyName: filterExplorerResult.scopeTitle,
      industry: filterExplorerResult.scopeTitle,
      industryTags: [filterExplorerResult.scopeTitle],
      companyDescription: `Auto-loaded cohort across ${filterExplorerResult.totalMatchedCompanies.toLocaleString()} matching organizations.`,
      headquarters: 'Worldwide',
      emailPattern: {
        detectedFormulaId:
          filters.emailFormulaOverride === 'auto'
            ? 'first_dot_last'
            : filters.emailFormulaOverride,
        formulaLabel: 'Unique Auto-Detected Per Company',
        excelFormula: '',
        patternConfidence: 88,
        mxVerified: true,
        mxProvider: 'Multi-Domain Verified',
        detectionBasis: 'Live Web Pattern Intelligence',
        sampleObservedEmails: [],
      },
      sourcesUsed: ['Org Chart'],
      fetchedAt: filterExplorerResult.fetchedAt,
      durationMs: 120,
      cached: false,
      employees: activeFilteredContacts,
      departmentBreakdown: filterExplorerResult.departmentBreakdown,
      seniorityBreakdown: filterExplorerResult.seniorityBreakdown,
    };
  }, [
    sessionMode,
    currentDomainResult,
    filterSelectedCompany,
    filterCompanyResult,
    filterExplorerResult,
    activeFilteredContacts,
    filters.emailFormulaOverride,
  ]);

  const executeDomainLookup = useCallback(
    async (
      rawDomain: string,
      forceRefresh = false,
      companySlug?: string,
      companyDisplayLabel?: string
    ) => {
      const domain = rawDomain ? sanitizeClientDomain(rawDomain) : '';
      if (!companySlug && (!domain || !domain.includes('.'))) {
        setStatusBanner({
          tone: 'error',
          text: 'Enter a valid company domain such as shopify.com or vercel.com.',
        });
        return;
      }

      setSessionMode('domain');
      if (domain) {
        setDomainInput(domain);
      }
      setDomainSelectedDepartment('All');
      setDomainSelectedSeniority('All');
      setContactsPage(1);
      setRolesPage(1);
      setLocalSearchQuery('');

      const existingSnapshot = domain ? snapshots[domain] : undefined;
      const hasValidSnapshot =
        Boolean(existingSnapshot) &&
        (existingSnapshot?.employees.length || 0) > 0;

      if (effectiveOffline) {
        if (domain && hasValidSnapshot && existingSnapshot && !forceRefresh) {
          setActiveDomain(domain);
          setActiveTab('full-names-emails');
          setStatusBanner({
            tone: 'info',
            text: `Loaded cached offline directory for ${domain} (${existingSnapshot.employees.length.toLocaleString()} employees).`,
          });
          return;
        }
        if (domain) {
          queueDomainOffline(domain);
          setStatusBanner({
            tone: 'warning',
            text: `You are offline. "${domain}" was added to your sync queue and will fetch automatically once reconnected.`,
          });
        } else {
          setStatusBanner({
            tone: 'warning',
            text: 'Reconnect to the internet to fetch employees for this global company.',
          });
        }
        return;
      }

      if (domain && !forceRefresh && hasValidSnapshot) {
        setActiveDomain(domain);
        setStatusBanner(null);
        return;
      }

      setIsDomainLoading(true);
      setLoadingDomain(companyDisplayLabel || domain || companySlug || '');
      setStatusBanner(null);

      try {
        const queryParams = new URLSearchParams();
        if (domain) queryParams.set('domain', domain);
        if (companySlug) queryParams.set('companySlug', companySlug);
        if (forceRefresh) queryParams.set('refresh', 'true');

        const res = await fetch(`/api/search?${queryParams.toString()}`);
        const payload = await res.json();

        if (!res.ok) {
          throw new Error(
            payload?.error || 'Failed to query public directory.'
          );
        }

        const data = payload as SearchResponse;
        if (data.employees.length > 0) {
          setSnapshots((prev) => ({
            ...prev,
            [data.domain]: data,
          }));
          setActiveDomain(data.domain);
          setDomainInput(data.domain);
          setStatusBanner({
            tone: 'success',
            text: `Indexed ${data.employees.length.toLocaleString()} contacts & emails (${data.emailPattern.formulaLabel} · ${data.emailPattern.patternConfidence}% accuracy) for ${data.companyName}.`,
          });
        } else {
          setStatusBanner({
            tone: 'warning',
            text: `No public employee records were indexed for "${
              data.domain || companyDisplayLabel
            }". Verify the domain spelling or try another company.`,
          });
        }
      } catch (err) {
        if (!navigator.onLine && domain) {
          queueDomainOffline(domain);
          setStatusBanner({
            tone: 'warning',
            text: `Connection interrupted. "${domain}" is queued for automatic sync on reconnect.`,
          });
        } else {
          setStatusBanner({
            tone: 'error',
            text:
              err instanceof Error
                ? err.message
                : 'Unable to complete domain lookup.',
          });
        }
      } finally {
        setIsDomainLoading(false);
        setLoadingDomain('');
      }
    },
    [effectiveOffline, queueDomainOffline, snapshots]
  );

  const loadFilterCompanyContacts = useCallback(
    async (company: GlobalCompanyItem, preserveCurrentTab = false) => {
      filterCompanyAbortRef.current?.abort();
      setSessionMode('filter');
      if (!preserveCurrentTab) {
        setActiveTab('full-names-emails');
        setContactsPage(1);
        setRolesPage(1);
        setLocalSearchQuery('');
      }
      setFilterSelectedDepartment('All');
      setFilterSelectedSeniority('All');
      setFilterSelectedCompany(company);
      setFilterCompanyError(null);
      scrollToListTop(resultsTopRef.current);

      const cleanDom = company.domain
        ? sanitizeClientDomain(company.domain)
        : '';
      const cachedSnapshot =
        (cleanDom && snapshots[cleanDom]?.employees?.length
          ? snapshots[cleanDom]
          : undefined) ||
        Object.values(snapshots).find(
          (s) => s.companySlug === company.slug && s.employees.length > 0
        );

      if (cachedSnapshot) {
        setFilterCompanyResult(cachedSnapshot);
        setIsFilterCompanyLoading(false);
        return;
      }

      if (effectiveOffline) {
        if (cleanDom) {
          queueDomainOffline(cleanDom);
        }
        setFilterCompanyResult(null);
        setIsFilterCompanyLoading(false);
        setFilterCompanyError(
          `You are currently offline. Reconnect to fetch full names and emails for ${company.name}.`
        );
        return;
      }

      const controller = new AbortController();
      filterCompanyAbortRef.current = controller;
      setFilterCompanyResult(null);
      setIsFilterCompanyLoading(true);

      try {
        const queryParams = new URLSearchParams();
        if (cleanDom) queryParams.set('domain', cleanDom);
        if (company.slug) queryParams.set('companySlug', company.slug);

        const res = await fetch(`/api/search?${queryParams.toString()}`, {
          signal: controller.signal,
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(
            payload?.error || 'Failed to load company contacts.'
          );
        }

        const data = payload as SearchResponse;
        if (!controller.signal.aborted) {
          setFilterCompanyResult(data);
          if (data.domain && data.employees.length > 0) {
            setSnapshots((prev) => ({
              ...prev,
              [data.domain]: data,
            }));
          }
          if (data.employees.length === 0) {
            setFilterCompanyError(
              `No public employee records were indexed for ${company.name}.`
            );
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setFilterCompanyError(
            err instanceof Error
              ? err.message
              : `Unable to load contacts for ${company.name}.`
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsFilterCompanyLoading(false);
        }
      }
    },
    [effectiveOffline, queueDomainOffline, snapshots]
  );

  const handleSelectGlobalCompany = useCallback(
    (company: GlobalCompanyItem) => {
      void loadFilterCompanyContacts(company, false);
    },
    [loadFilterCompanyContacts]
  );

  const hydratedDeepLinkRef = useRef<string>('');
  useEffect(() => {
    if (
      sessionMode === 'domain' &&
      activeDomain &&
      !snapshots[activeDomain] &&
      !isDomainLoading
    ) {
      const key = `domain:${activeDomain}`;
      if (hydratedDeepLinkRef.current !== key) {
        hydratedDeepLinkRef.current = key;
        void executeDomainLookup(activeDomain, false);
      }
    } else if (
      sessionMode === 'filter' &&
      filterSelectedCompany &&
      !filterCompanyResult &&
      !isFilterCompanyLoading
    ) {
      const key = `company:${filterSelectedCompany.slug}:${
        filterSelectedCompany.domain || ''
      }`;
      if (hydratedDeepLinkRef.current !== key) {
        hydratedDeepLinkRef.current = key;
        void loadFilterCompanyContacts(filterSelectedCompany, true);
      }
    }
  }, [
    sessionMode,
    activeDomain,
    snapshots,
    isDomainLoading,
    executeDomainLookup,
    filterSelectedCompany,
    filterCompanyResult,
    isFilterCompanyLoading,
    loadFilterCompanyContacts,
  ]);

  const activeSelectedDepartment =
    sessionMode === 'domain'
      ? domainSelectedDepartment
      : filterSelectedDepartment;
  const activeSelectedSeniority =
    sessionMode === 'domain'
      ? domainSelectedSeniority
      : filterSelectedSeniority;

  const handleBackToCompaniesList = useCallback(() => {
    filterCompanyAbortRef.current?.abort();
    setIsFilterCompanyLoading(false);
    setFilterSelectedCompany(null);
    setFilterCompanyResult(null);
    setFilterCompanyError(null);
    setSessionMode('filter');
    setActiveTab('industry');
    setContactsPage(1);
    setRolesPage(1);
    setLocalSearchQuery('');
    scrollToListTop(resultsTopRef.current);
  }, []);

  const currentUrlState = useMemo<UrlRoutedState>(
    () => ({
      sessionMode,
      activeTab,
      activeDomain,
      filters,
      globalPage,
      contactsPage,
      rolesPage,
      localSearchQuery,
      selectedDepartment: activeSelectedDepartment,
      selectedSeniority: activeSelectedSeniority,
      filterSelectedCompany,
      showWidgetsDrawer,
    }),
    [
      sessionMode,
      activeTab,
      activeDomain,
      filters,
      globalPage,
      contactsPage,
      rolesPage,
      localSearchQuery,
      activeSelectedDepartment,
      activeSelectedSeniority,
      filterSelectedCompany,
      showWidgetsDrawer,
    ]
  );

  const { currentRoutePath, breadcrumbs } = useUrlRouterSync({
    state: currentUrlState,
    defaultFilters: INITIAL_SIDEBAR_FILTERS,
    domainCompanyName: currentDomainResult?.companyName,
    filterCompanyDisplayName: filterCompanyResult?.companyName,
    onRestorePopState: (parsed) => {
      setSessionMode(parsed.sessionMode);
      setActiveTab(parsed.activeTab);
      setActiveDomain(parsed.activeDomain);
      setDomainInput(parsed.activeDomain || '');
      setFilters(parsed.filters);
      setGlobalPage(parsed.globalPage);
      setContactsPage(parsed.contactsPage);
      setRolesPage(parsed.rolesPage);
      setLocalSearchQuery(parsed.localSearchQuery);
      setShowWidgetsDrawer(parsed.showWidgetsDrawer);
      if (parsed.sessionMode === 'domain') {
        setDomainSelectedDepartment(parsed.selectedDepartment);
        setDomainSelectedSeniority(parsed.selectedSeniority);
      } else {
        setFilterSelectedDepartment(parsed.selectedDepartment);
        setFilterSelectedSeniority(parsed.selectedSeniority);
      }
      if (!parsed.filterSelectedCompany) {
        setFilterSelectedCompany(null);
        setFilterCompanyResult(null);
        setFilterCompanyError(null);
      } else {
        setFilterSelectedCompany(parsed.filterSelectedCompany);
      }
    },
    onNavigateDomainRoot: () => {
      setSessionMode('domain');
      setActiveTab('full-names-emails');
    },
    onNavigateTabFullNames: () => setActiveTab('full-names-emails'),
    onBackToCompaniesList: handleBackToCompaniesList,
  });

  const handleSelectIndustryFilter = useCallback((nextSlugs: string[]) => {
    setFilters((prev) => ({
      ...prev,
      selectedIndustrySlugs: nextSlugs,
    }));
    filterCompanyAbortRef.current?.abort();
    setIsFilterCompanyLoading(false);
    setFilterSelectedCompany(null);
    setFilterCompanyResult(null);
    setFilterCompanyError(null);
    setSessionMode((prevMode) => {
      if (prevMode !== 'filter') {
        setActiveTab('industry');
      }
      return 'filter';
    });
    setFilterSelectedDepartment('All');
    setFilterSelectedSeniority('All');
    setGlobalPage(1);
    setContactsPage(1);
    setRolesPage(1);
  }, []);

  const handleBulkDomainsUpload = useCallback(
    (domains: string[]) => {
      if (domains.length === 0) return;
      for (const d of domains.slice(1)) {
        queueDomainOffline(d);
      }
      setSessionMode('domain');
      setActiveTab('full-names-emails');
      void executeDomainLookup(domains[0], false);
      setStatusBanner({
        tone: 'info',
        text: `Imported ${domains.length} domain${
          domains.length === 1 ? '' : 's'
        } from list — indexing ${domains[0]} and syncing remaining domains.`,
      });
    },
    [executeDomainLookup, queueDomainOffline]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSessionMode('domain');
    setActiveTab('full-names-emails');
    void executeDomainLookup(domainInput, false);
  };

  const visibleWidgets = useMemo(
    () => widgets.filter((w) => w.visible),
    [widgets]
  );

  const handleReorderVisible = (newVisibleOrder: WidgetConfig[]) => {
    setWidgets((prev) => {
      const hidden = prev.filter((w) => !w.visible);
      return [...newVisibleOrder, ...hidden];
    });
  };

  const moveWidgetByStep = (id: WidgetId, direction: 'up' | 'down') => {
    const idx = visibleWidgets.findIndex((w) => w.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= visibleWidgets.length) return;
    const updated = [...visibleWidgets];
    const [moved] = updated.splice(idx, 1);
    updated.splice(targetIdx, 0, moved);
    handleReorderVisible(updated);
  };

  const toggleWidgetVisibility = (id: WidgetId) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  };

  const handleSelectActiveDepartment = useCallback(
    (dept: DepartmentCategory | 'All') => {
      if (sessionMode === 'domain') {
        setDomainSelectedDepartment(dept);
      } else {
        setFilterSelectedDepartment(dept);
      }
      setRolesPage(1);
    },
    [sessionMode]
  );

  const handleSelectActiveSeniority = useCallback(
    (sen: SeniorityLevel | 'All') => {
      if (sessionMode === 'domain') {
        setDomainSelectedSeniority(sen);
      } else {
        setFilterSelectedSeniority(sen);
      }
      setRolesPage(1);
    },
    [sessionMode]
  );

  const fullNamesTab: PrimaryTabConfig = {
    id: 'full-names-emails',
    label: 'Full Names & Emails',
    icon: Users,
    badge:
      sessionMode === 'domain'
        ? currentDomainResult
          ? currentDomainResult.employees.length.toLocaleString()
          : undefined
        : filterSelectedCompany
        ? filterCompanyResult
          ? filterCompanyResult.employees.length.toLocaleString()
          : undefined
        : filterExplorerResult
        ? activeTotalMatchedContacts.toLocaleString()
        : undefined,
  };

  const commandHierarchyTab: PrimaryTabConfig = {
    id: 'command-hierarchy',
    label: 'Command Hierarchy',
    icon: Crown,
    badge:
      sessionMode === 'domain'
        ? currentDomainResult
          ? `${currentDomainResult.employees.length.toLocaleString()} Roles`
          : undefined
        : filterSelectedCompany
        ? filterCompanyResult
          ? `${filterCompanyResult.employees.length.toLocaleString()} Roles`
          : undefined
        : filterExplorerResult
        ? `${activeTotalMatchedContacts.toLocaleString()} Roles`
        : undefined,
  };

  const industryTab: PrimaryTabConfig = {
    id: 'industry',
    label: sessionMode === 'filter' ? 'Companies' : 'Industry',
    icon: Building2,
    badge:
      sessionMode === 'domain'
        ? currentDomainResult?.industryTags?.[0] || undefined
        : filterExplorerResult
        ? `${filterExplorerResult.totalMatchedCompanies.toLocaleString()} Orgs`
        : globalDirectory
        ? `${globalDirectory.totalCompanies.toLocaleString()} Orgs`
        : undefined,
  };

  const primaryTabs: PrimaryTabConfig[] =
    sessionMode === 'filter'
      ? [industryTab, fullNamesTab, commandHierarchyTab]
      : [fullNamesTab, commandHierarchyTab, industryTab];

  const handleSelectPrimaryTab = useCallback(
    (tabId: PrimaryTab) => {
      if (sessionMode === 'filter' && tabId === 'industry') {
        handleBackToCompaniesList();
        return;
      }
      setActiveTab(tabId);
      setLocalSearchQuery('');
    },
    [sessionMode, handleBackToCompaniesList]
  );

  return (
    <div className="min-h-screen relative overflow-x-clip bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 transition-colors duration-200">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[460px] w-[880px] rounded-full bg-sky-500/12 dark:bg-sky-500/10 blur-3xl" />
        <div className="absolute top-72 -right-32 h-[360px] w-[520px] rounded-full bg-indigo-500/10 dark:bg-indigo-500/8 blur-3xl" />
      </div>

      <TopNavHeader
        sessionMode={sessionMode}
        activeTab={activeTab}
        primaryTabs={primaryTabs}
        showWidgetsDrawer={showWidgetsDrawer}
        totalMatchedCompanies={filterExplorerResult?.totalMatchedCompanies}
        onBrandClick={() => {
          setSessionMode('domain');
          setActiveTab('full-names-emails');
        }}
        onSelectTab={handleSelectPrimaryTab}
        onToggleWidgetsDrawer={() => setShowWidgetsDrawer((v) => !v)}
        onOpenWorldwideExplorer={() => {
          if (!filterSelectedCompany) {
            setActiveTab('industry');
          }
          setSessionMode('filter');
          scrollToListTop(resultsTopRef.current);
        }}
        onFocusDomainLookup={() => {
          setSessionMode('domain');
          setActiveTab('full-names-emails');
          scrollToListTop(searchInputRef.current, 110);
          window.setTimeout(() => {
            searchInputRef.current?.focus();
          }, 120);
        }}
      />

      <div
        id="top"
        className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex items-start gap-6"
      >
        <FilterSidebar
          filters={filters}
          onChangeFilters={handleChangeFilters}
          onResetFilters={() => {
            setFilters(INITIAL_SIDEBAR_FILTERS);
            filterCompanyAbortRef.current?.abort();
            setIsFilterCompanyLoading(false);
            setFilterSelectedCompany(null);
            setFilterCompanyResult(null);
            setFilterCompanyError(null);
            setFilterSelectedDepartment('All');
            setFilterSelectedSeniority('All');
            setGlobalPage(1);
            setContactsPage(1);
            setRolesPage(1);
            setLocalSearchQuery('');
            setSessionMode('filter');
            setActiveTab('industry');
          }}
          globalIndustries={globalIndustries}
          industriesLoading={industriesLoading}
          onSelectIndustryFilter={handleSelectIndustryFilter}
          onActivateCompanyDirectory={() => {
            setSessionMode((prev) => {
              if (prev !== 'filter') {
                setActiveTab('industry');
              }
              return 'filter';
            });
          }}
          onDomainDirectLookup={(d) => {
            setSessionMode('domain');
            setActiveTab('full-names-emails');
            void executeDomainLookup(d, false);
          }}
          onBulkDomainsUpload={handleBulkDomainsUpload}
          snapshots={snapshots}
          activeDomain={sessionMode === 'domain' ? activeDomain : null}
          onSelectSavedSnapshot={(d) => {
            setSessionMode('domain');
            setActiveDomain(d);
            setDomainInput(d);
            setDomainSelectedDepartment('All');
            setDomainSelectedSeniority('All');
            setContactsPage(1);
            setRolesPage(1);
            setLocalSearchQuery('');
            setActiveTab('full-names-emails');
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          isFilterLoading={isFilterLoading}
        />

        <main className="flex-1 min-w-0 space-y-4">
          <RouteAddressBar
            breadcrumbs={breadcrumbs}
            currentRoutePath={currentRoutePath}
          />

          <HeroDomainSearchSection
            searchInputRef={searchInputRef}
            domainInput={domainInput}
            onChangeDomainInput={setDomainInput}
            onSubmitDomain={handleSubmit}
            isDomainLoading={isDomainLoading}
            sessionMode={sessionMode}
            currentDomainResult={currentDomainResult}
            onRefreshCurrentDomain={(d) => void executeDomainLookup(d, true)}
            activeFilterCount={activeFilterCount}
            onOpenMobileFilters={() => setMobileSidebarOpen(true)}
            showWidgetsDrawer={showWidgetsDrawer}
            onToggleWidgetsDrawer={() => setShowWidgetsDrawer((v) => !v)}
            effectiveOffline={effectiveOffline}
            pendingSyncCount={pendingSyncCount}
            onToggleSimulateOffline={() => setSimulateOffline((prev) => !prev)}
            theme={theme}
            onToggleTheme={() =>
              setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
            }
            isInstallable={isInstallable}
            onInstallApp={() => void install()}
            statusBanner={statusBanner}
            onDismissStatusBanner={() => setStatusBanner(null)}
          />

          <SessionAndTabsBar
            resultsTopRef={resultsTopRef}
            sessionMode={sessionMode}
            activeTab={activeTab}
            primaryTabs={primaryTabs}
            currentDomainResult={currentDomainResult}
            filterExplorerResult={filterExplorerResult}
            activeTotalMatchedContacts={activeTotalMatchedContacts}
            activeFilterCount={activeFilterCount}
            isFilterLoading={isFilterLoading}
            isFilterCompanyLoading={isFilterCompanyLoading}
            onSelectDomainSession={() => {
              setSessionMode('domain');
              setLocalSearchQuery('');
            }}
            onSelectFilterSession={() => {
              if (sessionMode !== 'filter' && !filterSelectedCompany) {
                setActiveTab('industry');
              }
              setSessionMode('filter');
              setLocalSearchQuery('');
            }}
            onSelectTab={handleSelectPrimaryTab}
          />

          <AnimatePresence mode="wait">
            {activeTab === 'full-names-emails' && (
              <motion.section
                key={`tab-full-names-emails-${sessionMode}-${
                  filterSelectedCompany?.slug || 'cohort'
                }`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-5 sm:p-6 shadow-xs"
              >
                <EmployeeTableWidget
                  sessionMode={sessionMode}
                  domainResult={currentDomainResult}
                  isDomainLoading={isDomainLoading}
                  loadingDomain={loadingDomain}
                  filterResult={filterExplorerResult}
                  isFilterLoading={isFilterLoading}
                  filters={filters}
                  onSwitchToFilterSession={() => {
                    setSessionMode('filter');
                    setActiveTab('industry');
                  }}
                  onFocusDomainInput={() => searchInputRef.current?.focus()}
                  onInspectDomainFromFilter={(domain) => {
                    void executeDomainLookup(domain, false);
                  }}
                  filterSelectedCompany={filterSelectedCompany}
                  filterCompanyResult={filterCompanyResult}
                  isFilterCompanyLoading={isFilterCompanyLoading}
                  filterCompanyError={filterCompanyError}
                  onBackToCompaniesList={handleBackToCompaniesList}
                  onSelectCompanyFromFilterContact={(compInfo) => {
                    handleSelectGlobalCompany({
                      id: compInfo.slug,
                      slug: compInfo.slug,
                      name: compInfo.name,
                      domain: compInfo.domain,
                      websiteUrl: `https://${compInfo.domain}`,
                      logoUrl: null,
                      location: 'Worldwide',
                      industry: '',
                      employeeRange: '',
                      revenueRange: '',
                    });
                  }}
                  globalPage={globalPage}
                  onChangeGlobalPage={(pg) => {
                    setGlobalPage(pg);
                    setContactsPage(1);
                  }}
                  contactsPage={contactsPage}
                  onChangeContactsPage={setContactsPage}
                  urlLocalQuery={localSearchQuery}
                  onChangeUrlLocalQuery={setLocalSearchQuery}
                />
              </motion.section>
            )}

            {activeTab === 'command-hierarchy' && (
              <motion.section
                key={`tab-command-hierarchy-${sessionMode}-${
                  filterSelectedCompany?.slug || 'cohort'
                }`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-5 sm:p-6 shadow-xs"
              >
                <JobTitleTab
                  sessionMode={sessionMode}
                  domainResult={currentDomainResult}
                  isDomainLoading={isDomainLoading}
                  filterResult={filterExplorerResult}
                  isFilterLoading={isFilterLoading}
                  filters={filters}
                  selectedDepartment={activeSelectedDepartment}
                  selectedSeniority={activeSelectedSeniority}
                  onSelectDepartment={handleSelectActiveDepartment}
                  onSelectSeniority={handleSelectActiveSeniority}
                  onSwitchToFilterSession={() => {
                    setSessionMode('filter');
                    setActiveTab('industry');
                  }}
                  onFocusDomainInput={() => searchInputRef.current?.focus()}
                  filterSelectedCompany={filterSelectedCompany}
                  filterCompanyResult={filterCompanyResult}
                  isFilterCompanyLoading={isFilterCompanyLoading}
                  onBackToCompaniesList={handleBackToCompaniesList}
                  globalPage={globalPage}
                  onChangeGlobalPage={(pg) => {
                    setGlobalPage(pg);
                    setRolesPage(1);
                  }}
                  rolesPage={rolesPage}
                  onChangeRolesPage={setRolesPage}
                  urlRoleQuery={localSearchQuery}
                  onChangeUrlRoleQuery={setLocalSearchQuery}
                />
              </motion.section>
            )}

            {activeTab === 'industry' && (
              <motion.section
                key={`tab-industry-${sessionMode}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-5 sm:p-6 shadow-xs"
              >
                <IndustryTab
                  sessionMode={sessionMode}
                  domainResult={currentDomainResult}
                  allSnapshots={snapshots}
                  isDomainLoading={isDomainLoading}
                  filterResult={filterExplorerResult}
                  isFilterLoading={isFilterLoading}
                  filters={filters}
                  globalIndustries={globalIndustries}
                  globalDirectory={globalDirectory}
                  globalDirectoryLoading={globalDirectoryLoading}
                  globalPage={globalPage}
                  onChangeGlobalPage={setGlobalPage}
                  onSelectIndustrySlug={(slug) => {
                    setFilters((prev) => ({
                      ...prev,
                      selectedIndustrySlugs: slug ? [slug] : [],
                    }));
                    setSessionMode('filter');
                    setGlobalPage(1);
                    setContactsPage(1);
                    setRolesPage(1);
                  }}
                  onSelectGlobalCompany={handleSelectGlobalCompany}
                  onSelectDomain={(d) => {
                    setSessionMode('domain');
                    setActiveDomain(d);
                    setDomainInput(d);
                    setContactsPage(1);
                    setRolesPage(1);
                    setLocalSearchQuery('');
                    setActiveTab('full-names-emails');
                  }}
                  onSwitchSessionMode={(mode) => {
                    if (mode === 'filter') {
                      setActiveTab('industry');
                    }
                    setSessionMode(mode);
                  }}
                  onFocusDomainInput={() => searchInputRef.current?.focus()}
                />
              </motion.section>
            )}
          </AnimatePresence>

          <WidgetsDrawerBoard
            showWidgetsDrawer={showWidgetsDrawer}
            widgets={widgets}
            onResetWidgets={() => setWidgets(DEFAULT_WIDGETS)}
            onToggleWidgetVisibility={toggleWidgetVisibility}
            onReorderVisible={handleReorderVisible}
            onMoveWidgetByStep={moveWidgetByStep}
            snapshots={snapshots}
            activeDomain={activeDomain}
            effectiveOffline={effectiveOffline}
            onSelectSavedSnapshot={(d) => {
              setSessionMode('domain');
              setActiveDomain(d);
              setDomainInput(d);
              setDomainSelectedDepartment('All');
              setDomainSelectedSeniority('All');
              setContactsPage(1);
              setRolesPage(1);
              setLocalSearchQuery('');
              setActiveTab('full-names-emails');
            }}
            onRefreshSnapshot={(d) => void executeDomainLookup(d, true)}
            onDeleteSnapshot={(d) => {
              setSnapshots((prev) => {
                const next = { ...prev };
                delete next[d];
                return next;
              });
              if (activeDomain === d) {
                setActiveDomain(null);
                setDomainInput('');
              }
            }}
            syncQueue={syncQueue}
            simulateOffline={simulateOffline}
            isSyncing={isSyncing}
            lastSyncedAt={lastSyncedAt}
            onToggleSimulateOffline={() => setSimulateOffline((v) => !v)}
            onTriggerSyncNow={() => void syncPendingQueue()}
            onRemoveQueueItem={(id) =>
              setSyncQueue((prev) => prev.filter((i) => i.id !== id))
            }
            onClearSynced={() =>
              setSyncQueue((prev) => prev.filter((i) => i.status !== 'synced'))
            }
            activeAnalyticsResult={activeAnalyticsResult}
            activeSelectedDepartment={activeSelectedDepartment}
            activeSelectedSeniority={activeSelectedSeniority}
            onSelectActiveDepartment={handleSelectActiveDepartment}
            onSelectActiveSeniority={handleSelectActiveSeniority}
            onSelectDomainFromAnalytics={(d) => {
              setSessionMode('domain');
              setActiveDomain(d);
              setDomainInput(d);
            }}
          />
        </main>
      </div>

      <footer className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-slate-200/70 dark:border-slate-800/70 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
        <span>OrgLens Public Directory &amp; Email Format Explorer</span>
        <span>Corporate email finder &amp; Worldwide company explorer</span>
      </footer>
    </div>
  );
}
