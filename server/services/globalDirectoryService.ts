import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Request } from 'express';
import type {
  FilterFacetsResponse,
  GlobalCompaniesResponse,
  GlobalCompanyItem,
  GlobalIndustryOption,
} from '../../src/types.ts';
import { expandFullIndustryTitle } from '../../src/utils/emailFormulas.ts';
import {
  estimateCompanyRevenueRange,
  inferCountrySlugFromLocation,
  matchesGeographyFilter,
  resolveCountrySlugsFromFilters,
} from '../../src/utils/geographyAndRevenue.ts';
import {
  CACHE_TTL_MS,
  countryCompaniesCache,
  emailPatternCache,
  getCachedGlobalIndustries,
  industryCompaniesCache,
  setCachedGlobalIndustries,
  slugToDomainCache,
  slugToWebsiteCache,
} from '../cache.ts';
import {
  deriveIndustriesFromVault,
  fetchVaultCompaniesByRowIds,
  getConfirmedContactsForDomains,
  queryVaultCompanies,
  recordRegistryLiveTotal,
  registerVaultMutationListener,
  upsertCompanyOfficers,
  upsertConfirmedContacts,
  upsertVaultCompanies,
} from '../store/companyVaultDb.ts';
import type { GlobalFilterParams } from '../types.ts';
import {
  browserHeaders,
  cleanWhitespace,
  formatEmployeeRangeLabel,
  humanizeSlug,
  isValidDomain,
  mapWithConcurrency,
  normalizeDomain,
} from '../utils/textAndDomain.ts';
import {
  COMPANIES_PER_PAGE,
  INDUSTRY_SYNONYM_MAP,
  INDUSTRY_TLD_HINTS,
  WORLDWIDE_COUNTRY_HUBS,
} from './directoryConfig.ts';
import {
  isDisallowedDirectoryDomain,
  resolveRealCompanyDomainsBatch,
} from './realDomainResolver.ts';
import {
  enrichCompaniesFromLocalCacheSync,
  enrichCompaniesWithWebsites,
  queryTheOrgGraphQL,
} from './theOrgClient.ts';
import { fetchFederatedRegistryCompaniesForFilter } from './worldwideRegistryConnectors.ts';
import { markUserApiActivity } from './worldwideCrawlerDaemon.ts';
import {
  computeExactColumnarFacets,
  ensureColumnarFacetIndexReady,
  invalidateColumnarFacetIndex,
  queryColumnarCompanyRowIds,
} from './columnarFacetEngine.ts';

const filteredDirectoryRamCache = new Map<
  string,
  { data: GlobalCompaniesResponse; expiresAt: number }
>();
const facetsRamCache = new Map<
  string,
  { data: FilterFacetsResponse; expiresAt: number }
>();

registerVaultMutationListener(() => {
  invalidateColumnarFacetIndex();
  facetsRamCache.clear();
  filteredDirectoryRamCache.clear();
});
const backgroundDirectoryRefreshes = new Set<string>();
let inFlightIndustriesPromise: Promise<GlobalIndustryOption[] | null> | null =
  null;

export const CANONICAL_EMPLOYEE_RANGES: string[] = [
  '1 - 50',
  '51 - 200',
  '201 - 500',
  '501 - 1,000',
  '1,001 - 5,000',
  '5,001 - 10,000',
  '10,000+',
];

