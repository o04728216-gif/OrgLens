import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  CloudOff,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  LayoutGrid,
  Loader2,
  Moon,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Users,
} from 'lucide-react';
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
  SyncQueueItem,
  WidgetConfig,
  WidgetId,
} from './types';
import {
  DEFAULT_WIDGETS,
  copyTextToClipboard,
  loadSavedTheme,
  loadSnapshots,
  loadSyncQueue,
  loadWidgetConfigs,
  saveSnapshots,
  saveSyncQueue,
  saveTheme,
  saveWidgetConfigs,
} from './utils/offlineStorage';
import { AnalyticsWidget } from './components/AnalyticsWidget';
import { EmployeeTableWidget } from './components/EmployeeTableWidget';
import { JobTitleTab } from './components/JobTitleTab';
import { IndustryTab } from './components/IndustryTab';
import { SavedDomainsWidget } from './components/SavedDomainsWidget';
import { OfflineSyncWidget } from './components/OfflineSyncWidget';
import {
  FilterSidebar,
  MobileFilterTriggerButton,
  countActiveSidebarFilters,
} from './components/FilterSidebar';
import { applyExcelEmailFormula } from './utils/emailFormulas';
import { usePWAInstall } from './hooks/usePWAInstall';

const INITIAL_SIDEBAR_FILTERS: SidebarFiltersState = {
  contactSearch: '',
  roleKeyword: '',
  seniorities: [],
  departments: [],
  minAccuracy: 50,
  maxAccuracy: 99,
  emailFormulaOverride: 'auto',
  companyNameFilter: '',
  selectedIndustrySlugs: [],
  industryMatchMode: 'any',
  industryKeyword: '',
  employeeRanges: [],
  revenueRanges: [],
  selectedContinents: [],
  selectedCountries: [],
  locationQuery: '',
};

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

interface DraggableWidgetCardProps {
  widget: WidgetConfig;
  index: number;
  totalVisible: number;
  onMove: (id: WidgetId, direction: 'up' | 'down') => void;
  children: React.ReactNode;
}

