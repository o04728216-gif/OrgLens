import type { CrawlerVaultStats } from '../../src/types.ts';
import {
  getCrawlerCursor,
  getFullCrawlerVaultStats,
  getVaultSummaryCounts,
  queryVaultCompanies,
  saveCrawlerCursor,
  upsertCompanyOfficers,
  upsertConfirmedContacts,
  upsertVaultCompanies,
} from '../store/companyVaultDb.ts';
import { WORLDWIDE_COUNTRY_HUBS } from './directoryConfig.ts';
import {
  fetchGlobalCompaniesByCountry,
  fetchGlobalCompaniesByIndustry,
  fetchGlobalIndustries,
} from './globalDirectoryService.ts';
import {
  fetchAustraliaAbnBusinesses,
  fetchAustraliaAsicCompanies,
  fetchColoradoBusinessEntities,
  fetchFranceSireneOdsCompanies,
  fetchNewYorkCorporations,
  fetchNpmCorporatePublishers,
  fetchOregonActiveBusinesses,
  fetchUsSecPublicCompanies,
  fetchUsTreasuryRecipients,
} from './nationalRegistryConnectors.ts';
import { crawlRealConfirmedEmails } from './realEmailCrawler.ts';
import { resolveRealCompanyDomainsBatch } from './realDomainResolver.ts';
import { enrichCompaniesWithWebsites } from './theOrgClient.ts';
import { inspectTargetWebsite } from './websiteScraper.ts';
import {
  crawlMajesticDomainChunk,
  crawlTrancoDomainChunk,
  fetchFinlandPrhCompanies,
  fetchFranceSireneCompanies,
  fetchGithubOrganizations,
  fetchGleifCompanies,
  fetchNorwayBrregCompanies,
  fetchOpenAlexInstitutions,
  fetchRorOrganizations,
  fetchWikidataEnterprises,
  probeGlobalRegistryFederationTotals,
} from './worldwideRegistryConnectors.ts';

const FRENCH_DEPARTEMENTS = [
  '75',
  '92',
  '69',
  '13',
  '33',
  '59',
  '31',
  '44',
  '67',
  '06',
  '34',
  '35',
  '38',
  '93',
  '94',
  '78',
  '91',
  '95',
  '57',
  '76',
  '83',
  '49',
  '29',
  '54',
  '63',
  '64',
  '45',
  '21',
  '37',
  '51',
];

let daemonEnabled = true;
let daemonTimer: ReturnType<typeof setTimeout> | null = null;
let activeCycle = false;
let lastCycleAt: string | null = null;
let totalCyclesRun = 0;
let lastUserActivityAt = 0;

export function markUserApiActivity(): void {
  lastUserActivityAt = Date.now();
}

async function crawlTheOrgCountryStep(): Promise<number> {
  const cur = getCrawlerCursor('theorg_countries');
  const rawVal = cur?.cursorValue || '0:1';
  const [hubIdxStr, pageStr] = rawVal.split(':');
  const hubIdx = Math.max(
    0,
    parseInt(hubIdxStr || '0', 10) % WORLDWIDE_COUNTRY_HUBS.length
  );
  const page = Math.max(1, Math.min(200, parseInt(pageStr || '1', 10) || 1));

  const countrySlug = WORLDWIDE_COUNTRY_HUBS[hubIdx] || 'united-states';
  const resp = await fetchGlobalCompaniesByCountry(countrySlug, page);
  const enriched = await enrichCompaniesWithWebsites(
    resp.companies.slice(0, 50)
  );
  const added = upsertVaultCompanies(enriched, 'TheOrg Directory');

  const nextHubIdx = (hubIdx + 1) % WORLDWIDE_COUNTRY_HUBS.length;
  const nextPage = nextHubIdx === 0 ? (page % 200) + 1 : page;
  saveCrawlerCursor(
    'theorg_countries',
    `${nextHubIdx}:${nextPage}`,
    added,
    `Indexed ${countrySlug} p.${page} (+${added})`
  );
  return added;
}