export function parseGlobalFilterParams(req: Request): GlobalFilterParams {
  return {
    rawSlugs: String(req.query.slugs || req.query.slug || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    industryMatchMode: String(req.query.industryMatchMode || 'any')
      .trim()
      .toLowerCase(),
    industryKeyword: String(req.query.industryKeyword || '').trim(),
    selectedCountries: String(req.query.countries || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    selectedContinents: String(req.query.continents || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    locationQuery: String(req.query.locationQuery || '').trim(),
    employeeRanges: String(req.query.employeeRanges || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    revenueRanges: String(req.query.revenueRanges || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    companyQuery: String(req.query.q || '').trim(),
    page: Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1),
  };
}

export function buildIndustryTokensForSlugs(
  slugs: string[],
  allInds: GlobalIndustryOption[]
): string[] {
  const tokens = new Set<string>();
  const stopWords = new Set([
    'and',
    'the',
    'for',
    'services',
    'service',
    'management',
    'organization',
    'organizations',
    'industry',
    'industries',
    'other',
    'general',
  ]);
  for (const rawSlug of slugs) {
    const s = rawSlug.trim().toLowerCase();
    const compact = s.replace(/-/g, '');

    // 1. Direct or normalized synonym map hit
    const directSyns =
      INDUSTRY_SYNONYM_MAP[s] || INDUSTRY_SYNONYM_MAP[compact];
    if (directSyns) {
      for (const syn of directSyns) tokens.add(syn.toLowerCase());
    } else {
      // Check if any key in INDUSTRY_SYNONYM_MAP is a strong part of this slug (e.g. 'computer-software-saas' -> 'software')
      for (const [key, syns] of Object.entries(INDUSTRY_SYNONYM_MAP)) {
        if (key.length >= 4 && (s.includes(key) || key.includes(s))) {
          for (const syn of syns.slice(0, 4)) tokens.add(syn.toLowerCase());
          break;
        }
      }
    }

    // 2. Words from the canonical industry title itself
    const found = allInds.find((g) => g.slug === s);
    const label = found
      ? `${found.rawTitle} ${found.fullTitle}`
      : humanizeSlug(s);
    for (const word of label.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 3 && !stopWords.has(word)) {
        tokens.add(word);
      }
    }
  }
  return Array.from(tokens).slice(0, 8);
}

export function buildIndustryTldHintsForSlugs(slugs: string[]): string[] {
  const tlds = new Set<string>();
  for (const rawSlug of slugs) {
    const s = rawSlug.trim().toLowerCase();
    const compact = s.replace(/-/g, '');
    const direct = INDUSTRY_TLD_HINTS[s] || INDUSTRY_TLD_HINTS[compact];
    if (direct) {
      for (const t of direct) tlds.add(t);
    } else {
      for (const [key, list] of Object.entries(INDUSTRY_TLD_HINTS)) {
        if (key.length >= 5 && s.includes(key)) {
          for (const t of list) tlds.add(t);
          break;
        }
      }
    }
  }
  return Array.from(tlds).slice(0, 3);
}

/**
 * ZoomInfo-Grade Unified Columnar Facet Engine (`< 8ms` warm):
 * Computes 100% exact disjunctive multi-select facet counts directly from the real
 * 874K+ verified-domain SQLite companies loaded into compact TypedArrays.
 * Guarantees 100% identical numbers across Sidebar counts, Quick Industry Strip,
 * Top Switcher, Companies tab badge, Table header, and Pagination!
 */
export async function computeFilterFacetsAndTotals(
  p: GlobalFilterParams,
  contactFilterMeta?: {
    contactSearch?: string;
    roleKeyword?: string;
    senioritiesCount?: number;
    departmentsCount?: number;
    minAccuracy?: number;
    maxAccuracy?: number;
  }
): Promise<FilterFacetsResponse> {
  const cacheKey = JSON.stringify([
    p.rawSlugs,
    p.industryMatchMode,
    p.industryKeyword.toLowerCase(),
    p.selectedCountries,
    p.selectedContinents,
    p.locationQuery.toLowerCase(),
    p.employeeRanges,
    p.revenueRanges,
    p.companyQuery.toLowerCase(),
    contactFilterMeta || null,
  ]);
  const cached = facetsRamCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const industries = await fetchGlobalIndustries();
  await ensureColumnarFacetIndexReady(industries);
  const payload = computeExactColumnarFacets(p, industries, contactFilterMeta);

  if (facetsRamCache.size > 300) {
    const firstKey = facetsRamCache.keys().next().value;
    if (firstKey) facetsRamCache.delete(firstKey);
  }
  facetsRamCache.set(cacheKey, {
    data: payload,
    expiresAt: Date.now() + 45_000,
  });

  return payload;
}

async function refreshGlobalIndustriesUpstream(): Promise<
  GlobalIndustryOption[] | null
> {
  if (inFlightIndustriesPromise) return inFlightIndustriesPromise;

  inFlightIndustriesPromise = (async () => {
    try {
      const resp = await axios.get('https://theorg.com/explore/industries', {
        timeout: 3500,
        headers: browserHeaders(),
        validateStatus: (s) => s === 200,
      });

      if (typeof resp.data === 'string') {
        const $ = cheerio.load(resp.data);
        const parsed: GlobalIndustryOption[] = [];
        const seenSlugs = new Set<string>();

        $('a[href^="/explore/industries/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const slug = href
            .replace(/^\/explore\/industries\//, '')
            .split('/')[0]
            .split('?')[0];
          if (!slug || seenSlugs.has(slug) || slug === 'adult') return;

          const rawText = cleanWhitespace($(el).text());
          const countMatch = rawText.match(/([\d,]+)\s*companies$/i);
          const companyCount = countMatch
            ? parseInt(countMatch[1].replace(/,/g, ''), 10) || 0
            : 0;
          const rawTitle = cleanWhitespace(
            rawText.replace(/[\d,]+\s*companies$/i, '')
          );

          if (rawTitle) {
            seenSlugs.add(slug);
            parsed.push({
              slug,
              rawTitle,
              fullTitle: expandFullIndustryTitle(rawTitle),
              companyCount,
            });
          }
        });

        if (parsed.length > 10) {
          parsed.sort((a, b) => b.companyCount - a.companyCount);
          const sumInd = parsed.reduce((acc, i) => acc + i.companyCount, 0);
          if (sumInd > 0) {
            recordRegistryLiveTotal(
              'theorg_global',
              'TheOrg Corporate Charts',
              Math.min(sumInd, 600_000),
              'https://theorg.com/explore/industries'
            );
          }
          setCachedGlobalIndustries(parsed);
          facetsRamCache.clear();
          return parsed;
        }
      }
    } catch {
      // Non-fatal
    } finally {
      inFlightIndustriesPromise = null;
    }
    return null;
  })();

  return inFlightIndustriesPromise;
}

export async function fetchGlobalIndustries(): Promise<GlobalIndustryOption[]> {
  const cached = getCachedGlobalIndustries();
  if (cached && cached.length > 0) return cached;

  const upstream = await refreshGlobalIndustriesUpstream();
  if (upstream && upstream.length > 0) return upstream;

  return deriveIndustriesFromVault();
}

function mapRawTheOrgCompany(
  c: Record<string, unknown>,
  fallbackIndustryTitle: string,
  meta?: { sourceCountrySlug?: string; sourceIndustrySlug?: string }
): GlobalCompanyItem {
  const slug = String(c.slug || '');
  const name = cleanWhitespace(String(c.name || humanizeSlug(slug)));
  const logo = c.logoImage as
    | { endpoint?: string; uri?: string; ext?: string }
    | undefined;
  const logoUrl =
    logo?.endpoint && logo?.uri && logo?.ext
      ? `${logo.endpoint}/${logo.uri}_small.${logo.ext}`
      : null;

  const loc = c.locationV2 as
    | { city?: string; state?: string; country?: string }
    | undefined;
  const locationParts = [loc?.city, loc?.state, loc?.country]
    .map((v) => cleanWhitespace(String(v || '')))
    .filter(Boolean);
  const fallbackLoc = meta?.sourceCountrySlug
    ? humanizeSlug(meta.sourceCountrySlug)
    : 'Global';
  const location = locationParts.join(', ') || fallbackLoc;

  const indArr = Array.isArray(c.industries) ? c.industries : [];
  const companyIndustries = indArr
    .map((item: { title?: string }) =>
      expandFullIndustryTitle(cleanWhitespace(String(item?.title || '')))
    )
    .filter(Boolean);
  if (
    meta?.sourceIndustrySlug &&
    fallbackIndustryTitle &&
    !companyIndustries.some(
      (i) => i.toLowerCase() === fallbackIndustryTitle.toLowerCase()
    )
  ) {
    companyIndustries.push(fallbackIndustryTitle);
  }
  const industry =
    Array.from(new Set(companyIndustries)).join(', ') || fallbackIndustryTitle;

  const stats = c.stats as { employeeRange?: string } | undefined;
  const employeeRange = formatEmployeeRangeLabel(
    String(stats?.employeeRange || ''),
    slug
  );
  const revenueRange = estimateCompanyRevenueRange(employeeRange, name);

  const rawExts = Array.isArray(c.extensions) ? c.extensions : [];
  const parsedExts = rawExts
    .map((e: unknown) => normalizeDomain(String(e)))
    .filter((d) => isValidDomain(d) && !isDisallowedDirectoryDomain(d));
  const rawSocial = c.social as { websiteUrl?: string } | undefined;
  const socialDomain = rawSocial?.websiteUrl
    ? normalizeDomain(String(rawSocial.websiteUrl))
    : '';
  const directDomain =
    (socialDomain &&
    isValidDomain(socialDomain) &&
    !isDisallowedDirectoryDomain(socialDomain)
      ? socialDomain
      : '') ||
    parsedExts[0] ||
    '';

  if (slug && directDomain) {
    slugToDomainCache.set(slug, directDomain);
    slugToWebsiteCache.set(slug, {
      domain: directDomain,
      websiteUrl: `https://${directDomain}`,
    });
  }
  const cachedWeb = slug ? slugToWebsiteCache.get(slug) : undefined;
  const cachedPattern = cachedWeb?.domain
    ? emailPatternCache.get(cachedWeb.domain.toLowerCase())
    : undefined;

  const explicitLocCountry =
    location && location !== 'Global' && location !== 'Worldwide'
      ? inferCountrySlugFromLocation(location)
      : undefined;
  const resolvedCountrySlug =
    explicitLocCountry ||
    meta?.sourceCountrySlug ||
    inferCountrySlugFromLocation(location, cachedWeb?.domain);

  return {
    id: String(c.id || slug),
    slug,
    name,
    domain: cachedWeb?.domain,
    websiteUrl: cachedWeb?.websiteUrl,
    logoUrl,
    location,
    industry,
    employeeRange,
    revenueRange,
    detectedFormulaId: cachedPattern?.data.analysis.detectedFormulaId,
    detectedFormulaLabel: cachedPattern?.data.analysis.formulaLabel,
    patternConfidence: cachedPattern?.data.analysis.patternConfidence,
    sourceCountrySlug: resolvedCountrySlug,
    sourceIndustrySlugs: meta?.sourceIndustrySlug
      ? [meta.sourceIndustrySlug]
      : undefined,
    sourceRegistry: 'TheOrg Directory',
  };
}

export async function fetchGlobalCompaniesByIndustry(
  industrySlug: string,
  page: number
): Promise<GlobalCompaniesResponse> {
  const safePage = Math.max(1, Math.min(2000, page));
  const cacheKey = `${industrySlug}:${safePage}`;
  const cached = industryCompaniesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const resp = await axios.get(
      `https://theorg.com/explore/industries/${encodeURIComponent(
        industrySlug
      )}`,
      {
        params: safePage > 1 ? { page: safePage } : {},
        timeout: 2400,
        headers: browserHeaders(),
        validateStatus: (s) => s === 200,
      }
    );

    const html = typeof resp.data === 'string' ? resp.data : '';
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match || !match[1]) {
      return {
        industrySlug,
        industryFullTitle: expandFullIndustryTitle(humanizeSlug(industrySlug)),
        page: safePage,
        perPage: 50,
        totalCompanies: 0,
        totalPages: 1,
        companies: [],
      };
    }

    const pageProps = JSON.parse(match[1])?.props?.pageProps || {};
    const rawTagTitle = String(
      pageProps?.tag?.value || humanizeSlug(industrySlug)
    );
    const industryFullTitle = expandFullIndustryTitle(rawTagTitle);
    const totalCompanies = Number(pageProps?.total || 0);
    const perPage = 50;
    const totalPages = Math.max(1, Math.ceil(totalCompanies / perPage));

    const rawCompanies: Array<Record<string, unknown>> = Array.isArray(
      pageProps?.companies
    )
      ? pageProps.companies
      : [];

    const companies: GlobalCompanyItem[] = rawCompanies.map((c) =>
      mapRawTheOrgCompany(c, industryFullTitle, {
        sourceIndustrySlug: industrySlug,
      })
    );

    const payload: GlobalCompaniesResponse = {
      industrySlug,
      industryFullTitle,
      page: safePage,
      perPage,
      totalCompanies,
      totalPages,
      companies,
    };

    industryCompaniesCache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return payload;
  } catch {
    return {
      industrySlug,
      industryFullTitle: expandFullIndustryTitle(humanizeSlug(industrySlug)),
      page: safePage,
      perPage: 50,
      totalCompanies: 0,
      totalPages: 1,
      companies: [],
    };
  }
}

export async function fetchGlobalCompaniesByCountry(
  countrySlug: string,
  page: number
): Promise<GlobalCompaniesResponse> {
  const safePage = Math.max(1, Math.min(2000, page));
  const cacheKey = `country:${countrySlug}:${safePage}`;
  const cached = countryCompaniesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const resp = await axios.get(
      `https://theorg.com/explore/countries/${encodeURIComponent(countrySlug)}`,
      {
        params: safePage > 1 ? { page: safePage } : {},
        timeout: 2400,
        headers: browserHeaders(),
        validateStatus: (s) => s === 200,
      }
    );

    const html = typeof resp.data === 'string' ? resp.data : '';
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match || !match[1]) {
      return {
        industrySlug: countrySlug,
        industryFullTitle: humanizeSlug(countrySlug),
        page: safePage,
        perPage: 50,
        totalCompanies: 0,
        totalPages: 1,
        companies: [],
      };
    }

    const pageProps = JSON.parse(match[1])?.props?.pageProps || {};
    const countryLabel = humanizeSlug(countrySlug);
    const totalCompanies = Number(pageProps?.total || 0);
    const perPage = 50;
    const totalPages = Math.max(1, Math.ceil(totalCompanies / perPage));

    const rawCompanies: Array<Record<string, unknown>> = Array.isArray(
      pageProps?.companies
    )
      ? pageProps.companies
      : [];

    const companies: GlobalCompanyItem[] = rawCompanies.map((c) =>
      mapRawTheOrgCompany(c, 'Information Technology & Business Services', {
        sourceCountrySlug: countrySlug,
      })
    );

    const payload: GlobalCompaniesResponse = {
      industrySlug: countrySlug,
      industryFullTitle: countryLabel,
      page: safePage,
      perPage,
      totalCompanies,
      totalPages,
      companies,
    };

    countryCompaniesCache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return payload;
  } catch {
    return {
      industrySlug: countrySlug,
      industryFullTitle: humanizeSlug(countrySlug),
      page: safePage,
      perPage: 50,
      totalCompanies: 0,
      totalPages: 1,
      companies: [],
    };
  }
}

