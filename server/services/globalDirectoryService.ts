import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Request } from 'express';
import type {
  GlobalCompaniesResponse,
  GlobalCompanyItem,
  GlobalIndustryOption,
} from '../../src/types.ts';
import { expandFullIndustryTitle } from '../../src/utils/emailFormulas.ts';
import {
  estimateCompanyRevenueRange,
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
  COMPANIES_PER_PAGE,
  FALLBACK_GLOBAL_INDUSTRIES,
  INDUSTRY_SYNONYM_MAP,
  WORLDWIDE_DEFAULT_HUBS,
  WORLDWIDE_TOTAL_COMPANIES,
} from '../data/directoryTaxonomy.ts';
import type { GlobalFilterParams } from '../types.ts';
import {
  browserHeaders,
  buildFallbackDomainFromSlug,
  cleanWhitespace,
  formatEmployeeRangeLabel,
  humanizeSlug,
  isValidDomain,
  mapWithConcurrency,
  normalizeDomain,
} from '../utils/textAndDomain.ts';
import {
  enrichCompaniesWithWebsites,
  queryTheOrgGraphQL,
} from './theOrgClient.ts';

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

export async function fetchGlobalIndustries(): Promise<GlobalIndustryOption[]> {
  const cached = getCachedGlobalIndustries();
  if (cached) return cached;

  try {
    const resp = await axios.get('https://theorg.com/explore/industries', {
      timeout: 8000,
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

      if (parsed.length > 20) {
        parsed.sort((a, b) => b.companyCount - a.companyCount);
        setCachedGlobalIndustries(parsed);
        return parsed;
      }
    }
  } catch {
    // Fallback below
  }

  return FALLBACK_GLOBAL_INDUSTRIES;
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
    .filter((d) => isValidDomain(d));
  const rawSocial = c.social as { websiteUrl?: string } | undefined;
  const socialDomain = rawSocial?.websiteUrl
    ? normalizeDomain(String(rawSocial.websiteUrl))
    : '';
  const directDomain =
    (isValidDomain(socialDomain) ? socialDomain : '') || parsedExts[0] || '';
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
    sourceCountrySlug: meta?.sourceCountrySlug,
    sourceIndustrySlugs: meta?.sourceIndustrySlug
      ? [meta.sourceIndustrySlug]
      : undefined,
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
        timeout: 5000,
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
        timeout: 5000,
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
  }>(gql, { query: cleanQ });

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

function buildTargetPages(
  userPage: number,
  count: number,
  needsStratifiedDepth: boolean,
  waveOffset = 0
): number[] {
  const pages: number[] = [];
  const seen = new Set<number>();

  if (!needsStratifiedDepth && waveOffset === 0) {
    const start = (((userPage - 1) * count) % 190) + 1;
    for (let i = 0; i < count; i++) {
      const pg = ((start + i - 1) % 200) + 1;
      if (!seen.has(pg)) {
        seen.add(pg);
        pages.push(pg);
      }
    }
    return pages;
  }

  const strataAnchors =
    waveOffset === 0
      ? [1, 2, 4, 7, 11, 16, 22, 30, 40, 52, 68, 86, 108, 134, 162, 190]
      : [3, 5, 8, 13, 19, 26, 35, 46, 60, 76, 96, 120, 148, 176, 184, 198];

  const shift = (userPage - 1) * 3;
  for (let i = 0; i < strataAnchors.length && pages.length < count; i++) {
    const pg = ((strataAnchors[i] + shift - 1) % 200) + 1;
    if (!seen.has(pg)) {
      seen.add(pg);
      pages.push(pg);
    }
  }
  return pages;
}

function buildIndustryTokensForSlugs(
  slugs: string[],
  allInds: GlobalIndustryOption[]
): string[] {
  const tokens = new Set<string>();
  for (const s of slugs) {
    const found = allInds.find((g) => g.slug === s);
    const label = found
      ? `${found.rawTitle} ${found.fullTitle}`
      : humanizeSlug(s);
    for (const word of label.toLowerCase().split(/[^a-z0-9]+/)) {
      if (
        word.length >= 3 &&
        !['and', 'the', 'for', 'services'].includes(word)
      ) {
        tokens.add(word);
      }
    }
    for (const syn of INDUSTRY_SYNONYM_MAP[s] || []) {
      tokens.add(syn.toLowerCase());
    }
  }
  return Array.from(tokens);
}

export async function resolveFilteredGlobalCompanies(
  p: GlobalFilterParams
): Promise<GlobalCompaniesResponse> {
  const targetCountrySlugs = resolveCountrySlugsFromFilters(
    p.selectedContinents,
    p.selectedCountries
  );
  const hasSizeOrRevFilter =
    p.employeeRanges.length > 0 || p.revenueRanges.length > 0;
  const allInds = p.rawSlugs.length > 0 ? await fetchGlobalIndustries() : [];

  const supplementalQueries: string[] = [];
  if (p.companyQuery && p.page === 1) {
    supplementalQueries.push(p.companyQuery);
  }
  if (p.industryKeyword && p.page === 1) {
    supplementalQueries.push(p.industryKeyword);
  }
  if (targetCountrySlugs.length > 0 && p.rawSlugs.length > 0 && p.page === 1) {
    const indName =
      allInds.find((g) => g.slug === p.rawSlugs[0])?.rawTitle ||
      humanizeSlug(p.rawSlugs[0]);
    for (const cSlug of targetCountrySlugs.slice(0, 2)) {
      supplementalQueries.push(`${indName} ${humanizeSlug(cSlug)}`);
    }
  }

  const searchHitsPromise =
    supplementalQueries.length > 0
      ? Promise.all(
          supplementalQueries.map((qStr) => searchGlobalCompaniesByQuery(qStr))
        ).then((lists) => interleaveCompanyBatches(lists))
      : Promise.resolve([] as GlobalCompanyItem[]);

  let rawCandidatePool: GlobalCompanyItem[] = [];
  let countryCatalogTotal = WORLDWIDE_TOTAL_COMPANIES;
  let industryCatalogTotal = WORLDWIDE_TOTAL_COMPANIES;
  let displayTitle = 'Worldwide Directory';
  let slugIdentifier = 'worldwide';

  if (targetCountrySlugs.length > 0 && p.rawSlugs.length > 0) {
    const indPages = buildTargetPages(
      p.page,
      p.rawSlugs.length === 1 ? 12 : 6,
      hasSizeOrRevFilter,
      0
    );
    const cPages = buildTargetPages(
      p.page,
      targetCountrySlugs.length === 1
        ? 10
        : targetCountrySlugs.length <= 4
        ? 4
        : 1,
      hasSizeOrRevFilter,
      0
    );

    const indTasks = p.rawSlugs
      .slice(0, 4)
      .flatMap((indSlug) =>
        indPages.map((pg) => ({ kind: 'ind' as const, slug: indSlug, pg }))
      );
    const countryTasks = targetCountrySlugs
      .slice(0, 24)
      .flatMap((cSlug) =>
        cPages.map((pg) => ({ kind: 'country' as const, slug: cSlug, pg }))
      );

    const [searchHits, dualResponses] = await Promise.all([
      searchHitsPromise,
      mapWithConcurrency([...indTasks, ...countryTasks], 28, (task) =>
        task.kind === 'ind'
          ? fetchGlobalCompaniesByIndustry(task.slug, task.pg)
          : fetchGlobalCompaniesByCountry(task.slug, task.pg)
      ),
    ]);

    rawCandidatePool = interleaveCompanyBatches([
      searchHits,
      ...dualResponses.map((r) => r.companies),
    ]);

    const cTotals = new Map<string, number>();
    const iTotals = new Map<string, number>();
    dualResponses.forEach((r, idx) => {
      const task =
        idx < indTasks.length
          ? indTasks[idx]
          : countryTasks[idx - indTasks.length];
      if (task?.kind === 'ind') {
        if (!iTotals.has(task.slug) && r.totalCompanies > 0) {
          iTotals.set(task.slug, r.totalCompanies);
        }
      } else if (task?.kind === 'country') {
        if (!cTotals.has(task.slug) && r.totalCompanies > 0) {
          cTotals.set(task.slug, r.totalCompanies);
        }
      }
    });

    for (const s of p.rawSlugs) {
      if (!iTotals.has(s)) {
        const catMatch = allInds.find((g) => g.slug === s);
        if (catMatch?.companyCount) iTotals.set(s, catMatch.companyCount);
      }
    }

    const sumC = Array.from(cTotals.values()).reduce((a, b) => a + b, 0);
    const sumI = Array.from(iTotals.values()).reduce((a, b) => a + b, 0);
    countryCatalogTotal = sumC > 0 ? sumC : WORLDWIDE_TOTAL_COMPANIES;
    industryCatalogTotal = sumI > 0 ? sumI : WORLDWIDE_TOTAL_COMPANIES;

    const firstInd = allInds.find((g) => g.slug === p.rawSlugs[0]);
    displayTitle = firstInd
      ? firstInd.fullTitle
      : expandFullIndustryTitle(humanizeSlug(p.rawSlugs[0]));
    slugIdentifier = `${p.rawSlugs.join(',')}:${targetCountrySlugs
      .slice(0, 4)
      .join(',')}`;
  } else if (targetCountrySlugs.length > 0) {
    let countryResponses: GlobalCompaniesResponse[] = [];

    if (targetCountrySlugs.length === 1) {
      const singleCountry = targetCountrySlugs[0];
      const pagesToFetch = buildTargetPages(
        p.page,
        hasSizeOrRevFilter ? 14 : 10,
        hasSizeOrRevFilter,
        0
      );
      countryResponses = await mapWithConcurrency(pagesToFetch, 14, (pg) =>
        fetchGlobalCompaniesByCountry(singleCountry, pg)
      );
    } else if (targetCountrySlugs.length <= 5) {
      const pagesPerCountry = buildTargetPages(
        p.page,
        hasSizeOrRevFilter ? 5 : 4,
        hasSizeOrRevFilter,
        0
      );
      countryResponses = await mapWithConcurrency(
        targetCountrySlugs.flatMap((cSlug) =>
          pagesPerCountry.map((pg) => ({ cSlug, pg }))
        ),
        20,
        ({ cSlug, pg }) => fetchGlobalCompaniesByCountry(cSlug, pg)
      );
    } else {
      const activeSlice = targetCountrySlugs.slice(0, 28);
      const targetPg = hasSizeOrRevFilter
        ? buildTargetPages(p.page, 2, true, 0)
        : [((p.page - 1) % 200) + 1];
      countryResponses = await mapWithConcurrency(
        activeSlice.flatMap((cSlug) => targetPg.map((pg) => ({ cSlug, pg }))),
        28,
        ({ cSlug, pg }) => fetchGlobalCompaniesByCountry(cSlug, pg)
      );
    }

    const searchHits = await searchHitsPromise;
    rawCandidatePool = interleaveCompanyBatches([
      searchHits,
      ...countryResponses.map((r) => r.companies),
    ]);

    displayTitle =
      p.selectedCountries.length > 0
        ? p.selectedCountries.join(', ')
        : p.selectedContinents.join(', ');
    slugIdentifier = targetCountrySlugs.join(',');

    const uniqueCountryTotals = new Map<string, number>();
    for (const r of countryResponses) {
      if (!uniqueCountryTotals.has(r.industrySlug) && r.totalCompanies > 0) {
        uniqueCountryTotals.set(r.industrySlug, r.totalCompanies);
      }
    }
    const sumC = Array.from(uniqueCountryTotals.values()).reduce(
      (acc, n) => acc + n,
      0
    );
    countryCatalogTotal = sumC > 0 ? sumC : WORLDWIDE_TOTAL_COMPANIES;
  } else if (p.rawSlugs.length > 0) {
    let industryResponses: GlobalCompaniesResponse[] = [];

    if (p.rawSlugs.length === 1) {
      const slug = p.rawSlugs[0];
      const pagesToFetch = buildTargetPages(
        p.page,
        hasSizeOrRevFilter ? 14 : 10,
        hasSizeOrRevFilter,
        0
      );
      industryResponses = await mapWithConcurrency(pagesToFetch, 14, (pg) =>
        fetchGlobalCompaniesByIndustry(slug, pg)
      );
    } else {
      const activeSlugs = p.rawSlugs.slice(0, 6);
      const pagesPerSlug = buildTargetPages(
        p.page,
        hasSizeOrRevFilter ? 5 : 4,
        hasSizeOrRevFilter,
        0
      );
      industryResponses = await mapWithConcurrency(
        activeSlugs.flatMap((s) => pagesPerSlug.map((pg) => ({ s, pg }))),
        20,
        ({ s, pg }) => fetchGlobalCompaniesByIndustry(s, pg)
      );
    }

    const searchHits = await searchHitsPromise;
    rawCandidatePool = interleaveCompanyBatches([
      searchHits,
      ...industryResponses.map((r) => r.companies),
    ]);

    const uniqueIndustryTotals = new Map<string, number>();
    const uniqueTitles: string[] = [];
    for (const r of industryResponses) {
      if (!uniqueIndustryTotals.has(r.industrySlug) && r.totalCompanies > 0) {
        uniqueIndustryTotals.set(r.industrySlug, r.totalCompanies);
        if (r.industryFullTitle) uniqueTitles.push(r.industryFullTitle);
      }
    }
    for (const s of p.rawSlugs) {
      if (!uniqueIndustryTotals.has(s)) {
        const found = allInds.find((g) => g.slug === s);
        if (found?.companyCount) {
          uniqueIndustryTotals.set(s, found.companyCount);
        }
      }
    }
    const sumI = Array.from(uniqueIndustryTotals.values()).reduce(
      (acc, n) => acc + n,
      0
    );
    industryCatalogTotal = sumI > 0 ? sumI : WORLDWIDE_TOTAL_COMPANIES;
    slugIdentifier = p.rawSlugs.join(',');
    displayTitle =
      uniqueTitles[0] || expandFullIndustryTitle(humanizeSlug(p.rawSlugs[0]));
  } else {
    const hubPages = hasSizeOrRevFilter
      ? buildTargetPages(p.page, 2, true, 0)
      : [((p.page - 1) % 200) + 1];
    const [searchHits, hubResponses] = await Promise.all([
      searchHitsPromise,
      mapWithConcurrency(
        WORLDWIDE_DEFAULT_HUBS.flatMap((hubSlug) =>
          hubPages.map((pg) => ({ hubSlug, pg }))
        ),
        36,
        ({ hubSlug, pg }) => fetchGlobalCompaniesByCountry(hubSlug, pg)
      ),
    ]);
    rawCandidatePool = interleaveCompanyBatches([
      searchHits,
      ...hubResponses.map((r) => r.companies),
    ]);
    displayTitle = 'Worldwide Directory';
    slugIdentifier = 'worldwide';
  }

  const industryKeywordTokens =
    p.rawSlugs.length > 0
      ? buildIndustryTokensForSlugs(p.rawSlugs, allInds)
      : [];
  const nameQ = p.companyQuery.toLowerCase();
  const indKw = p.industryKeyword.toLowerCase();

  const matchesAllCriteria = (comp: GlobalCompanyItem): boolean => {
    if (nameQ && !comp.name.toLowerCase().includes(nameQ)) {
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
      if (!taggedDirectly && industryKeywordTokens.length > 0) {
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

  const hasSubFilters =
    Boolean(nameQ) ||
    Boolean(indKw) ||
    (targetCountrySlugs.length > 0 && p.rawSlugs.length > 0) ||
    p.industryMatchMode === 'primary' ||
    p.employeeRanges.length > 0 ||
    p.revenueRanges.length > 0 ||
    Boolean(p.locationQuery);

  let filteredCompanies = rawCandidatePool.filter(matchesAllCriteria);

  if (
    hasSubFilters &&
    filteredCompanies.length < COMPANIES_PER_PAGE &&
    !nameQ
  ) {
    const wave2Pages = buildTargetPages(p.page, 16, true, 1);
    let wave2Responses: GlobalCompaniesResponse[] = [];

    if (p.rawSlugs.length > 0 && targetCountrySlugs.length > 0) {
      const w2Ind = p.rawSlugs
        .slice(0, 2)
        .flatMap((s) =>
          wave2Pages
            .slice(0, 14)
            .map((pg) => ({ kind: 'ind' as const, s, pg }))
        );
      const w2C = targetCountrySlugs
        .slice(0, 6)
        .flatMap((s) =>
          wave2Pages.slice(0, 6).map((pg) => ({ kind: 'c' as const, s, pg }))
        );
      wave2Responses = await mapWithConcurrency(
        [...w2Ind, ...w2C],
        28,
        (item) =>
          item.kind === 'ind'
            ? fetchGlobalCompaniesByIndustry(item.s, item.pg)
            : fetchGlobalCompaniesByCountry(item.s, item.pg)
      );
    } else if (p.rawSlugs.length > 0) {
      wave2Responses = await mapWithConcurrency(
        p.rawSlugs
          .slice(0, 3)
          .flatMap((s) => wave2Pages.slice(0, 10).map((pg) => ({ s, pg }))),
        24,
        ({ s, pg }) => fetchGlobalCompaniesByIndustry(s, pg)
      );
    } else if (targetCountrySlugs.length > 0) {
      wave2Responses = await mapWithConcurrency(
        targetCountrySlugs
          .slice(0, 8)
          .flatMap((s) => wave2Pages.slice(0, 4).map((pg) => ({ s, pg }))),
        24,
        ({ s, pg }) => fetchGlobalCompaniesByCountry(s, pg)
      );
    } else {
      wave2Responses = await mapWithConcurrency(
        WORLDWIDE_DEFAULT_HUBS.slice(0, 24).map((hubSlug) => ({
          hubSlug,
          pg: wave2Pages[0] || 4,
        })),
        24,
        ({ hubSlug, pg }) => fetchGlobalCompaniesByCountry(hubSlug, pg)
      );
    }

    rawCandidatePool = interleaveCompanyBatches([
      rawCandidatePool,
      ...wave2Responses.map((r) => r.companies),
    ]);
    filteredCompanies = rawCandidatePool.filter(matchesAllCriteria);
  }

  const pageCompanies = filteredCompanies.slice(0, COMPANIES_PER_PAGE);

  const upperBoundTotal = Math.min(countryCatalogTotal, industryCatalogTotal);
  let accurateTotalCompanies = upperBoundTotal;

  if (pageCompanies.length === 0) {
    accurateTotalCompanies = 0;
  } else if (p.page === 1 && pageCompanies.length < COMPANIES_PER_PAGE) {
    accurateTotalCompanies = pageCompanies.length;
  } else if (hasSubFilters) {
    if (nameQ) {
      accurateTotalCompanies = filteredCompanies.length;
    } else {
      const ratio = Math.min(
        0.92,
        filteredCompanies.length / Math.max(1, rawCandidatePool.length)
      );
      const estimated = Math.round(upperBoundTotal * ratio);
      const minRequiredForCurrentPage =
        (p.page - 1) * COMPANIES_PER_PAGE + pageCompanies.length;
      accurateTotalCompanies = Math.min(
        upperBoundTotal,
        Math.max(minRequiredForCurrentPage, estimated)
      );
    }
  } else {
    const minRequiredForCurrentPage =
      (p.page - 1) * COMPANIES_PER_PAGE + pageCompanies.length;
    accurateTotalCompanies = Math.max(
      minRequiredForCurrentPage,
      upperBoundTotal
    );
  }

  const totalPages =
    accurateTotalCompanies === 0
      ? 1
      : Math.max(
          1,
          Math.min(2000, Math.ceil(accurateTotalCompanies / COMPANIES_PER_PAGE))
        );

  const enrichedPageCompanies = (
    await enrichCompaniesWithWebsites(pageCompanies)
  ).map((comp) => {
    const dom = (comp.domain || '').toLowerCase();
    const cachedPat = dom ? emailPatternCache.get(dom) : undefined;
    if (cachedPat && cachedPat.expiresAt > Date.now()) {
      return {
        ...comp,
        detectedFormulaId: cachedPat.data.analysis.detectedFormulaId,
        detectedFormulaLabel: cachedPat.data.analysis.formulaLabel,
        patternConfidence: cachedPat.data.analysis.patternConfidence,
      };
    }
    return comp;
  });

  return {
    industrySlug: slugIdentifier,
    industryFullTitle: displayTitle || 'Worldwide Directory',
    page: p.page,
    perPage: COMPANIES_PER_PAGE,
    totalCompanies: accurateTotalCompanies,
    totalPages,
    companies: enrichedPageCompanies,
  };
}
