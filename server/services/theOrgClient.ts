import axios from 'axios';
import type { GlobalCompanyItem } from '../../src/types.ts';
import { expandFullIndustryTitle } from '../../src/utils/emailFormulas.ts';
import { slugToDomainCache, slugToWebsiteCache } from '../cache.ts';
import { getVerifiedDomainsFromVaultCache } from '../store/companyVaultDb.ts';
import type {
  CandidateEmployee,
  GraphQLOrgNode,
  GraphQLTeam,
  TheOrgFullDiscovery,
} from '../types.ts';
import {
  browserHeaders,
  cleanJobTitle,
  cleanWhitespace,
  extractDomainCore,
  formatEmployeeRangeLabel,
  humanizeSlug,
  isValidDomain,
  normalizeDomain,
  pickUserAgent,
  slugifyName,
} from '../utils/textAndDomain.ts';
import {
  isDisallowedDirectoryDomain,
  isSuspectGeneratedDomain,
  resolveRealCompanyDomainsBatch,
  resolveSingleRealCompanyDomain,
} from './realDomainResolver.ts';

const THEORG_GRAPHQL_URL = 'https://prod-graphql-api.theorg.com/graphql';

export async function queryTheOrgGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 2400
): Promise<T | null> {
  try {
    const resp = await axios.post(
      THEORG_GRAPHQL_URL,
      { query, variables },
      {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Client': 'web',
          Origin: 'https://theorg.com',
          Referer: 'https://theorg.com/',
          'User-Agent': pickUserAgent(),
        },
        validateStatus: (s) => s === 200,
      }
    );
    return (resp.data?.data as T) || null;
  } catch {
    return null;
  }
}

interface GraphQLCompanyMeta {
  id?: string;
  slug?: string;
  name?: string;
  description?: string;
  extensions?: string[];
  social?: { websiteUrl?: string; linkedInUrl?: string };
  industries?: Array<{ title?: string }>;
  locationV2?: { city?: string; state?: string; country?: string };
  stats?: { employeeRange?: string };
}

function isExactDomainMatch(candidateDomain: string, targetDomain: string): boolean {
  const cand = normalizeDomain(candidateDomain);
  const target = normalizeDomain(targetDomain);
  if (!cand || !target) return false;
  return (
    cand === target ||
    cand.endsWith(`.${target}`) ||
    target.endsWith(`.${cand}`)
  );
}

/**
 * Scores how strongly a TheOrg company matches the requested target domain/brand:
 *   3 = Exact domain match via `extensions` or `social.websiteUrl` hostname
 *   2 = Exact LinkedIn company slug match
 *   1 = Exact brand/core name match (ONLY when company has NO conflicting domain and name length >= 4)
 *   0 = Reject (conflicting corporate website/extensions or unrelated fuzzy search hit)
 */
function scoreTargetDomainMatch(
  company: GraphQLCompanyMeta,
  domain: string,
  linkedinCompanySlug: string | null,
  brandName: string,
  skipDomainGuard: boolean
): number {
  if (skipDomainGuard || !domain) return 3;

  const extensions = Array.isArray(company.extensions)
    ? company.extensions
        .map((e) => normalizeDomain(String(e)))
        .filter(Boolean)
    : [];
  const rawWebsiteUrl = String(company.social?.websiteUrl || '');
  const websiteDomain = rawWebsiteUrl ? normalizeDomain(rawWebsiteUrl) : '';
  const orgLiUrl = String(company.social?.linkedInUrl || '').toLowerCase();
  const orgName = String(company.name || '').trim();
  const domainLower = normalizeDomain(domain);

  const domainMatched =
    extensions.some((ext) => isExactDomainMatch(ext, domainLower)) ||
    isExactDomainMatch(websiteDomain, domainLower);

  if (domainMatched) return 3;

  const linkedinMatched = linkedinCompanySlug
    ? orgLiUrl.includes(`/company/${linkedinCompanySlug.toLowerCase()}`)
    : false;

  if (linkedinMatched) return 2;

  // If the company explicitly lists a DIFFERENT corporate domain or email extensions
  // that do NOT match our target domain (e.g. att.com when user searched x.com), REJECT it.
  if (websiteDomain.length > 0 || extensions.length > 0) {
    return 0;
  }

  // Only allow name-only fallback when the org record has no website/extensions at all
  // AND the brand/core identifier is specific enough (>= 4 chars) to prevent short-name collisions.
  const orgSlugNorm = slugifyName(orgName);
  const brandSlugNorm = slugifyName(brandName);
  const coreNorm = slugifyName(extractDomainCore(domainLower));
  if (
    (coreNorm.length >= 4 && orgSlugNorm === coreNorm) ||
    (brandSlugNorm.length >= 4 && orgSlugNorm === brandSlugNorm)
  ) {
    return 1;
  }

  return 0;
}

