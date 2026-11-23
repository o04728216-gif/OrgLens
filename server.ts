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

// Mount Vite / static frontend FIRST and independently so GET / and JS modules respond in < 500ms
// without ever waiting on SQLite WAL recovery or heavy backend route imports!
const frontendReadyPromise = (async () => {
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
})();

const apiReadyPromise = (async () => {
  const { apiRouter } = await import('./server/routes/apiRoutes.ts');
  mountedApiRouter = apiRouter;
})();

const bootstrapPromise = (async () => {
  await Promise.all([frontendReadyPromise, apiReadyPromise]);

  const { getStoragePersistenceDiagnostics } = await import(
    './server/store/persistentDataDir.ts'
  );
  const storageDiag = getStoragePersistenceDiagnostics();
  console.log(
    `[OrgLens Storage] Auth DB: ${storageDiag.authStoragePath} | Vault DB: ${storageDiag.vaultStoragePath} | Persistent Volume: ${
      storageDiag.isPersistentVolumeMounted
        ? `MOUNTED (${storageDiag.detectedMountPoint})`
        : storageDiag.isContainerRuntime
        ? `NOT MOUNTED — attach Persistent Storage to ${storageDiag.recommendedCoolifyMountPath} in Coolify to retain data across redeploys`
        : 'LOCAL HOST DISK'
    }`
  );

  const registerGracefulShutdown = () => {
    let shuttingDown = false;
    const handleSignal = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[OrgLens] Received ${signal}, flushing databases cleanly...`);
      try {
        const [{ flushVpsStoreSync }, { checkpointAndCloseVaultDb }] =
          await Promise.all([
            import('./server/store/vpsStore.ts'),
            import('./server/store/companyVaultDb.ts'),
          ]);
        flushVpsStoreSync();
        checkpointAndCloseVaultDb();
      } catch (err) {
        console.error('[OrgLens] Error flushing databases on shutdown:', err);
      } finally {
        httpServer.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2500).unref();
      }
    };
    process.once('SIGTERM', () => void handleSignal('SIGTERM'));
    process.once('SIGINT', () => void handleSignal('SIGINT'));
  };
  registerGracefulShutdown();

  // Defer background crawler & directory cache warm-up until after server + Vite are 100% ready
  setTimeout(() => {
    void (async () => {
      try {
        const [
          { startWorldwideCrawlerDaemon },
          { fetchGlobalIndustries, resolveFilteredGlobalCompanies },
          { buildColumnarFacetIndexAsync },
          { fetchQuickCompanyRoster },
          { detectBatchCompanyEmailPatterns },
          { isValidDomain, mapWithConcurrency },
        ] = await Promise.all([
          import('./server/services/worldwideCrawlerDaemon.ts'),
          import('./server/services/globalDirectoryService.ts'),
          import('./server/services/columnarFacetEngine.ts'),
          import('./server/services/filterExplorerService.ts'),
          import('./server/services/emailIntelligence.ts'),
          import('./server/utils/textAndDomain.ts'),
        ]);

        startWorldwideCrawlerDaemon();

        const industries = await fetchGlobalIndustries();
        await buildColumnarFacetIndexAsync(industries);

        const dir = await resolveFilteredGlobalCompanies({
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
        });

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
  }, 6000);
})();

void bootstrapPromise;

app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.path.startsWith('/api/')) {
      if (!mountedApiRouter) {
        await apiReadyPromise;
      }
      if (mountedApiRouter) {
        mountedApiRouter(req, res, next);
        return;
      }
    }
    if (!mountedFrontendHandler) {
      await frontendReadyPromise;
    }
    if (mountedFrontendHandler) {
      mountedFrontendHandler(req, res, next);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});
