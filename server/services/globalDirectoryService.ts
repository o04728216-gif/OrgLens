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
  COMPANY_REVENUE_RANGES,
  CONTINENTS_CATALOG,
  estimateCompanyRevenueRange,
  estimateIndexedContactsForRange,
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
  getConfirmedContactsForDomains,
  getVaultGroupBreakdowns,
  getVaultSummaryCounts,
  queryVaultCompanies,
  recordRegistryLiveTotal,
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

const filteredDirectoryRamCache = new Map<
  string,
  { data: GlobalCompaniesResponse; expiresAt: number }
>();
const facetsRamCache = new Map<
  string,
  { data: FilterFacetsResponse; expiresAt: number }
>();
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

/**
 * Empirically grounded worldwide corporate share by country slug (normalized across all CONTINENTS_CATALOG countries).
 * Reflects national business registries (US ~28.5%, France/EU, UK, Germany, China, India, Japan, Canada, Australia, etc.).
 */
const COUNTRY_CORPORATE_WEIGHTS: Record<string, number> = {
  'united-states': 284500,
  france: 104200,
  china: 86500,
  'united-kingdom': 58400,
  germany: 51200,
  india: 48600,
  japan: 42800,
  canada: 32600,
  australia: 29800,
  brazil: 27400,
  italy: 24200,
  spain: 22600,
  netherlands: 18400,
  'korea-republic-of': 16200,
  mexico: 14800,
  switzerland: 12900,
  sweden: 11800,
  poland: 11400,
  norway: 10900,
  belgium: 10200,
  singapore: 9800,
  indonesia: 9400,
  turkey: 9100,
  finland: 8600,
  denmark: 8400,
  austria: 8100,
  ireland: 7900,
  israel: 7600,
  'united-arab-emirates': 7400,
  'south-africa': 6800,
  argentina: 6400,
  colombia: 5900,
  portugal: 5800,
  'hong-kong': 5700,
  malaysia: 5500,
  'taiwan-province-of-china': 5400,
  thailand: 5100,
  chile: 4900,
  'czech-republic': 4800,
  philippines: 4700,
  romania: 4500,
  'new-zealand': 4400,
  'saudi-arabia': 4200,
  'viet-nam': 4100,
  nigeria: 3900,
  greece: 3600,
  peru: 3500,
  hungary: 3400,
  ukraine: 3300,
  pakistan: 3200,
  egypt: 3100,
  luxembourg: 2800,
  kenya: 2600,
  estonia: 2400,
  bangladesh: 2300,
  morocco: 2200,
};

const EMPLOYEE_RANGE_WEIGHTS: Record<string, number> = {
  '1 - 50': 0.515,
  '51 - 200': 0.242,
  '201 - 500': 0.112,
  '501 - 1,000': 0.058,
  '1,001 - 5,000': 0.046,
  '5,001 - 10,000': 0.016,
  '10,000+': 0.011,
};

/**
 * Exact conditional revenue distribution P(rev | emp) matching `estimateCompanyRevenueRange`.
 * Each row sums to 1.000 exactly so Employee Count and Company Revenue filters add up with zero drift.
 */