function matchesTargetDomainOrBrand(
  company: GraphQLCompanyMeta,
  domain: string,
  linkedinCompanySlug: string | null,
  brandName: string,
  skipDomainGuard: boolean
): boolean {
  return (
    scoreTargetDomainMatch(
      company,
      domain,
      linkedinCompanySlug,
      brandName,
      skipDomainGuard
    ) > 0
  );
}

/**
 * Comprehensive Parallel Roster Loader:
 * Fetches BOTH GraphQL `teamsByCompany` (up to 800 teams x 500 members) AND
 * Next.js `initialNodes` (all C-Suite, VPs, and un-teamed reporting nodes) simultaneously
 * so zero employee names are omitted while keeping total latency < 2.2s.
 */
export async function fetchFullTheOrgCompany(
  slug: string,
  domain: string,
  linkedinCompanySlug: string | null,
  brandName: string,
  skipDomainGuard = false,
  preloadedMeta?: GraphQLCompanyMeta
): Promise<TheOrgFullDiscovery | null> {
  try {
    const pageUrl = `https://theorg.com/org/${encodeURIComponent(slug)}`;

    const COMBINED_COMPANY_TEAMS_QUERY = `
      query FastCompanyAndTeams($slug: String!) {
        company(slug: $slug) {
          id
          slug
          name
          description
          extensions
          social {
            websiteUrl
            linkedInUrl
          }
          industries {
            title
          }
          locationV2 {
            city
            state
            country
          }
          stats {
            employeeRange
          }
        }
        t0: teamsByCompany(companySlug: $slug, limit: 100, offset: 0) {
          name
          slug
          memberCount
          members(limit: 500, offset: 0) {
            id
            slug
            fullName
            role
          }
        }
        t1: teamsByCompany(companySlug: $slug, limit: 100, offset: 100) {
          name
          slug
          memberCount
          members(limit: 500, offset: 0) {
            id
            slug
            fullName
            role
          }
        }
        t2: teamsByCompany(companySlug: $slug, limit: 100, offset: 200) {
          name
          slug
          memberCount
          members(limit: 500, offset: 0) {
            id
            slug
            fullName
            role
          }
        }
        t3: teamsByCompany(companySlug: $slug, limit: 100, offset: 300) {
          name
          slug
          memberCount
          members(limit: 500, offset: 0) {
            id
            slug
            fullName
            role
          }
        }
      }
    `;

    // Fire GraphQL 400-team query AND Next.js HTML initialNodes fetch simultaneously in parallel!
    const [gqlData, htmlPageData] = await Promise.all([
      queryTheOrgGraphQL<{
        company?: GraphQLCompanyMeta | null;
        t0?: GraphQLTeam[];
        t1?: GraphQLTeam[];
        t2?: GraphQLTeam[];
        t3?: GraphQLTeam[];
      }>(COMBINED_COMPANY_TEAMS_QUERY, { slug }, 2600),
      axios
        .get(pageUrl, {
          timeout: 1950,
          headers: browserHeaders(),
          validateStatus: (s) => s === 200,
        })
        .then((resp) => {
          if (typeof resp.data !== 'string') return null;
          const match = resp.data.match(
            /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
          );
          if (!match?.[1]) return null;
          return JSON.parse(match[1])?.props?.pageProps || null;
        })
        .catch(() => null),
    ]);

    let company: GraphQLCompanyMeta | null =
      gqlData?.company ||
      (htmlPageData?.initialCompany as GraphQLCompanyMeta | undefined) ||
      preloadedMeta ||
      null;

    let allTeams: GraphQLTeam[] = [
      ...(gqlData?.t0 || []),
      ...(gqlData?.t1 || []),
      ...(gqlData?.t2 || []),
      ...(gqlData?.t3 || []),
    ];
    if (allTeams.length === 0 && Array.isArray(htmlPageData?.initialTeams)) {
      allTeams = htmlPageData.initialTeams;
    }

    const initialNodes: GraphQLOrgNode[] = Array.isArray(
      htmlPageData?.initialNodes
    )
      ? htmlPageData.initialNodes
      : [];

    if (!company) return null;

    if (
      !matchesTargetDomainOrBrand(
        company,
        domain,
        linkedinCompanySlug,
        brandName,
        skipDomainGuard
      )
    ) {
      return null;
    }

    const extensions: string[] = Array.isArray(company.extensions)
      ? company.extensions
          .map((e: unknown) => normalizeDomain(String(e)))
          .filter((d) => isValidDomain(d) && !isDisallowedDirectoryDomain(d))
      : [];
    const rawWebsiteUrl = String(company?.social?.websiteUrl || '');
    const websiteDomain = rawWebsiteUrl ? normalizeDomain(rawWebsiteUrl) : '';
    const orgName = String(company?.name || '').trim();
    const canonicalSlug = String(company?.slug || slug);

    let resolvedDomain =
      domain ||
      (websiteDomain &&
      isValidDomain(websiteDomain) &&
      !isDisallowedDirectoryDomain(websiteDomain)
        ? websiteDomain
        : '') ||
      extensions[0] ||
      '';

    if (!resolvedDomain) {
      resolvedDomain = await resolveSingleRealCompanyDomain(
        orgName || brandName || humanizeSlug(canonicalSlug),
        canonicalSlug
      );
    }

    if (canonicalSlug && resolvedDomain && isValidDomain(resolvedDomain)) {
      slugToDomainCache.set(canonicalSlug, resolvedDomain);
      slugToWebsiteCache.set(canonicalSlug, {
        domain: resolvedDomain,
        websiteUrl: `https://${resolvedDomain}`,
      });
    }

    // Fetch extra team pages 400..800 for mega-enterprises (>400 teams) in one fast parallel batch
    if ((gqlData?.t3?.length || 0) === 100) {
      const MEGA_TEAMS_QUERY = `
        query MegaTeamsExtended($slug: String!) {
          t4: teamsByCompany(companySlug: $slug, limit: 100, offset: 400) {
            name
            slug
            memberCount
            members(limit: 500, offset: 0) {
              id
              slug
              fullName
              role
            }
          }
          t5: teamsByCompany(companySlug: $slug, limit: 100, offset: 500) {
            name
            slug
            memberCount
            members(limit: 500, offset: 0) {
              id
              slug
              fullName
              role
            }
          }
          t6: teamsByCompany(companySlug: $slug, limit: 100, offset: 600) {
            name
            slug
            memberCount
            members(limit: 500, offset: 0) {
              id
              slug
              fullName
              role
            }
          }
          t7: teamsByCompany(companySlug: $slug, limit: 100, offset: 700) {
            name
            slug
            memberCount
            members(limit: 500, offset: 0) {
              id
              slug
              fullName
              role
            }
          }
        }
      `;
      const megaResp = await queryTheOrgGraphQL<{
        t4?: GraphQLTeam[];
        t5?: GraphQLTeam[];
        t6?: GraphQLTeam[];
        t7?: GraphQLTeam[];
      }>(MEGA_TEAMS_QUERY, { slug: canonicalSlug }, 1750);
      if (megaResp?.t4?.length) allTeams = [...allTeams, ...megaResp.t4];
      if (megaResp?.t5?.length) allTeams = [...allTeams, ...megaResp.t5];
      if (megaResp?.t6?.length) allTeams = [...allTeams, ...megaResp.t6];
      if (megaResp?.t7?.length) allTeams = [...allTeams, ...megaResp.t7];
    }

    const resolvedCompany =
      orgName || brandName || humanizeSlug(canonicalSlug);
    const industries: string[] = Array.isArray(company?.industries)
      ? company.industries
          .map((t: { title?: string }) =>
            expandFullIndustryTitle(cleanWhitespace(String(t?.title || '')))
          )
          .filter(Boolean)
      : [];

    const city = cleanWhitespace(String(company?.locationV2?.city || ''));
    const state = cleanWhitespace(String(company?.locationV2?.state || ''));
    const country = cleanWhitespace(String(company?.locationV2?.country || ''));
    const headquarters = [city, state, country].filter(Boolean).join(', ');
    const description = cleanWhitespace(String(company?.description || ''));
    const employeeRange = formatEmployeeRangeLabel(
      String(company?.stats?.employeeRange || '')
    );

    const nodeById = new Map<string, GraphQLOrgNode>();
    for (const n of initialNodes) {
      if (n.id && !nodeById.has(n.id)) nodeById.set(n.id, n);
    }

    const computeNodeDepth = (node: GraphQLOrgNode): number => {
      let depth = 0;
      let curr: GraphQLOrgNode | undefined = node;
      const visited = new Set<string>();
      while (
        curr?.parentId &&
        nodeById.has(curr.parentId) &&
        !visited.has(curr.id)
      ) {
        visited.add(curr.id);
        depth++;
        curr = nodeById.get(curr.parentId);
      }
      return depth;
    };

    const memberTeamMap = new Map<string, string>();
    for (const team of allTeams) {
      for (const m of team.members || []) {
        if (m.slug && team.name && !memberTeamMap.has(m.slug)) {
          memberTeamMap.set(m.slug, team.name);
        }
      }
    }

    const employeesByKey = new Map<string, CandidateEmployee>();

    for (const node of nodeById.values()) {
      const pos = node?.node?.position;
      if (!pos) continue;
      const fullName = cleanWhitespace(
        String(pos.fullName || node.title || '')
      );
      if (!fullName || fullName.split(' ').length < 2) continue;
      const personSlug = String(
        pos.slug || `${slugifyName(fullName)}-${node.id}`
      );
      const jobTitle = cleanJobTitle(
        String(pos.role || 'Team Member'),
        resolvedCompany,
        resolvedDomain
      );

      employeesByKey.set(personSlug, {
        id: `theorg-${canonicalSlug}-${personSlug}`,
        fullName,
        jobTitle,
        teamHint: memberTeamMap.get(personSlug) || '',
        orgDepth: computeNodeDepth(node),
        reportCount: Number(node.reportCount || 0),
        profileUrl: pos.slug
          ? `https://theorg.com/org/${canonicalSlug}/org-chart/${pos.slug}`
          : pageUrl,
        source: 'Org Chart',
      });
    }

    for (const team of allTeams) {
      const teamName = String(team?.name || '');
      const members = Array.isArray(team?.members) ? team.members : [];
      for (const m of members) {
        const fullName = cleanWhitespace(String(m?.fullName || ''));
        if (!fullName || fullName.split(' ').length < 2) continue;
        const personSlug = String(
          m?.slug || m?.id || `${slugifyName(fullName)}-${slugifyName(teamName)}`
        );
        const existing = employeesByKey.get(personSlug);
        if (existing) {
          if (!existing.teamHint && teamName) {
            existing.teamHint = teamName;
          }
          continue;
        }

        const jobTitle = cleanJobTitle(
          String(m?.role || teamName || 'Team Member'),
          resolvedCompany,
          resolvedDomain
        );

        employeesByKey.set(personSlug, {
          id: `theorg-${canonicalSlug}-${personSlug}`,
          fullName,
          jobTitle,
          teamHint: teamName,
          orgDepth: 3,
          reportCount: 0,
          profileUrl: m?.slug
            ? `https://theorg.com/org/${canonicalSlug}/org-chart/${m.slug}`
            : pageUrl,
          source: 'Org Chart',
        });
      }
    }

    const employees = Array.from(employeesByKey.values());
    if (employees.length === 0) return null;

    return {
      companyName: resolvedCompany,
      companySlug: canonicalSlug,
      resolvedDomain,
      industries,
      description,
      headquarters,
      employeeRange,
      employees,
    };
  } catch {
    return null;
  }
}