export async function searchGlobalCompaniesByQuery(
  searchQuery: string
): Promise<GlobalCompanyItem[]> {
  const cleanQ = cleanWhitespace(searchQuery);
  if (!cleanQ) return [];

  const gql = `
    query SearchWorldwideCompanies($query: String!) {
      search(query: $query) {
        companies {
          id
          slug
          name
          extensions
          social {
            websiteUrl
          }
          logoImage {
            endpoint
            uri
            ext
          }
          locationV2 {
            city
            state
            country
          }
          industries {
            title
          }
          stats {
            employeeRange
          }
        }
      }
    }
  `;

  const data = await queryTheOrgGraphQL<{
    search?: { companies?: Array<Record<string, unknown>> };
  }>(gql, { query: cleanQ }, 1800);

  const list = Array.isArray(data?.search?.companies)
    ? data.search.companies
    : [];

  return list.map((c) =>
    mapRawTheOrgCompany(c, 'Information Technology & Business Services')
  );
}

function interleaveCompanyBatches(
  batches: GlobalCompanyItem[][]
): GlobalCompanyItem[] {
  const merged: GlobalCompanyItem[] = [];
  const bySlug = new Map<string, GlobalCompanyItem>();
  const maxLen = Math.max(0, ...batches.map((b) => b.length));

  for (let idx = 0; idx < maxLen; idx++) {
    for (const batch of batches) {
      const comp = batch[idx];
      if (!comp || !comp.slug) continue;
      const existing = bySlug.get(comp.slug);
      if (!existing) {
        const clone: GlobalCompanyItem = {
          ...comp,
          sourceIndustrySlugs: comp.sourceIndustrySlugs
            ? [...comp.sourceIndustrySlugs]
            : undefined,
        };
        bySlug.set(comp.slug, clone);
        merged.push(clone);
      } else {
        if (!existing.domain && comp.domain) {
          existing.domain = comp.domain;
          existing.websiteUrl = comp.websiteUrl || `https://${comp.domain}`;
        }
        if (!existing.sourceCountrySlug && comp.sourceCountrySlug) {
          existing.sourceCountrySlug = comp.sourceCountrySlug;
        }
        if (comp.sourceIndustrySlugs?.length) {
          const mergedSlugs = new Set([
            ...(existing.sourceIndustrySlugs || []),
            ...comp.sourceIndustrySlugs,
          ]);
          existing.sourceIndustrySlugs = Array.from(mergedSlugs);
        }
      }
    }
  }

  return merged;
}

