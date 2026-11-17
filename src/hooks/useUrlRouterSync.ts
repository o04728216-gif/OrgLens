import { useEffect, useMemo, useRef } from 'react';
import type { SidebarFiltersState } from '../types';
import {
  buildDocumentTitle,
  buildUrlFromAppState,
  parseUrlToAppState,
  type BreadcrumbSegment,
  type UrlRoutedState,
} from '../utils/urlRouter';

interface UseUrlRouterSyncParams {
  state: UrlRoutedState;
  defaultFilters: SidebarFiltersState;
  domainCompanyName?: string;
  filterCompanyDisplayName?: string;
  onRestorePopState: (parsed: UrlRoutedState) => void;
  onNavigateDomainRoot: () => void;
  onNavigateTabFullNames: () => void;
  onBackToCompaniesList: () => void;
}

export function useUrlRouterSync({
  state,
  defaultFilters,
  domainCompanyName,
  filterCompanyDisplayName,
  onRestorePopState,
  onNavigateDomainRoot,
  onNavigateTabFullNames,
  onBackToCompaniesList,
}: UseUrlRouterSyncParams) {
  const isPopStateRef = useRef(false);
  const hasNormalizedInitialUrlRef = useRef(false);
  const prevDiscreteRouteKeyRef = useRef<string>('');
  const restoreCallbackRef = useRef(onRestorePopState);
  restoreCallbackRef.current = onRestorePopState;

  const currentRoutePath = useMemo(
    () => buildUrlFromAppState(state),
    [state]
  );

  // Sync <title> dynamically with active session, company, tab, and page
  useEffect(() => {
    const companyDisplayName =
      state.sessionMode === 'domain'
        ? domainCompanyName
        : filterCompanyDisplayName || state.filterSelectedCompany?.name;
    document.title = buildDocumentTitle(state, companyDisplayName);
  }, [state, domainCompanyName, filterCompanyDisplayName]);

  // Push discrete navigations to browser history and replace continuous search/filter edits
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const discreteKey = `${state.sessionMode}|${state.activeTab}|${
      state.activeDomain || ''
    }|${state.filterSelectedCompany?.slug || ''}|${state.globalPage}|${
      state.contactsPage
    }|${state.rolesPage}|${state.showWidgetsDrawer ? '1' : '0'}`;

    const currentBrowserPath = `${window.location.pathname}${window.location.search}`;

    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      prevDiscreteRouteKeyRef.current = discreteKey;
      return;
    }

    if (!hasNormalizedInitialUrlRef.current) {
      hasNormalizedInitialUrlRef.current = true;
      prevDiscreteRouteKeyRef.current = discreteKey;
      if (currentBrowserPath !== currentRoutePath) {
        window.history.replaceState(null, '', currentRoutePath);
      }
      return;
    }

    if (currentBrowserPath === currentRoutePath) {
      prevDiscreteRouteKeyRef.current = discreteKey;
      return;
    }

    if (prevDiscreteRouteKeyRef.current !== discreteKey) {
      window.history.pushState(null, '', currentRoutePath);
      prevDiscreteRouteKeyRef.current = discreteKey;
    } else {
      window.history.replaceState(null, '', currentRoutePath);
    }
  }, [
    currentRoutePath,
    state.sessionMode,
    state.activeTab,
    state.activeDomain,
    state.filterSelectedCompany?.slug,
    state.globalPage,
    state.contactsPage,
    state.rolesPage,
    state.showWidgetsDrawer,
  ]);

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    const onPopState = () => {
      isPopStateRef.current = true;
      const parsed = parseUrlToAppState(window.location, defaultFilters);
      restoreCallbackRef.current(parsed);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [defaultFilters]);

  const breadcrumbs = useMemo<BreadcrumbSegment[]>(() => {
    const activeTabLabel =
      state.activeTab === 'industry'
        ? state.sessionMode === 'filter'
          ? 'Companies'
          : 'Industry'
        : state.activeTab === 'command-hierarchy'
        ? 'Command Hierarchy'
        : 'Full Names & Emails';

    if (state.sessionMode === 'domain') {
      const items: BreadcrumbSegment[] = [
        {
          label: 'Domain Lookup',
          onClick: onNavigateDomainRoot,
        },
      ];
      if (state.activeDomain) {
        items.push({
          label: domainCompanyName
            ? `${domainCompanyName} (${state.activeDomain})`
            : state.activeDomain,
          onClick: onNavigateTabFullNames,
        });
      }
      items.push({ label: activeTabLabel });
      if (state.activeTab === 'full-names-emails' && state.contactsPage > 1) {
        items.push({ label: `Page ${state.contactsPage}` });
      } else if (
        state.activeTab === 'command-hierarchy' &&
        state.rolesPage > 1
      ) {
        items.push({ label: `Page ${state.rolesPage}` });
      }
      return items;
    }

    const items: BreadcrumbSegment[] = [
      {
        label: 'Filter Explorer',
        onClick: onBackToCompaniesList,
      },
    ];

    if (state.filterSelectedCompany && state.activeTab !== 'industry') {
      items.push({
        label: 'Companies',
        onClick: onBackToCompaniesList,
      });
      items.push({
        label: filterCompanyDisplayName || state.filterSelectedCompany.name,
        onClick: onNavigateTabFullNames,
      });
      items.push({ label: activeTabLabel });
      if (state.activeTab === 'full-names-emails' && state.contactsPage > 1) {
        items.push({ label: `Page ${state.contactsPage}` });
      } else if (
        state.activeTab === 'command-hierarchy' &&
        state.rolesPage > 1
      ) {
        items.push({ label: `Page ${state.rolesPage}` });
      }
    } else {
      items.push({ label: activeTabLabel });
      if (state.activeTab === 'industry' && state.globalPage > 1) {
        items.push({ label: `Page ${state.globalPage}` });
      } else if (state.activeTab !== 'industry') {
        if (state.globalPage > 1) {
          items.push({ label: `Batch ${state.globalPage}` });
        }
        if (
          state.activeTab === 'full-names-emails' &&
          state.contactsPage > 1
        ) {
          items.push({ label: `Page ${state.contactsPage}` });
        } else if (
          state.activeTab === 'command-hierarchy' &&
          state.rolesPage > 1
        ) {
          items.push({ label: `Page ${state.rolesPage}` });
        }
      }
    }

    return items;
  }, [
    state.sessionMode,
    state.activeTab,
    state.activeDomain,
    state.contactsPage,
    state.rolesPage,
    state.globalPage,
    state.filterSelectedCompany,
    domainCompanyName,
    filterCompanyDisplayName,
    onNavigateDomainRoot,
    onNavigateTabFullNames,
    onBackToCompaniesList,
  ]);

  return {
    currentRoutePath,
    breadcrumbs,
  };
}
