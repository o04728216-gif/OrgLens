import { Router } from 'express';
import type { Request, Response } from 'express';
import type { GlobalCompanyItem, SearchResponse } from '../../src/types.ts';
import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { discoverDomainEmployees } from '../services/domainDiscoveryService.ts';
import { buildFilterExplorerResponse } from '../services/filterExplorerService.ts';
import {
  computeFilterFacetsAndTotals,
  fetchGlobalIndustries,
  parseGlobalFilterParams,
  resolveFilteredGlobalCompanies,
  searchGlobalCompaniesByQuery,
} from '../services/globalDirectoryService.ts';
import { applyOverridesAndZeroCoinMaskToFilterExplorer } from '../services/manualOverrideApplier.ts';
import { getCrawlerStatusSnapshot } from '../services/worldwideCrawlerDaemon.ts';
import { quickSearchVaultCompanies } from '../store/companyVaultDb.ts';
import {
  assertUserCanSearchCompany,
  computeHasActiveUnlimited,
  settleCompanyLookupCoins,
} from '../store/vpsStore.ts';
import {
  isValidDomain,
  normalizeDomain,
  slugifyName,
} from '../utils/textAndDomain.ts';
import { adminRouter } from './adminRoutes.ts';
import { authAndBillingRouter } from './authAndBillingRoutes.ts';

export const apiRouter = Router();

apiRouter.get(['/api/ping', '/health'], (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Mount Auth, Billing, and Comprehensive /admin routers
apiRouter.use(authAndBillingRouter);
apiRouter.use(adminRouter);

apiRouter.get(
  '/api/crawler/public-stats',
  requireAuth,
  (_req: AuthenticatedRequest, res: Response) => {
    const snap = getCrawlerStatusSnapshot();
    res.json({
      vaultCompaniesCount: snap.vaultCompaniesCount,
      confirmedContactsCount: snap.confirmedContactsCount,
      confirmedDomainsCount: snap.confirmedDomainsCount,
      liveFederatedCatalogTotal: snap.liveFederatedCatalogTotal,
      daemonRunning: snap.daemonRunning,
      lastCycleAt: snap.lastCycleAt,
    });
  }
);

apiRouter.get(
  '/api/industries',
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const industries = await fetchGlobalIndustries();
      res.json({ industries });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Failed to load industries.',
      });
    }
  }
);

const COMMON_SUBDOMAIN_PREFIXES = new Set([
  'www',
  'm',
  'mobile',
  'app',
  'docs',
  'doc',
  'help',
  'support',
  'careers',
  'jobs',
  'blog',
  'news',
  'press',
  'about',
  'shop',
  'store',
  'portal',
  'login',
  'signin',
  'auth',
  'account',
  'accounts',
  'my',
  'ir',
  'investors',
  'investor',
  'mail',
  'webmail',
  'status',
  'developer',
  'developers',
  'dev',
  'api',
  'go',
  'en',
  'us',
  'uk',
]);

const TWO_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.br',
  'com.cn',
  'com.sg',
  'com.hk',
  'co.in',
  'co.nz',
  'co.za',
  'com.mx',
  'com.tr',
  'co.kr',
  'com.tw',
  'com.ar',
  'com.co',
  'com.my',
  'com.ph',
  'com.ng',
  'com.pk',
  'com.eg',
]);

function stripCommonSubdomains(hostname: string): string {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  const minParts = TWO_PART_PUBLIC_SUFFIXES.has(lastTwo) ? 3 : 2;
  while (parts.length > minParts && COMMON_SUBDOMAIN_PREFIXES.has(parts[0])) {
    parts.shift();
  }
  return parts.join('.');
}