const DraggableWidgetCard: React.FC<DraggableWidgetCardProps> = ({
  widget,
  index,
  totalVisible,
  onMove,
  children,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={widget}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl backdrop-blur-xl bg-white/75 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 shadow-xs"
    >
      <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label={`Drag to reorder ${widget.title}`}
            title="Drag to reorder widget"
            onPointerDown={(e) => dragControls.start(e)}
            className="p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing touch-none transition-colors"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white truncate">
              {widget.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {widget.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(widget.id, 'up')}
            aria-label={`Move ${widget.title} up`}
            title="Move widget up"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={index === totalVisible - 1}
            onClick={() => onMove(widget.id, 'down')}
            aria-label={`Move ${widget.title} down`}
            title="Move widget down"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6">{children}</div>
    </Reorder.Item>
  );
};

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadSavedTheme());
  const [activeTab, setActiveTab] = useState<PrimaryTab>('full-names-emails');
  const [sessionMode, setSessionMode] = useState<SessionMode>('domain');
  const [showWidgetsDrawer, setShowWidgetsDrawer] = useState(false);

  // Responsive Sidebar state (collapsible on PC, slide-over drawer on mobile)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [filters, setFilters] = useState<SidebarFiltersState>(
    INITIAL_SIDEBAR_FILTERS
  );

  // Global Industries Catalog + Filter Explorer Session state
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
  const [globalPage, setGlobalPage] = useState(1);

  // Domain Lookup Session state — completely empty on boot (zero autofill!)
  const [domainInput, setDomainInput] = useState('');
  const [snapshots, setSnapshots] = useState<Record<string, SearchResponse>>(() =>
    loadSnapshots()
  );
  const [activeDomain, setActiveDomain] = useState<string | null>(null);

  const [isDomainLoading, setIsDomainLoading] = useState(false);
  const [loadingDomain, setLoadingDomain] = useState('');
  const [headerCopied, setHeaderCopied] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'info' | 'warning' | 'error' | 'success';
    text: string;
  } | null>(null);

  // Separate hierarchy drilldowns per session so Domain Lookup and Filter Explorer never interfere
  const [domainSelectedDepartment, setDomainSelectedDepartment] = useState<
    DepartmentCategory | 'All'
  >('All');
  const [domainSelectedSeniority, setDomainSelectedSeniority] = useState<
    SeniorityLevel | 'All'
  >('All');
  const [filterSelectedDepartment, setFilterSelectedDepartment] = useState<
    DepartmentCategory | 'All'
  >('All');
  const [filterSelectedSeniority, setFilterSelectedSeniority] = useState<
    SeniorityLevel | 'All'
  >('All');

  const [widgets, setWidgets] = useState<WidgetConfig[]>(() =>
    loadWidgetConfigs()
  );

  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOffline, setSimulateOffline] = useState(false);
  const effectiveOffline = !browserOnline || simulateOffline;

  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() =>
    loadSyncQueue()
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, install } = usePWAInstall();

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
    saveSyncQueue(syncQueue);
  }, [syncQueue]);

  useEffect(() => {
    saveWidgetConfigs(widgets);
  }, [widgets]);

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Load all 277 global industries on mount
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

  // Debounce text & slider inputs so rapid typing/sliding auto-loads smoothly without race conditions
  const [debouncedTextFilters, setDebouncedTextFilters] = useState({
    companyNameFilter: '',
    industryKeyword: '',
    locationQuery: '',
    contactSearch: '',
    roleKeyword: '',
    minAccuracy: 50,
    maxAccuracy: 99,
  });

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

  // Auto-load Filter Explorer Session whenever filters change OR Filter Explorer Session is active
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
        if (!controller.signal.aborted && payload && Array.isArray(payload.employees)) {
          setFilterExplorerResult(payload);
          setGlobalDirectory({
            industrySlug: selectedSlugsKey || 'all',
            industryFullTitle: payload.scopeTitle,
            page: payload.page,
            perPage: 25,
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

  // Any filter modification automatically switches into Filter Explorer Session & resets page to 1
  const handleChangeFilters = useCallback(
    (updater: (prev: SidebarFiltersState) => SidebarFiltersState) => {
      setFilters(updater);
      setSessionMode('filter');
      setFilterSelectedDepartment('All');
      setFilterSelectedSeniority('All');
      setGlobalPage(1);
    },
    []
  );

  const currentDomainResult = useMemo(() => {
    if (!activeDomain) return null;
    return snapshots[activeDomain] || null;
  }, [activeDomain, snapshots]);

  // Exact live filtered contacts in Filter Explorer Session (for badges & top Copy Full Name List button)
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

  // Synthesize AnalyticsWidget view for whichever session is active
  const activeAnalyticsResult = useMemo<SearchResponse | null>(() => {
    if (sessionMode === 'domain') return currentDomainResult;
    if (!filterExplorerResult || activeFilteredContacts.length === 0) return null;
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
        formulaLabel: 'Multi-Company Corporate Format',
        excelFormula: '',
        patternConfidence: 88,
        mxVerified: true,
        mxProvider: 'Multi-Domain Verified',
        detectionBasis: 'Filter Explorer Cohort',
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
    filterExplorerResult,
    activeFilteredContacts,
    filters.emailFormulaOverride,
  ]);

  const activeSessionContactsForHeaderCopy = useMemo(() => {
    if (sessionMode === 'domain') {
      return currentDomainResult ? currentDomainResult.employees : [];
    }
    return activeFilteredContacts;
  }, [sessionMode, currentDomainResult, activeFilteredContacts]);

  const handleCopyAllNames = async () => {
    if (activeSessionContactsForHeaderCopy.length === 0) return;
    const listText = activeSessionContactsForHeaderCopy
      .map((emp) => emp.fullName)
      .join('\n');
    const ok = await copyTextToClipboard(listText);
    if (ok) {
      setHeaderCopied(true);
      window.setTimeout(() => setHeaderCopied(false), 2500);
    }
  };

  const queueDomainOffline = useCallback((domain: string) => {
    setSyncQueue((prev) => {
      const exists = prev.find(
        (item) =>
          item.domain === domain &&
          (item.status === 'pending' || item.status === 'syncing')
      );
      if (exists) return prev;
      return [
        {
          id: `${domain}-${Date.now()}`,
          domain,
          queuedAt: new Date().toISOString(),
          status: 'pending',
        },
        ...prev,
      ];
    });
  }, []);

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

      // Activate Domain Lookup Session exclusively (preserving Filter Explorer Session state separately!)
      setSessionMode('domain');
      if (domain) {
        setDomainInput(domain);
      }
      setDomainSelectedDepartment('All');
      setDomainSelectedSeniority('All');

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
          throw new Error(payload?.error || 'Failed to query public directory.');
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

  const syncPendingQueue = useCallback(async () => {
    if (effectiveOffline || isSyncing) return;
    const pendingItems = syncQueue.filter(
      (item) => item.status === 'pending' || item.status === 'failed'
    );
    if (pendingItems.length === 0) return;

    setIsSyncing(true);
    const domainsToSync = Array.from(new Set(pendingItems.map((i) => i.domain)));

    setSyncQueue((prev) =>
      prev.map((item) =>
        domainsToSync.includes(item.domain) && item.status !== 'synced'
          ? { ...item, status: 'syncing', errorMessage: undefined }
          : item
      )
    );

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: domainsToSync }),
      });

      if (!res.ok) {
        throw new Error('Batch sync endpoint returned an error.');
      }

      const payload: {
        syncedAt: string;
        results: SearchResponse[];
        errors: Record<string, string>;
      } = await res.json();

      const nonEmptyResults = payload.results.filter(
        (r) => r.employees.length > 0
      );

      if (nonEmptyResults.length > 0) {
        setSnapshots((prev) => {
          const next = { ...prev };
          for (const r of nonEmptyResults) {
            next[r.domain] = r;
          }
          return next;
        });
        setActiveDomain(nonEmptyResults[0].domain);
        setSessionMode('domain');
      }

      const syncedDomains = new Set(payload.results.map((r) => r.domain));
      setSyncQueue((prev) =>
        prev.map((item) => {
          if (syncedDomains.has(item.domain)) {
            return { ...item, status: 'synced', errorMessage: undefined };
          }
          if (payload.errors[item.domain]) {
            return {
              ...item,
              status: 'failed',
              errorMessage: payload.errors[item.domain],
            };
          }
          return item;
        })
      );

      setLastSyncedAt(payload.syncedAt);
      setStatusBanner({
        tone: 'success',
        text: `Synced ${payload.results.length} domain${
          payload.results.length === 1 ? '' : 's'
        } with ranked employees and corporate email addresses.`,
      });
    } catch (err) {
      setSyncQueue((prev) =>
        prev.map((item) =>
          item.status === 'syncing'
            ? {
                ...item,
                status: 'failed',
                errorMessage:
                  err instanceof Error ? err.message : 'Sync failed',
              }
            : item
        )
      );
    } finally {
      setIsSyncing(false);
    }
  }, [effectiveOffline, isSyncing, syncQueue]);

  useEffect(() => {
    if (!effectiveOffline) {
      const hasPending = syncQueue.some((i) => i.status === 'pending');
      if (hasPending) {
        void syncPendingQueue();
      }
    }
  }, [effectiveOffline, syncPendingQueue, syncQueue]);

  // Sidebar Industry Filter Selection -> Switches to Filter Explorer Session and auto-loads!
  const handleSelectIndustryFilter = useCallback((nextSlugs: string[]) => {
    setFilters((prev) => ({
      ...prev,
      selectedIndustrySlugs: nextSlugs,
    }));
    setSessionMode('filter');
    setFilterSelectedDepartment('All');
    setFilterSelectedSeniority('All');
    setGlobalPage(1);
  }, []);

  // Clicking a company in Filter Explorer Worldwide Directory -> Opens full roster in Domain Lookup Session!
  const handleSelectGlobalCompany = useCallback(
    (company: GlobalCompanyItem) => {
      setSessionMode('domain');
      setActiveTab('full-names-emails');
      void executeDomainLookup('', false, company.slug, company.name);
    },
    [executeDomainLookup]
  );

  // Uploading a list of domains from Sidebar -> Opens in Domain Lookup Session
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

  const pendingSyncCount = syncQueue.filter(
    (q) => q.status === 'pending' || q.status === 'failed'
  ).length;

  const activeSelectedDepartment =
    sessionMode === 'domain'
      ? domainSelectedDepartment
      : filterSelectedDepartment;
  const activeSelectedSeniority =
    sessionMode === 'domain'
      ? domainSelectedSeniority
      : filterSelectedSeniority;

  const handleSelectActiveDepartment = useCallback(
    (dept: DepartmentCategory | 'All') => {
      if (sessionMode === 'domain') {
        setDomainSelectedDepartment(dept);
      } else {
        setFilterSelectedDepartment(dept);
      }
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
    },
    [sessionMode]
  );

  const fullNamesTab = {
    id: 'full-names-emails' as PrimaryTab,
    label: 'Full Names & Emails',
    icon: Users,
    badge:
      sessionMode === 'domain'
        ? currentDomainResult
          ? currentDomainResult.employees.length.toLocaleString()
          : undefined
        : filterExplorerResult
        ? activeTotalMatchedContacts.toLocaleString()
        : undefined,
  };

  const commandHierarchyTab = {
    id: 'command-hierarchy' as PrimaryTab,
    label: 'Command Hierarchy',
    icon: Crown,
    badge:
      sessionMode === 'domain'
        ? currentDomainResult
          ? `${currentDomainResult.employees.length.toLocaleString()} Roles`
          : undefined
        : filterExplorerResult
        ? `${activeTotalMatchedContacts.toLocaleString()} Roles`
        : undefined,
  };

  const industryTab = {
    id: 'industry' as PrimaryTab,
    label: 'Industry',
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

  // Under Filter Explorer: Industry tab is in the middle!
  const primaryTabs: Array<{
    id: PrimaryTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
  }> =
    sessionMode === 'filter'
      ? [fullNamesTab, industryTab, commandHierarchyTab]
      : [fullNamesTab, commandHierarchyTab, industryTab];

  return (
    <div className="min-h-screen relative overflow-x-clip bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 transition-colors duration-200">
      {/* Subtle Glass Ambient Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[460px] w-[880px] rounded-full bg-sky-500/12 dark:bg-sky-500/10 blur-3xl" />
        <div className="absolute top-72 -right-32 h-[360px] w-[520px] rounded-full bg-indigo-500/10 dark:bg-indigo-500/8 blur-3xl" />
      </div>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/75 dark:bg-[#090d16]/75 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('full-names-emails');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            OrgLens
          </a>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav
            aria-label="Primary tabs"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            {primaryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-slate-900 dark:text-white font-semibold underline'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowWidgetsDrawer((v) => !v)}
              className={`underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showWidgetsDrawer
                  ? 'text-slate-900 dark:text-white font-semibold underline'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Widgets &amp; Sync
            </button>
          </nav>

          {/* Zone 3: Single Primary Action -> Copy Full Name List */}
          <div className="flex items-center shrink-0">
            {activeSessionContactsForHeaderCopy.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleCopyAllNames()}
                className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  headerCopied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                {headerCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied {activeSessionContactsForHeaderCopy.length.toLocaleString()} Names!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Full Name List ({activeSessionContactsForHeaderCopy.length.toLocaleString()})
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSessionMode('domain');
                  searchInputRef.current?.focus();
                }}
                className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                Lookup Domain
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Responsive Workspace: Collapsible Left Sidebar + Fluid Directory Viewport */}
      <div
        id="top"
        className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex items-start gap-6"
      >
        {/* Left Collapsible Filter Sidebar (PC) & Slide-Over Drawer (Mobile) */}
        <FilterSidebar
          filters={filters}
          onChangeFilters={handleChangeFilters}
          onResetFilters={() => {
            setFilters(INITIAL_SIDEBAR_FILTERS);
            setFilterSelectedDepartment('All');
            setFilterSelectedSeniority('All');
            setGlobalPage(1);
            setSessionMode('filter');
          }}
          globalIndustries={globalIndustries}
          industriesLoading={industriesLoading}
          onSelectIndustryFilter={handleSelectIndustryFilter}
          onActivateCompanyDirectory={() => {
            setSessionMode('filter');
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
            setActiveTab('full-names-emails');
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          isFilterLoading={isFilterLoading}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Domain Search & Utility Controls */}
          <section className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/85 dark:border-slate-800/85 p-4 sm:p-7 shadow-xs">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
              <div className="max-w-2xl min-w-0">
                <p className="text-xs font-medium text-sky-600 dark:text-sky-400 mb-1.5">
                  Ranked Most Important → Least Important · Isolated Domain &amp; Auto-Loading Filter Sessions
                </p>
                <h1
                  style={{ textWrap: 'balance' }}
                  className="font-display text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white"
                >
                  Employee directory, corporate email finder &amp; worldwide company explorer
                </h1>
              </div>

              {/* Mobile Filter Trigger + Utility Controls */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <MobileFilterTriggerButton
                  activeCount={activeFilterCount}
                  onClick={() => setMobileSidebarOpen(true)}
                />

                <button
                  type="button"
                  onClick={() => setShowWidgetsDrawer((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    showWidgetsDrawer
                      ? 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                      : 'border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Saved &amp; Widgets
                </button>

                <button
                  type="button"
                  onClick={() => setSimulateOffline((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    effectiveOffline
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <CloudOff className="h-3.5 w-3.5" />
                  {effectiveOffline
                    ? `Offline${pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ''}`
                    : 'Test Offline'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
                  }
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="h-3.5 w-3.5 text-amber-400" />
                      Light
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5 text-slate-700" />
                      Dark
                    </>
                  )}
                </button>

                {isInstallable && (
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Install App
                  </button>
                )}
              </div>
            </div>

            {/* Domain Search Form (Starts completely empty — dedicated to Domain Lookup Session) */}
            <form onSubmit={handleSubmit} className="mt-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 min-w-0">
                  <Globe className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="Enter any company domain (e.g., shopify.com, vercel.com)"
                    aria-label="Company domain name"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl font-mono text-base sm:text-sm bg-white dark:bg-slate-950/80 border border-slate-300/90 dark:border-slate-800 text-slate-900 dark:text-white placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isDomainLoading}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-60 shadow-xs transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isDomainLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching...
                      </>
                    ) : effectiveOffline ? (
                      <>
                        <CloudOff className="h-4 w-4" />
                        Queue Lookup
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Search Domain
                      </>
                    )}
                  </button>

                  {sessionMode === 'domain' &&
                    currentDomainResult &&
                    !effectiveOffline && (
                      <button
                        type="button"
                        disabled={isDomainLoading}
                        onClick={() =>
                          void executeDomainLookup(
                            currentDomainResult.domain,
                            true
                          )
                        }
                        title="Force fresh full-organization & email pattern scrape"
                        className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Refresh
                      </button>
                    )}
                </div>
              </div>
            </form>

            {/* Status Feedback Banner */}
            <AnimatePresence mode="wait">
              {statusBanner && (
                <motion.div
                  key={statusBanner.text}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className={`mt-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-3 border ${
                    statusBanner.tone === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                      : statusBanner.tone === 'warning'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                      : statusBanner.tone === 'success'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200'
                  }`}
                >
                  <span>{statusBanner.text}</span>
                  <button
                    type="button"
                    onClick={() => setStatusBanner(null)}
                    className="text-current opacity-70 hover:opacity-100 underline shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Dual-Session Switcher Bar: Domain Lookup vs Filter Explorer */}
          <div className="flex items-center px-3 py-2.5 rounded-xl backdrop-blur-xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/85 dark:border-slate-800/85">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full p-1 rounded-lg bg-slate-100 dark:bg-slate-950/75 border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSessionMode('domain')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                  sessionMode === 'domain'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Globe className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Domain Lookup</span>
                <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                  {currentDomainResult
                    ? `· ${currentDomainResult.domain} (${currentDomainResult.employees.length.toLocaleString()})`
                    : '· Ready'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSessionMode('filter')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                  sessionMode === 'filter'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isFilterLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
                ) : (
                  <SlidersHorizontal className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                )}
                <span>Filter Explorer</span>
                <span className="font-mono tabular-nums text-xs text-sky-700 dark:text-sky-400">
                  {filterExplorerResult
                    ? `· ${activeTotalMatchedContacts.toLocaleString()} Contacts · ${filterExplorerResult.totalMatchedCompanies.toLocaleString()} Orgs`
                    : activeFilterCount > 0
                    ? `· ${activeFilterCount} Filters`
                    : '· Worldwide'}
                </span>
              </button>
            </div>
          </div>

          {/* Three Primary Result Tabs: FULL NAMES & EMAILS · COMMAND HIERARCHY · INDUSTRY */}
          <div
            role="tablist"
            aria-label="Employee directory result tabs"
            className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl backdrop-blur-xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/85 dark:border-slate-800/85"
          >
            {primaryTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap overflow-hidden ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-sky-600 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`hidden lg:inline font-mono tabular-nums text-xs truncate max-w-44 ${
                        active
                          ? 'text-slate-300 dark:text-sky-100'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      · {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tab Viewport */}
          <AnimatePresence mode="wait">
            {activeTab === 'full-names-emails' && (
              <motion.section
                key={`tab-full-names-emails-${sessionMode}`}
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
                  onSwitchToFilterSession={() => setSessionMode('filter')}
                  onFocusDomainInput={() => searchInputRef.current?.focus()}
                  onInspectDomainFromFilter={(domain) => {
                    void executeDomainLookup(domain, false);
                  }}
                />
              </motion.section>
            )}

            {activeTab === 'command-hierarchy' && (
              <motion.section
                key={`tab-command-hierarchy-${sessionMode}`}
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
                  onSwitchToFilterSession={() => setSessionMode('filter')}
                  onFocusDomainInput={() => searchInputRef.current?.focus()}
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
                  }}
                  onSelectGlobalCompany={handleSelectGlobalCompany}
                  onSelectDomain={(d) => {
                    setSessionMode('domain');
                    setActiveDomain(d);
                    setDomainInput(d);
                    setActiveTab('full-names-emails');
                  }}
                  onSwitchSessionMode={setSessionMode}
                  onFocusDomainInput={() => searchInputRef.current?.focus()}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {/* Collapsible Saved Snapshots, Offline Sync & Draggable Widgets Board */}
          <AnimatePresence>
            {showWidgetsDrawer && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6 pt-2"
              >
                <div className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-5 sm:p-6 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Customizable Dashboard Widgets &amp; Offline Sync
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Drag any widget&apos;s grip handle to reorder, or toggle visibility below.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWidgets(DEFAULT_WIDGETS)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset Layout
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {widgets.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleWidgetVisibility(w.id)}
                        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer ${
                          w.visible
                            ? 'border-sky-500/40 bg-sky-500/10 text-slate-900 dark:text-white'
                            : 'border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <span className="truncate">{w.title}</span>
                        {w.visible ? (
                          <Eye className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <Reorder.Group
                  axis="y"
                  values={visibleWidgets}
                  onReorder={handleReorderVisible}
                  className="space-y-6"
                >
                  {visibleWidgets.map((widget, index) => (
                    <DraggableWidgetCard
                      key={widget.id}
                      widget={widget}
                      index={index}
                      totalVisible={visibleWidgets.length}
                      onMove={moveWidgetByStep}
                    >
                      {widget.id === 'saved-domains' && (
                        <SavedDomainsWidget
                          snapshots={snapshots}
                          activeDomain={activeDomain}
                          isOffline={effectiveOffline}
                          onSelectSnapshot={(d) => {
                            setSessionMode('domain');
                            setActiveDomain(d);
                            setDomainInput(d);
                            setDomainSelectedDepartment('All');
                            setDomainSelectedSeniority('All');
                            setActiveTab('full-names-emails');
                          }}
                          onRefreshSnapshot={(d) =>
                            void executeDomainLookup(d, true)
                          }
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
                        />
                      )}

                      {widget.id === 'sync-queue' && (
                        <OfflineSyncWidget
                          queue={syncQueue}
                          isOffline={effectiveOffline}
                          simulateOffline={simulateOffline}
                          isSyncing={isSyncing}
                          lastSyncedAt={lastSyncedAt}
                          onToggleSimulateOffline={() =>
                            setSimulateOffline((v) => !v)
                          }
                          onTriggerSyncNow={() => void syncPendingQueue()}
                          onRemoveQueueItem={(id) =>
                            setSyncQueue((prev) =>
                              prev.filter((i) => i.id !== id)
                            )
                          }
                          onClearSynced={() =>
                            setSyncQueue((prev) =>
                              prev.filter((i) => i.status !== 'synced')
                            )
                          }
                        />
                      )}

                      {widget.id === 'analytics-charts' && (
                        <AnalyticsWidget
                          currentResult={activeAnalyticsResult}
                          allSnapshots={snapshots}
                          selectedDepartment={activeSelectedDepartment}
                          selectedSeniority={activeSelectedSeniority}
                          onSelectDepartment={handleSelectActiveDepartment}
                          onSelectSeniority={handleSelectActiveSeniority}
                          onSelectDomain={(d) => {
                            setSessionMode('domain');
                            setActiveDomain(d);
                            setDomainInput(d);
                          }}
                        />
                      )}
                    </DraggableWidgetCard>
                  ))}
                </Reorder.Group>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <footer className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-slate-200/70 dark:border-slate-800/70 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
        <span>OrgLens Public Directory &amp; Email Format Explorer</span>
        <span>
          Ordered Most Important → Least Important · Isolated Domain &amp; Auto-Loading Filter Sessions
        </span>
      </footer>
    </div>
  );
}
