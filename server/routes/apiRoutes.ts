import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SearchResponse } from '../../src/types.ts';
import { discoverDomainEmployees } from '../services/domainDiscoveryService.ts';
import { buildFilterExplorerResponse } from '../services/filterExplorerService.ts';
import {
  fetchGlobalIndustries,
  parseGlobalFilterParams,
  resolveFilteredGlobalCompanies,
} from '../services/globalDirectoryService.ts';
import { isValidDomain, normalizeDomain } from '../utils/textAndDomain.ts';

export const apiRouter = Router();

apiRouter.get(['/api/ping', '/health'], (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

apiRouter.get('/api/industries', async (_req: Request, res: Response) => {
  try {
    const industries = await fetchGlobalIndustries();
    res.json({ industries });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load industries.',
    });
  }
});

apiRouter.get(
  '/api/industry-companies',
  async (req: Request, res: Response) => {
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

apiRouter.get('/api/filter-explorer', async (req: Request, res: Response) => {
  try {
    const payload = await buildFilterExplorerResponse(req);
    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load filtered directory.',
    });
  }
});

apiRouter.get('/api/search', async (req: Request, res: Response) => {
  const rawDomain = String(req.query.domain || '');
  const companySlug = String(req.query.companySlug || '')
    .trim()
    .toLowerCase();
  const forceRefresh = req.query.refresh === 'true';
  const domain = rawDomain ? normalizeDomain(rawDomain) : '';

  if (!companySlug && (!domain || !isValidDomain(domain))) {
    res.status(400).json({
      error:
        'Please enter a valid company domain (for example, shopify.com or vercel.com).',
    });
    return;
  }

  try {
    const data = await discoverDomainEmployees(
      domain,
      forceRefresh,
      companySlug || undefined
    );
    res.json(data);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unexpected error while indexing company directory.';
    res.status(500).json({ error: message });
  }
});

apiRouter.post('/api/sync', async (req: Request, res: Response) => {
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
      const response = await discoverDomainEmployees(domain, false);
      results.push(response);
    } catch (err) {
      errors[domain] =
        err instanceof Error ? err.message : 'Sync lookup failed';
    }
  }

  res.json({
    syncedAt: new Date().toISOString(),
    results,
    errors,
  });
});