function titleCaseBrandFromDomain(domain: string): string {
  const parts = domain.split('.');
  const rawRoot = parts[0] || domain;
  return rawRoot
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseQuickSearchInput(raw: string): {
  effectiveQuery: string;
  detectedLinkDomain: string | null;
  detectedBrandFromLink: string | null;
  isSocialCompanyLink: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      effectiveQuery: '',
      detectedLinkDomain: null,
      detectedBrandFromLink: null,
      isSocialCompanyLink: false,
    };
  }

  // Handle pasted email address (e.g. jane@stripe.com -> stripe.com)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    const emailDom = stripCommonSubdomains(
      normalizeDomain(trimmed.split('@')[1] || '')
    );
    if (isValidDomain(emailDom)) {
      return {
        effectiveQuery: emailDom,
        detectedLinkDomain: emailDom,
        detectedBrandFromLink: emailDom.split('.')[0] || null,
        isSocialCompanyLink: false,
      };
    }
  }

  const looksLikeUrlOrDomain =
    /^https?:\/\//i.test(trimmed) ||
    /^www\./i.test(trimmed) ||
    (!trimmed.includes(' ') &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/i.test(trimmed));

  if (looksLikeUrlOrDomain) {
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      );
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const segments = parsed.pathname
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      // Smart extraction from LinkedIn / TheOrg / Crunchbase / GitHub / X company links
      if (
        (host === 'linkedin.com' || host.endsWith('.linkedin.com')) &&
        (segments[0] === 'company' || segments[0] === 'school') &&
        segments[1]
      ) {
        const handle = decodeURIComponent(segments[1]).replace(/[-_]+/g, ' ');
        return {
          effectiveQuery: handle,
          detectedLinkDomain: null,
          detectedBrandFromLink: handle,
          isSocialCompanyLink: true,
        };
      }
      if (
        (host === 'theorg.com' || host.endsWith('.theorg.com')) &&
        segments[0] === 'org' &&
        segments[1]
      ) {
        const handle = decodeURIComponent(segments[1]).replace(/[-_]+/g, ' ');
        return {
          effectiveQuery: handle,
          detectedLinkDomain: null,
          detectedBrandFromLink: handle,
          isSocialCompanyLink: true,
        };
      }
      if (
        (host === 'crunchbase.com' || host.endsWith('.crunchbase.com')) &&
        segments[0] === 'organization' &&
        segments[1]
      ) {
        const handle = decodeURIComponent(segments[1]).replace(/[-_]+/g, ' ');
        return {
          effectiveQuery: handle,
          detectedLinkDomain: null,
          detectedBrandFromLink: handle,
          isSocialCompanyLink: true,
        };
      }
      if (
        (host === 'github.com' || host === 'x.com' || host === 'twitter.com') &&
        segments[0]
      ) {
        const handle = decodeURIComponent(segments[0]).replace(/[-_]+/g, ' ');
        return {
          effectiveQuery: handle,
          detectedLinkDomain: null,
          detectedBrandFromLink: handle,
          isSocialCompanyLink: true,
        };
      }

      const rootDomain = stripCommonSubdomains(normalizeDomain(host));
      if (isValidDomain(rootDomain)) {
        const brandRoot = rootDomain.split('.')[0] || '';
        return {
          effectiveQuery: rootDomain,
          detectedLinkDomain: rootDomain,
          detectedBrandFromLink: brandRoot.replace(/[-_]+/g, ' ') || null,
          isSocialCompanyLink: false,
        };
      }
    } catch {
      // Fall through to standard company name search
    }
  }

  return {
    effectiveQuery: trimmed,
    detectedLinkDomain: null,
    detectedBrandFromLink: null,
    isSocialCompanyLink: false,
  };
}