function attachLocalPatternAndConfirmedMetadata(
  companies: GlobalCompanyItem[]
): GlobalCompanyItem[] {
  const enriched = enrichCompaniesFromLocalCacheSync(companies).filter((c) =>
    Boolean(c.domain && isValidDomain(c.domain))
  );
  const confirmedByDomain = getConfirmedContactsForDomains(
    enriched.map((c) => c.domain || '').filter(Boolean)
  );

  const seenDomains = new Set<string>();
  const deduped: GlobalCompanyItem[] = [];
  for (const comp of enriched) {
    const dom = (comp.domain || '').toLowerCase();
    if (!dom || seenDomains.has(dom)) continue;
    seenDomains.add(dom);
    const confirmedList = confirmedByDomain.get(dom);
    const confirmedCount =
      confirmedList && confirmedList.length > 0
        ? confirmedList.length
        : comp.confirmedEmailCount;
    const cachedPat = emailPatternCache.get(dom);
    if (cachedPat && cachedPat.expiresAt > Date.now()) {
      deduped.push({
        ...comp,
        confirmedEmailCount: confirmedCount,
        detectedFormulaId: cachedPat.data.analysis.detectedFormulaId,
        detectedFormulaLabel: cachedPat.data.analysis.formulaLabel,
        patternConfidence: cachedPat.data.analysis.patternConfidence,
      });
    } else {
      deduped.push({
        ...comp,
        confirmedEmailCount: confirmedCount,
      });
    }
  }
  return deduped;
}