async function crawlTheOrgIndustryStep(): Promise<number> {
  const industries = await fetchGlobalIndustries();
  if (industries.length === 0) return 0;

  const cur = getCrawlerCursor('theorg_industries');
  const [indIdxStr, pageStr] = (cur?.cursorValue || '0:1').split(':');
  const indIdx = Math.max(
    0,
    parseInt(indIdxStr || '0', 10) % industries.length
  );
  const page = Math.max(1, Math.min(200, parseInt(pageStr || '1', 10) || 1));

  const targetInd = industries[indIdx];
  const resp = await fetchGlobalCompaniesByIndustry(targetInd.slug, page);
  const enriched = await enrichCompaniesWithWebsites(
    resp.companies.slice(0, 50)
  );
  const added = upsertVaultCompanies(enriched, 'TheOrg Directory');

  const nextIndIdx = (indIdx + 1) % industries.length;
  const nextPage = nextIndIdx === 0 ? (page % 200) + 1 : page;
  saveCrawlerCursor(
    'theorg_industries',
    `${nextIndIdx}:${nextPage}`,
    added,
    `Indexed ${targetInd.slug} p.${page} (+${added})`
  );
  return added;
}

async function crawlGleifStep(): Promise<number> {
  const cur = getCrawlerCursor('gleif_global');
  const page = Math.max(
    1,
    Math.min(1800, parseInt(cur?.cursorValue || '1', 10) || 1)
  );
  const batch = await fetchGleifCompanies({ page, pageSize: 80 });
  const withDomains = await resolveRealCompanyDomainsBatch(batch.companies, {
    maxClearbitLookups: 14,
    timeoutMs: 1400,
  });
  const added = upsertVaultCompanies(withDomains, 'GLEIF Legal Registry');
  const nextPage = batch.companies.length === 0 ? 1 : (page % 1800) + 1;
  saveCrawlerCursor(
    'gleif_global',
    String(nextPage),
    added,
    `GLEIF page ${page} (+${added} legal entities)`
  );
  return added;
}

async function crawlNorwayBrregStep(): Promise<number> {
  const cur = getCrawlerCursor('norway_brreg');
  const page = Math.max(
    1,
    Math.min(95, parseInt(cur?.cursorValue || '1', 10) || 1)
  );
  const batch = await fetchNorwayBrregCompanies({ page, size: 100 });
  const added = upsertVaultCompanies(batch.companies, 'Norway Brreg Register');
  const nextPage = batch.companies.length === 0 ? 1 : (page % 95) + 1;
  saveCrawlerCursor(
    'norway_brreg',
    String(nextPage),
    added,
    `Norway Brreg page ${page} (+${added})`
  );
  return added;
}

async function crawlFranceSireneStep(): Promise<number> {
  const cur = getCrawlerCursor('france_sirene');
  const [depIdxStr, pageStr] = (cur?.cursorValue || '0:1').split(':');
  const depIdx = Math.max(
    0,
    parseInt(depIdxStr || '0', 10) % FRENCH_DEPARTEMENTS.length
  );
  const page = Math.max(1, Math.min(350, parseInt(pageStr || '1', 10) || 1));
  const dep = FRENCH_DEPARTEMENTS[depIdx] || '75';

  const [dirBatch, odsBatch] = await Promise.all([
    fetchFranceSireneCompanies({
      departement: dep,
      page,
      perPage: 25,
    }),
    fetchFranceSireneOdsCompanies({
      offset: ((page - 1) * 60 + depIdx * 60) % 9600,
      limit: 60,
    }),
  ]);

  const added =
    upsertVaultCompanies(dirBatch.companies, 'France SIRENE Registry') +
    upsertVaultCompanies(odsBatch.companies, 'France SIRENE Registry');
  if (dirBatch.officers.length > 0) {
    upsertCompanyOfficers(dirBatch.officers);
  }

  const nextDepIdx = (depIdx + 1) % FRENCH_DEPARTEMENTS.length;
  const nextPage = nextDepIdx === 0 ? (page % 350) + 1 : page;
  saveCrawlerCursor(
    'france_sirene',
    `${nextDepIdx}:${nextPage}`,
    added,
    `France SIRENE dept ${dep} p.${page} (+${added} orgs, +${dirBatch.officers.length} officers)`
  );
  return added;
}