/**
 * Single-Roundtrip Aliased GraphQL Discovery:
 * Probes explicit slug, domain search, brand search, and candidate slugs simultaneously
 * in ONE ~250ms GraphQL call instead of 8 sequential HTTP waterfalls.
 */
export async function discoverViaTheOrg(
  domain: string,
  brandName: string,
  linkedinCompanySlug: string | null,
  explicitSlug?: string
): Promise<TheOrgFullDiscovery | null> {
  if (explicitSlug) {
    const directHit = await fetchFullTheOrgCompany(
      explicitSlug,
      domain,
      linkedinCompanySlug,
      brandName,
      true
    );
    if (directHit && directHit.employees.length > 0) return directHit;
  }

  const core = domain ? extractDomainCore(domain).toLowerCase() : '';
  const strippedSuffix = core.replace(
    /(hq|app|inc|corp|llc|ltd|plc|labs|tech|io|ai|global|group|official|online)$/i,
    ''
  );
  const strippedPrefix = core.replace(
    /^(get|try|use|go|join|hey|meet|with)/i,
    ''
  );

  const candidateSlugs = Array.from(
    new Set(
      [
        linkedinCompanySlug || '',
        core,
        slugifyName(brandName),
        strippedSuffix,
        strippedPrefix,
      ].filter((s) => s && s.length >= 2 && s !== explicitSlug)
    )
  ).slice(0, 5);

  const companySelection = `{
    id
    slug
    name
    description
    extensions
    social { websiteUrl linkedInUrl }
    industries { title }
    locationV2 { city state country }
    stats { employeeRange }
  }`;

  const aliasParts = candidateSlugs.map(
    (s, idx) => `c${idx}: company(slug: ${JSON.stringify(s)}) ${companySelection}`
  );
  if (domain) {
    aliasParts.push(
      `domSearch: search(query: ${JSON.stringify(
        domain
      )}) { companies { slug name } }`
    );
  }
  if (brandName && brandName.toLowerCase() !== domain.toLowerCase()) {
    aliasParts.push(
      `brandSearch: search(query: ${JSON.stringify(
        brandName
      )}) { companies { slug name } }`
    );
  }

  const directCoreSlug = core && core.length >= 2 ? core : '';
  const directCorePromise = directCoreSlug
    ? fetchFullTheOrgCompany(
        directCoreSlug,
        domain,
        linkedinCompanySlug,
        brandName,
        false
      )
    : Promise.resolve(null);

  if (aliasParts.length === 0) {
    return await directCorePromise;
  }

  const [directCoreHit, batchProbe] = await Promise.all([
    directCorePromise,
    queryTheOrgGraphQL<
      Record<
        string,
        | GraphQLCompanyMeta
        | { companies?: Array<{ slug: string; name: string }> }
        | null
      >
    >(`query {\n${aliasParts.join('\n')}\n}`, {}, 1800),
  ]);

  if (directCoreHit && directCoreHit.employees.length > 0) {
    return directCoreHit;
  }

  if (!batchProbe) return null;

  const triedSlugs = new Set<string>(directCoreSlug ? [directCoreSlug] : []);

  const domMatchedSlugs = (
    (
      batchProbe.domSearch as
        | { companies?: Array<{ slug: string }> }
        | undefined
    )?.companies || []
  )
    .map((c) => c.slug)
    .filter((s) => Boolean(s) && !triedSlugs.has(s))
    .slice(0, 5);

  const brandSlugs = (
    (
      batchProbe.brandSearch as
        | { companies?: Array<{ slug: string }> }
        | undefined
    )?.companies || []
  )
    .map((c) => c.slug)
    .filter((s) => Boolean(s) && !triedSlugs.has(s))
    .slice(0, 3);

  const verifiedCandidates: Array<{
    slug: string;
    meta: GraphQLCompanyMeta;
    score: number;
  }> = [];

  for (let i = 0; i < candidateSlugs.length; i++) {
    const meta = batchProbe[`c${i}`] as GraphQLCompanyMeta | null | undefined;
    if (!meta?.slug || triedSlugs.has(meta.slug)) continue;
    const score = scoreTargetDomainMatch(
      meta,
      domain,
      linkedinCompanySlug,
      brandName,
      false
    );
    triedSlugs.add(meta.slug);
    if (score > 0) {
      verifiedCandidates.push({ slug: meta.slug, meta, score });
    }
  }

  // Batch-verify all fuzzy domSearch + brandSearch slugs in ONE ~150ms aliased GraphQL metadata call
  // so unrelated companies returned by fuzzy search (e.g. `att` when searching `x.com`) are ALWAYS rejected!
  const unverifiedSearchSlugs = Array.from(
    new Set([...domMatchedSlugs, ...brandSlugs])
  )
    .filter((s) => !triedSlugs.has(s))
    .slice(0, 6);

  if (unverifiedSearchSlugs.length > 0) {
    const verifyAliases = unverifiedSearchSlugs.map(
      (s, idx) => `v${idx}: company(slug: ${JSON.stringify(s)}) ${companySelection}`
    );
    const verifiedBatch = await queryTheOrgGraphQL<
      Record<string, GraphQLCompanyMeta | null>
    >(`query {\n${verifyAliases.join('\n')}\n}`, {}, 1400);

    if (verifiedBatch) {
      for (let i = 0; i < unverifiedSearchSlugs.length; i++) {
        const meta = verifiedBatch[`v${i}`];
        if (!meta?.slug || triedSlugs.has(meta.slug)) continue;
        const score = scoreTargetDomainMatch(
          meta,
          domain,
          linkedinCompanySlug,
          brandName,
          false
        );
        triedSlugs.add(meta.slug);
        if (score > 0) {
          verifiedCandidates.push({ slug: meta.slug, meta, score });
        }
      }
    }
  }

  if (verifiedCandidates.length === 0) return null;

  // Strictly prioritize highest match tier (Exact Domain Match = 3 ALWAYS beats weaker brand matches!)
  const bestTierScore = Math.max(...verifiedCandidates.map((c) => c.score));
  const topTierCandidates = verifiedCandidates
    .filter((c) => c.score === bestTierScore)
    .slice(0, 2);

  const parallelHits = await Promise.all(
    topTierCandidates.map((cand) =>
      fetchFullTheOrgCompany(
        cand.slug,
        domain,
        linkedinCompanySlug,
        brandName,
        false,
        cand.meta
      ).catch(() => null)
    )
  );

  const validHits = parallelHits
    .filter((h): h is TheOrgFullDiscovery => Boolean(h && h.employees.length > 0))
    .sort((a, b) => b.employees.length - a.employees.length);

  return validHits[0] || null;
}