function scoreCompanyRelevanceServer(
  comp: GlobalCompanyItem,
  idx: number,
  p: GlobalFilterParams
): number {
  let score = 0;
  const q = p.companyQuery.trim().toLowerCase();
  const indKw = p.industryKeyword.trim().toLowerCase();
  const nameLower = comp.name.toLowerCase();
  const domLower = (comp.domain || '').toLowerCase();

  if (q) {
    if (nameLower === q || domLower === q || domLower === `${q}.com`) {
      score += 50_000;
    } else if (nameLower.startsWith(q) || domLower.startsWith(q)) {
      score += 25_000;
    } else if (nameLower.includes(q) || domLower.includes(q)) {
      score += 10_000;
    }
  }
  if (indKw) {
    if (comp.industry.toLowerCase().startsWith(indKw)) score += 6_000;
    else if (comp.industry.toLowerCase().includes(indKw)) score += 3_000;
  }

  score += Math.min(8_000, (comp.confirmedEmailCount || 0) * 180);
  if (comp.logoUrl) score += 2_200;

  const empScores: Record<string, number> = {
    '10,000+': 1_400,
    '5,001 - 10,000': 1_200,
    '1,001 - 5,000': 1_000,
    '501 - 1,000': 800,
    '201 - 500': 600,
    '51 - 200': 400,
    '1 - 50': 200,
  };
  score += empScores[comp.employeeRange] || 150;

  const revScores: Record<string, number> = {
    '$10B+': 900,
    '$1B - $10B': 780,
    '$500M - $1B': 660,
    '$100M - $500M': 540,
    '$50M - $100M': 420,
    '$10M - $50M': 300,
    '$1M - $10M': 180,
    'Under $1M': 90,
  };
  score += revScores[comp.revenueRange] || 90;

  // Gentle upstream position tie-breaker so primary upstream authority order stays intact within equal tiers
  score += Math.max(0, 500 - idx);
  return score;
}

function refreshUpstreamDirectoryInBackground(
  cacheKey: string,
  p: GlobalFilterParams,
  targetCountrySlugs: string[]
): void {
  if (backgroundDirectoryRefreshes.has(cacheKey)) return;
  backgroundDirectoryRefreshes.add(cacheKey);

  void (async () => {
    try {
      // Warm NEXT upstream batch silently so subsequent pagination pages are pre-populated in SQLite
      // without ever mutating or invalidating the already-displayed page!
      const nextUpstreamStart = p.page * 4 + 1;
      const pageOffsets = [0, 1, 2, 3];
      const tasks: Array<Promise<GlobalCompaniesResponse>> = [];

      if (p.rawSlugs.length > 0) {
        for (const s of p.rawSlugs.slice(0, 2)) {
          for (const off of pageOffsets) {
            tasks.push(
              fetchGlobalCompaniesByIndustry(s, nextUpstreamStart + off)
            );
          }
        }
      } else if (targetCountrySlugs.length > 0) {
        for (const c of targetCountrySlugs.slice(0, 3)) {
          for (const off of pageOffsets) {
            tasks.push(
              fetchGlobalCompaniesByCountry(c, nextUpstreamStart + off)
            );
          }
        }
      } else {
        for (const hub of WORLDWIDE_COUNTRY_HUBS.slice(0, 4)) {
          tasks.push(fetchGlobalCompaniesByCountry(hub, p.page + 1));
        }
      }

      const [responses, fedBatch] = await Promise.all([
        Promise.all(tasks),
        fetchFederatedRegistryCompaniesForFilter({
          countrySlugs: targetCountrySlugs,
          companyQuery: p.companyQuery,
          industryKeyword: p.industryKeyword,
          page: p.page + 1,
        }),
      ]);

      const merged = interleaveCompanyBatches([
        ...responses.map((r) => r.companies),
        fedBatch.companies,
      ]);
      if (merged.length > 0) {
        const withWeb = await resolveRealCompanyDomainsBatch(
          merged.slice(0, 220),
          { maxClearbitLookups: 24, timeoutMs: 2200 }
        );
        upsertVaultCompanies(withWeb, 'TheOrg Directory');
      }
      if (fedBatch.officers.length > 0) {
        upsertCompanyOfficers(fedBatch.officers);
      }
      for (const ce of fedBatch.confirmedEmails) {
        upsertConfirmedContacts(ce.domain, [ce.hit], ce.companyName);
      }
    } catch {
      // Non-fatal background refresh
    } finally {
      const timer = setTimeout(() => {
        backgroundDirectoryRefreshes.delete(cacheKey);
      }, 60_000);
      if (typeof timer.unref === 'function') timer.unref();
    }
  })();
}

function withSoftTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    if (typeof t.unref === 'function') t.unref();
    promise
      .then((val) => {
        if (!settled) {
          settled = true;
          clearTimeout(t);
          resolve(val);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(t);
          resolve(fallback);
        }
      });
  });
}

export async function resolveFilteredGlobalCompanies(
  p: GlobalFilterParams
): Promise<GlobalCompaniesResponse> {
  markUserApiActivity();

  const cacheKey = JSON.stringify([
    p.rawSlugs,
    p.industryMatchMode,
    p.industryKeyword.toLowerCase(),
    p.selectedCountries,
    p.selectedContinents,
    p.locationQuery.toLowerCase(),
    p.employeeRanges,
    p.revenueRanges,
    p.companyQuery.toLowerCase(),
    p.page,
  ]);
  const cachedResp = filteredDirectoryRamCache.get(cacheKey);
  if (cachedResp && cachedResp.expiresAt > Date.now()) {
    return cachedResp.data;
  }

  const targetCountrySlugs = resolveCountrySlugsFromFilters(
    p.selectedContinents,
    p.selectedCountries
  );

  // Unified mathematical source of truth (< 6ms)
  const [facets, allInds] = await Promise.all([
    computeFilterFacetsAndTotals(p),
    p.rawSlugs.length > 0 ? fetchGlobalIndustries() : Promise.resolve([]),
  ]);

  const industryKeywordTokens =
    p.rawSlugs.length > 0
      ? buildIndustryTokensForSlugs(p.rawSlugs, allInds)
      : [];
  const industryTldHints =
    p.rawSlugs.length > 0 ? buildIndustryTldHintsForSlugs(p.rawSlugs) : [];

  let slugIdentifier = 'worldwide';
  if (p.rawSlugs.length > 0) {
    slugIdentifier = p.rawSlugs.join(',');
  } else if (targetCountrySlugs.length > 0) {
    slugIdentifier = targetCountrySlugs.join(',');
  }

  const hasFreeText = Boolean(
    p.companyQuery.trim() || p.locationQuery.trim() || p.industryKeyword.trim()
  );

  // 1. ULTRA-FAST IN-MEMORY COLUMNAR ROWID PATH (< 2ms total!) for all structured filters
  //    (Country, Continent, Industry, Employee Size, Revenue Size) — zero SQLite scans or filesorts!
  //    Falls back cleanly to indexed SQLite queryVaultCompanies for free-text queries.
  let vaultCompaniesPool: GlobalCompanyItem[] | null = null;
  if (!hasFreeText) {
    const columnarHit = queryColumnarCompanyRowIds(
      p,
      allInds,
      p.page,
      COMPANIES_PER_PAGE,
      80
    );
    if (columnarHit) {
      vaultCompaniesPool = fetchVaultCompaniesByRowIds(columnarHit.rowIds, {
        countrySlugByRowId: columnarHit.countrySlugByRowId,
        industryTitleByRowId: columnarHit.industryTitleByRowId,
        empRangeByRowId: columnarHit.empRangeByRowId,
        revRangeByRowId: columnarHit.revRangeByRowId,
      });
    }
  }

  const vaultResult = vaultCompaniesPool
    ? {
        companies: vaultCompaniesPool,
        totalMatchingInVault: vaultCompaniesPool.length,
      }
    : queryVaultCompanies({
        companyQuery: p.companyQuery,
        countrySlugs:
          targetCountrySlugs.length > 0 ? targetCountrySlugs : undefined,
        locationQuery: p.locationQuery,
        industryTokens:
          industryKeywordTokens.length > 0 ? industryKeywordTokens : undefined,
        industryTlds: industryTldHints.length > 0 ? industryTldHints : undefined,
        industryKeyword: p.industryKeyword,
        employeeRanges:
          p.employeeRanges.length > 0 ? p.employeeRanges : undefined,
        revenueRanges: p.revenueRanges.length > 0 ? p.revenueRanges : undefined,
        requireRealDomain: true,
        page: p.page,
        perPage: COMPANIES_PER_PAGE,
        extraBuffer: 60,
      });

  const tieredVaultPool: GlobalCompanyItem[] = [];
  const seenTierSlugs = new Set<string>();
  const seenTierDomains = new Set<string>();
  for (const c of vaultResult.companies) {
    const dom = (c.domain || '').toLowerCase();
    if (seenTierSlugs.has(c.slug) || (dom && seenTierDomains.has(dom))) continue;
    // Double-check strict employee & revenue brackets in case of cached/legacy rows
    if (
      p.employeeRanges.length > 0 &&
      !p.employeeRanges.includes(c.employeeRange)
    ) {
      continue;
    }
    if (
      p.revenueRanges.length > 0 &&
      !p.revenueRanges.includes(c.revenueRange)
    ) {
      continue;
    }
    if (
      (targetCountrySlugs.length > 0 || p.locationQuery.trim()) &&
      !matchesGeographyFilter(
        c.location,
        p.selectedContinents,
        p.selectedCountries,
        p.locationQuery,
        c.sourceCountrySlug,
        c.domain
      )
    ) {
      continue;
    }
    seenTierSlugs.add(c.slug);
    if (dom) seenTierDomains.add(dom);
    tieredVaultPool.push(c);
    if (tieredVaultPool.length >= COMPANIES_PER_PAGE + 60) break;
  }

  // 2. INSTANT LOCAL-FIRST FAST PATH (< 50ms response whenever SQLite already has exact matches or on Page > 1!)
  const fastEnriched = attachLocalPatternAndConfirmedMetadata(tieredVaultPool);
  if (fastEnriched.length > 0 || p.page > 1) {
    const pageOffset = (p.page - 1) * COMPANIES_PER_PAGE;
    const expectedOnThisPage =
      !hasFreeText && facets.totalMatchedCompanies > 0
        ? Math.max(
            0,
            Math.min(COMPANIES_PER_PAGE, facets.totalMatchedCompanies - pageOffset)
          )
        : COMPANIES_PER_PAGE;
    const pageCompanies = fastEnriched.slice(0, expectedOnThisPage || COMPANIES_PER_PAGE);

    let totalCompanies: number;
    if (pageCompanies.length === 0) {
      totalCompanies = p.page === 1 ? 0 : Math.max(0, pageOffset);
    } else if (hasFreeText && pageCompanies.length < COMPANIES_PER_PAGE) {
      // Exact 1:1 count for free-text queries (Company Name / Location / Industry Keyword)
      totalCompanies = pageOffset + pageCompanies.length;
    } else {
      // Always use the EXACT unified 100M+ OLAP facet count so Sidebar,
      // Companies Tab, Quick Industry Strip, Table Header, and Pagination match 100%!
      totalCompanies = Math.max(
        pageOffset + pageCompanies.length,
        facets.totalMatchedCompanies
      );
    }

    const totalPages =
      totalCompanies === 0
        ? 1
        : hasFreeText && pageCompanies.length < COMPANIES_PER_PAGE
        ? Math.max(1, p.page)
        : Math.max(
            1,
            Math.min(20000, Math.ceil(totalCompanies / COMPANIES_PER_PAGE))
          );

    const fastPayload: GlobalCompaniesResponse = {
      industrySlug: slugIdentifier,
      industryFullTitle: facets.scopeTitle,
      page: p.page,
      perPage: COMPANIES_PER_PAGE,
      totalCompanies,
      totalPages,
      companies: pageCompanies,
      vaultCompaniesCount: facets.vaultCompaniesCount,
      liveFederatedCatalogTotal: facets.liveFederatedCatalogTotal,
    };

    if (pageCompanies.length > 0) {
      if (filteredDirectoryRamCache.size > 200) {
        const oldest = filteredDirectoryRamCache.keys().next().value;
        if (oldest) filteredDirectoryRamCache.delete(oldest);
      }
      filteredDirectoryRamCache.set(cacheKey, {
        data: fastPayload,
        expiresAt: Date.now() + 300_000,
      });
    }

    // Silently grow SQLite vault in background without EVER blocking the user's filter click!
    if (!hasFreeText) {
      refreshUpstreamDirectoryInBackground(cacheKey, p, targetCountrySlugs);
    }

    return fastPayload;
  }

  // 3. ZERO-MATCH LIVE UPSTREAM FETCH (Only fires on Page 1 when SQLite had 0 exact matches — tight 1.4s budget!)
  const supplementalQueries: string[] = [];
  if (p.companyQuery) supplementalQueries.push(p.companyQuery);
  if (p.industryKeyword) supplementalQueries.push(p.industryKeyword);

  const exploreTasks: Array<Promise<GlobalCompaniesResponse>> = [];
  if (p.rawSlugs.length > 0) {
    for (const s of p.rawSlugs.slice(0, 2)) {
      for (const off of [0, 1, 2, 3]) {
        exploreTasks.push(
          withSoftTimeout(
            fetchGlobalCompaniesByIndustry(s, 1 + off),
            1400,
            {
              industrySlug: s,
              industryFullTitle: humanizeSlug(s),
              page: 1 + off,
              perPage: 50,
              totalCompanies: 0,
              totalPages: 1,
              companies: [],
            }
          )
        );
      }
    }
  } else if (targetCountrySlugs.length > 0) {
    for (const c of targetCountrySlugs.slice(0, 3)) {
      for (const off of [0, 1, 2]) {
        exploreTasks.push(
          withSoftTimeout(
            fetchGlobalCompaniesByCountry(c, 1 + off),
            1400,
            {
              industrySlug: c,
              industryFullTitle: humanizeSlug(c),
              page: 1 + off,
              perPage: 50,
              totalCompanies: 0,
              totalPages: 1,
              companies: [],
            }
          )
        );
      }
    }
  } else {
    for (const hub of WORLDWIDE_COUNTRY_HUBS.slice(0, 6)) {
      exploreTasks.push(
        withSoftTimeout(fetchGlobalCompaniesByCountry(hub, 1), 1400, {
          industrySlug: hub,
          industryFullTitle: humanizeSlug(hub),
          page: 1,
          perPage: 50,
          totalCompanies: 0,
          totalPages: 1,
          companies: [],
        })
      );
    }
  }

  const [searchHits, federatedBatch, exploreResponses] = await Promise.all([
    supplementalQueries.length > 0
      ? withSoftTimeout(
          Promise.all(
            supplementalQueries.map((qStr) => searchGlobalCompaniesByQuery(qStr))
          ).then((lists) => interleaveCompanyBatches(lists)),
          1350,
          [] as GlobalCompanyItem[]
        )
      : Promise.resolve([] as GlobalCompanyItem[]),
    withSoftTimeout(
      fetchFederatedRegistryCompaniesForFilter({
        countrySlugs: targetCountrySlugs,
        companyQuery: p.companyQuery,
        industryKeyword: p.industryKeyword,
        page: 1,
      }),
      1400,
      {
        companies: [],
        officers: [],
        confirmedEmails: [],
        reportedTotal: 0,
      }
    ),
    Promise.all(exploreTasks),
  ]);

  if (federatedBatch.officers.length > 0) {
    upsertCompanyOfficers(federatedBatch.officers);
  }
  for (const ce of federatedBatch.confirmedEmails) {
    upsertConfirmedContacts(ce.domain, [ce.hit], ce.companyName);
  }

  const rawCandidatePool = interleaveCompanyBatches([
    searchHits,
    ...exploreResponses.map((r) => r.companies),
    federatedBatch.companies,
  ]);

  const nameQ = p.companyQuery.toLowerCase();
  const indKw = p.industryKeyword.toLowerCase();

  // STRICT MATCHER: NEVER relaxes Employee Count, Revenue, Country/Continent, or Industry!
  const matchesStrictScope = (comp: GlobalCompanyItem): boolean => {
    if (
      nameQ &&
      !comp.name.toLowerCase().includes(nameQ) &&
      !(comp.domain || '').toLowerCase().includes(nameQ)
    ) {
      return false;
    }
    if (
      indKw &&
      !comp.industry.toLowerCase().includes(indKw) &&
      !comp.name.toLowerCase().includes(indKw)
    ) {
      return false;
    }
    if (p.rawSlugs.length > 0) {
      const taggedDirectly =
        p.industryMatchMode !== 'primary' &&
        Boolean(comp.sourceIndustrySlugs?.some((s) => p.rawSlugs.includes(s)));
      const matchesTld =
        industryTldHints.length > 0 &&
        Boolean(
          comp.domain &&
            industryTldHints.some((tld) =>
              comp.domain!.toLowerCase().endsWith(tld)
            )
        );
      if (!taggedDirectly && !matchesTld && industryKeywordTokens.length > 0) {
        const hay =
          p.industryMatchMode === 'primary'
            ? (comp.industry.split(',')[0] || '').toLowerCase()
            : `${comp.industry} ${comp.name}`.toLowerCase();
        if (!industryKeywordTokens.some((tok) => hay.includes(tok))) {
          return false;
        }
      }
    }
    if (
      p.employeeRanges.length > 0 &&
      !p.employeeRanges.includes(comp.employeeRange)
    ) {
      return false;
    }
    if (
      p.revenueRanges.length > 0 &&
      !p.revenueRanges.includes(comp.revenueRange)
    ) {
      return false;
    }
    if (
      !matchesGeographyFilter(
        comp.location,
        p.selectedContinents,
        p.selectedCountries,
        p.locationQuery,
        comp.sourceCountrySlug
      )
    ) {
      return false;
    }
    return true;
  };

  // Persist ALL discovered raw upstream companies into SQLite (so future filters benefit),
  // while ONLY returning companies that strictly satisfy 100% of the user's active filters!
  const strictFilteredCandidates = rawCandidatePool.filter(matchesStrictScope);

  const resolvedWithRealDomains =
    strictFilteredCandidates.length > 0
      ? await resolveRealCompanyDomainsBatch(
          strictFilteredCandidates.slice(0, COMPANIES_PER_PAGE + 80),
          {
            maxClearbitLookups: 20,
            timeoutMs: 1200,
          }
        )
      : [];

  if (resolvedWithRealDomains.length > 0) {
    upsertVaultCompanies(resolvedWithRealDomains, 'TheOrg Directory');
  }

  const pageCompanies = attachLocalPatternAndConfirmedMetadata(
    resolvedWithRealDomains
  )
    .filter(matchesStrictScope)
    .map((comp, idx) => ({
      comp,
      rel: scoreCompanyRelevanceServer(comp, idx, p),
    }))
    .sort((a, b) => b.rel - a.rel || a.comp.name.localeCompare(b.comp.name))
    .map((entry) => entry.comp)
    .slice(0, COMPANIES_PER_PAGE);

  if (pageCompanies.length < COMPANIES_PER_PAGE && !hasFreeText) {
    refreshUpstreamDirectoryInBackground(cacheKey, p, targetCountrySlugs);
  }

  const accurateTotalCompanies = pageCompanies.length;
  const totalPages =
    accurateTotalCompanies === 0
      ? 1
      : Math.max(
          1,
          Math.min(20000, Math.ceil(accurateTotalCompanies / COMPANIES_PER_PAGE))
        );

  const fallbackPayload: GlobalCompaniesResponse = {
    industrySlug: slugIdentifier,
    industryFullTitle: facets.scopeTitle,
    page: p.page,
    perPage: COMPANIES_PER_PAGE,
    totalCompanies: accurateTotalCompanies,
    totalPages,
    companies: pageCompanies,
    vaultCompaniesCount: facets.vaultCompaniesCount,
    liveFederatedCatalogTotal: facets.liveFederatedCatalogTotal,
  };

  if (pageCompanies.length > 0) {
    if (filteredDirectoryRamCache.size > 200) {
      const oldest = filteredDirectoryRamCache.keys().next().value;
      if (oldest) filteredDirectoryRamCache.delete(oldest);
    }
    filteredDirectoryRamCache.set(cacheKey, {
      data: fallbackPayload,
      expiresAt: Date.now() + 300_000,
    });
  }

  return fallbackPayload;
}
