import type {
  AdminSectionId,
  DepartmentCategory,
  GlobalCompanyItem,
  PrimaryTab,
  SeniorityLevel,
  SessionMode,
  SidebarFiltersState,
  TopLevelAppView,
} from '../types';
import { EMAIL_FORMULAS, type EmailFormulaId } from './emailFormulas';

export interface UrlRoutedState {
  appView: TopLevelAppView;
  authMode: 'login' | 'signup';
  adminSection: AdminSectionId;
  sessionMode: SessionMode;
  activeTab: PrimaryTab;
  activeDomain: string | null;
  filters: SidebarFiltersState;
  globalPage: number;
  contactsPage: number;
  rolesPage: number;
  localSearchQuery: string;
  selectedDepartment: DepartmentCategory | 'All';
  selectedSeniority: SeniorityLevel | 'All';
  filterSelectedCompany: GlobalCompanyItem | null;
  showWidgetsDrawer: boolean;
}

const VALID_ADMIN_SECTIONS = new Set<AdminSectionId>([
  'overview',
  'crawler',
  'users',
  'devices',
  'payments',
  'directory-overrides',
  'ledger',
  'vouchers',
  'settings',
  'system',
]);

const VALID_DEPARTMENTS = new Set<DepartmentCategory>([
  'Leadership',
  'Engineering',
  'Product & Design',
  'Research & Data',
  'Sales & GTM',
  'Operations & Finance',
  'General',
]);

const VALID_SENIORITIES = new Set<SeniorityLevel>([
  'Executive',
  'Director / VP',
  'Lead / Senior',
  'Individual Contributor',
]);

const VALID_FORMULA_IDS = new Set<string>(EMAIL_FORMULAS.map((f) => f.id));