apiRouter.get(
  '/api/quick-company-search',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const startedAt = Date.now();
    const rawQuery = String(req.query.q || '').trim();
    const rawLimit = Number.parseInt(String(req.query.limit || '4'), 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(8, rawLimit))
      : 4;

    if (!rawQuery) {
      res.json({
        query: '',
        effectiveQuery: '',
        detectedLinkDomain: null,
        totalMatches: 0,
        companies: [],
        elapsedMs: 0,
      });
      return;
    }

    try {
      const parsed = parseQuickSearchInput(rawQuery);
      const effectiveQuery = parsed.effectiveQuery || rawQuery;

      // 1. Instant SQLite vault query (matching both company name and domain)
      const primaryVault = quickSearchVaultCompanies(effectiveQuery, limit);
      const merged: GlobalCompanyItem[] = [];
      const seenDomains = new Set<string>();
      const seenSlugs = new Set<string>();

      const pushCompany = (comp: GlobalCompanyItem, atFront = false) => {
        const dom = comp.domain ? normalizeDomain(comp.domain) : '';
        if (dom && seenDomains.has(dom)) return;
        if (!dom && seenSlugs.has(comp.slug)) return;
        if (dom) seenDomains.add(dom);
        seenSlugs.add(comp.slug);
        if (atFront) {
          merged.unshift(comp);
        } else {
          merged.push(comp);
        }
      };

      for (const comp of primaryVault.companies) {
        pushCompany(comp);
      }

      // If a link/domain was pasted, also pull brand-name matches from SQLite so grid is rich
      let totalMatches = primaryVault.totalMatches;
      if (
        parsed.detectedLinkDomain &&
        parsed.detectedBrandFromLink &&
        merged.length < limit
      ) {
        const brandVault = quickSearchVaultCompanies(
          parsed.detectedBrandFromLink,
          limit
        );
        totalMatches = Math.max(totalMatches, brandVault.totalMatches);
        for (const comp of brandVault.companies) {
          pushCompany(comp);
        }
      }

      const hasExactLinkMatch = parsed.detectedLinkDomain
        ? merged.some(
            (c) =>
              c.domain &&
              normalizeDomain(c.domain) === parsed.detectedLinkDomain
          )
        : false;

      // 2. Live Company Filter parity: if local vault has fewer than 4 matches (or exact link wasn't found),
      // query TheOrg live directory (same engine as Company Name Filter) with a tight timeout.
      if (
        (merged.length < limit ||
          (parsed.detectedLinkDomain && !hasExactLinkMatch)) &&
        effectiveQuery.length >= 2
      ) {
        try {
          const liveQuery =
            parsed.detectedBrandFromLink && parsed.detectedLinkDomain
              ? parsed.detectedBrandFromLink
              : effectiveQuery;
          const liveHits = await Promise.race<GlobalCompanyItem[]>([
            searchGlobalCompaniesByQuery(liveQuery),
            new Promise<GlobalCompanyItem[]>((resolve) =>
              setTimeout(() => resolve([]), 1600)
            ),
          ]);

          for (const hit of liveHits) {
            const hitDom = hit.domain ? normalizeDomain(hit.domain) : '';
            const isExact =
              Boolean(parsed.detectedLinkDomain) &&
              hitDom === parsed.detectedLinkDomain;
            pushCompany(hit, isExact);
          }
          totalMatches = Math.max(totalMatches, merged.length);
        } catch {
          // Keep instant local matches on upstream timeout
        }
      }

      // 3. Exact Link / Domain Smart Card: if user pasted a valid link/domain and it's still not in the grid,
      // place the exact company card at slot #1 so clicking it immediately resolves its employee emails!
      if (parsed.detectedLinkDomain) {
        const exactAlreadyPresent = merged.some(
          (c) =>
            c.domain &&
            normalizeDomain(c.domain) === parsed.detectedLinkDomain
        );
        if (!exactAlreadyPresent) {
          const dom = parsed.detectedLinkDomain;
          const displayName = titleCaseBrandFromDomain(dom);
          const directCard: GlobalCompanyItem = {
            id: `direct-link:${dom}`,
            slug: slugifyName(displayName || dom),
            name: displayName,
            domain: dom,
            websiteUrl: `https://${dom}`,
            logoUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=128`,
            location: 'Direct Link Match',
            industry: 'Corporate Website',
            employeeRange: '',
            revenueRange: '',
            sourceRegistry: 'Live Domain Discovery',
          };
          pushCompany(directCard, true);
          totalMatches = Math.max(totalMatches, merged.length);
        } else {
          // Ensure the exact matching domain is always slot #1 in the 2x2 grid
          const exactIdx = merged.findIndex(
            (c) =>
              c.domain &&
              normalizeDomain(c.domain) === parsed.detectedLinkDomain
          );
          if (exactIdx > 0) {
            const [exactItem] = merged.splice(exactIdx, 1);
            merged.unshift(exactItem);
          }
        }
      }

      res.json({
        query: rawQuery,
        effectiveQuery,
        detectedLinkDomain: parsed.detectedLinkDomain,
        isSocialCompanyLink: parsed.isSocialCompanyLink,
        totalMatches: Math.max(totalMatches, merged.length),
        companies: merged.slice(0, limit),
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Quick company search failed.';
      res.status(500).json({ error: message });
    }
  }
);

apiRouter.get(
  '/api/filter-facets',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const params = parseGlobalFilterParams(req);
      const seniorities = String(req.query.seniorities || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      const departments = String(req.query.departments || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      const minAccuracy = Math.max(
        0,
        parseInt(String(req.query.minAccuracy || '50'), 10) || 50
      );
      const maxAccuracy = Math.min(
        100,
        parseInt(String(req.query.maxAccuracy || '99'), 10) || 99
      );
      const facets = await computeFilterFacetsAndTotals(params, {
        contactSearch: String(req.query.contactSearch || '').trim(),
        roleKeyword: String(req.query.roleKeyword || '').trim(),
        senioritiesCount: seniorities.length,
        departmentsCount: departments.length,
        minAccuracy,
        maxAccuracy,
      });
      res.json(facets);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to compute filter facets.',
      });
    }
  }
);

apiRouter.get(
  '/api/industry-companies',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const params = parseGlobalFilterParams(req);
      const directoryPayload = await resolveFilteredGlobalCompanies(params);
      res.json(directoryPayload);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch worldwide companies.',
      });
    }
  }
);

apiRouter.get(
  '/api/filter-explorer',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const rawPayload = await buildFilterExplorerResponse(req);
      const maskEmails =
        !computeHasActiveUnlimited(user) && user.lensCoins <= 0;
      const payload = applyOverridesAndZeroCoinMaskToFilterExplorer(
        rawPayload,
        maskEmails,
        user.unlockedCompanies || []
      );
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load filtered directory.',
      });
    }
  }
);

let activePrefetchCount = 0;

apiRouter.get(
  '/api/prefetch',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const rawDomain = String(req.query.domain || '');
    const companySlug = String(req.query.companySlug || '')
      .trim()
      .toLowerCase();
    const domain = rawDomain ? normalizeDomain(rawDomain) : '';

    res.json({ ok: true });

    if (activePrefetchCount >= 2) return;
    if (!companySlug && (!domain || !isValidDomain(domain))) return;

    activePrefetchCount++;
    void discoverDomainEmployees(domain, false, companySlug || undefined)
      .catch(() => {
        // Silent cache warm
      })
      .finally(() => {
        activePrefetchCount = Math.max(0, activePrefetchCount - 1);
      });
  }
);

/**
 * Free read-only Company QuickView preview: NEVER checks, counts, or deducts coins.
 * Coins are only counted/deducted when the user explicitly opens the Full Roster via /api/search.
 */
apiRouter.get(
  '/api/quickview',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const rawDomain = String(req.query.domain || '');
    const companySlug = String(req.query.companySlug || '')
      .trim()
      .toLowerCase();
    const domain = rawDomain ? normalizeDomain(rawDomain) : '';

    if (!companySlug && (!domain || !isValidDomain(domain))) {
      res.status(400).json({
        error: 'Please select a valid company to preview.',
      });
      return;
    }

    try {
      const data = await discoverDomainEmployees(
        domain,
        false,
        companySlug || undefined
      );

      res.json({
        ...data,
        totalEmployeesCount: data.employees.length,
        employees: data.employees.slice(0, 8),
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected error while loading company QuickView.';
      res.status(500).json({ error: message });
    }
  }
);

apiRouter.get(
  '/api/search',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const rawDomain = String(req.query.domain || '');
    const companySlug = String(req.query.companySlug || '')
      .trim()
      .toLowerCase();
    const source: 'domain' | 'filter_company' =
      req.query.source === 'filter_company' ? 'filter_company' : 'domain';
    const forceRefresh = req.query.refresh === 'true';
    const domain = rawDomain ? normalizeDomain(rawDomain) : '';

    if (!companySlug && (!domain || !isValidDomain(domain))) {
      res.status(400).json({
        error:
          'Please enter a valid company domain (for example, shopify.com or vercel.com).',
      });
      return;
    }

    const candidateUnlockKeys = [
      domain,
      companySlug ? `slug:${companySlug}` : '',
    ].filter(Boolean);

    try {
      assertUserCanSearchCompany(
        user,
        candidateUnlockKeys,
        source,
        forceRefresh
      );
    } catch (coinErr) {
      const errWithCode = coinErr as Error & { code?: string };
      if (errWithCode.code === 'INSUFFICIENT_COINS') {
        res.status(402).json({
          error: errWithCode.message,
          code: 'INSUFFICIENT_COINS',
          upgradeRequired: true,
          balanceRemaining: user.lensCoins,
        });
        return;
      }
      res.status(403).json({ error: errWithCode.message });
      return;
    }

    try {
      const data = await discoverDomainEmployees(
        domain,
        forceRefresh,
        companySlug || undefined
      );

      const coinMeta = settleCompanyLookupCoins({
        userId: user.id,
        source,
        domain: data.domain || domain,
        companySlug: data.companySlug || companySlug || undefined,
        companyName: data.companyName || domain || companySlug,
        employeesCount: data.employees.length,
        forceRefresh,
      });

      res.json({
        ...data,
        coinMeta,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected error while indexing company directory.';
      res.status(500).json({ error: message });
    }
  }
);

apiRouter.post(
  '/api/sync',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const rawDomains: unknown = req.body?.domains;
    if (!Array.isArray(rawDomains) || rawDomains.length === 0) {
      res
        .status(400)
        .json({ error: 'Provide a non-empty array of domains to sync.' });
      return;
    }

    const sanitized = Array.from(
      new Set(
        rawDomains
          .map((d) => normalizeDomain(String(d || '')))
          .filter((d) => isValidDomain(d))
      )
    ).slice(0, 10);

    const results: SearchResponse[] = [];
    const errors: Record<string, string> = {};

    for (const domain of sanitized) {
      try {
        assertUserCanSearchCompany(user, [domain], 'domain', false);
        const response = await discoverDomainEmployees(domain, false);
        const coinMeta = settleCompanyLookupCoins({
          userId: user.id,
          source: 'domain',
          domain: response.domain || domain,
          companySlug: response.companySlug,
          companyName: response.companyName || domain,
          employeesCount: response.employees.length,
          forceRefresh: false,
        });
        results.push({ ...response, coinMeta });
      } catch (err) {
        errors[domain] =
          err instanceof Error ? err.message : 'Sync lookup failed';
      }
    }

    res.json({
      syncedAt: new Date().toISOString(),
      results,
      errors,
      balanceRemaining: user.lensCoins,
    });
  }
);