async function crawlFinlandPrhStep(): Promise<number> {
  const cur = getCrawlerCursor('finland_prh');
  const page = Math.max(
    1,
    Math.min(400, parseInt(cur?.cursorValue || '1', 10) || 1)
  );
  const batch = await fetchFinlandPrhCompanies({ page });
  const added = upsertVaultCompanies(batch.companies, 'Finland PRH Register');
  const nextPage = batch.companies.length === 0 ? 1 : (page % 400) + 1;
  saveCrawlerCursor(
    'finland_prh',
    String(nextPage),
    added,
    `Finland PRH page ${page} (+${added})`
  );
  return added;
}

async function crawlUsCorporateRegistriesStep(): Promise<number> {
  const cur = getCrawlerCursor('us_federal_and_states');
  const step = Math.max(0, parseInt(cur?.cursorValue || '0', 10) || 0);
  const offset = (step * 60) % 60_000;
  const treasuryPage = (step % 500) + 1;

  const [treasuryBatch, secBatch, nyBatch, coBatch, orBatch] =
    await Promise.all([
      fetchUsTreasuryRecipients({ page: treasuryPage, limit: 60 }),
      fetchUsSecPublicCompanies({ offset: (step * 60) % 10_200, limit: 60 }),
      fetchNewYorkCorporations({ offset, limit: 60 }),
      fetchColoradoBusinessEntities({ offset, limit: 60 }),
      fetchOregonActiveBusinesses({ offset, limit: 60 }),
    ]);

  const enrichedSec = await resolveRealCompanyDomainsBatch(secBatch.companies, {
    maxClearbitLookups: 20,
    timeoutMs: 1400,
  });

  const added =
    upsertVaultCompanies(
      treasuryBatch.companies,
      'US Treasury DUNS/UEI Registry'
    ) +
    upsertVaultCompanies(enrichedSec, 'US SEC EDGAR Registry') +
    upsertVaultCompanies(nyBatch.companies, 'NY Dept of State Registry') +
    upsertVaultCompanies(coBatch.companies, 'Colorado SOS Registry') +
    upsertVaultCompanies(orBatch.companies, 'Oregon SOS Registry');

  const allOfficers = [...nyBatch.officers, ...orBatch.officers];
  if (allOfficers.length > 0) {
    upsertCompanyOfficers(allOfficers);
  }

  saveCrawlerCursor(
    'us_federal_and_states',
    String(step + 1),
    added,
    `US Treasury + SEC + NY/CO/OR SOS wave ${step + 1} (+${added} corps, +${allOfficers.length} principals)`
  );
  return added;
}

async function crawlAustraliaAndTechRegistriesStep(): Promise<{
  companiesAdded: number;
  emailsAdded: number;
}> {
  const cur = getCrawlerCursor('australia_and_npm_gh');
  const step = Math.max(0, parseInt(cur?.cursorValue || '0', 10) || 0);
  const auOffset = (step * 60) % 120_000;

  const [asicBatch, abnBatch, npmBatch, ghBatch] = await Promise.all([
    fetchAustraliaAsicCompanies({ offset: auOffset, limit: 60 }),
    fetchAustraliaAbnBusinesses({ offset: auOffset, limit: 60 }),
    fetchNpmCorporatePublishers({
      topicIdx: step,
      from: ((step >> 4) * 50) % 1000,
      size: 50,
    }),
    fetchGithubOrganizations({ page: (step % 25) + 1, perPage: 30 }),
  ]);

  const companiesAdded =
    upsertVaultCompanies(asicBatch.companies, 'Australia ASIC Register') +
    upsertVaultCompanies(abnBatch.companies, 'Australia ABN Register') +
    upsertVaultCompanies(npmBatch.companies, 'NPM Global Publishers') +
    upsertVaultCompanies(ghBatch.companies, 'GitHub Organizations');

  let emailsAdded = 0;
  const byDom = new Map<
    string,
    { companyName: string; hits: typeof npmBatch.confirmedEmails[number]['hit'][] }
  >();
  for (const ce of npmBatch.confirmedEmails) {
    const existing = byDom.get(ce.domain) || {
      companyName: ce.companyName,
      hits: [],
    };
    existing.hits.push(ce.hit);
    byDom.set(ce.domain, existing);
  }
  for (const [dom, entry] of byDom.entries()) {
    emailsAdded += upsertConfirmedContacts(dom, entry.hits, entry.companyName);
  }

  saveCrawlerCursor(
    'australia_and_npm_gh',
    String(step + 1),
    companiesAdded,
    `AU ASIC/ABN + NPM + GitHub wave ${step + 1} (+${companiesAdded} orgs, +${emailsAdded} confirmed emails)`
  );
  return { companiesAdded, emailsAdded };
}