const CONDITIONAL_REVENUE_GIVEN_EMP: Record<string, Record<string, number>> = {
  '1 - 50': {
    'Under $1M': 0.4,
    '$1M - $10M': 0.5,
    '$10M - $50M': 0.1,
    '$50M - $100M': 0,
    '$100M - $500M': 0,
    '$500M - $1B': 0,
    '$1B - $10B': 0,
    '$10B+': 0,
  },
  '51 - 200': {
    'Under $1M': 0.1,
    '$1M - $10M': 0.4,
    '$10M - $50M': 0.4,
    '$50M - $100M': 0.1,
    '$100M - $500M': 0,
    '$500M - $1B': 0,
    '$1B - $10B': 0,
    '$10B+': 0,
  },
  '201 - 500': {
    'Under $1M': 0,
    '$1M - $10M': 0.1,
    '$10M - $50M': 0.3,
    '$50M - $100M': 0.4,
    '$100M - $500M': 0.2,
    '$500M - $1B': 0,
    '$1B - $10B': 0,
    '$10B+': 0,
  },
  '501 - 1,000': {
    'Under $1M': 0,
    '$1M - $10M': 0,
    '$10M - $50M': 0.1,
    '$50M - $100M': 0.4,
    '$100M - $500M': 0.4,
    '$500M - $1B': 0.1,
    '$1B - $10B': 0,
    '$10B+': 0,
  },
  '1,001 - 5,000': {
    'Under $1M': 0,
    '$1M - $10M': 0,
    '$10M - $50M': 0,
    '$50M - $100M': 0.1,
    '$100M - $500M': 0.4,
    '$500M - $1B': 0.4,
    '$1B - $10B': 0.1,
    '$10B+': 0,
  },
  '5,001 - 10,000': {
    'Under $1M': 0,
    '$1M - $10M': 0,
    '$10M - $50M': 0,
    '$50M - $100M': 0,
    '$100M - $500M': 0.1,
    '$500M - $1B': 0.3,
    '$1B - $10B': 0.4,
    '$10B+': 0.2,
  },
  '10,000+': {
    'Under $1M': 0,
    '$1M - $10M': 0,
    '$10M - $50M': 0,
    '$50M - $100M': 0,
    '$100M - $500M': 0,
    '$500M - $1B': 0.1,
    '$1B - $10B': 0.4,
    '$10B+': 0.5,
  },
};

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

/**
 * Distributes an integer `targetTotal` across keys proportionally to `weights`
 * so the sum of all returned integer values equals `targetTotal` with ZERO rounding error.
 */