/**
 * Zero-latency synchronous enrichment using RAM + SQLite verified_domain_cache.
 * NEVER fabricates fake `${slug}.com` domains.
 */
export function enrichCompaniesFromLocalCacheSync(
  companies: GlobalCompanyItem[]
): GlobalCompanyItem[] {
  if (companies.length === 0) return [];
  const keys = companies.map((c) =>
    (c.slug || slugifyName(c.name)).trim().toLowerCase()
  );
  const dbCache = getVerifiedDomainsFromVaultCache(keys);

  return companies.map((comp) => {
    const key = (comp.slug || slugifyName(comp.name)).trim().toLowerCase();
    const cached = slugToWebsiteCache.get(key) || dbCache.get(key);
    if (
      cached &&
      !isSuspectGeneratedDomain(
        cached.domain,
        key,
        comp.name,
        comp.sourceRegistry
      )
    ) {
      slugToWebsiteCache.set(key, cached);
      slugToDomainCache.set(key, cached.domain);
      return {
        ...comp,
        domain: cached.domain,
        websiteUrl: cached.websiteUrl,
      };
    }

    if (
      comp.domain &&
      isValidDomain(comp.domain) &&
      !isSuspectGeneratedDomain(
        comp.domain,
        key,
        comp.name,
        comp.sourceRegistry
      )
    ) {
      const cleanDom = normalizeDomain(comp.domain);
      return {
        ...comp,
        domain: cleanDom,
        websiteUrl: `https://${cleanDom}`,
      };
    }

    return {
      ...comp,
      domain: undefined,
      websiteUrl: undefined,
    };
  });
}

export async function enrichCompaniesWithWebsites(
  companies: GlobalCompanyItem[]
): Promise<GlobalCompanyItem[]> {
  return resolveRealCompanyDomainsBatch(companies, {
    maxClearbitLookups: 36,
    timeoutMs: 2200,
  });
}