async function crawlOpenAlexAndRorStep(): Promise<number> {
  const cur = getCrawlerCursor('openalex_ror');
  const page = Math.max(
    1,
    Math.min(180, parseInt(cur?.cursorValue || '1', 10) || 1)
  );
  const [oaBatch, rorBatch, wdBatch] = await Promise.all([
    fetchOpenAlexInstitutions({ page, perPage: 80 }),
    fetchRorOrganizations({ page }),
    fetchWikidataEnterprises({ offset: ((page - 1) * 25) % 8000, limit: 25 }),
  ]);

  const addedOa = upsertVaultCompanies(
    oaBatch.companies,
    'OpenAlex Global Index'
  );
  const addedRor = upsertVaultCompanies(
    rorBatch.companies,
    'ROR Global Registry'
  );
  const addedWd = upsertVaultCompanies(
    wdBatch.companies,
    'Wikidata Corporate Graph'
  );
  const totalAdded = addedOa + addedRor + addedWd;

  saveCrawlerCursor(
    'openalex_ror',
    String((page % 180) + 1),
    totalAdded,
    `OpenAlex + ROR + Wikidata wave ${page} (+${totalAdded})`
  );
  return totalAdded;
}

async function crawlMajesticAndTrancoStep(): Promise<number> {
  const majCur = getCrawlerCursor('majestic_million');
  const majOffset = Math.max(0, parseInt(majCur?.cursorValue || '0', 10) || 0);

  const trancoCur = getCrawlerCursor('tranco_top1m');
  const trancoOffset = Math.max(
    0,
    parseInt(trancoCur?.cursorValue || '0', 10) || 0
  );

  const [majRes, trancoRes] = await Promise.all([
    crawlMajesticDomainChunk(majOffset, 65536),
    crawlTrancoDomainChunk(trancoOffset, 49152),
  ]);

  const addedMaj = upsertVaultCompanies(
    majRes.companies,
    'Majestic Million Domains'
  );
  const addedTranco = upsertVaultCompanies(
    trancoRes.companies,
    'Tranco Global Domains'
  );

  saveCrawlerCursor(
    'majestic_million',
    String(majRes.nextByteOffset),
    addedMaj,
    `Majestic CSV byte ${majOffset.toLocaleString()} (+${addedMaj} domains)`
  );
  saveCrawlerCursor(
    'tranco_top1m',
    String(trancoRes.nextByteOffset),
    addedTranco,
    `Tranco CSV byte ${trancoOffset.toLocaleString()} (+${addedTranco} domains)`
  );

  return addedMaj + addedTranco;
}

async function crawlConfirmedEmailsStep(): Promise<number> {
  const cur = getCrawlerCursor('confirmed_email_harvester');
  const page = Math.max(
    1,
    Math.min(500, parseInt(cur?.cursorValue || '1', 10) || 1)
  );

  const sample = queryVaultCompanies({ page, perPage: 18 });
  const candidates = sample.companies
    .filter((c) => Boolean(c.domain) && !c.confirmedEmailCount)
    .slice(0, 4);

  let discoveredCount = 0;
  for (const comp of candidates) {
    if (!comp.domain) continue;
    try {
      const site = await inspectTargetWebsite(comp.domain);
      const res = await crawlRealConfirmedEmails({
        domain: comp.domain,
        companyName: comp.name,
        knownEmployees: site.employees,
        websiteConfirmedEmails: site.confirmedEmails,
        fastMode: true,
      });
      discoveredCount += res.allConfirmedContacts.length;
    } catch {
      // Non-fatal
    }
  }

  saveCrawlerCursor(
    'confirmed_email_harvester',
    String((page % 250) + 1),
    discoveredCount,
    `Verified @domain crawl (+${discoveredCount} confirmed emails)`
  );
  return discoveredCount;
}