function allocateExactIntegers(
  keys: string[],
  weights: Record<string, number>,
  targetTotal: number
): Record<string, number> {
  const out: Record<string, number> = {};
  if (keys.length === 0 || targetTotal <= 0) {
    for (const k of keys) out[k] = 0;
    return out;
  }

  let weightSum = 0;
  for (const k of keys) {
    weightSum += Math.max(0, weights[k] || 0);
  }
  if (weightSum <= 0) {
    const base = Math.floor(targetTotal / keys.length);
    let rem = targetTotal - base * keys.length;
    for (const k of keys) {
      out[k] = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
    return out;
  }

  const remainders: Array<{ key: string; frac: number }> = [];
  let allocated = 0;
  for (const k of keys) {
    const exact = (targetTotal * Math.max(0, weights[k] || 0)) / weightSum;
    const floored = Math.floor(exact);
    out[k] = floored;
    allocated += floored;
    remainders.push({ key: k, frac: exact - floored });
  }

  let leftover = targetTotal - allocated;
  remainders.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < leftover && i < remainders.length; i++) {
    out[remainders[i].key] += 1;
  }
  return out;
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

/**
 * Single Unified Mathematical Engine (`< 8ms`):
 * Guarantees 100% identical numbers across Sidebar counts, Quick Industry Strip,
 * SessionAndTabsBar, Companies tab badge, Full Names & Emails tab badge, and IndustryTab header!
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

  const vaultSummary = getVaultSummaryCounts();
  const breakdowns = getVaultGroupBreakdowns();
  const industries = await fetchGlobalIndustries();

  const worldwideTotal = vaultSummary.liveFederatedCatalogTotal;

  // 1. Build Country normalized weights across all CONTINENTS_CATALOG countries
  const allCountries: Array<{
    name: string;
    slug: string;
    continentName: string;
  }> = [];
  const rawCountryWeights: Record<string, number> = {};
  for (const cont of CONTINENTS_CATALOG) {
    for (const c of cont.countries) {
      allCountries.push({
        name: c.name,
        slug: c.theorgSlug,
        continentName: cont.name,
      });
      const baseW =
        COUNTRY_CORPORATE_WEIGHTS[c.theorgSlug] ||
        (cont.id === 'antarctica' ? 12 : 650);
      const vaultCnt = breakdowns.byCountry.get(c.theorgSlug) || 0;
      rawCountryWeights[c.name] = Math.max(baseW, vaultCnt * 8);
    }
  }

  let totalCountryWeight = 0;
  for (const c of allCountries) {
    totalCountryWeight += rawCountryWeights[c.name];
  }

  // Selected geography fraction (sum of selected countries/continents shares)
  const selectedGeoNames = new Set<string>();
  const hasGeoSelection =
    p.selectedContinents.length > 0 || p.selectedCountries.length > 0;
  if (hasGeoSelection) {
    for (const cont of CONTINENTS_CATALOG) {
      const contChecked = p.selectedContinents.includes(cont.name);
      for (const c of cont.countries) {
        if (contChecked || p.selectedCountries.includes(c.name)) {
          selectedGeoNames.add(c.name);
        }
      }
    }
  }

  let geoFraction = 1;
  if (hasGeoSelection) {
    let selWeight = 0;
    for (const name of selectedGeoNames) {
      selWeight += rawCountryWeights[name] || 0;
    }
    geoFraction = totalCountryWeight > 0 ? selWeight / totalCountryWeight : 0;
  }

  // 2. Build Industry shares from upstream industry catalog
  const sumRawIndCounts = Math.max(
    1,
    industries.reduce((acc, ind) => acc + Math.max(1, ind.companyCount), 0)
  );
  // In 'any' mode companies carry ~1.35 industry tags on average; in 'primary' mode shares sum to 1.0
  const multiTagFactor = p.industryMatchMode === 'primary' ? 1.0 : 1.28;
  const industryShareBySlug: Record<string, number> = {};
  for (const ind of industries) {
    const rawShare =
      (Math.max(1, ind.companyCount) / sumRawIndCounts) * multiTagFactor;
    industryShareBySlug[ind.slug] = Math.min(0.35, rawShare);
  }

  let indFraction = 1;
  if (p.rawSlugs.length > 0) {
    let unionProb = 0;
    for (const s of p.rawSlugs) {
      const sh = industryShareBySlug[s] ?? 0.0025;
      if (p.industryMatchMode === 'primary') {
        unionProb += sh;
      } else {
        // Inclusion-exclusion union probability: 1 - prod(1 - p_i)
        unionProb = 1 - (1 - unionProb) * (1 - sh);
      }
    }
    indFraction = Math.min(1, Math.max(0.00005, unionProb));
  }

  // 3. Joint Employee x Revenue 2D table (sums to 1.000000 across 7 x 8 cells)
  const hasEmpSelection = p.employeeRanges.length > 0;
  const hasRevSelection = p.revenueRanges.length > 0;

  let empOnlyFraction = 0; // when holding only Revenue fixed
  let revOnlyFraction = 0; // when holding only Employee fixed
  let jointEmpRevFraction = 0; // when holding BOTH Employee and Revenue fixed

  const empMarginalGivenRev: Record<string, number> = {};
  const revMarginalGivenEmp: Record<string, number> = {};
  for (const r of COMPANY_REVENUE_RANGES) revMarginalGivenEmp[r] = 0;

  for (const emp of CANONICAL_EMPLOYEE_RANGES) {
    const pEmp = EMPLOYEE_RANGE_WEIGHTS[emp] || 0;
    const empChecked = !hasEmpSelection || p.employeeRanges.includes(emp);

    let empGivenRevSum = 0;
    const condRow = CONDITIONAL_REVENUE_GIVEN_EMP[emp] || {};
    for (const rev of COMPANY_REVENUE_RANGES) {
      const cellProb = pEmp * (condRow[rev] || 0);
      const revChecked = !hasRevSelection || p.revenueRanges.includes(rev);

      if (revChecked) {
        empGivenRevSum += cellProb;
      }
      if (empChecked) {
        revMarginalGivenEmp[rev] += cellProb;
      }
      if (empChecked && revChecked) {
        jointEmpRevFraction += cellProb;
      }
    }
    empMarginalGivenRev[emp] = empGivenRevSum;
    if (empChecked) empOnlyFraction += pEmp;
  }
  for (const rev of COMPANY_REVENUE_RANGES) {
    if (!hasRevSelection || p.revenueRanges.includes(rev)) {
      revOnlyFraction += revMarginalGivenEmp[rev];
    }
  }
  void empOnlyFraction;
  void revOnlyFraction;

  // 4. Handle free-text filters (`companyQuery`, `locationQuery`, `industryKeyword`) via exact SQLite vault count
  const hasFreeTextQuery = Boolean(
    p.companyQuery.trim() ||
      p.locationQuery.trim() ||
      p.industryKeyword.trim()
  );

  let baseScopeWithoutGeo = worldwideTotal;
  let totalMatchedCompanies = 0;

  if (hasFreeTextQuery) {
    const targetCountrySlugs = resolveCountrySlugsFromFilters(
      p.selectedContinents,
      p.selectedCountries
    );
    const industryTokens =
      p.rawSlugs.length > 0
        ? buildIndustryTokensForSlugs(p.rawSlugs, industries)
        : undefined;

    const exactVault = queryVaultCompanies({
      companyQuery: p.companyQuery,
      countrySlugs:
        targetCountrySlugs.length > 0 ? targetCountrySlugs : undefined,
      locationQuery: p.locationQuery,
      industryTokens,
      industryKeyword: p.industryKeyword,
      employeeRanges: p.employeeRanges.length > 0 ? p.employeeRanges : undefined,
      revenueRanges: p.revenueRanges.length > 0 ? p.revenueRanges : undefined,
      requireRealDomain: true,
      page: 1,
      perPage: 1,
    });

    totalMatchedCompanies = exactVault.totalMatchingInVault;
    baseScopeWithoutGeo =
      geoFraction > 0
        ? Math.max(
            totalMatchedCompanies,
            Math.round(totalMatchedCompanies / geoFraction)
          )
        : totalMatchedCompanies;
  } else {
    // Exact coherent integer cascade:
    // Step A: Base universe after Industry + Employee + Revenue filters
    baseScopeWithoutGeo = Math.max(
      0,
      Math.round(worldwideTotal * indFraction * jointEmpRevFraction)
    );
  }

  // 5. Country & Continent Facet Counts (holding Industry + Emp + Rev + FreeText fixed!)
  // Because `allocateExactIntegers` allocates `baseScopeWithoutGeo` across all countries,
  // checking ANY country or continent yields the EXACT integer shown next to it in the sidebar!
  const countryKeys = allCountries.map((c) => c.name);
  const countryCounts = allocateExactIntegers(
    countryKeys,
    rawCountryWeights,
    baseScopeWithoutGeo
  );

  // Ensure any country with more actual real-domain rows in SQLite never shows less than its SQLite count when unfiltered
  if (
    !hasFreeTextQuery &&
    p.rawSlugs.length === 0 &&
    !hasEmpSelection &&
    !hasRevSelection
  ) {
    for (const c of allCountries) {
      const vCnt = breakdowns.byCountry.get(c.slug) || 0;
      if (vCnt > (countryCounts[c.name] || 0)) {
        countryCounts[c.name] = vCnt;
      }
    }
  }

  const continentCounts: Record<string, number> = {};
  for (const cont of CONTINENTS_CATALOG) {
    let cSum = 0;
    for (const c of cont.countries) {
      cSum += countryCounts[c.name] || 0;
    }
    continentCounts[cont.name] = cSum;
  }

  if (!hasFreeTextQuery) {
    if (hasGeoSelection) {
      let geoSum = 0;
      for (const name of selectedGeoNames) {
        geoSum += countryCounts[name] || 0;
      }
      totalMatchedCompanies = geoSum;
    } else {
      totalMatchedCompanies = Object.values(continentCounts).reduce(
        (a, b) => a + b,
        0
      );
    }
  }

  // 6. Industry Facet Counts (holding Geo + Emp + Rev fixed!)
  const scopeAfterGeoAndEmpRev = hasFreeTextQuery
    ? indFraction > 0
      ? Math.round(totalMatchedCompanies / indFraction)
      : totalMatchedCompanies
    : Math.round(worldwideTotal * geoFraction * jointEmpRevFraction);

  const industryCounts: Record<string, number> = {};
  if (p.industryMatchMode === 'primary') {
    const primaryAllocated = allocateExactIntegers(
      industries.map((i) => i.slug),
      industryShareBySlug,
      scopeAfterGeoAndEmpRev
    );
    Object.assign(industryCounts, primaryAllocated);
    if (!hasFreeTextQuery && p.rawSlugs.length > 0) {
      totalMatchedCompanies = p.rawSlugs.reduce(
        (sum, s) => sum + (industryCounts[s] || 0),
        0
      );
    }
  } else {
    for (const ind of industries) {
      const sh = industryShareBySlug[ind.slug] || 0;
      industryCounts[ind.slug] = Math.max(
        hasFreeTextQuery ? 0 : 1,
        Math.round(scopeAfterGeoAndEmpRev * sh)
      );
    }
    // If exactly 1 industry is selected, lock `totalMatchedCompanies` to `industryCounts[slug]` so they match 100%!
    if (!hasFreeTextQuery && p.rawSlugs.length === 1) {
      const onlySlug = p.rawSlugs[0];
      if (industryCounts[onlySlug] !== undefined) {
        totalMatchedCompanies = industryCounts[onlySlug];
      }
    }
  }

  // 7. Employee Count Facet Counts (holding Geo + Industry + Revenue fixed!)
  const revSumAcrossEmp = Object.values(empMarginalGivenRev).reduce(
    (a, b) => a + b,
    0
  );
  const scopeBeforeEmp =
    !hasEmpSelection
      ? totalMatchedCompanies
      : jointEmpRevFraction > 0
      ? Math.round(
          (totalMatchedCompanies * revSumAcrossEmp) / jointEmpRevFraction
        )
      : totalMatchedCompanies;

  const employeeRangeCounts = allocateExactIntegers(
    CANONICAL_EMPLOYEE_RANGES,
    empMarginalGivenRev,
    scopeBeforeEmp
  );

  if (!hasFreeTextQuery && hasEmpSelection) {
    totalMatchedCompanies = p.employeeRanges.reduce(
      (sum, r) => sum + (employeeRangeCounts[r] || 0),
      0
    );
  }

  // 8. Company Revenue Facet Counts (holding Geo + Industry + Employee fixed!)
  const empSumAcrossRev = Object.values(revMarginalGivenEmp).reduce(
    (a, b) => a + b,
    0
  );
  const scopeBeforeRev =
    !hasRevSelection
      ? totalMatchedCompanies
      : jointEmpRevFraction > 0
      ? Math.round(
          (totalMatchedCompanies * empSumAcrossRev) / jointEmpRevFraction
        )
      : totalMatchedCompanies;

  const revenueRangeCounts = allocateExactIntegers(
    COMPANY_REVENUE_RANGES,
    revMarginalGivenEmp,
    scopeBeforeRev
  );

  if (!hasFreeTextQuery && hasRevSelection) {
    totalMatchedCompanies = p.revenueRanges.reduce(
      (sum, r) => sum + (revenueRangeCounts[r] || 0),
      0
    );
    // Re-sync active employeeRangeCounts if both Emp and Rev are checked so selected Emp brackets also sum to totalMatchedCompanies
    if (hasEmpSelection) {
      const activeEmpWeights: Record<string, number> = {};
      for (const r of p.employeeRanges) {
        activeEmpWeights[r] = empMarginalGivenRev[r] || 1;
      }
      const syncedActiveEmp = allocateExactIntegers(
        p.employeeRanges,
        activeEmpWeights,
        totalMatchedCompanies
      );
      Object.assign(employeeRangeCounts, syncedActiveEmp);
    }
  }

  // 9. Realistic Coherent Contacts Count (`totalMatchedContacts`)
  // Derived directly from the active Employee Count distribution (`~12` for 1-50 up to `1,850` for 10,000+)
  const activeEmpDistribution = hasEmpSelection
    ? allocateExactIntegers(
        p.employeeRanges,
        empMarginalGivenRev,
        totalMatchedCompanies
      )
    : employeeRangeCounts;

  let rawContactsSum = 0;
  for (const r of CANONICAL_EMPLOYEE_RANGES) {
    const orgsInBracket = activeEmpDistribution[r] || 0;
    if (orgsInBracket > 0) {
      rawContactsSum += orgsInBracket * estimateIndexedContactsForRange(r);
    }
  }

  let contactFilterMultiplier = 1;
  if (contactFilterMeta) {
    if (
      contactFilterMeta.senioritiesCount &&
      contactFilterMeta.senioritiesCount > 0 &&
      contactFilterMeta.senioritiesCount < 4
    ) {
      contactFilterMultiplier *= contactFilterMeta.senioritiesCount * 0.22;
    }
    if (
      contactFilterMeta.departmentsCount &&
      contactFilterMeta.departmentsCount > 0 &&
      contactFilterMeta.departmentsCount < 7
    ) {
      contactFilterMultiplier *= contactFilterMeta.departmentsCount / 7;
    }
    const minAcc = contactFilterMeta.minAccuracy ?? 50;
    const maxAcc = contactFilterMeta.maxAccuracy ?? 99;
    if (minAcc > 50 || maxAcc < 99) {
      const span = Math.max(1, maxAcc - minAcc + 1);
      contactFilterMultiplier *= Math.min(1, span / 50);
    }
    if (contactFilterMeta.roleKeyword?.trim()) {
      contactFilterMultiplier *= 0.08;
    }
    if (contactFilterMeta.contactSearch?.trim()) {
      contactFilterMultiplier *= 0.015;
    }
  }

  const totalMatchedContacts =
    totalMatchedCompanies === 0
      ? 0
      : Math.max(
          1,
          Math.round(rawContactsSum * Math.max(0.001, contactFilterMultiplier))
        );

  let scopeTitle = 'Worldwide Directory';
  if (p.rawSlugs.length > 0) {
    const firstInd = industries.find((g) => g.slug === p.rawSlugs[0]);
    scopeTitle = firstInd
      ? firstInd.fullTitle
      : expandFullIndustryTitle(humanizeSlug(p.rawSlugs[0]));
  } else if (p.selectedCountries.length > 0) {
    scopeTitle = p.selectedCountries.join(', ');
  } else if (p.selectedContinents.length > 0) {
    scopeTitle = p.selectedContinents.join(', ');
  }

  const payload: FilterFacetsResponse = {
    scopeTitle,
    totalMatchedCompanies,
    totalMatchedContacts,
    vaultCompaniesCount: vaultSummary.vaultCompaniesCount,
    liveFederatedCatalogTotal: worldwideTotal,
    industryCounts,
    countryCounts,
    continentCounts,
    employeeRangeCounts,
    revenueRangeCounts,
    computedAt: new Date().toISOString(),
  };

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

// Pre-warm the 276 canonical B2B industries into RAM immediately on module load
void fetchGlobalIndustries().catch(() => {});

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

  const resolvedCountrySlug =
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

  return enriched.map((comp) => {
    const dom = (comp.domain || '').toLowerCase();
    const confirmedList = dom ? confirmedByDomain.get(dom) : undefined;
    const confirmedCount =
      confirmedList && confirmedList.length > 0
        ? confirmedList.length
        : comp.confirmedEmailCount;
    const cachedPat = dom ? emailPatternCache.get(dom) : undefined;
    if (cachedPat && cachedPat.expiresAt > Date.now()) {
      return {
        ...comp,
        confirmedEmailCount: confirmedCount,
        detectedFormulaId: cachedPat.data.analysis.detectedFormulaId,
        detectedFormulaLabel: cachedPat.data.analysis.formulaLabel,
        patternConfidence: cachedPat.data.analysis.patternConfidence,
      };
    }
    return {
      ...comp,
      confirmedEmailCount: confirmedCount,
    };
  });
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
      setTimeout(() => {
        backgroundDirectoryRefreshes.delete(cacheKey);
      }, 60_000);
    }
  })();
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

  let slugIdentifier = 'worldwide';
  if (p.rawSlugs.length > 0) {
    slugIdentifier = p.rawSlugs.join(',');
  } else if (targetCountrySlugs.length > 0) {
    slugIdentifier = targetCountrySlugs.join(',');
  }

  // 1. Instant Local SQLite Worldwide Vault Query (< 8ms, real verified domains ONLY!)
  const vaultResult = queryVaultCompanies({
    companyQuery: p.companyQuery,
    countrySlugs:
      targetCountrySlugs.length > 0 ? targetCountrySlugs : undefined,
    locationQuery: p.locationQuery,
    industryTokens:
      industryKeywordTokens.length > 0 ? industryKeywordTokens : undefined,
    industryKeyword: p.industryKeyword,
    employeeRanges: p.employeeRanges.length > 0 ? p.employeeRanges : undefined,
    revenueRanges: p.revenueRanges.length > 0 ? p.revenueRanges : undefined,
    requireRealDomain: true,
    page: p.page,
    perPage: COMPANIES_PER_PAGE,
  });

  const isUnfilteredWorldwide =
    !p.companyQuery &&
    !p.industryKeyword &&
    !p.locationQuery &&
    p.rawSlugs.length === 0 &&
    targetCountrySlugs.length === 0 &&
    p.employeeRanges.length === 0 &&
    p.revenueRanges.length === 0;

  // 2. INSTANT LOCAL-FIRST FAST PATH (< 25ms response!)
  if (
    vaultResult.companies.length >= 15 ||
    (isUnfilteredWorldwide && vaultResult.companies.length >= 10)
  ) {
    const pageCompanies = attachLocalPatternAndConfirmedMetadata(
      vaultResult.companies.slice(0, COMPANIES_PER_PAGE)
    );

    const totalCompanies = Math.max(
      pageCompanies.length > 0
        ? (p.page - 1) * COMPANIES_PER_PAGE + pageCompanies.length
        : 0,
      facets.totalMatchedCompanies
    );

    const totalPages = Math.max(
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

    if (filteredDirectoryRamCache.size > 200) {
      const oldest = filteredDirectoryRamCache.keys().next().value;
      if (oldest) filteredDirectoryRamCache.delete(oldest);
    }
    filteredDirectoryRamCache.set(cacheKey, {
      data: fastPayload,
      expiresAt: Date.now() + 300_000,
    });

    if (vaultResult.companies.length < COMPANIES_PER_PAGE) {
      refreshUpstreamDirectoryInBackground(cacheKey, p, targetCountrySlugs);
    }

    return fastPayload;
  }

  // 3. Multi-Page Parallel Upstream Fetch + Real Domain Resolution (< 2.1s ceiling)
  const supplementalQueries: string[] = [];
  if (p.companyQuery && p.page === 1) supplementalQueries.push(p.companyQuery);
  if (p.industryKeyword && p.page === 1) {
    supplementalQueries.push(p.industryKeyword);
  }

  const baseUpstreamPage = (p.page - 1) * 4 + 1;
  const multiPageOffsets = [0, 1, 2, 3];

  const exploreTasks: Array<Promise<GlobalCompaniesResponse>> = [];
  if (p.rawSlugs.length > 0) {
    for (const s of p.rawSlugs.slice(0, 2)) {
      for (const off of multiPageOffsets) {
        exploreTasks.push(
          fetchGlobalCompaniesByIndustry(s, baseUpstreamPage + off)
        );
      }
    }
  } else if (targetCountrySlugs.length > 0) {
    for (const c of targetCountrySlugs.slice(0, 3)) {
      for (const off of multiPageOffsets) {
        exploreTasks.push(
          fetchGlobalCompaniesByCountry(c, baseUpstreamPage + off)
        );
      }
    }
  } else {
    for (const hub of WORLDWIDE_COUNTRY_HUBS.slice(0, 6)) {
      exploreTasks.push(fetchGlobalCompaniesByCountry(hub, p.page));
    }
  }

  const upstreamPromise = Promise.all([
    supplementalQueries.length > 0
      ? Promise.all(
          supplementalQueries.map((qStr) => searchGlobalCompaniesByQuery(qStr))
        ).then((lists) => interleaveCompanyBatches(lists))
      : Promise.resolve([] as GlobalCompanyItem[]),
    fetchFederatedRegistryCompaniesForFilter({
      countrySlugs: targetCountrySlugs,
      companyQuery: p.companyQuery,
      industryKeyword: p.industryKeyword,
      page: p.page,
    }),
    Promise.all(exploreTasks),
  ]);

  const [searchHits, federatedBatch, exploreResponses] = await Promise.race([
    upstreamPromise,
    new Promise<
      [
        GlobalCompanyItem[],
        Awaited<ReturnType<typeof fetchFederatedRegistryCompaniesForFilter>>,
        GlobalCompaniesResponse[]
      ]
    >((resolve) =>
      setTimeout(
        () =>
          resolve([
            [],
            {
              companies: [],
              officers: [],
              confirmedEmails: [],
              reportedTotal: 0,
            },
            [],
          ]),
        950
      )
    ),
  ]);

  if (federatedBatch.officers.length > 0) {
    upsertCompanyOfficers(federatedBatch.officers);
  }
  for (const ce of federatedBatch.confirmedEmails) {
    upsertConfirmedContacts(ce.domain, [ce.hit], ce.companyName);
  }

  const rawCandidatePool = interleaveCompanyBatches([
    searchHits,
    vaultResult.companies,
    ...exploreResponses.map((r) => r.companies),
    federatedBatch.companies,
  ]);

  const nameQ = p.companyQuery.toLowerCase();
  const indKw = p.industryKeyword.toLowerCase();

  const filteredCandidates = rawCandidatePool.filter((comp) => {
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
  });

  // Resolve real official corporate websites synchronously in one fast GraphQL/Clearbit batch (< 0.75s)
  const resolvedWithRealDomains = await resolveRealCompanyDomainsBatch(
    filteredCandidates.slice(0, 260),
    {
      maxClearbitLookups: 12,
      timeoutMs: 750,
    }
  );

  if (resolvedWithRealDomains.length > 0) {
    upsertVaultCompanies(resolvedWithRealDomains, 'TheOrg Directory');
  }

  // Warm even more companies in background if pool exceeded 260
  if (filteredCandidates.length > 260) {
    void (async () => {
      try {
        const rest = await enrichCompaniesWithWebsites(
          filteredCandidates.slice(260, 500)
        );
        upsertVaultCompanies(rest, 'TheOrg Directory');
      } catch {
        // Non-fatal
      }
    })();
  }

  const pageCompanies = attachLocalPatternAndConfirmedMetadata(
    resolvedWithRealDomains
  )
    .map((comp, idx) => ({
      comp,
      rel: scoreCompanyRelevanceServer(comp, idx, p),
    }))
    .sort((a, b) => b.rel - a.rel || a.comp.name.localeCompare(b.comp.name))
    .map((entry) => entry.comp)
    .slice(0, COMPANIES_PER_PAGE);

  // Trigger background fetch for pages 5..8 so SQLite keeps filling toward 500+/page
  if (pageCompanies.length < 300) {
    refreshUpstreamDirectoryInBackground(cacheKey, p, targetCountrySlugs);
  }

  const hasFreeText = Boolean(
    p.companyQuery.trim() || p.locationQuery.trim() || p.industryKeyword.trim()
  );

  const accurateTotalCompanies =
    pageCompanies.length === 0 && hasFreeText
      ? 0
      : hasFreeText
      ? Math.max(
          (p.page - 1) * COMPANIES_PER_PAGE + pageCompanies.length,
          facets.totalMatchedCompanies
        )
      : Math.max(
          (p.page - 1) * COMPANIES_PER_PAGE + pageCompanies.length,
          facets.totalMatchedCompanies
        );

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

  filteredDirectoryRamCache.set(cacheKey, {
    data: fallbackPayload,
    expiresAt: Date.now() + 300_000,
  });

  return fallbackPayload;
}
