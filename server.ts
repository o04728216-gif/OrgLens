import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes/apiRoutes.ts';
import { detectBatchCompanyEmailPatterns } from './server/services/emailIntelligence.ts';
import { fetchQuickCompanyRoster } from './server/services/filterExplorerService.ts';
import { resolveFilteredGlobalCompanies } from './server/services/globalDirectoryService.ts';
import type { GlobalFilterParams } from './server/types.ts';
import {
  isValidDomain,
  mapWithConcurrency,
} from './server/utils/textAndDomain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OrgLens server listening on http://0.0.0.0:${PORT}`);

    // Non-blocking startup warm-up for Worldwide Directory, quick rosters, and per-company email formats
    void (async () => {
      try {
        const defaultParams: GlobalFilterParams = {
          rawSlugs: [],
          industryMatchMode: 'any',
          industryKeyword: '',
          selectedCountries: [],
          selectedContinents: [],
          locationQuery: '',
          employeeRanges: [],
          revenueRanges: [],
          companyQuery: '',
          page: 1,
        };
        const dir = await resolveFilteredGlobalCompanies(defaultParams);
        const topCompanies = dir.companies
          .filter((c) => Boolean(c.slug))
          .slice(0, 65);
        const rosters = await mapWithConcurrency(topCompanies, 24, (comp) =>
          fetchQuickCompanyRoster(comp)
        );
        const patternInputs = topCompanies
          .map((comp, idx) => ({
            domain: (
              rosters[idx]?.[0]?.domain ||
              comp.domain ||
              ''
            ).toLowerCase(),
            companyName: rosters[idx]?.[0]?.companyName || comp.name,
            employees: (rosters[idx] || []).slice(0, 60),
            employeeRange: comp.employeeRange,
          }))
          .filter((p) => Boolean(p.domain && isValidDomain(p.domain)));
        await detectBatchCompanyEmailPatterns(patternInputs, 16);
      } catch {
        // Non-fatal background warm
      }
    })();
  });
}

startServer();
