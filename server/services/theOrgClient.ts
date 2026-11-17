import axios from 'axios';
import type { GlobalCompanyItem } from '../../src/types.ts';
import { expandFullIndustryTitle } from '../../src/utils/emailFormulas.ts';
import { slugToDomainCache, slugToWebsiteCache } from '../cache.ts';
import type {
  CandidateEmployee,
  GraphQLOrgNode,
  GraphQLTeam,
  TheOrgFullDiscovery,
} from '../types.ts';
import {
  browserHeaders,
  buildFallbackDomainFromSlug,
  cleanJobTitle,
  cleanWhitespace,
  extractDomainCore,
  formatEmployeeRangeLabel,
  humanizeSlug,
  isValidDomain,
  mapWithConcurrency,
  normalizeDomain,
  pickUserAgent,
  slugifyName,
} from '../utils/textAndDomain.ts';

const THEORG_GRAPHQL_URL = 'https://prod-graphql-api.theorg.com/graphql';

export async function queryTheOrgGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 8500
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

export async function fetchFullTheOrgCompany(
  slug: string,
  domain: string,
  linkedinCompanySlug: string | null,
  brandName: string,
  skipDomainGuard = false
): Promise<TheOrgFullDiscovery | null> {
  try {
    const pageUrl = `https://theorg.com/org/${encodeURIComponent(slug)}`;
    const resp = await axios.get(pageUrl, {
      timeout: 7500,
      headers: browserHeaders(),
      validateStatus: (s) => s === 200,
    });

    if (typeof resp.data !== 'string') return null;
    const match = resp.data.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match || !match[1]) return null;

    const pageProps = JSON.parse(match[1])?.props?.pageProps;
    const company = pageProps?.initialCompany;
    if (!company) return null;

    const extensions: string[] = Array.isArray(company.extensions)
      ? company.extensions
          .map((e: unknown) => normalizeDomain(String(e)))
          .filter(Boolean)
      : [];
    const rawWebsiteUrl = String(company?.social?.websiteUrl || '');
    const websiteDomain = rawWebsiteUrl ? normalizeDomain(rawWebsiteUrl) : '';
    const orgLiUrl = String(company?.social?.linkedInUrl || '').toLowerCase();
    const orgName = String(company?.name || '').trim();
    const canonicalSlug = String(company?.slug || slug);
    const companyId = String(company?.id || '');

    const resolvedDomain =
      domain ||
      extensions.find((d) => isValidDomain(d)) ||
      (isValidDomain(websiteDomain) ? websiteDomain : `${canonicalSlug}.com`);

    if (canonicalSlug && isValidDomain(resolvedDomain)) {
      slugToDomainCache.set(canonicalSlug, resolvedDomain);
      slugToWebsiteCache.set(canonicalSlug, {
        domain: resolvedDomain,
        websiteUrl: `https://${resolvedDomain}`,
      });
    }

    if (!skipDomainGuard && domain) {
      const domainLower = domain.toLowerCase();
      const domainMatched =
        extensions.some(
          (ext) => ext === domainLower || domainLower.endsWith(`.${ext}`)
        ) ||
        websiteDomain === domainLower ||
        rawWebsiteUrl.toLowerCase().includes(domainLower);

      const linkedinMatched =
        Boolean(linkedinCompanySlug) &&
        orgLiUrl.includes(`/company/${linkedinCompanySlug}`);

      if (
        (websiteDomain.length > 0 || extensions.length > 0) &&
        !domainMatched &&
        !linkedinMatched
      ) {
        const orgSlugNorm = slugifyName(orgName);
        const brandSlugNorm = slugifyName(brandName);
        const coreNorm = slugifyName(extractDomainCore(domain));
        if (orgSlugNorm !== brandSlugNorm && orgSlugNorm !== coreNorm) {
          return null;
        }
      }
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

    const TEAMS_QUERY = `
      query($slug: String!, $tLimit: Int!, $tOffset: Int!, $mLimit: Int!) {
        teamsByCompany(companySlug: $slug, limit: $tLimit, offset: $tOffset) {
          name
          slug
          memberCount
          members(limit: $mLimit, offset: 0) {
            id
            slug
            fullName
            role
          }
        }
      }
    `;

    const firstTeamsPage = await queryTheOrgGraphQL<{
      teamsByCompany: GraphQLTeam[];
    }>(TEAMS_QUERY, {
      slug: canonicalSlug,
      tLimit: 100,
      tOffset: 0,
      mLimit: 500,
    });

    let allTeams: GraphQLTeam[] = firstTeamsPage?.teamsByCompany || [];

    if (allTeams.length === 100) {
      const [page2, page3] = await Promise.all([
        queryTheOrgGraphQL<{ teamsByCompany: GraphQLTeam[] }>(TEAMS_QUERY, {
          slug: canonicalSlug,
          tLimit: 100,
          tOffset: 100,
          mLimit: 500,
        }),
        queryTheOrgGraphQL<{ teamsByCompany: GraphQLTeam[] }>(TEAMS_QUERY, {
          slug: canonicalSlug,
          tLimit: 100,
          tOffset: 200,
          mLimit: 500,
        }),
      ]);
      allTeams = [
        ...allTeams,
        ...(page2?.teamsByCompany || []),
        ...(page3?.teamsByCompany || []),
      ];
    }

    const initialNodes: GraphQLOrgNode[] = Array.isArray(pageProps?.initialNodes)
      ? pageProps.initialNodes
      : [];

    const expandableManagers = initialNodes
      .filter((n) => (n.reportCount || 0) > 0 && n.id)
      .slice(0, 14);

    const BRANCH_QUERY = `
      query OrgChartBranch($companyId: UUID!, $nodeId: String!) {
        nodes(
          companyId: $companyId
          mode: { directLineage: { fromNode: $nodeId, expandedLevels: true } }
        ) {
          id
          title
          parentId
          reportCount
          node {
            ... on Position {
              position {
                id
                fullName
                role
                slug
              }
            }
          }
        }
      }
    `;

    let expandedBranchNodes: GraphQLOrgNode[] = [];
    if (companyId && expandableManagers.length > 0) {
      const branchResults = await Promise.all(
        expandableManagers.map((mgr) =>
          queryTheOrgGraphQL<{ nodes: GraphQLOrgNode[] }>(BRANCH_QUERY, {
            companyId,
            nodeId: mgr.id,
          })
        )
      );
      for (const br of branchResults) {
        if (Array.isArray(br?.nodes)) {
          expandedBranchNodes = [...expandedBranchNodes, ...br.nodes];
        }
      }
    }

    const allOrgNodes = [...initialNodes, ...expandedBranchNodes];
    const nodeById = new Map<string, GraphQLOrgNode>();
    for (const n of allOrgNodes) {
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

    const employeesBySlug = new Map<string, CandidateEmployee>();

    for (const node of nodeById.values()) {
      const pos = node?.node?.position;
      if (!pos) continue;
      const fullName = cleanWhitespace(
        String(pos.fullName || node.title || '')
      );
      if (!fullName || fullName.split(' ').length < 2) continue;
      const personSlug = String(pos.slug || slugifyName(fullName));
      const jobTitle = cleanJobTitle(
        String(pos.role || 'Team Member'),
        resolvedCompany,
        resolvedDomain
      );

      employeesBySlug.set(personSlug, {
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

    const teamsToProcess =
      allTeams.length > 0
        ? allTeams
        : Array.isArray(pageProps?.initialTeams)
        ? pageProps.initialTeams
        : [];

    for (const team of teamsToProcess) {
      const teamName = String(team?.name || '');
      const members = Array.isArray(team?.members) ? team.members : [];
      for (const m of members) {
        const fullName = cleanWhitespace(String(m?.fullName || ''));
        if (!fullName || fullName.split(' ').length < 2) continue;
        const personSlug = String(m?.slug || slugifyName(fullName));
        if (employeesBySlug.has(personSlug)) continue;

        const jobTitle = cleanJobTitle(
          String(m?.role || teamName || 'Team Member'),
          resolvedCompany,
          resolvedDomain
        );

        employeesBySlug.set(personSlug, {
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

    const employees = Array.from(employeesBySlug.values());
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

  const domainSearch = await queryTheOrgGraphQL<{
    search?: { companies?: Array<{ slug: string; name: string }> };
  }>(`query($q: String!) { search(query: $q) { companies { slug name } } }`, {
    q: domain,
  });

  const domainMatchedSlugs = (domainSearch?.search?.companies || [])
    .map((c) => c.slug)
    .filter(Boolean)
    .slice(0, 2);

  for (const s of domainMatchedSlugs) {
    const hit = await fetchFullTheOrgCompany(
      s,
      domain,
      linkedinCompanySlug,
      brandName,
      true
    );
    if (hit && hit.employees.length > 0) return hit;
  }

  const core = extractDomainCore(domain).toLowerCase();
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
      ].filter((s) => s && s.length >= 2 && !domainMatchedSlugs.includes(s))
    )
  );

  for (const slug of candidateSlugs.slice(0, 4)) {
    const hit = await fetchFullTheOrgCompany(
      slug,
      domain,
      linkedinCompanySlug,
      brandName,
      false
    );
    if (hit && hit.employees.length > 0) return hit;
  }

  const brandSearch = await queryTheOrgGraphQL<{
    search?: { companies?: Array<{ slug: string; name: string }> };
  }>(`query($q: String!) { search(query: $q) { companies { slug name } } }`, {
    q: brandName,
  });

  for (const comp of (brandSearch?.search?.companies || []).slice(0, 2)) {
    if (comp.slug && !candidateSlugs.includes(comp.slug)) {
      const hit = await fetchFullTheOrgCompany(
        comp.slug,
        domain,
        linkedinCompanySlug,
        brandName,
        false
      );
      if (hit && hit.employees.length > 0) return hit;
    }
  }

  return null;
}

export async function enrichCompaniesWithWebsites(
  companies: GlobalCompanyItem[]
): Promise<GlobalCompanyItem[]> {
  if (companies.length === 0) return companies;

  const missingSlugs = Array.from(
    new Set(
      companies
        .map((c) => c.slug.trim().toLowerCase())
        .filter((s) => s && !slugToWebsiteCache.has(s))
    )
  );

  if (missingSlugs.length > 0) {
    const BATCH_SIZE = 90;
    const chunks: string[][] = [];
    for (let i = 0; i < missingSlugs.length; i += BATCH_SIZE) {
      chunks.push(missingSlugs.slice(i, i + BATCH_SIZE));
    }

    await mapWithConcurrency(chunks, 6, async (chunk) => {
      const aliasFields = chunk
        .map(
          (s, idx) =>
            `c${idx}: company(slug: ${JSON.stringify(
              s
            )}) { slug extensions social { websiteUrl } }`
        )
        .join('\n');
      const data = await queryTheOrgGraphQL<
        Record<
          string,
          {
            slug?: string;
            extensions?: string[];
            social?: { websiteUrl?: string };
          } | null
        >
      >(`query {\n${aliasFields}\n}`, {}, 5500);

      if (!data) return;

      chunk.forEach((reqSlug, idx) => {
        const node = data[`c${idx}`];
        if (!node) return;
        const exts = Array.isArray(node.extensions)
          ? node.extensions
              .map((e) => normalizeDomain(String(e)))
              .filter((d) => isValidDomain(d))
          : [];
        const rawUrl = cleanWhitespace(String(node.social?.websiteUrl || ''));
        const webDom = rawUrl ? normalizeDomain(rawUrl) : '';
        const bestDomain =
          (isValidDomain(webDom) ? webDom : '') || exts[0] || '';
        if (bestDomain) {
          slugToDomainCache.set(reqSlug, bestDomain);
          slugToWebsiteCache.set(reqSlug, {
            domain: bestDomain,
            websiteUrl: `https://${bestDomain}`,
          });
        }
      });
    });
  }

  return companies.map((comp) => {
    const key = comp.slug.trim().toLowerCase();
    const cached = slugToWebsiteCache.get(key);
    if (cached) {
      return {
        ...comp,
        domain: cached.domain,
        websiteUrl: cached.websiteUrl,
      };
    }
    const fallbackDomain =
      comp.domain && isValidDomain(comp.domain)
        ? comp.domain
        : buildFallbackDomainFromSlug(comp.slug, comp.name);
    return {
      ...comp,
      domain: fallbackDomain,
      websiteUrl: `https://${fallbackDomain}`,
    };
  });
}
