import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Building2,
  Crown,
  Megaphone,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type {
  AdminSectionId,
  DepartmentCategory,
  FilterExplorerResponse,
  FilterFacetsResponse,
  GlobalCompaniesResponse,
  GlobalCompanyItem,
  GlobalIndustryOption,
  PrimaryTab,
  SearchResponse,
  SeniorityLevel,
  SessionMode,
  SidebarFiltersState,
  TopLevelAppView,
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
import { usePlatformAuth } from './hooks/usePlatformAuth';
import { apiFetch } from './utils/authClient';
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
import { SessionAndTabsBar } from './components/layout/SessionAndTabsBar';
import { WidgetsDrawerBoard } from './components/layout/WidgetsDrawerBoard';
import { OrgLensLogoLoaderOverlay } from './components/layout/OrgLensLogoLoaderOverlay';
import { SignOutConfirmModal } from './components/layout/SignOutConfirmModal';
import { B2BLandingAuthPage } from './components/landing/B2BLandingAuthPage';
import { UsdtUpgradePage } from './components/billing/UsdtUpgradePage';
import { AdminDashboardPage } from './components/admin/AdminDashboardPage';
import { UserProfileSettingsPage } from './components/account/UserProfileSettingsPage';

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

const INDUSTRIES_CACHE_KEY = 'orglens_industries_cache_v1';

function loadCachedIndustries(): GlobalIndustryOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(INDUSTRIES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GlobalIndustryOption[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialRoute = useMemo<UrlRoutedState>(() => {
    if (typeof window === 'undefined') {
      return {
        appView: 'landing',
        authMode: 'login',
        adminSection: 'overview',
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
  const [appView, setAppView] = useState<TopLevelAppView>(initialRoute.appView);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(
    initialRoute.authMode
  );
  const [adminSection, setAdminSection] = useState<AdminSectionId>(
    initialRoute.adminSection
  );
  const [exhaustedCoinsPrompt, setExhaustedCoinsPrompt] = useState<
    string | null
  >(null);

  const [activeTab, setActiveTab] = useState<PrimaryTab>(
    initialRoute.activeTab
  );
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
  >(() => loadCachedIndustries());
  const [industriesLoading, setIndustriesLoading] = useState(false);
  const [globalDirectory, setGlobalDirectory] =
    useState<GlobalCompaniesResponse | null>(null);
  const [globalDirectoryLoading, setGlobalDirectoryLoading] = useState(false);
  const [filterFacets, setFilterFacets] =
    useState<FilterFacetsResponse | null>(null);
  const [filterExplorerResult, setFilterExplorerResult] =
    useState<FilterExplorerResponse | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  // Tracks explicit user clicks on pagination buttons so pagination fetches on demand with a clear loading indicator
  const paginationRequestedPageRef = useRef<number | null>(null);
  const [authSubmittingOverlay, setAuthSubmittingOverlay] = useState(false);
  const [postLoginOverlayVisible, setPostLoginOverlayVisible] = useState(false);
  const postLoginStartedAtRef = useRef<number>(0);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

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

  // Tracks companies already settled for the current logged-in user in this browser tab
  const sessionSettledKeysRef = useRef<Set<string>>(new Set());
  // Client RAM cache for instant 0ms Worldwide Directory page switches
  const directoryPageCacheRef = useRef<Map<string, GlobalCompaniesResponse>>(
    new Map()
  );
  // Client RAM cache for instant 0ms Filter Explorer contact cohort switches
  const explorerPageCacheRef = useRef<Map<string, FilterExplorerResponse>>(
    new Map()
  );
  // Client RAM cache for instant 0ms Sidebar & Header Facet math
  const facetsCacheRef = useRef<Map<string, FilterFacetsResponse>>(new Map());
  // Deduplicates background /api/prefetch calls per browser session
  const prefetchedTargetsRef = useRef<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const { isInstallable, install } = usePWAInstall();

  const {
    user,
    publicConfig,
    coinLedger,
    usdtOrders,
    authInitializing,
    sessionDisplacedNotice,
    clearSessionDisplacedNotice,
    login,
    signup,
    logout,
    refreshAccount,
    fetchPublicConfig,
    applySearchCoinMeta,
    applyExactCoinBalance,
    submitUsdtPayment,
    redeemVoucher,
    updateProfile,
    changePassword,
    rotateSession,
  } = usePlatformAuth(appView === 'admin');

  // Clear settled cache whenever logged-in user ID changes
  useEffect(() => {
    sessionSettledKeysRef.current.clear();
  }, [user?.id]);

  // If single-device lock displaces this browser session, return cleanly to Sign In
  useEffect(() => {
    if (sessionDisplacedNotice && !user && appView !== 'admin') {
      sessionSettledKeysRef.current.clear();
      setAppView('landing');
      setAuthMode('login');
    }
  }, [sessionDisplacedNotice, user, appView]);

  // Automatically route authenticated users from `/` or `/login` into Workspace
  useEffect(() => {
    if (!authInitializing && user && appView === 'landing') {
      setAppView('workspace');
      if (
        user.preferences?.defaultSessionMode === 'filter' &&
        !activeDomain &&
        !filterSelectedCompany
      ) {
        setSessionMode('filter');
        setActiveTab('industry');
      }
    }
  }, [
    authInitializing,
    user,
    appView,
    activeDomain,
    filterSelectedCompany,
  ]);

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
    onBalanceUpdated: applyExactCoinBalance,
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
    if (effectiveOffline || !user) return;
    let cancelled = false;
    setGlobalIndustries((prev) => {
      if (prev.length === 0) {
        setIndustriesLoading(true);
      }
      return prev;
    });
    apiFetch('/api/industries')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled && Array.isArray(payload?.industries)) {
          setGlobalIndustries(payload.industries);
          try {
            window.localStorage.setItem(
              INDUSTRIES_CACHE_KEY,
              JSON.stringify(payload.industries)
            );
          } catch {
            // Ignore quota errors
          }
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
  }, [effectiveOffline, user]);

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
    const nextCompanyName = filters.companyNameFilter.trim();
    const nextIndustryKeyword = filters.industryKeyword.trim();
    const nextLocationQuery = filters.locationQuery.trim();
    const nextContactSearch = filters.contactSearch.trim();
    const nextRoleKeyword = filters.roleKeyword.trim();
    const nextMinAccuracy = filters.minAccuracy;
    const nextMaxAccuracy = filters.maxAccuracy;

    const timer = window.setTimeout(() => {
      setDebouncedTextFilters((prev) => {
        if (
          prev.companyNameFilter === nextCompanyName &&
          prev.industryKeyword === nextIndustryKeyword &&
          prev.locationQuery === nextLocationQuery &&
          prev.contactSearch === nextContactSearch &&
          prev.roleKeyword === nextRoleKeyword &&
          prev.minAccuracy === nextMinAccuracy &&
          prev.maxAccuracy === nextMaxAccuracy
        ) {
          return prev;
        }
        return {
          companyNameFilter: nextCompanyName,
          industryKeyword: nextIndustryKeyword,
          locationQuery: nextLocationQuery,
          contactSearch: nextContactSearch,
          roleKeyword: nextRoleKeyword,
          minAccuracy: nextMinAccuracy,
          maxAccuracy: nextMaxAccuracy,
        };
      });
    }, 50);
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

  const prefetchCompanyLookup = useCallback(
    (rawDomain?: string | null, companySlug?: string | null) => {
      if (effectiveOffline || !user) return;
      const cleanDom = rawDomain ? sanitizeClientDomain(rawDomain) : '';
      const cleanSlug = (companySlug || '').trim().toLowerCase();
      if (!cleanSlug && (!cleanDom || !cleanDom.includes('.'))) return;

      const key = `${cleanDom}|${cleanSlug}`;
      if (prefetchedTargetsRef.current.has(key)) return;
      prefetchedTargetsRef.current.add(key);

      const q = new URLSearchParams();
      if (cleanDom && cleanDom.includes('.')) q.set('domain', cleanDom);
      if (cleanSlug) q.set('companySlug', cleanSlug);
      void apiFetch(`/api/prefetch?${q.toString()}`).catch(() => {
        // Silent background cache warm
      });
    },
    [effectiveOffline, user]
  );

  // Warm server domain cache while user types a valid domain in the search bar
  useEffect(() => {
    if (effectiveOffline || !user || appView !== 'workspace') return;
    const candidate = sanitizeClientDomain(domainInput);
    if (
      !candidate ||
      candidate.length < 4 ||
      !candidate.includes('.') ||
      candidate.endsWith('.') ||
      snapshots[candidate]
    ) {
      return;
    }
    const tlds = candidate.split('.');
    const lastPart = tlds[tlds.length - 1] || '';
    if (lastPart.length < 2) return;

    const timer = window.setTimeout(() => {
      prefetchCompanyLookup(candidate, null);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [domainInput, effectiveOffline, user, appView, snapshots, prefetchCompanyLookup]);

  const buildCompanyParams = useCallback(
    (pageNum: number) => {
      const p = new URLSearchParams();
      if (selectedSlugsKey) p.set('slugs', selectedSlugsKey);
      if (selectedCountriesKey) p.set('countries', selectedCountriesKey);
      if (selectedContinentsKey) p.set('continents', selectedContinentsKey);
      if (debouncedTextFilters.companyNameFilter) {
        p.set('q', debouncedTextFilters.companyNameFilter);
      }
      if (debouncedTextFilters.industryKeyword) {
        p.set('industryKeyword', debouncedTextFilters.industryKeyword);
      }
      if (filters.industryMatchMode) {
        p.set('industryMatchMode', filters.industryMatchMode);
      }
      if (selectedEmpRangesKey) {
        p.set('employeeRanges', selectedEmpRangesKey);
      }
      if (selectedRevRangesKey) {
        p.set('revenueRanges', selectedRevRangesKey);
      }
      if (debouncedTextFilters.locationQuery) {
        p.set('locationQuery', debouncedTextFilters.locationQuery);
      }
      p.set('page', String(Math.max(1, pageNum)));
      return p.toString();
    },
    [
      selectedSlugsKey,
      selectedCountriesKey,
      selectedContinentsKey,
      debouncedTextFilters.companyNameFilter,
      debouncedTextFilters.industryKeyword,
      debouncedTextFilters.locationQuery,
      filters.industryMatchMode,
      selectedEmpRangesKey,
      selectedRevRangesKey,
    ]
  );

  const buildExplorerParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      if (selectedSlugsKey) params.set('slugs', selectedSlugsKey);
      if (selectedCountriesKey) params.set('countries', selectedCountriesKey);
      if (selectedContinentsKey) {
        params.set('continents', selectedContinentsKey);
      }
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
      params.set('page', String(Math.max(1, pageNum)));
      return params.toString();
    },
    [
      selectedSlugsKey,
      selectedCountriesKey,
      selectedContinentsKey,
      debouncedTextFilters,
      filters.industryMatchMode,
      filters.emailFormulaOverride,
      selectedEmpRangesKey,
      selectedRevRangesKey,
      selectedSenioritiesKey,
      selectedDepartmentsKey,
    ]
  );

  const handleNavigateGlobalPage = useCallback((nextPage: number) => {
    const bounded = Math.max(1, nextPage);
    paginationRequestedPageRef.current = bounded;
    setGlobalPage(bounded);
  }, []);
  useEffect(() => {
    if (effectiveOffline || !user || appView !== 'workspace') return;

    const p = new URLSearchParams();
    if (selectedSlugsKey) p.set('slugs', selectedSlugsKey);
    if (selectedCountriesKey) p.set('countries', selectedCountriesKey);
    if (selectedContinentsKey) p.set('continents', selectedContinentsKey);
    if (debouncedTextFilters.companyNameFilter) {
      p.set('q', debouncedTextFilters.companyNameFilter);
    }
    if (debouncedTextFilters.industryKeyword) {
      p.set('industryKeyword', debouncedTextFilters.industryKeyword);
    }
    if (filters.industryMatchMode) {
      p.set('industryMatchMode', filters.industryMatchMode);
    }
    if (selectedEmpRangesKey) p.set('employeeRanges', selectedEmpRangesKey);
    if (selectedRevRangesKey) p.set('revenueRanges', selectedRevRangesKey);
    if (debouncedTextFilters.locationQuery) {
      p.set('locationQuery', debouncedTextFilters.locationQuery);
    }
    if (debouncedTextFilters.contactSearch) {
      p.set('contactSearch', debouncedTextFilters.contactSearch);
    }
    if (debouncedTextFilters.roleKeyword) {
      p.set('roleKeyword', debouncedTextFilters.roleKeyword);
    }
    if (selectedSenioritiesKey) p.set('seniorities', selectedSenioritiesKey);
    if (selectedDepartmentsKey) p.set('departments', selectedDepartmentsKey);
    p.set('minAccuracy', String(debouncedTextFilters.minAccuracy));
    p.set('maxAccuracy', String(debouncedTextFilters.maxAccuracy));

    const facetsKey = p.toString();
    const cachedFacets = facetsCacheRef.current.get(facetsKey);
    if (cachedFacets) {
      setFilterFacets((prev) => (prev === cachedFacets ? prev : cachedFacets));
      return;
    }

    const controller = new AbortController();
    apiFetch(`/api/filter-facets?${facetsKey}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: FilterFacetsResponse | null) => {
        if (
          !controller.signal.aborted &&
          payload &&
          typeof payload.totalMatchedCompanies === 'number'
        ) {
          if (facetsCacheRef.current.size > 150) {
            const oldest = facetsCacheRef.current.keys().next().value;
            if (oldest !== undefined) facetsCacheRef.current.delete(oldest);
          }
          facetsCacheRef.current.set(facetsKey, payload);
          setFilterFacets(payload);
        }
      })
      .catch(() => {
        // Non-fatal
      });

    return () => {
      controller.abort();
    };
  }, [
    user,
    appView,
    selectedSlugsKey,
    selectedCountriesKey,
    selectedContinentsKey,
    selectedSenioritiesKey,
    selectedDepartmentsKey,
    selectedEmpRangesKey,
    selectedRevRangesKey,
    filters.industryMatchMode,
    debouncedTextFilters,
    effectiveOffline,
  ]);

  const inFlightCompanyPrefetchRef = useRef<
    Map<string, Promise<GlobalCompaniesResponse | null>>
  >(new Map());
  const inFlightExplorerPrefetchRef = useRef<
    Map<string, Promise<FilterExplorerResponse | null>>
  >(new Map());

  const isCompaniesPageCached = useCallback(
    (page: number) => directoryPageCacheRef.current.has(buildCompanyParams(page)),
    [buildCompanyParams]
  );

  const isExplorerPageCached = useCallback(
    (page: number) =>
      explorerPageCacheRef.current.has(buildExplorerParams(page)),
    [buildExplorerParams]
  );

  const prefetchCompaniesPage = useCallback(
    (page: number) => {
      if (effectiveOffline || !user || appView !== 'workspace' || page < 1) {
        return;
      }
      const queryStr = buildCompanyParams(page);
      if (
        directoryPageCacheRef.current.has(queryStr) ||
        inFlightCompanyPrefetchRef.current.has(queryStr)
      ) {
        return;
      }
      const reqPromise = apiFetch(`/api/industry-companies?${queryStr}`)
        .then((r) => (r.ok ? (r.json() as Promise<GlobalCompaniesResponse>) : null))
        .then((payload) => {
          if (payload && Array.isArray(payload.companies) && payload.companies.length > 0) {
            if (directoryPageCacheRef.current.size > 300) {
              const firstKey = directoryPageCacheRef.current.keys().next().value;
              if (firstKey !== undefined) {
                directoryPageCacheRef.current.delete(firstKey);
              }
            }
            directoryPageCacheRef.current.set(queryStr, payload);
          }
          return payload;
        })
        .catch(() => null)
        .finally(() => {
          inFlightCompanyPrefetchRef.current.delete(queryStr);
        });
      inFlightCompanyPrefetchRef.current.set(queryStr, reqPromise);
    },
    [effectiveOffline, user, appView, buildCompanyParams]
  );

  const prefetchExplorerPage = useCallback(
    (page: number) => {
      if (effectiveOffline || !user || appView !== 'workspace' || page < 1) {
        return;
      }
      const queryStr = buildExplorerParams(page);
      if (
        explorerPageCacheRef.current.has(queryStr) ||
        inFlightExplorerPrefetchRef.current.has(queryStr)
      ) {
        return;
      }
      const reqPromise = apiFetch(`/api/filter-explorer?${queryStr}`)
        .then((r) => (r.ok ? (r.json() as Promise<FilterExplorerResponse>) : null))
        .then((payload) => {
          if (
            payload &&
            Array.isArray(payload.employees) &&
            (payload.employees.length > 0 || payload.totalMatchedCompanies === 0)
          ) {
            if (explorerPageCacheRef.current.size > 150) {
              const firstKey = explorerPageCacheRef.current.keys().next().value;
              if (firstKey !== undefined) {
                explorerPageCacheRef.current.delete(firstKey);
              }
            }
            explorerPageCacheRef.current.set(queryStr, payload);
          }
          return payload;
        })
        .catch(() => null)
        .finally(() => {
          inFlightExplorerPrefetchRef.current.delete(queryStr);
        });
      inFlightExplorerPrefetchRef.current.set(queryStr, reqPromise);
    },
    [effectiveOffline, user, appView, buildExplorerParams]
  );

  // 1. Worldwide Companies Loader — Instant 0ms swap on cached pages + coalesced in-flight prefetch + silent Page N+1 warm!
  useEffect(() => {
    if (effectiveOffline || !user || appView !== 'workspace') return;

    const queryStr = buildCompanyParams(globalPage);
    const cachedPage = directoryPageCacheRef.current.get(queryStr);

    if (cachedPage) {
      setGlobalDirectory((prev) => (prev === cachedPage ? prev : cachedPage));
      setGlobalDirectoryLoading(false);
      if (paginationRequestedPageRef.current === globalPage) {
        paginationRequestedPageRef.current = null;
      }
      // Silently warm next page in background so continuous pagination is instant!
      if (cachedPage.page < cachedPage.totalPages && cachedPage.companies.length >= 500) {
        const t = window.setTimeout(() => prefetchCompaniesPage(globalPage + 1), 150);
        return () => window.clearTimeout(t);
      }
      return;
    }

    setGlobalDirectoryLoading(true);
    let cancelled = false;
    let nextPrefetchTimer: number | null = null;
    const controller = new AbortController();

    // Reuse an already in-flight prefetch promise for this exact page if one exists!
    const existingPrefetch = inFlightCompanyPrefetchRef.current.get(queryStr);
    const dataPromise: Promise<GlobalCompaniesResponse | null> = existingPrefetch
      ? existingPrefetch
      : apiFetch(`/api/industry-companies?${queryStr}`, {
          signal: controller.signal,
        }).then((r) =>
          r.ok ? (r.json() as Promise<GlobalCompaniesResponse>) : null
        );

    dataPromise
      .then((payload) => {
        if (
          !cancelled &&
          !controller.signal.aborted &&
          payload &&
          Array.isArray(payload.companies)
        ) {
          if (payload.companies.length > 0) {
            if (directoryPageCacheRef.current.size > 300) {
              const firstKey = directoryPageCacheRef.current.keys().next().value;
              if (firstKey !== undefined) {
                directoryPageCacheRef.current.delete(firstKey);
              }
            }
            directoryPageCacheRef.current.set(queryStr, payload);
          }
          startTransition(() => {
            setGlobalDirectory(payload);
          });
          // Proactively prefetch Page N+1 once current page arrives
          if (payload.page < payload.totalPages && payload.companies.length >= 500) {
            nextPrefetchTimer = window.setTimeout(
              () => prefetchCompaniesPage(globalPage + 1),
              220
            );
          }
        }
      })
      .catch(() => {
        // Aborted or transient network issue
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) {
          setGlobalDirectoryLoading(false);
          if (paginationRequestedPageRef.current === globalPage) {
            paginationRequestedPageRef.current = null;
          }
        }
      });

    return () => {
      cancelled = true;
      if (nextPrefetchTimer !== null) window.clearTimeout(nextPrefetchTimer);
      controller.abort();
    };
  }, [
    user,
    appView,
    buildCompanyParams,
    globalPage,
    effectiveOffline,
    prefetchCompaniesPage,
  ]);

  // 2. Contact Cohort Loader — Instant 0ms swap on cached pages + coalesced in-flight prefetch + no contention with Companies tab!
  useEffect(() => {
    if (effectiveOffline || !user || appView !== 'workspace') return;
    if (sessionMode !== 'filter' && activeFilterCount === 0) {
      return;
    }

    const explorerQueryStr = buildExplorerParams(globalPage);
    const cachedExplorer = explorerPageCacheRef.current.get(explorerQueryStr);
    const isExplicitPaginationTurn =
      paginationRequestedPageRef.current === globalPage;

    if (cachedExplorer) {
      setFilterExplorerResult((prev) =>
        prev === cachedExplorer ? prev : cachedExplorer
      );
      setIsFilterLoading(false);
      // Warm Page N+1 silently when viewing contacts/hierarchy tabs
      if (
        activeTab !== 'industry' &&
        cachedExplorer.page < cachedExplorer.totalPages &&
        cachedExplorer.employees.length >= 500
      ) {
        const t = window.setTimeout(() => prefetchExplorerPage(globalPage + 1), 220);
        return () => window.clearTimeout(t);
      }
      return;
    }

    // When user is actively browsing Companies tab, don't compete while Companies is still loading
    if (sessionMode === 'filter' && activeTab === 'industry' && globalDirectoryLoading) {
      return;
    }

    let cancelled = false;
    let nextPrefetchTimer: number | null = null;
    const controller = new AbortController();
    const deferMs =
      sessionMode === 'filter' && activeTab === 'industry' ? 350 : 0;

    const timer = window.setTimeout(() => {
      if (activeTab !== 'industry') {
        setFilterExplorerResult((prev) => {
          if (!prev || isExplicitPaginationTurn || globalPage > 1) {
            setIsFilterLoading(true);
          }
          return prev;
        });
      }

      // Reuse an already in-flight prefetch promise for this exact page if one exists!
      const existingPrefetch =
        inFlightExplorerPrefetchRef.current.get(explorerQueryStr);
      const dataPromise: Promise<FilterExplorerResponse | null> = existingPrefetch
        ? existingPrefetch
        : apiFetch(`/api/filter-explorer?${explorerQueryStr}`, {
            signal: controller.signal,
          }).then((r) =>
            r.ok ? (r.json() as Promise<FilterExplorerResponse>) : null
          );

      dataPromise
        .then((payload) => {
          if (
            !cancelled &&
            !controller.signal.aborted &&
            payload &&
            Array.isArray(payload.employees)
          ) {
            if (
              payload.employees.length > 0 ||
              payload.totalMatchedCompanies === 0
            ) {
              if (explorerPageCacheRef.current.size > 150) {
                const firstKey = explorerPageCacheRef.current.keys().next().value;
                if (firstKey !== undefined) {
                  explorerPageCacheRef.current.delete(firstKey);
                }
              }
              explorerPageCacheRef.current.set(explorerQueryStr, payload);
            }
            startTransition(() => {
              setFilterExplorerResult(payload);
            });
            if (
              activeTab !== 'industry' &&
              payload.page < payload.totalPages &&
              payload.employees.length >= 500
            ) {
              nextPrefetchTimer = window.setTimeout(
                () => prefetchExplorerPage(globalPage + 1),
                300
              );
            }
          }
        })
        .catch(() => {
          // Aborted or transient network issue
        })
        .finally(() => {
          if (!cancelled && !controller.signal.aborted) {
            setIsFilterLoading(false);
          }
        });
    }, deferMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (nextPrefetchTimer !== null) window.clearTimeout(nextPrefetchTimer);
      controller.abort();
    };
  }, [
    user,
    appView,
    sessionMode,
    activeTab,
    activeFilterCount,
    globalDirectoryLoading,
    buildExplorerParams,
    globalPage,
    effectiveOffline,
    prefetchExplorerPage,
  ]);

  const filtersSnapshotRef = useRef(filters);
  filtersSnapshotRef.current = filters;

  const handleChangeFilters = useCallback(
    (updater: (prev: SidebarFiltersState) => SidebarFiltersState) => {
      const prevFilters = filtersSnapshotRef.current;
      const nextFilters = updater(prevFilters);
      const companyScopeChanged =
        prevFilters.companyNameFilter !== nextFilters.companyNameFilter ||
        prevFilters.industryKeyword !== nextFilters.industryKeyword ||
        prevFilters.industryMatchMode !== nextFilters.industryMatchMode ||
        prevFilters.locationQuery !== nextFilters.locationQuery ||
        prevFilters.selectedIndustrySlugs.join(',') !==
          nextFilters.selectedIndustrySlugs.join(',') ||
        prevFilters.selectedContinents.join('|') !==
          nextFilters.selectedContinents.join('|') ||
        prevFilters.selectedCountries.join('|') !==
          nextFilters.selectedCountries.join('|') ||
        prevFilters.employeeRanges.join('|') !==
          nextFilters.employeeRanges.join('|') ||
        prevFilters.revenueRanges.join('|') !==
          nextFilters.revenueRanges.join('|');

      setFilters(nextFilters);
      setAppView('workspace');
      filterCompanyAbortRef.current?.abort();
      setIsFilterCompanyLoading(false);
      setFilterSelectedCompany(null);
      setFilterCompanyResult(null);
      setFilterCompanyError(null);
      setSessionMode('filter');

      if (
        companyScopeChanged ||
        sessionMode !== 'filter' ||
        (activeTab !== 'full-names-emails' &&
          activeTab !== 'command-hierarchy')
      ) {
        setActiveTab('industry');
      }

      setFilterSelectedDepartment('All');
      setFilterSelectedSeniority('All');
      paginationRequestedPageRef.current = null;
      setGlobalPage(1);
      setContactsPage(1);
      setRolesPage(1);
    },
    [sessionMode, activeTab]
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
      const isMasked = emp.email.includes('*');
      const resolvedEmail =
        isMasked || filters.emailFormulaOverride === 'auto'
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
        formulaLabel: 'Verified Corporate Directory',
        excelFormula: '',
        patternConfidence: 88,
        mxVerified: true,
        mxProvider: 'Multi-Domain Verified',
        detectionBasis: 'Live Web Verification',
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

      setAppView('workspace');
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
      const alreadySettledThisSession = Boolean(
        domain && sessionSettledKeysRef.current.has(`dom:${domain}`)
      );

      if (effectiveOffline) {
        if (
          domain &&
          hasValidSnapshot &&
          existingSnapshot &&
          alreadySettledThisSession &&
          !forceRefresh
        ) {
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

      if (domain && !forceRefresh && hasValidSnapshot && alreadySettledThisSession) {
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
        queryParams.set('source', 'domain');
        if (forceRefresh) queryParams.set('refresh', 'true');

        const res = await apiFetch(`/api/search?${queryParams.toString()}`);
        const payload = await res.json();

        if (res.status === 402 || payload?.code === 'INSUFFICIENT_COINS') {
          if (typeof payload?.balanceRemaining === 'number') {
            applyExactCoinBalance(payload.balanceRemaining);
          }
          setExhaustedCoinsPrompt(
            payload?.error ||
              `You have consumed all ${publicConfig.defaultSignupCoins} Lens Coins. Upgrade for $${publicConfig.unlimitedMonthlyPriceUsdt}/month in USDT (TRC20) for unlimited company emails.`
          );
          setAppView('upgrade');
          return;
        }

        if (!res.ok) {
          throw new Error(
            payload?.error || 'Failed to query public directory.'
          );
        }

        const data = payload as SearchResponse;
        applySearchCoinMeta(data.coinMeta);

        if (data.employees.length > 0) {
          sessionSettledKeysRef.current.add(`dom:${data.domain}`);
          if (data.companySlug) {
            sessionSettledKeysRef.current.add(`slug:${data.companySlug}`);
          }
          setSnapshots((prev) => ({
            ...prev,
            [data.domain]: data,
          }));
          setActiveDomain(data.domain);
          setDomainInput(data.domain);

          setStatusBanner({
            tone: 'success',
            text: `Indexed ${data.employees.length.toLocaleString()} contacts & verified emails (${data.emailPattern.patternConfidence}% confidence) for ${data.companyName}.`,
          });
        } else {
          setStatusBanner({
            tone: 'warning',
            text: `No public employee records were indexed for "${
              data.domain || companyDisplayLabel
            }" — 0 Lens Coins deducted.`,
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
    [
      applyExactCoinBalance,
      applySearchCoinMeta,
      effectiveOffline,
      publicConfig.defaultSignupCoins,
      publicConfig.unlimitedMonthlyPriceUsdt,
      queueDomainOffline,
      snapshots,
    ]
  );

  const loadFilterCompanyContacts = useCallback(
    async (company: GlobalCompanyItem, preserveCurrentTab = false) => {
      filterCompanyAbortRef.current?.abort();
      setAppView('workspace');
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
      const settledByDom = Boolean(
        cleanDom && sessionSettledKeysRef.current.has(`dom:${cleanDom}`)
      );
      const settledBySlug = Boolean(
        company.slug && sessionSettledKeysRef.current.has(`slug:${company.slug}`)
      );

      const cachedSnapshot =
        (cleanDom && snapshots[cleanDom]?.employees?.length
          ? snapshots[cleanDom]
          : undefined) ||
        Object.values(snapshots).find(
          (s) => s.companySlug === company.slug && s.employees.length > 0
        );

      if (cachedSnapshot && (settledByDom || settledBySlug)) {
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
        queryParams.set('source', 'filter_company');

        const res = await apiFetch(`/api/search?${queryParams.toString()}`, {
          signal: controller.signal,
        });
        const payload = await res.json();

        if (res.status === 402 || payload?.code === 'INSUFFICIENT_COINS') {
          if (typeof payload?.balanceRemaining === 'number') {
            applyExactCoinBalance(payload.balanceRemaining);
          }
          setFilterSelectedCompany(null);
          setExhaustedCoinsPrompt(
            payload?.error ||
              `You have consumed all ${publicConfig.defaultSignupCoins} Lens Coins. Upgrade for $${publicConfig.unlimitedMonthlyPriceUsdt}/month in USDT (TRC20) for unlimited company emails.`
          );
          setAppView('upgrade');
          return;
        }

        if (!res.ok) {
          throw new Error(
            payload?.error || 'Failed to load company contacts.'
          );
        }

        const data = payload as SearchResponse;
        if (!controller.signal.aborted) {
          applySearchCoinMeta(data.coinMeta);
          setFilterCompanyResult(data);
          if (data.employees.length > 0) {
            if (data.domain) {
              sessionSettledKeysRef.current.add(`dom:${data.domain}`);
              setSnapshots((prev) => ({
                ...prev,
                [data.domain]: data,
              }));
            }
            if (company.slug) {
              sessionSettledKeysRef.current.add(`slug:${company.slug}`);
            }
          } else {
            setFilterCompanyError(
              `No public employee records were indexed for ${company.name} — 0 Lens Coins deducted.`
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
    [
      applyExactCoinBalance,
      applySearchCoinMeta,
      effectiveOffline,
      publicConfig.defaultSignupCoins,
      publicConfig.unlimitedMonthlyPriceUsdt,
      queueDomainOffline,
      snapshots,
    ]
  );

  const handleSelectGlobalCompany = useCallback(
    (company: GlobalCompanyItem) => {
      void loadFilterCompanyContacts(company, false);
    },
    [loadFilterCompanyContacts]
  );

  const hydratedDeepLinkRef = useRef<string>('');
  useEffect(() => {
    if (!user || appView !== 'workspace') return;
    if (
      sessionMode === 'domain' &&
      activeDomain &&
      !sessionSettledKeysRef.current.has(`dom:${activeDomain}`) &&
      !isDomainLoading
    ) {
      const key = `${user.id}:domain:${activeDomain}`;
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
      const key = `${user.id}:company:${filterSelectedCompany.slug}:${
        filterSelectedCompany.domain || ''
      }`;
      if (hydratedDeepLinkRef.current !== key) {
        hydratedDeepLinkRef.current = key;
        void loadFilterCompanyContacts(filterSelectedCompany, true);
      }
    }
  }, [
    user,
    appView,
    sessionMode,
    activeDomain,
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

  const effectiveRoutedView: TopLevelAppView =
    appView === 'admin'
      ? 'admin'
      : !user
      ? 'landing'
      : appView === 'upgrade'
      ? 'upgrade'
      : appView === 'profile'
      ? 'profile'
      : 'workspace';

  const currentUrlState = useMemo<UrlRoutedState>(
    () => ({
      appView: effectiveRoutedView,
      authMode,
      adminSection,
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
      effectiveRoutedView,
      authMode,
      adminSection,
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

  useUrlRouterSync({
    state: currentUrlState,
    defaultFilters: INITIAL_SIDEBAR_FILTERS,
    domainCompanyName: currentDomainResult?.companyName,
    filterCompanyDisplayName: filterCompanyResult?.companyName,
    onRestorePopState: (parsed) => {
      setAppView(parsed.appView);
      setAuthMode(parsed.authMode);
      setAdminSection(parsed.adminSection);
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
      setAppView('workspace');
      setSessionMode('domain');
      setActiveTab('full-names-emails');
    },
    onNavigateTabFullNames: () => {
      setAppView('workspace');
      setActiveTab('full-names-emails');
    },
    onBackToCompaniesList: handleBackToCompaniesList,
  });

  const handleSelectIndustryFilter = useCallback((nextSlugs: string[]) => {
    setAppView('workspace');
    setFilters((prev) => ({
      ...prev,
      selectedIndustrySlugs: nextSlugs,
    }));
    filterCompanyAbortRef.current?.abort();
    setIsFilterCompanyLoading(false);
    setFilterSelectedCompany(null);
    setFilterCompanyResult(null);
    setFilterCompanyError(null);
    setSessionMode('filter');
    setActiveTab('industry');
    setFilterSelectedDepartment('All');
    setFilterSelectedSeniority('All');
    paginationRequestedPageRef.current = null;
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
      setAppView('workspace');
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
    setAppView('workspace');
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

  const coherentFilterOrgsTotal = useMemo(() => {
    const hasFreeText = Boolean(
      filters.companyNameFilter.trim() ||
        filters.locationQuery.trim() ||
        filters.industryKeyword.trim()
    );
    if (hasFreeText && globalDirectory) {
      return globalDirectory.totalCompanies;
    }
    if (
      globalDirectory &&
      !globalDirectoryLoading &&
      globalDirectory.page === globalPage &&
      globalDirectory.companies.length < 500
    ) {
      return globalDirectory.totalCompanies;
    }
    if (filterFacets) return filterFacets.totalMatchedCompanies;
    if (globalDirectory) return globalDirectory.totalCompanies;
    if (filterExplorerResult) return filterExplorerResult.totalMatchedCompanies;
    return 0;
  }, [
    filters.companyNameFilter,
    filters.locationQuery,
    filters.industryKeyword,
    filterFacets,
    globalDirectory,
    globalDirectoryLoading,
    globalPage,
    filterExplorerResult,
  ]);

  const coherentFilterContactsTotal = useMemo(() => {
    if (
      filterExplorerResult &&
      !isFilterLoading &&
      filterExplorerResult.page === globalPage &&
      filterExplorerResult.employees.length < 500
    ) {
      return filterExplorerResult.totalMatchedContacts;
    }
    if (filterFacets) return filterFacets.totalMatchedContacts;
    return activeTotalMatchedContacts;
  }, [
    filterExplorerResult,
    isFilterLoading,
    globalPage,
    filterFacets,
    activeTotalMatchedContacts,
  ]);

  const hasCoherentFilterTotals = Boolean(
    filterFacets || globalDirectory || filterExplorerResult
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
        : hasCoherentFilterTotals
        ? coherentFilterContactsTotal.toLocaleString()
        : undefined,
  };

  const commandHierarchyTab: PrimaryTabConfig = {
    id: 'command-hierarchy',
    label: 'Command Hierarchy',
    icon: Crown,
    badge: undefined,
  };

  const industryTab: PrimaryTabConfig = {
    id: 'industry',
    label: sessionMode === 'filter' ? 'Companies' : 'Industry',
    icon: Building2,
    badge:
      sessionMode === 'domain'
        ? currentDomainResult?.industryTags?.[0] || undefined
        : hasCoherentFilterTotals
        ? `${coherentFilterOrgsTotal.toLocaleString()} Orgs`
        : undefined,
  };

  const primaryTabs: PrimaryTabConfig[] =
    sessionMode === 'filter'
      ? [industryTab, fullNamesTab, commandHierarchyTab]
      : [fullNamesTab, commandHierarchyTab, industryTab];

  const handleSelectPrimaryTab = useCallback(
    (tabId: PrimaryTab) => {
      setAppView('workspace');
      if (sessionMode === 'filter' && tabId === 'industry') {
        handleBackToCompaniesList();
        return;
      }
      setActiveTab(tabId);
      setLocalSearchQuery('');
    },
    [sessionMode, handleBackToCompaniesList]
  );

  const requestSignOut = useCallback(() => {
    setSignOutConfirmOpen(true);
  }, []);

  const confirmSignOutNow = useCallback(() => {
    setSignOutConfirmOpen(false);
    setPostLoginOverlayVisible(false);
    logout();
    sessionSettledKeysRef.current.clear();
    directoryPageCacheRef.current.clear();
    explorerPageCacheRef.current.clear();
    facetsCacheRef.current.clear();
    setSnapshots({});
    setActiveDomain(null);
    setDomainInput('');
    setFilterSelectedCompany(null);
    setFilterCompanyResult(null);
    setGlobalDirectory(null);
    setFilterFacets(null);
    setFilterExplorerResult(null);
    setAppView('landing');
    setAuthMode('login');
  }, [logout]);

  // Auto-dismiss the white translucent OrgLens dismantling logo overlay once workspace data finishes loading
  useEffect(() => {
    if (!postLoginOverlayVisible || authSubmittingOverlay) return;

    // Hard safety cap so slow networks never trap the user on the overlay
    const maxCapTimer = window.setTimeout(() => {
      setPostLoginOverlayVisible(false);
    }, 2400);

    const workspaceLoaded =
      Boolean(globalDirectory) && !globalDirectoryLoading;
    const elapsed = Date.now() - postLoginStartedAtRef.current;

    let dismissTimer: number | undefined;
    if (workspaceLoaded || appView !== 'workspace') {
      const remainingMinCycle = Math.max(0, 650 - elapsed);
      dismissTimer = window.setTimeout(() => {
        setPostLoginOverlayVisible(false);
      }, remainingMinCycle);
    }

    return () => {
      window.clearTimeout(maxCapTimer);
      if (dismissTimer !== undefined) {
        window.clearTimeout(dismissTimer);
      }
    };
  }, [
    postLoginOverlayVisible,
    authSubmittingOverlay,
    globalDirectory,
    globalDirectoryLoading,
    appView,
  ]);

  // Initial session validation splash using matching OrgLens logo overlay
  if (authInitializing) {
    return (
      <OrgLensLogoLoaderOverlay
        visible={true}
        subtitle="Restoring your OrgLens session..."
      />
    );
  }

  // 1. /admin View (Comprehensive Admin Console + Admin Login Gate)
  if (appView === 'admin') {
    return (
      <>
        <AdminDashboardPage
          user={user}
          publicConfig={publicConfig}
          activeSection={adminSection}
          onSelectSection={setAdminSection}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onLogin={login}
          onLogout={requestSignOut}
          onReturnToWorkspace={() =>
            setAppView(user ? 'workspace' : 'landing')
          }
          onSyncAuthAndConfig={async () => {
            await Promise.all([refreshAccount(), fetchPublicConfig(true)]);
          }}
        />
        <SignOutConfirmModal
          open={signOutConfirmOpen}
          userEmail={user?.email}
          userName={user?.fullName}
          onCancel={() => setSignOutConfirmOpen(false)}
          onConfirm={confirmSignOutNow}
        />
      </>
    );
  }

  // 2. Unauthenticated Landing + B2B Login / Sign Up View OR Authenticated Workspace
  // Mount OrgLensLogoLoaderOverlay at the same tree level so submitting login immediately displays
  // the dismantling/rearranging favicon overlay and transitions into the workspace with zero flicker.
  const isLoginOverlayActive = authSubmittingOverlay || postLoginOverlayVisible;

  if (!user) {
    return (
      <>
        <OrgLensLogoLoaderOverlay visible={isLoginOverlayActive} />
        <B2BLandingAuthPage
          authMode={authMode}
          onChangeAuthMode={setAuthMode}
          config={publicConfig}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          sessionDisplacedNotice={sessionDisplacedNotice}
          onDismissSessionNotice={clearSessionDisplacedNotice}
          onLogin={async (identifier, password) => {
            postLoginStartedAtRef.current = Date.now();
            setAuthSubmittingOverlay(true);
            try {
              const loggedIn = await login(identifier, password);
              setPostLoginOverlayVisible(true);
              setAuthSubmittingOverlay(false);
              setAppView('workspace');
              if (loggedIn.preferences?.defaultSessionMode === 'filter') {
                setSessionMode('filter');
                setActiveTab('industry');
              } else {
                setSessionMode('domain');
                setActiveTab('full-names-emails');
              }
              return loggedIn;
            } catch (err) {
              setAuthSubmittingOverlay(false);
              setPostLoginOverlayVisible(false);
              throw err;
            }
          }}
          onSignup={async (input) => {
            postLoginStartedAtRef.current = Date.now();
            setAuthSubmittingOverlay(true);
            try {
              const created = await signup(input);
              setPostLoginOverlayVisible(true);
              setAuthSubmittingOverlay(false);
              setAppView('workspace');
              setSessionMode('domain');
              setActiveTab('full-names-emails');
              setStatusBanner({
                tone: 'success',
                text: `Welcome to OrgLens, ${created.fullName}! ${created.lensCoins} free Lens Coins have been credited to your account.`,
              });
              return created;
            } catch (err) {
              setAuthSubmittingOverlay(false);
              setPostLoginOverlayVisible(false);
              throw err;
            }
          }}
        />
      </>
    );
  }

  // 3. Authenticated Views: /upgrade (USDT TRC20 Billing) OR Directory Workspace
  return (
    <>
      <OrgLensLogoLoaderOverlay visible={isLoginOverlayActive} />
      <div className="min-h-screen relative overflow-x-clip bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 transition-colors duration-200">
        <div
          aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[460px] w-[880px] rounded-full bg-sky-500/12 dark:bg-sky-500/10 blur-3xl" />
        <div className="absolute top-72 -right-32 h-[360px] w-[520px] rounded-full bg-indigo-500/10 dark:bg-indigo-500/8 blur-3xl" />
      </div>

      {publicConfig.announcementBanner?.trim() && (
        <div className="relative z-30 bg-sky-600 text-white px-4 py-2 text-xs font-medium text-center flex items-center justify-center gap-2">
          <Megaphone className="h-3.5 w-3.5 shrink-0" />
          <span>{publicConfig.announcementBanner}</span>
        </div>
      )}

      <TopNavHeader
        user={user}
        monthlyPriceUsdt={publicConfig.unlimitedMonthlyPriceUsdt}
        appView={appView}
        sessionMode={sessionMode}
        activeTab={activeTab}
        primaryTabs={primaryTabs}
        onBrandClick={() => {
          setAppView('workspace');
          setSessionMode('domain');
          setActiveTab('full-names-emails');
        }}
        onSelectTab={handleSelectPrimaryTab}
        onFocusDomainLookup={() => {
          setAppView('workspace');
          setSessionMode('domain');
          setActiveTab('full-names-emails');
          scrollToListTop(searchInputRef.current, 110);
          window.setTimeout(() => {
            searchInputRef.current?.focus();
          }, 120);
        }}
        onOpenProfile={() => {
          setExhaustedCoinsPrompt(null);
          setAppView('profile');
          void refreshAccount();
        }}
        onOpenUpgrade={() => {
          setExhaustedCoinsPrompt(null);
          setAppView('upgrade');
          void refreshAccount();
        }}
        onOpenAdmin={() => setAppView('admin')}
        onLogout={requestSignOut}
      />

      {appView === 'upgrade' ? (
        <div className="relative z-10">
          <UsdtUpgradePage
            user={user}
            config={publicConfig}
            ledger={coinLedger}
            orders={usdtOrders}
            exhaustedCoinsPrompt={exhaustedCoinsPrompt}
            onBackToWorkspace={() => {
              setExhaustedCoinsPrompt(null);
              setAppView('workspace');
            }}
            onSubmitUsdtPayment={submitUsdtPayment}
            onRedeemVoucher={redeemVoucher}
          />
        </div>
      ) : appView === 'profile' ? (
        <div className="relative z-10">
          <UserProfileSettingsPage
            user={user}
            config={publicConfig}
            ledger={coinLedger}
            theme={theme}
            onToggleTheme={() =>
              setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
            }
            onBackToWorkspace={() => setAppView('workspace')}
            onOpenUpgrade={() => {
              setExhaustedCoinsPrompt(null);
              setAppView('upgrade');
              void refreshAccount();
            }}
            onOpenUnlockedDomain={(dom) => {
              setAppView('workspace');
              setSessionMode('domain');
              setActiveTab('full-names-emails');
              void executeDomainLookup(dom, false);
            }}
            onUpdateProfile={updateProfile}
            onChangePassword={changePassword}
            onRotateSession={rotateSession}
            onRedeemVoucher={redeemVoucher}
            onLogout={requestSignOut}
          />
        </div>
      ) : (
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
              paginationRequestedPageRef.current = null;
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
              setSessionMode('filter');
              setActiveTab('industry');
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
              void executeDomainLookup(d, false);
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            mobileOpen={mobileSidebarOpen}
            onCloseMobile={() => setMobileSidebarOpen(false)}
            isFilterLoading={
              !hasCoherentFilterTotals &&
              (isFilterLoading || globalDirectoryLoading)
            }
            filterFacets={filterFacets}
          />

          <main className="flex-1 min-w-0 space-y-4">
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
              onToggleSimulateOffline={() =>
                setSimulateOffline((prev) => !prev)
              }
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
              coherentMatchedOrgs={coherentFilterOrgsTotal}
              hasFilterTotals={hasCoherentFilterTotals}
              activeFilterCount={activeFilterCount}
              isFilterLoading={
                !hasCoherentFilterTotals &&
                (isFilterLoading || globalDirectoryLoading)
              }
              isFilterCompanyLoading={isFilterCompanyLoading}
              onSelectDomainSession={() => {
                setSessionMode('domain');
                setActiveTab('full-names-emails');
                setLocalSearchQuery('');
              }}
              onSelectFilterSession={() => {
                setSessionMode('filter');
                setActiveTab(filterSelectedCompany ? 'full-names-emails' : 'industry');
                setLocalSearchQuery('');
              }}
              onSelectTab={handleSelectPrimaryTab}
            />

            <section
              aria-hidden={activeTab !== 'full-names-emails'}
              className={
                activeTab === 'full-names-emails'
                  ? 'block rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-3.5 sm:p-6 shadow-xs'
                  : 'hidden'
              }
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
                  handleNavigateGlobalPage(pg);
                  setContactsPage(1);
                }}
                isPageCached={isExplorerPageCached}
                onPrefetchPage={prefetchExplorerPage}
                contactsPage={contactsPage}
                onChangeContactsPage={setContactsPage}
                urlLocalQuery={localSearchQuery}
                onChangeUrlLocalQuery={setLocalSearchQuery}
                monthlyPriceUsdt={publicConfig.unlimitedMonthlyPriceUsdt}
                onOpenUpgrade={() => setAppView('upgrade')}
                copyFormat={user.preferences?.copyFormat}
                autoScrollOnPagination={
                  user.preferences?.autoScrollOnPagination ?? true
                }
                exportFilenamePrefix={
                  user.preferences?.exportFilenamePrefix
                }
                coherentMatchedOrgs={
                  hasCoherentFilterTotals ? coherentFilterOrgsTotal : undefined
                }
              />
            </section>

            <section
              aria-hidden={activeTab !== 'command-hierarchy'}
              className={
                activeTab === 'command-hierarchy'
                  ? 'block rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-3.5 sm:p-6 shadow-xs'
                  : 'hidden'
              }
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
                  handleNavigateGlobalPage(pg);
                  setRolesPage(1);
                }}
                isPageCached={isExplorerPageCached}
                onPrefetchPage={prefetchExplorerPage}
                rolesPage={rolesPage}
                onChangeRolesPage={setRolesPage}
                urlRoleQuery={localSearchQuery}
                onChangeUrlRoleQuery={setLocalSearchQuery}
              />
            </section>

            <section
              aria-hidden={activeTab !== 'industry'}
              className={
                activeTab === 'industry'
                  ? 'block rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-3.5 sm:p-6 shadow-xs'
                  : 'hidden'
              }
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
                filterFacets={filterFacets}
                coherentTotalCompanies={coherentFilterOrgsTotal}
                globalPage={globalPage}
                onChangeGlobalPage={handleNavigateGlobalPage}
                isPageCached={isCompaniesPageCached}
                onPrefetchPage={prefetchCompaniesPage}
                onSelectIndustrySlug={(slug) => {
                  setFilters((prev) => ({
                    ...prev,
                    selectedIndustrySlugs: slug ? [slug] : [],
                  }));
                  setSessionMode('filter');
                  paginationRequestedPageRef.current = null;
                  setGlobalPage(1);
                  setContactsPage(1);
                  setRolesPage(1);
                }}
                onSelectGlobalCompany={handleSelectGlobalCompany}
                onPrefetchCompany={(comp) =>
                  prefetchCompanyLookup(comp.domain, comp.slug)
                }
                onSelectDomain={(d) => {
                  setSessionMode('domain');
                  setActiveTab('full-names-emails');
                  void executeDomainLookup(d, false);
                }}
                onSwitchSessionMode={(mode) => {
                  setSessionMode(mode);
                  if (mode === 'domain') {
                    setActiveTab('full-names-emails');
                  } else {
                    setActiveTab(filterSelectedCompany ? 'full-names-emails' : 'industry');
                  }
                }}
                onFocusDomainInput={() => searchInputRef.current?.focus()}
              />
            </section>

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
                setActiveTab('full-names-emails');
                void executeDomainLookup(d, false);
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
                setSyncQueue((prev) =>
                  prev.filter((i) => i.status !== 'synced')
                )
              }
              activeAnalyticsResult={activeAnalyticsResult}
              activeSelectedDepartment={activeSelectedDepartment}
              activeSelectedSeniority={activeSelectedSeniority}
              onSelectActiveDepartment={handleSelectActiveDepartment}
              onSelectActiveSeniority={handleSelectActiveSeniority}
              onSelectDomainFromAnalytics={(d) => {
                setSessionMode('domain');
                void executeDomainLookup(d, false);
              }}
            />
          </main>
        </div>
      )}

      <footer
        className={`relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 border-t border-slate-200/70 dark:border-slate-800/70 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left ${
          appView === 'workspace' ? 'pb-24 lg:pb-8' : 'pb-8'
        }`}
      >
        <span>OrgLens Corporate Directory &amp; Company Explorer</span>
        <div className="flex items-center gap-4">
          <a
            href={publicConfig.supportTelegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Support
          </a>
          <span aria-hidden="true">·</span>
          <span>{publicConfig.companyTagline}</span>
        </div>
      </footer>

      {/* Mobile Thumb-Zone Bottom Navigation Bar (lg:hidden, Workspace Only) */}
      {appView === 'workspace' && (
        <nav
          aria-label="Mobile quick navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 backdrop-blur-xl bg-white/95 dark:bg-[#090d16]/95 border-t border-slate-200/90 dark:border-slate-800/90 px-2 grid grid-cols-4 gap-1"
        >
          <button
            type="button"
            onClick={() => {
              setSessionMode('domain');
              setActiveTab('full-names-emails');
              scrollToListTop(searchInputRef.current, 100);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              sessionMode === 'domain' && !mobileSidebarOpen
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Search className="h-4 w-4" />
            <span>Domain</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSessionMode('filter');
              handleBackToCompaniesList();
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              sessionMode === 'filter' &&
              activeTab === 'industry' &&
              !mobileSidebarOpen
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Companies</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('full-names-emails');
              scrollToListTop(resultsTopRef.current, 80);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'full-names-emails' &&
              sessionMode === 'filter' &&
              !mobileSidebarOpen
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Contacts</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className={`relative flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              mobileSidebarOpen || activeFilterCount > 0
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </span>
          </button>
        </nav>
      )}
      <SignOutConfirmModal
        open={signOutConfirmOpen}
        userEmail={user?.email}
        userName={user?.fullName}
        onCancel={() => setSignOutConfirmOpen(false)}
        onConfirm={confirmSignOutNow}
      />
      </div>
    </>
  );
}
