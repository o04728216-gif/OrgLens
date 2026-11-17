import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SearchResponse } from '../../src/types.ts';
import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { discoverDomainEmployees } from '../services/domainDiscoveryService.ts';
import { buildFilterExplorerResponse } from '../services/filterExplorerService.ts';
import {
  fetchGlobalIndustries,
  parseGlobalFilterParams,
  resolveFilteredGlobalCompanies,
} from '../services/globalDirectoryService.ts';
import { applyOverridesAndZeroCoinMaskToFilterExplorer } from '../services/manualOverrideApplier.ts';
import {
  assertUserCanSearchCompany,
  computeHasActiveUnlimited,
  settleCompanyLookupCoins,
} from '../store/vpsStore.ts';
import { isValidDomain, normalizeDomain } from '../utils/textAndDomain.ts';
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
