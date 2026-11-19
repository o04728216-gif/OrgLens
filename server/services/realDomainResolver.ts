import axios from 'axios';
import dns from 'node:dns/promises';
import type { GlobalCompanyItem } from '../../src/types.ts';
import { slugToDomainCache, slugToWebsiteCache } from '../cache.ts';
import {
  getVerifiedDomainsFromVaultCache,
  saveVerifiedDomainsToVaultCache,
} from '../store/companyVaultDb.ts';
import {
  cleanWhitespace,
  extractDomainCore,
  isValidDomain,
  mapWithConcurrency,
  normalizeDomain,
  pickUserAgent,
  slugifyName,
} from '../utils/textAndDomain.ts';
import { queryTheOrgGraphQL } from './theOrgClient.ts';

const dnsLiveRamCache = new Map<
  string,
  { alive: boolean; hasMx: boolean; expiresAt: number }
>();

const DISALLOWED_PLATFORM_DOMAINS = new Set([
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'wikipedia.org',
  'wikidata.org',
  'bloomberg.com',
  'crunchbase.com',
  'theorg.com',
  'github.com',
  'npmjs.com',
  'sec.gov',
  'data.gouv.fr',
  'gleif.org',
  'opencorporates.com',
  'dnb.com',
  'zoominfo.com',
  'apollo.io',
  'yelp.com',
  'glassdoor.com',
  'indeed.com',
]);

const LEGAL_NOISE_WORDS = new Set([
  'the',
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'company',
  'co',
  'plc',
  'lp',
  'llp',
  'gmbh',
  'ag',
  'sa',
  'sas',
  'sarl',
  'bv',
  'nv',
  'oy',
  'oyj',
  'ab',
  'as',
  'asa',
  'pty',
  'pvt',
  'holdings',
  'holding',
  'group',
  'international',
  'global',
  'enterprises',
]);