export async function runCrawlerCycleNow(options?: {
  burstPages?: number;
  manualTrigger?: boolean;
}): Promise<{ companiesIndexed: number; confirmedEmailsFound: number }> {
  if (activeCycle) {
    return { companiesIndexed: 0, confirmedEmailsFound: 0 };
  }

  activeCycle = true;
  let companiesIndexed = 0;
  let confirmedEmailsFound = 0;
  const loops = Math.max(1, Math.min(5, options?.burstPages || 1));
  const currentVaultSize = getVaultSummaryCounts().vaultCompaniesCount;
  const skipHeavyBulkCsv =
    !options?.manualTrigger && currentVaultSize >= 500_000;

  try {
    for (let i = 0; i < loops; i++) {
      const results = await Promise.allSettled([
        crawlTheOrgCountryStep(),
        crawlTheOrgIndustryStep(),
        crawlGleifStep(),
        crawlNorwayBrregStep(),
        crawlFranceSireneStep(),
        crawlFinlandPrhStep(),
        crawlUsCorporateRegistriesStep(),
        crawlAustraliaAndTechRegistriesStep(),
        crawlOpenAlexAndRorStep(),
        skipHeavyBulkCsv ? Promise.resolve(0) : crawlMajesticAndTrancoStep(),
        crawlConfirmedEmailsStep(),
      ]);

      results.forEach((r, idx) => {
        if (r.status !== 'fulfilled') return;
        if (idx === 7) {
          const val = r.value as {
            companiesAdded: number;
            emailsAdded: number;
          };
          companiesIndexed += val.companiesAdded;
          confirmedEmailsFound += val.emailsAdded;
        } else if (idx === 10) {
          confirmedEmailsFound += r.value as number;
        } else {
          companiesIndexed += r.value as number;
        }
      });
    }

    totalCyclesRun++;
    lastCycleAt = new Date().toISOString();
  } finally {
    activeCycle = false;
  }

  return { companiesIndexed, confirmedEmailsFound };
}

function scheduleNextDaemonTick(delayMs?: number): void {
  if (daemonTimer) {
    clearTimeout(daemonTimer);
    daemonTimer = null;
  }
  if (!daemonEnabled) return;

  const existingCount = getVaultSummaryCounts().vaultCompaniesCount;
  const defaultIntervalMs = existingCount >= 250_000 ? 15 * 60_000 : 90_000;
  const effectiveDelay =
    typeof delayMs === 'number' ? delayMs : defaultIntervalMs;

  daemonTimer = setTimeout(async () => {
    if (!daemonEnabled) return;
    // Yield 100% of network, CPU, and SQLite I/O while a user is actively querying
    if (Date.now() - lastUserActivityAt < 60_000) {
      scheduleNextDaemonTick(60_000);
      return;
    }
    try {
      await runCrawlerCycleNow({ burstPages: 1 });
    } catch {
      // Non-fatal background tick
    }
    if (daemonEnabled) {
      scheduleNextDaemonTick();
    }
  }, effectiveDelay);
}

export function startWorldwideCrawlerDaemon(): void {
  daemonEnabled = true;
  const existingVaultCount = getVaultSummaryCounts().vaultCompaniesCount;
  const isFreshVault = existingVaultCount < 500;
  const isLargeVault = existingVaultCount >= 250_000;

  scheduleNextDaemonTick(
    isFreshVault ? 35_000 : isLargeVault ? 10 * 60_000 : 60_000
  );
  void (async () => {
    try {
      await new Promise((resolve) =>
        setTimeout(resolve, isFreshVault ? 2_000 : 45_000)
      );
      if (isFreshVault || Date.now() - lastUserActivityAt >= 30_000) {
        await probeGlobalRegistryFederationTotals();
      }
      if (isFreshVault) {
        await runCrawlerCycleNow({ burstPages: 1 });
      }
    } catch {
      // Non-fatal federation total probe / initial seed
    }
  })();
}

export function setCrawlerDaemonEnabled(enabled: boolean): CrawlerVaultStats {
  daemonEnabled = enabled;
  if (enabled) {
    scheduleNextDaemonTick(3000);
  } else if (daemonTimer) {
    clearTimeout(daemonTimer);
    daemonTimer = null;
  }
  return getCrawlerStatusSnapshot();
}

export function getCrawlerStatusSnapshot(): CrawlerVaultStats {
  return getFullCrawlerVaultStats({
    daemonRunning: daemonEnabled,
    daemonActiveCycle: activeCycle,
    lastCycleAt,
    totalCyclesRun,
  });
}
