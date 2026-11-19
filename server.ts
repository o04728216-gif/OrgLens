import 'dotenv/config';
import dns from 'node:dns';
import net from 'node:net';

process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '32';

import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Prioritize IPv4 resolution across all outbound crawlers & API calls to prevent IPv6 socket timeouts
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json({ limit: '25mb' }));

// Immediate zero-dependency readiness endpoints so control-plane health checks succeed in < 80ms
app.get(['/api/ping', '/health'], (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

const httpServer = http.createServer(app);

let mountedApiRouter: RequestHandler | null = null;
let mountedFrontendHandler: RequestHandler | null = null;

// Bind port 3000 immediately before heavy Vite / SQLite / crawler module imports
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`OrgLens server listening on http://0.0.0.0:${PORT}`);
});

const bootstrapPromise = (async () => {
  const { apiRouter } = await import('./server/routes/apiRoutes.ts');
  mountedApiRouter = apiRouter;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Attach HMR to httpServer (or disable when DISABLE_HMR=true) to avoid port 24678 EADDRINUSE crashes
        hmr:
          process.env.DISABLE_HMR === 'true'
            ? false
            : { server: httpServer },
      },
      appType: 'spa',
    });
    mountedFrontendHandler = vite.middlewares as RequestHandler;
  } else {
    const distPath = path.join(__dirname, 'dist');
    const prodRouter = express.Router();
    prodRouter.use(express.static(distPath));
    prodRouter.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    mountedFrontendHandler = prodRouter;
  }

  // Defer background crawler & directory cache warm-up until after server + Vite are 100% ready
  setTimeout(() => {
    void (async () => {
      try {
        const [
          { startWorldwideCrawlerDaemon },
          { fetchGlobalIndustries, resolveFilteredGlobalCompanies },
          { fetchQuickCompanyRoster },
          { detectBatchCompanyEmailPatterns },
          { isValidDomain, mapWithConcurrency },
        ] = await Promise.all([
          import('./server/services/worldwideCrawlerDaemon.ts'),
          import('./server/services/globalDirectoryService.ts'),
          import('./server/services/filterExplorerService.ts'),
          import('./server/services/emailIntelligence.ts'),
          import('./server/utils/textAndDomain.ts'),
        ]);

        startWorldwideCrawlerDaemon();

        const [dir] = await Promise.all([
          resolveFilteredGlobalCompanies({
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
          }),
          fetchGlobalIndustries(),
        ]);

        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const topCompanies = dir.companies
          .filter((c) => Boolean(c.slug))
          .slice(0, 10);
        const rosters = await mapWithConcurrency(topCompanies, 4, (comp) =>
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
            employees: (rosters[idx] || []).slice(0, 40),
            employeeRange: comp.employeeRange,
          }))
          .filter((p) => Boolean(p.domain && isValidDomain(p.domain)));
        await detectBatchCompanyEmailPatterns(patternInputs, 0);
      } catch {
        // Non-fatal background warm-up
      }
    })();
  }, 4000);
})();

app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!mountedApiRouter || !mountedFrontendHandler) {
      await bootstrapPromise;
    }
    if (mountedApiRouter) {
      mountedApiRouter(req, res, (apiErr?: unknown) => {
        if (apiErr) {
          next(apiErr);
          return;
        }
        if (res.headersSent) return;
        if (mountedFrontendHandler) {
          mountedFrontendHandler(req, res, next);
        } else {
          next();
        }
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});