export function isDisallowedDirectoryDomain(domain: string): boolean {
  const clean = normalizeDomain(domain);
  if (!clean || !isValidDomain(clean)) return true;
  if (DISALLOWED_PLATFORM_DOMAINS.has(clean)) return true;
  for (const blocked of DISALLOWED_PLATFORM_DOMAINS) {
    if (clean.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

/**
 * Detects synthetic/fake domains previously built by appending `.com` to raw legal/registry slugs
 * (e.g. `acme-holdings-llc.com`, `ford-motor-company.com`, `us-sec-000123.com`).
 */
export function isSuspectGeneratedDomain(
  domain?: string | null,
  slug?: string | null,
  companyName?: string | null,
  sourceRegistry?: string | null
): boolean {
  if (!domain) return true;
  const clean = normalizeDomain(domain);
  if (!clean || !isValidDomain(clean)) return true;
  if (isDisallowedDirectoryDomain(clean)) return true;

  // Multi-hyphenated legal entity suffixes in .com are almost always slug-concatenated fakes
  if (
    /-(inc|incorporated|llc|ltd|limited|corp|corporation|plc|gmbh|sarl|sas|oyj|pty|holdings-llc|motor-company)\.com$/i.test(
      clean
    )
  ) {
    return true;
  }

  // Registry ID prefixes/suffixes leaked into domain
  if (
    /^(gleif|sirene|sec|nydos|cosos|orsos|asic|abn|brreg|prh|ror|openalex|wd)-/i.test(
      clean
    ) ||
    /-[0-9]{5,}\.com$/i.test(clean)
  ) {
    return true;
  }

  const cleanSlug = (slug || '').trim().toLowerCase();
  if (cleanSlug && clean === `${cleanSlug}.com`) {
    const hyphenCount = (cleanSlug.match(/-/g) || []).length;
    if (hyphenCount >= 3) return true;
    if (
      hyphenCount >= 2 &&
      sourceRegistry &&
      sourceRegistry !== 'Majestic Million Domains' &&
      sourceRegistry !== 'Tranco Global Domains' &&
      sourceRegistry !== 'Live Domain Discovery'
    ) {
      return true;
    }
  }

  void companyName;
  return false;
}

/**
 * Fast DNS existence verification (MX or A/AAAA record) with 950ms ceiling.
 * Confirms a candidate domain actually resolves on the public internet.
 */
export async function verifyDomainResolvesLive(
  rawDomain: string,
  timeoutMs = 950
): Promise<{ alive: boolean; hasMx: boolean }> {
  const domain = normalizeDomain(rawDomain);
  if (!domain || !isValidDomain(domain) || isDisallowedDirectoryDomain(domain)) {
    return { alive: false, hasMx: false };
  }

  const cached = dnsLiveRamCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) {
    return { alive: cached.alive, hasMx: cached.hasMx };
  }

  const probePromise = (async (): Promise<{ alive: boolean; hasMx: boolean }> => {
    try {
      const mx = await dns.resolveMx(domain);
      if (Array.isArray(mx) && mx.length > 0) {
        return { alive: true, hasMx: true };
      }
    } catch {
      // Fallback to A / AAAA lookup
    }

    try {
      const addr = await dns.lookup(domain);
      if (addr && addr.address) {
        return { alive: true, hasMx: false };
      }
    } catch {
      // Domain NXDOMAIN / unreachable
    }
    return { alive: false, hasMx: false };
  })();

  const result = await Promise.race([
    probePromise,
    new Promise<{ alive: boolean; hasMx: boolean }>((resolve) =>
      setTimeout(() => resolve({ alive: false, hasMx: false }), timeoutMs)
    ),
  ]);

  if (dnsLiveRamCache.size > 8000) {
    const oldest = dnsLiveRamCache.keys().next().value;
    if (oldest) dnsLiveRamCache.delete(oldest);
  }
  dnsLiveRamCache.set(domain, {
    ...result,
    expiresAt: Date.now() + 1000 * 60 * 60 * 12,
  });

  return result;
}

function tokenizeBrand(rawName: string): string[] {
  return cleanWhitespace(rawName)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 2 && !LEGAL_NOISE_WORDS.has(tok));
}

function isStrongClearbitMatch(
  targetCompanyName: string,
  suggestionName: string,
  suggestionDomain: string
): boolean {
  if (isDisallowedDirectoryDomain(suggestionDomain)) return false;

  const targetTokens = tokenizeBrand(targetCompanyName);
  const candTokens = tokenizeBrand(suggestionName);
  const domainCore = extractDomainCore(suggestionDomain)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (targetTokens.length === 0) return false;

  const joinedTarget = targetTokens.join('');
  const firstToken = targetTokens[0];

  // Exact core match (e.g. "Ford Motor Company" -> tokens ["ford", "motor"], domainCore "ford")
  if (domainCore === joinedTarget) return true;
  if (firstToken.length >= 3 && domainCore === firstToken) return true;
  if (
    firstToken.length >= 4 &&
    (domainCore.startsWith(firstToken) || joinedTarget.startsWith(domainCore)) &&
    domainCore.length >= 4
  ) {
    // Also verify suggestion name shares the primary brand token
    if (candTokens.includes(firstToken)) return true;
  }

  // Multi-token brand overlap (e.g., "Bank of America" -> "bankofamerica.com" or "JPMorgan Chase" -> "jpmorganchase.com")
  const sharedTokens = targetTokens.filter((t) => candTokens.includes(t));
  if (
    targetTokens.length >= 2 &&
    sharedTokens.length >= Math.min(2, targetTokens.length) &&
    sharedTokens[0] === firstToken
  ) {
    return true;
  }

  // Acronym match when suggestionName explicitly matches full brand tokens (e.g. "International Business Machines" -> "IBM" / "ibm.com")
  if (targetTokens.length >= 3) {
    const acronym = targetTokens.map((t) => t[0]).join('');
    if (domainCore === acronym && sharedTokens.length >= 2) {
      return true;
    }
  }

  return false;
}

async function resolveSingleDomainViaClearbit(
  companyName: string,
  timeoutMs = 1300
): Promise<{ domain: string; logoUrl?: string | null } | null> {
  const tokens = tokenizeBrand(companyName);
  if (tokens.length === 0) return null;
  const cleanQuery = tokens.slice(0, 4).join(' ');
  if (cleanQuery.length < 2) return null;

  try {
    const resp = await axios.get(
      'https://autocomplete.clearbit.com/v1/companies/suggest',
      {
        params: { query: cleanQuery },
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': pickUserAgent(),
        },
        validateStatus: (s) => s === 200,
      }
    );

    if (!Array.isArray(resp.data)) return null;

    for (const item of resp.data.slice(0, 5)) {
      const dom = normalizeDomain(String(item?.domain || ''));
      const sugName = cleanWhitespace(String(item?.name || ''));
      if (!dom || !isValidDomain(dom)) continue;
      if (!isStrongClearbitMatch(companyName, sugName, dom)) continue;

      const dnsCheck = await verifyDomainResolvesLive(dom, 850);
      if (dnsCheck.alive) {
        return {
          domain: dom,
          logoUrl: item?.logo ? String(item.logo) : null,
        };
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

/**
 * Resolves real, verified official corporate domains for a batch of companies:
 * 1. Checks RAM + SQLite `verified_domain_cache`
 * 2. Keeps pre-existing clean non-suspect domains
 * 3. Batch-queries TheOrg GraphQL `social.websiteUrl` + `extensions`
 * 4. Resolves remaining companies via Clearbit Autocomplete + live DNS check
 * Never fabricates `${slug}.com` fake domains.
 */
export async function resolveRealCompanyDomainsBatch(
  companies: GlobalCompanyItem[],
  options?: {
    maxClearbitLookups?: number;
    timeoutMs?: number;
  }
): Promise<GlobalCompanyItem[]> {
  if (companies.length === 0) return [];

  const maxClearbit = options?.maxClearbitLookups ?? 32;
  const lookupKeys = companies.map((c) =>
    (c.slug || slugifyName(c.name)).trim().toLowerCase()
  );

  const vaultDomainMap = getVerifiedDomainsFromVaultCache(lookupKeys);
  const resolvedBySlug = new Map<
    string,
    { domain: string; websiteUrl: string; logoUrl?: string | null }
  >();

  const needsTheOrgSlugs: string[] = [];
  const needsClearbitItems: Array<{ slug: string; name: string }> = [];

  for (const comp of companies) {
    const slug = (comp.slug || slugifyName(comp.name)).trim().toLowerCase();
    if (!slug) continue;

    // 1. Check RAM cache
    const ramWeb = slugToWebsiteCache.get(slug);
    if (
      ramWeb?.domain &&
      !isSuspectGeneratedDomain(
        ramWeb.domain,
        slug,
        comp.name,
        comp.sourceRegistry
      )
    ) {
      resolvedBySlug.set(slug, ramWeb);
      continue;
    }

    // 2. Check SQLite verified_domain_cache
    const sqliteHit = vaultDomainMap.get(slug);
    if (
      sqliteHit &&
      !isSuspectGeneratedDomain(
        sqliteHit.domain,
        slug,
        comp.name,
        comp.sourceRegistry
      )
    ) {
      slugToDomainCache.set(slug, sqliteHit.domain);
      slugToWebsiteCache.set(slug, sqliteHit);
      resolvedBySlug.set(slug, sqliteHit);
      continue;
    }

    // 3. Check company's own domain field if it is genuine (not suspect slug-generated)
    if (
      comp.domain &&
      isValidDomain(comp.domain) &&
      !isSuspectGeneratedDomain(
        comp.domain,
        slug,
        comp.name,
        comp.sourceRegistry
      )
    ) {
      const cleanDom = normalizeDomain(comp.domain);
      const entry = {
        domain: cleanDom,
        websiteUrl: `https://${cleanDom}`,
      };
      slugToDomainCache.set(slug, cleanDom);
      slugToWebsiteCache.set(slug, entry);
      resolvedBySlug.set(slug, entry);
      continue;
    }

    if (!comp.sourceRegistry || comp.sourceRegistry === 'TheOrg Directory') {
      needsTheOrgSlugs.push(slug);
    } else {
      needsClearbitItems.push({ slug, name: comp.name });
    }
  }

  const newlyVerifiedForDb: Array<{
    lookupKey: string;
    domain: string;
    websiteUrl: string;
    resolverSource: string;
  }> = [];

  // 4. Batch resolve TheOrg official websites via GraphQL
  if (needsTheOrgSlugs.length > 0) {
    const uniqueSlugs = Array.from(new Set(needsTheOrgSlugs)).slice(0, 500);
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueSlugs.length; i += 80) {
      chunks.push(uniqueSlugs.slice(i, i + 80));
    }

    await mapWithConcurrency(chunks, 4, async (chunk) => {
      const aliasFields = chunk
        .map(
          (s, idx) =>
            `c${idx}: company(slug: ${JSON.stringify(
              s
            )}) { slug name extensions social { websiteUrl } }`
        )
        .join('\n');

      const data = await queryTheOrgGraphQL<
        Record<
          string,
          {
            slug?: string;
            name?: string;
            extensions?: string[];
            social?: { websiteUrl?: string };
          } | null
        >
      >(`query {\n${aliasFields}\n}`, {}, options?.timeoutMs ?? 2200);

      if (!data) return;

      chunk.forEach((reqSlug, idx) => {
        const node = data[`c${idx}`];
        if (!node) return;
        const exts = Array.isArray(node.extensions)
          ? node.extensions
              .map((e) => normalizeDomain(String(e)))
              .filter(
                (d) => isValidDomain(d) && !isDisallowedDirectoryDomain(d)
              )
          : [];
        const rawUrl = cleanWhitespace(String(node.social?.websiteUrl || ''));
        const webDom = rawUrl ? normalizeDomain(rawUrl) : '';
        const bestDomain =
          (webDom && isValidDomain(webDom) && !isDisallowedDirectoryDomain(webDom)
            ? webDom
            : '') ||
          exts[0] ||
          '';

        if (bestDomain) {
          const entry = {
            domain: bestDomain,
            websiteUrl: `https://${bestDomain}`,
          };
          slugToDomainCache.set(reqSlug, bestDomain);
          slugToWebsiteCache.set(reqSlug, entry);
          resolvedBySlug.set(reqSlug, entry);
          newlyVerifiedForDb.push({
            lookupKey: reqSlug,
            domain: bestDomain,
            websiteUrl: entry.websiteUrl,
            resolverSource: 'TheOrg Official URL',
          });
        } else if (node.name) {
          needsClearbitItems.push({ slug: reqSlug, name: node.name });
        }
      });
    });
  }

  // 5. Resolve remaining companies via Clearbit Autocomplete + live DNS check
  if (needsClearbitItems.length > 0 && maxClearbit > 0) {
    const seenSlugs = new Set<string>();
    const capped = needsClearbitItems
      .filter((item) => {
        if (!item.slug || resolvedBySlug.has(item.slug) || seenSlugs.has(item.slug)) {
          return false;
        }
        seenSlugs.add(item.slug);
        return true;
      })
      .slice(0, maxClearbit);

    await mapWithConcurrency(capped, 10, async (item) => {
      const hit = await resolveSingleDomainViaClearbit(item.name, 1250);
      if (hit?.domain) {
        const entry = {
          domain: hit.domain,
          websiteUrl: `https://${hit.domain}`,
          logoUrl: hit.logoUrl,
        };
        slugToDomainCache.set(item.slug, hit.domain);
        slugToWebsiteCache.set(item.slug, entry);
        resolvedBySlug.set(item.slug, entry);
        newlyVerifiedForDb.push({
          lookupKey: item.slug,
          domain: hit.domain,
          websiteUrl: entry.websiteUrl,
          resolverSource: 'Clearbit + DNS Verified',
        });
      }
    });
  }

  if (newlyVerifiedForDb.length > 0) {
    saveVerifiedDomainsToVaultCache(newlyVerifiedForDb);
  }

  return companies.map((comp) => {
    const slug = (comp.slug || slugifyName(comp.name)).trim().toLowerCase();
    const resolved = resolvedBySlug.get(slug);
    if (resolved) {
      return {
        ...comp,
        domain: resolved.domain,
        websiteUrl: resolved.websiteUrl,
        logoUrl: comp.logoUrl || resolved.logoUrl || null,
      };
    }
    // Strip suspect/fake domains rather than serving fake websites
    if (
      isSuspectGeneratedDomain(
        comp.domain,
        slug,
        comp.name,
        comp.sourceRegistry
      )
    ) {
      return {
        ...comp,
        domain: undefined,
        websiteUrl: undefined,
      };
    }
    return comp;
  });
}

export async function resolveSingleRealCompanyDomain(
  companyName: string,
  slug?: string
): Promise<string> {
  const cleanSlug = (slug || slugifyName(companyName)).trim().toLowerCase();
  if (cleanSlug) {
    const cached = slugToDomainCache.get(cleanSlug);
    if (cached && !isSuspectGeneratedDomain(cached, cleanSlug, companyName)) {
      return cached;
    }
    const dbMap = getVerifiedDomainsFromVaultCache([cleanSlug]);
    const dbHit = dbMap.get(cleanSlug);
    if (dbHit && !isSuspectGeneratedDomain(dbHit.domain, cleanSlug, companyName)) {
      slugToDomainCache.set(cleanSlug, dbHit.domain);
      return dbHit.domain;
    }
  }

  const hit = await resolveSingleDomainViaClearbit(companyName, 1400);
  if (hit?.domain) {
    if (cleanSlug) {
      slugToDomainCache.set(cleanSlug, hit.domain);
      slugToWebsiteCache.set(cleanSlug, {
        domain: hit.domain,
        websiteUrl: `https://${hit.domain}`,
      });
      saveVerifiedDomainsToVaultCache([
        {
          lookupKey: cleanSlug,
          domain: hit.domain,
          websiteUrl: `https://${hit.domain}`,
          resolverSource: 'Clearbit + DNS Verified',
        },
      ]);
    }
    return hit.domain;
  }
  return '';
}