function sanitizeDomainSegment(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .replace(/^@/, '');
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseTabSegment(
  seg: string | undefined,
  session: SessionMode
): PrimaryTab {
  const clean = (seg || '').trim().toLowerCase();
  if (clean === 'command-hierarchy' || clean === 'hierarchy') {
    return 'command-hierarchy';
  }
  if (clean === 'companies' || clean === 'industry') {
    return 'industry';
  }
  if (
    clean === 'full-names-emails' ||
    clean === 'contacts' ||
    clean === 'emails'
  ) {
    return 'full-names-emails';
  }
  return session === 'filter' ? 'industry' : 'full-names-emails';
}

function formatTabSegment(tab: PrimaryTab, session: SessionMode): string {
  if (tab === 'industry') {
    return session === 'filter' ? 'companies' : 'industry';
  }
  return tab;
}

export function parseUrlToAppState(
  loc: Pick<Location, 'pathname' | 'search'>,
  defaultFilters: SidebarFiltersState
): UrlRoutedState {
  const segments = loc.pathname
    .split('/')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);
  const sp = new URLSearchParams(loc.search);

  let appView: TopLevelAppView = 'workspace';
  let authMode: 'login' | 'signup' = 'login';
  let adminSection: AdminSectionId = 'overview';
  let sessionMode: SessionMode = 'domain';
  let activeTab: PrimaryTab = 'full-names-emails';
  let activeDomain: string | null = null;
  let filterSelectedCompany: GlobalCompanyItem | null = null;

  const first = (segments[0] || '').toLowerCase();

  if (!first) {
    appView = 'landing';
    authMode = sp.get('auth') === 'signup' ? 'signup' : 'login';
  } else if (first === 'login' || first === 'signin') {
    appView = 'landing';
    authMode = 'login';
  } else if (first === 'signup' || first === 'register') {
    appView = 'landing';
    authMode = 'signup';
  } else if (
    first === 'profile' ||
    first === 'settings' ||
    first === 'account'
  ) {
    appView = 'profile';
  } else if (
    first === 'upgrade' ||
    first === 'billing' ||
    first === 'lens-coins'
  ) {
    appView = 'upgrade';
  } else if (first === 'admin') {
    appView = 'admin';
    const rawSec = (segments[1] || 'overview').toLowerCase() as AdminSectionId;
    adminSection = VALID_ADMIN_SECTIONS.has(rawSec) ? rawSec : 'overview';
  } else if (
    first === 'filter-explorer' ||
    first === 'explorer' ||
    first === 'companies'
  ) {
    appView = 'workspace';
    sessionMode = 'filter';
    const second = (segments[1] || '').toLowerCase();

    if (second === 'company' && segments[2]) {
      const companySlug = segments[2].trim().toLowerCase();
      const companyTab = parseTabSegment(segments[3], 'domain');
      activeTab = companyTab === 'industry' ? 'full-names-emails' : companyTab;

      const qDomain = sanitizeDomainSegment(sp.get('domain') || '');
      const resolvedDomain =
        qDomain && qDomain.includes('.') ? qDomain : `${companySlug}.com`;
      const companyName =
        (sp.get('name') || '').trim() || humanizeSlug(companySlug);

      filterSelectedCompany = {
        id: companySlug,
        slug: companySlug,
        name: companyName,
        domain: resolvedDomain,
        websiteUrl: `https://${resolvedDomain}`,
        logoUrl: null,
        location: sp.get('locLabel') || 'Worldwide',
        industry: sp.get('indLabel') || '',
        employeeRange: '',
        revenueRange: '',
      };
    } else {
      activeTab = parseTabSegment(
        first === 'companies' ? 'companies' : segments[1],
        'filter'
      );
    }
  } else if (first === 'domain-lookup' || first === 'domain') {
    appView = 'workspace';
    sessionMode = 'domain';
    const second = segments[1] || '';
    const secondLower = second.toLowerCase();

    if (
      second &&
      secondLower !== 'full-names-emails' &&
      secondLower !== 'command-hierarchy' &&
      secondLower !== 'industry' &&
      second.includes('.')
    ) {
      activeDomain = sanitizeDomainSegment(second);
      activeTab = parseTabSegment(segments[2], 'domain');
    } else {
      activeTab = parseTabSegment(second, 'domain');
    }
  } else if (first && first.includes('.')) {
    appView = 'workspace';
    sessionMode = 'domain';
    activeDomain = sanitizeDomainSegment(first);
    activeTab = parseTabSegment(segments[1], 'domain');
  }

  const industriesParam = sp.get('industries') || sp.get('slugs') || '';
  const selectedIndustrySlugs = industriesParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const modeParam = (sp.get('mode') || 'any').toLowerCase();
  const industryMatchMode: 'any' | 'primary' =
    modeParam === 'primary' ? 'primary' : 'any';

  const seniorities = (sp.get('seniorities') || '')
    .split('|')
    .map((s) => s.trim())
    .filter((s): s is SeniorityLevel =>
      VALID_SENIORITIES.has(s as SeniorityLevel)
    );

  const departments = (sp.get('depts') || '')
    .split('|')
    .map((s) => s.trim())
    .filter((d): d is DepartmentCategory =>
      VALID_DEPARTMENTS.has(d as DepartmentCategory)
    );

  const rawFormula = (sp.get('formula') || 'auto').trim();
  const emailFormulaOverride: EmailFormulaId | 'auto' = VALID_FORMULA_IDS.has(
    rawFormula
  )
    ? (rawFormula as EmailFormulaId)
    : 'auto';

  const minAccRaw = parseInt(sp.get('minAcc') || '50', 10);
  const maxAccRaw = parseInt(sp.get('maxAcc') || '99', 10);
  const minAccuracy = Number.isFinite(minAccRaw)
    ? Math.max(50, Math.min(98, minAccRaw))
    : 50;
  const maxAccuracy = Number.isFinite(maxAccRaw)
    ? Math.max(minAccuracy, Math.min(99, maxAccRaw))
    : 99;

  const filters: SidebarFiltersState = {
    ...defaultFilters,
    contactSearch: sp.get('contact') || '',
    roleKeyword: sp.get('role') || '',
    seniorities,
    departments,
    minAccuracy,
    maxAccuracy,
    emailFormulaOverride,
    companyNameFilter: sp.get('company') || '',
    selectedIndustrySlugs,
    industryMatchMode,
    industryKeyword: sp.get('indKw') || '',
    employeeRanges: (sp.get('employees') || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    revenueRanges: (sp.get('revenue') || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    selectedContinents: (sp.get('continents') || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    selectedCountries: (sp.get('countries') || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    locationQuery: sp.get('loc') || '',
  };

  const rawPage = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const rawBatch = Math.max(1, parseInt(sp.get('batch') || '0', 10) || 0);

  let globalPage = 1;
  let contactsPage = 1;
  let rolesPage = 1;

  if (sessionMode === 'filter' && !filterSelectedCompany) {
    if (activeTab === 'industry') {
      globalPage = rawPage;
    } else if (activeTab === 'full-names-emails') {
      globalPage = rawBatch > 0 ? rawBatch : 1;
      contactsPage = rawPage;
    } else if (activeTab === 'command-hierarchy') {
      globalPage = rawBatch > 0 ? rawBatch : 1;
      rolesPage = rawPage;
    }
  } else {
    if (activeTab === 'full-names-emails') {
      contactsPage = rawPage;
    } else if (activeTab === 'command-hierarchy') {
      rolesPage = rawPage;
    }
  }

  const deptParam = (sp.get('dept') || 'All').trim();
  const selectedDepartment: DepartmentCategory | 'All' = VALID_DEPARTMENTS.has(
    deptParam as DepartmentCategory
  )
    ? (deptParam as DepartmentCategory)
    : 'All';

  const tierParam = (sp.get('tier') || 'All').trim();
  const selectedSeniority: SeniorityLevel | 'All' = VALID_SENIORITIES.has(
    tierParam as SeniorityLevel
  )
    ? (tierParam as SeniorityLevel)
    : 'All';

  const localSearchQuery = sp.get('q') || '';
  const showWidgetsDrawer = sp.get('panel') === 'widgets-sync';

  return {
    appView,
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
    selectedDepartment,
    selectedSeniority,
    filterSelectedCompany,
    showWidgetsDrawer,
  };
}

export function buildUrlFromAppState(state: UrlRoutedState): string {
  if (state.appView === 'landing') {
    return state.authMode === 'signup' ? '/signup' : '/';
  }
  if (state.appView === 'profile') {
    return '/settings';
  }
  if (state.appView === 'upgrade') {
    return '/upgrade';
  }
  if (state.appView === 'admin') {
    return state.adminSection === 'overview'
      ? '/admin'
      : `/admin/${state.adminSection}`;
  }

  const sp = new URLSearchParams();
  let pathname = '/domain-lookup/full-names-emails';

  if (state.sessionMode === 'domain') {
    const tabSlug = formatTabSegment(state.activeTab, 'domain');
    if (state.activeDomain) {
      pathname = `/domain-lookup/${encodeURIComponent(
        state.activeDomain
      )}/${tabSlug}`;
    } else {
      pathname = `/domain-lookup/${tabSlug}`;
    }

    if (state.activeTab === 'full-names-emails') {
      if (state.contactsPage > 1) sp.set('page', String(state.contactsPage));
      if (state.localSearchQuery.trim()) {
        sp.set('q', state.localSearchQuery.trim());
      }
    } else if (state.activeTab === 'command-hierarchy') {
      if (state.selectedDepartment !== 'All') {
        sp.set('dept', state.selectedDepartment);
      }
      if (state.selectedSeniority !== 'All') {
        sp.set('tier', state.selectedSeniority);
      }
      if (state.rolesPage > 1) sp.set('page', String(state.rolesPage));
      if (state.localSearchQuery.trim()) {
        sp.set('q', state.localSearchQuery.trim());
      }
    }
  } else {
    if (state.filterSelectedCompany && state.activeTab !== 'industry') {
      const slug = state.filterSelectedCompany.slug || 'organization';
      const tabSlug = formatTabSegment(state.activeTab, 'domain');
      pathname = `/filter-explorer/company/${encodeURIComponent(
        slug
      )}/${tabSlug}`;

      if (state.filterSelectedCompany.domain) {
        sp.set('domain', state.filterSelectedCompany.domain);
      }
      if (state.filterSelectedCompany.name) {
        sp.set('name', state.filterSelectedCompany.name);
      }
      if (state.activeTab === 'full-names-emails' && state.contactsPage > 1) {
        sp.set('page', String(state.contactsPage));
      }
      if (state.activeTab === 'command-hierarchy') {
        if (state.selectedDepartment !== 'All') {
          sp.set('dept', state.selectedDepartment);
        }
        if (state.selectedSeniority !== 'All') {
          sp.set('tier', state.selectedSeniority);
        }
        if (state.rolesPage > 1) sp.set('page', String(state.rolesPage));
      }
      if (state.localSearchQuery.trim()) {
        sp.set('q', state.localSearchQuery.trim());
      }
    } else {
      const tabSlug = formatTabSegment(state.activeTab, 'filter');
      pathname = `/filter-explorer/${tabSlug}`;

      if (state.activeTab === 'industry') {
        if (state.globalPage > 1) sp.set('page', String(state.globalPage));
      } else if (state.activeTab === 'full-names-emails') {
        if (state.globalPage > 1) sp.set('batch', String(state.globalPage));
        if (state.contactsPage > 1) sp.set('page', String(state.contactsPage));
        if (state.localSearchQuery.trim()) {
          sp.set('q', state.localSearchQuery.trim());
        }
      } else if (state.activeTab === 'command-hierarchy') {
        if (state.globalPage > 1) sp.set('batch', String(state.globalPage));
        if (state.selectedDepartment !== 'All') {
          sp.set('dept', state.selectedDepartment);
        }
        if (state.selectedSeniority !== 'All') {
          sp.set('tier', state.selectedSeniority);
        }
        if (state.rolesPage > 1) sp.set('page', String(state.rolesPage));
        if (state.localSearchQuery.trim()) {
          sp.set('q', state.localSearchQuery.trim());
        }
      }
    }

    const f = state.filters;
    if (f.selectedIndustrySlugs.length > 0) {
      sp.set('industries', f.selectedIndustrySlugs.join(','));
    }
    if (f.industryMatchMode === 'primary') {
      sp.set('mode', 'primary');
    }
    if (f.industryKeyword.trim()) sp.set('indKw', f.industryKeyword.trim());
    if (f.selectedContinents.length > 0) {
      sp.set('continents', f.selectedContinents.join('|'));
    }
    if (f.selectedCountries.length > 0) {
      sp.set('countries', f.selectedCountries.join('|'));
    }
    if (f.locationQuery.trim()) sp.set('loc', f.locationQuery.trim());
    if (f.employeeRanges.length > 0) {
      sp.set('employees', f.employeeRanges.join('|'));
    }
    if (f.revenueRanges.length > 0) {
      sp.set('revenue', f.revenueRanges.join('|'));
    }
    if (f.companyNameFilter.trim()) {
      sp.set('company', f.companyNameFilter.trim());
    }
    if (f.contactSearch.trim()) sp.set('contact', f.contactSearch.trim());
    if (f.roleKeyword.trim()) sp.set('role', f.roleKeyword.trim());
    if (f.seniorities.length > 0) {
      sp.set('seniorities', f.seniorities.join('|'));
    }
    if (f.departments.length > 0) sp.set('depts', f.departments.join('|'));
    if (f.minAccuracy > 50) sp.set('minAcc', String(f.minAccuracy));
    if (f.maxAccuracy < 99) sp.set('maxAcc', String(f.maxAccuracy));
    if (f.emailFormulaOverride !== 'auto') {
      sp.set('formula', f.emailFormulaOverride);
    }
  }

  if (state.showWidgetsDrawer) {
    sp.set('panel', 'widgets-sync');
  }

  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function buildDocumentTitle(
  state: UrlRoutedState,
  companyDisplayName?: string
): string {
  if (state.appView === 'landing') {
    return state.authMode === 'login'
      ? 'Sign In · Corporate Email Intelligence | OrgLens'
      : 'OrgLens · B2B Corporate Email Finder & Worldwide Company Explorer';
  }
  if (state.appView === 'profile') {
    return 'Profile & Account Settings | OrgLens';
  }
  if (state.appView === 'upgrade') {
    return 'Lens Coins & $15/mo USDT (TRC20) Unlimited Upgrade | OrgLens';
  }
  if (state.appView === 'admin') {
    return `Admin Console · ${humanizeSlug(state.adminSection)} | OrgLens`;
  }

  const tabLabel =
    state.activeTab === 'industry'
      ? state.sessionMode === 'filter'
        ? 'Companies'
        : 'Industry'
      : state.activeTab === 'command-hierarchy'
      ? 'Command Hierarchy'
      : 'Full Names & Emails';

  if (state.sessionMode === 'domain') {
    if (state.activeDomain) {
      const label = companyDisplayName
        ? `${companyDisplayName} (${state.activeDomain})`
        : state.activeDomain;
      return `${label} · ${tabLabel} | OrgLens`;
    }
    return `Domain Lookup · ${tabLabel} | OrgLens`;
  }

  if (state.filterSelectedCompany && state.activeTab !== 'industry') {
    const label = companyDisplayName || state.filterSelectedCompany.name;
    return `${label} · ${tabLabel} · Filter Explorer | OrgLens`;
  }

  const pageSuffix =
    state.activeTab === 'industry' && state.globalPage > 1
      ? ` (Page ${state.globalPage})`
      : state.globalPage > 1
      ? ` (Batch ${state.globalPage})`
      : '';

  return `Filter Explorer · ${tabLabel}${pageSuffix} | OrgLens`;
}

export interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}
