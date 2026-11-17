import axios from 'axios';
import type { Request } from 'express';
import type {
  DepartmentCategory,
  EmployeeRecord,
  FilterExplorerResponse,
  GlobalCompanyItem,
  SeniorityLevel,
} from '../../src/types.ts';
import {
  EMAIL_FORMULAS,
  applyExcelEmailFormula,
  getExcelFormulaDefinition,
  splitFullNameForExcel,
} from '../../src/utils/emailFormulas.ts';
import type { EmailFormulaId } from '../../src/utils/emailFormulas.ts';
import { estimateIndexedContactsForRange } from '../../src/utils/geographyAndRevenue.ts';
import {
  CACHE_TTL_MS,
  emailPatternCache,
  quickRosterCache,
  slugToDomainCache,
  slugToWebsiteCache,
} from '../cache.ts';
import type {
  CandidateEmployee,
  EnrichedEmailPatternResult,
  GraphQLOrgNode,
  GraphQLTeam,
} from '../types.ts';
import {
  classifyDepartment,
  classifySeniority,
  computeBreakdowns,
  computeImportanceScore,
} from '../utils/rankingAndStats.ts';
import {
  browserHeaders,
  buildFallbackDomainFromSlug,
  cleanJobTitle,
  cleanWhitespace,
  humanizeSlug,
  isValidDomain,
  mapWithConcurrency,
  normalizeDomain,
  normalizePersonKey,
  slugifyName,
} from '../utils/textAndDomain.ts';
import { detectBatchCompanyEmailPatterns } from './emailIntelligence.ts';
import {
  parseGlobalFilterParams,
  resolveFilteredGlobalCompanies,
} from './globalDirectoryService.ts';
import { queryTheOrgGraphQL } from './theOrgClient.ts';

/**
 * Applies a company's live-detected internet email format & web-verified emails
 * onto all contacts in its roster.
 */
export function applyDetectedPatternToRoster(
  roster: EmployeeRecord[],
  patternResult: EnrichedEmailPatternResult | undefined
): EmployeeRecord[] {
  if (!patternResult || roster.length === 0) return roster;

  const { analysis, verifiedPersonEmails } = patternResult;
  const observedSet = new Set(
    analysis.sampleObservedEmails.map((s) => s.toLowerCase())
  );

  return roster.map((emp) => {
    const normKey = normalizePersonKey(emp.fullName);
    const verifiedWebEmail = verifiedPersonEmails.get(normKey);

    if (verifiedWebEmail) {
      const matchedF = EMAIL_FORMULAS.find(
        (f) =>
          applyExcelEmailFormula(emp.fullName, emp.domain, f.id) ===
          verifiedWebEmail.toLowerCase()
      );
      return {
        ...emp,
        email: verifiedWebEmail.toLowerCase(),
        emailAccuracy: 99,
        emailFormulaId: matchedF?.id || analysis.detectedFormulaId,
        emailFormulaLabel: matchedF?.label || analysis.formulaLabel,
        emailVerifiedOnWeb: true,
      };
    }

    const email = applyExcelEmailFormula(
      emp.fullName,
      emp.domain,
      analysis.detectedFormulaId
    );
    const { lastName, hasComplexParts } = splitFullNameForExcel(emp.fullName);
    let acc = analysis.patternConfidence;
    if (!lastName) acc = Math.max(52, acc - 14);
    else if (hasComplexParts) acc = Math.max(66, acc - 4);

    const isObserved = Boolean(email && observedSet.has(email.toLowerCase()));
    if (isObserved) {
      acc = 99;
    }

    return {
      ...emp,
      email,
      emailAccuracy: acc,
      emailFormulaId: analysis.detectedFormulaId,
      emailFormulaLabel: analysis.formulaLabel,
      emailVerifiedOnWeb: isObserved,
    };
  });
}

export async function fetchQuickCompanyRoster(
  comp: GlobalCompanyItem
): Promise<EmployeeRecord[]> {
  const slug = comp.slug.trim().toLowerCase();
  if (!slug) return [];

  const cached = quickRosterCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    const dom = (cached.data[0]?.domain || comp.domain || '').toLowerCase();
    const cachedPat = dom ? emailPatternCache.get(dom) : undefined;
    return cachedPat && cachedPat.expiresAt > Date.now()
      ? applyDetectedPatternToRoster(cached.data, cachedPat.data)
      : cached.data;
  }

  try {
    const pageUrl = `https://theorg.com/org/${encodeURIComponent(slug)}`;
    const COMPANY_AND_TEAMS_QUERY = `
      query($slug: String!, $tLimit: Int!, $tOffset: Int!, $mLimit: Int!) {
        company(slug: $slug) {
          id
          name
          extensions
          social {
            websiteUrl
          }
        }
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

    const gqlResp = await queryTheOrgGraphQL<{
      company?: {
        id?: string;
        name?: string;
        extensions?: string[];
        social?: { websiteUrl?: string };
      };
      teamsByCompany?: GraphQLTeam[];
    }>(
      COMPANY_AND_TEAMS_QUERY,
      {
        slug,
        tLimit: 100,
        tOffset: 0,
        mLimit: 250,
      },
      9000
    );

    let companyObj: Record<string, unknown> = gqlResp?.company || {};
    let teams: GraphQLTeam[] = gqlResp?.teamsByCompany || [];

    if (teams.length === 100) {
      const moreTeams = await queryTheOrgGraphQL<{
        teamsByCompany?: GraphQLTeam[];
      }>(
        `query($slug: String!) {
          teamsByCompany(companySlug: $slug, limit: 100, offset: 100) {
            name
            slug
            memberCount
            members(limit: 250, offset: 0) {
              id
              slug
              fullName
              role
            }
          }
        }`,
        { slug },
        7500
      );
      if (moreTeams?.teamsByCompany?.length) {
        teams = [...teams, ...moreTeams.teamsByCompany];
      }
    }

    let initialNodes: GraphQLOrgNode[] = [];
    const totalTeamMembers = teams.reduce(
      (acc, t) => acc + (t.members?.length || 0),
      0
    );

    if (totalTeamMembers === 0) {
      try {
        const pageResp = await axios.get(pageUrl, {
          timeout: 2400,
          headers: browserHeaders(),
          validateStatus: (s) => s === 200,
        });
        const html = typeof pageResp.data === 'string' ? pageResp.data : '';
        const match = html.match(
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
        );
        const pageProps = match?.[1]
          ? JSON.parse(match[1])?.props?.pageProps || {}
          : {};
        if (!companyObj?.name && pageProps?.initialCompany) {
          companyObj = pageProps.initialCompany;
        }
        if (Array.isArray(pageProps?.initialNodes)) {
          initialNodes = pageProps.initialNodes;
        }
        if (teams.length === 0 && Array.isArray(pageProps?.initialTeams)) {
          teams = pageProps.initialTeams;
        }
      } catch {
        // Non-fatal
      }
    }

    const rawExts = Array.isArray(companyObj.extensions)
      ? companyObj.extensions
      : [];
    const extensions: string[] = rawExts
      .map((e: unknown) => normalizeDomain(String(e)))
      .filter(Boolean);
    const socialObj = companyObj.social as { websiteUrl?: string } | undefined;
    const rawWebsiteUrl = String(socialObj?.websiteUrl || '');
    const websiteDomain = rawWebsiteUrl ? normalizeDomain(rawWebsiteUrl) : '';

    const hasVerifiedExt = extensions.some((d) => isValidDomain(d));
    const resolvedDomain =
      extensions.find((d) => isValidDomain(d)) ||
      (isValidDomain(websiteDomain)
        ? websiteDomain
        : comp.domain && isValidDomain(comp.domain)
        ? comp.domain
        : buildFallbackDomainFromSlug(slug, comp.name));

    if (isValidDomain(resolvedDomain)) {
      slugToDomainCache.set(slug, resolvedDomain);
      slugToWebsiteCache.set(slug, {
        domain: resolvedDomain,
        websiteUrl: `https://${resolvedDomain}`,
      });
    }

    const resolvedCompanyName =
      cleanWhitespace(String(companyObj?.name || comp.name)) ||
      humanizeSlug(slug);
    const primaryIndustry =
      comp.industry || 'Information Technology & Business Services';

    const defaultFormula: EmailFormulaId =
      comp.employeeRange === '1 - 50' ? 'first_only' : 'first_dot_last';
    const defaultDef = getExcelFormulaDefinition(defaultFormula);
    const baseConfidence =
      hasVerifiedExt || isValidDomain(websiteDomain)
        ? defaultFormula === 'first_only'
          ? 85
          : 88
        : 78;

    const nodeById = new Map<string, GraphQLOrgNode>();
    for (const n of initialNodes) {
      if (n.id && !nodeById.has(n.id)) nodeById.set(n.id, n);
    }

    const computeDepth = (node: GraphQLOrgNode): number => {
      let d = 0;
      let curr: GraphQLOrgNode | undefined = node;
      const seen = new Set<string>();
      while (
        curr?.parentId &&
        nodeById.has(curr.parentId) &&
        !seen.has(curr.id)
      ) {
        seen.add(curr.id);
        d++;
        curr = nodeById.get(curr.parentId);
      }
      return d;
    };

    const memberTeamMap = new Map<string, string>();
    for (const team of teams) {
      for (const m of team.members || []) {
        if (m.slug && team.name && !memberTeamMap.has(m.slug)) {
          memberTeamMap.set(m.slug, team.name);
        }
      }
    }

    const candidates = new Map<string, CandidateEmployee>();

    for (const node of nodeById.values()) {
      const pos = node?.node?.position;
      if (!pos) continue;
      const fullName = cleanWhitespace(
        String(pos.fullName || node.title || '')
      );
      if (!fullName || fullName.split(' ').length < 2) continue;
      const pSlug = String(pos.slug || slugifyName(fullName));
      const jobTitle = cleanJobTitle(
        String(pos.role || 'Team Member'),
        resolvedCompanyName,
        resolvedDomain
      );
      candidates.set(pSlug, {
        id: `filter-${slug}-${pSlug}`,
        fullName,
        jobTitle,
        teamHint: memberTeamMap.get(pSlug) || '',
        orgDepth: computeDepth(node),
        reportCount: Number(node.reportCount || 0),
        profileUrl: pos.slug
          ? `https://theorg.com/org/${slug}/org-chart/${pos.slug}`
          : pageUrl,
        source: 'Org Chart',
      });
    }

    for (const team of teams) {
      const teamName = String(team?.name || '');
      for (const m of team.members || []) {
        const fullName = cleanWhitespace(String(m?.fullName || ''));
        if (!fullName || fullName.split(' ').length < 2) continue;
        const pSlug = String(m?.slug || slugifyName(fullName));
        if (candidates.has(pSlug)) continue;
        const jobTitle = cleanJobTitle(
          String(m?.role || teamName || 'Team Member'),
          resolvedCompanyName,
          resolvedDomain
        );
        candidates.set(pSlug, {
          id: `filter-${slug}-${pSlug}`,
          fullName,
          jobTitle,
          teamHint: teamName,
          orgDepth: 3,
          reportCount: 0,
          profileUrl: m?.slug
            ? `https://theorg.com/org/${slug}/org-chart/${m.slug}`
            : pageUrl,
          source: 'Org Chart',
        });
      }
    }

    const roster: EmployeeRecord[] = Array.from(candidates.values()).map(
      (cand) => {
        const importanceScore = computeImportanceScore(
          cand.jobTitle,
          cand.orgDepth ?? 3,
          cand.reportCount ?? 0
        );
        const email = applyExcelEmailFormula(
          cand.fullName,
          resolvedDomain,
          defaultFormula
        );
        const { lastName, hasComplexParts } = splitFullNameForExcel(
          cand.fullName
        );
        let acc = baseConfidence;
        if (!lastName) acc = Math.max(52, acc - 14);
        else if (hasComplexParts) acc = Math.max(66, acc - 4);

        return {
          id: cand.id,
          rank: 0,
          importanceScore,
          fullName: cand.fullName,
          companyName: resolvedCompanyName,
          email,
          emailAccuracy: acc,
          emailFormulaId: defaultFormula,
          emailFormulaLabel: defaultDef.label,
          emailVerifiedOnWeb: false,
          jobTitle: cand.jobTitle,
          industry: primaryIndustry,
          department: classifyDepartment(cand.jobTitle, cand.teamHint || ''),
          seniority: classifySeniority(cand.jobTitle),
          profileUrl: cand.profileUrl,
          domain: resolvedDomain,
          source: cand.source,
        };
      }
    );

    roster.sort((a, b) => {
      if (a.importanceScore !== b.importanceScore) {
        return a.importanceScore - b.importanceScore;
      }
      return a.fullName.localeCompare(b.fullName);
    });

    quickRosterCache.set(slug, {
      data: roster,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    const cachedPat = emailPatternCache.get(resolvedDomain.toLowerCase());
    if (cachedPat && cachedPat.expiresAt > Date.now()) {
      return applyDetectedPatternToRoster(roster, cachedPat.data);
    }

    return roster;
  } catch {
    return [];
  }
}

export async function buildFilterExplorerResponse(
  req: Request
): Promise<FilterExplorerResponse> {
  const companyParams = parseGlobalFilterParams(req);
  const contactSearch = String(req.query.contactSearch || '')
    .trim()
    .toLowerCase();
  const roleKeyword = String(req.query.roleKeyword || '')
    .trim()
    .toLowerCase();
  const seniorities = String(req.query.seniorities || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean) as SeniorityLevel[];
  const departments = String(req.query.departments || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean) as DepartmentCategory[];
  const minAccuracy = Math.max(
    0,
    parseInt(String(req.query.minAccuracy || '50'), 10) || 50
  );
  const maxAccuracy = Math.min(
    100,
    parseInt(String(req.query.maxAccuracy || '99'), 10) || 99
  );
  const formulaOverride = String(
    req.query.emailFormulaOverride || 'auto'
  ).trim() as EmailFormulaId | 'auto';

  const directoryPayload = await resolveFilteredGlobalCompanies(companyParams);

  const allValidCompanies = directoryPayload.companies.filter((c) =>
    Boolean(c.slug)
  );
  const companiesToExtract = allValidCompanies.slice(0, 65);

  const rawCompanyRosters = await mapWithConcurrency(
    companiesToExtract,
    24,
    (comp) => fetchQuickCompanyRoster(comp)
  );

  const patternInputs = companiesToExtract
    .map((comp, idx) => {
      const roster = rawCompanyRosters[idx] || [];
      const dom = (roster[0]?.domain || comp.domain || '').toLowerCase();
      return {
        domain: dom,
        companyName: roster[0]?.companyName || comp.name,
        employees: roster.slice(0, 80),
        employeeRange: comp.employeeRange,
      };
    })
    .filter((item) => Boolean(item.domain && isValidDomain(item.domain)));

  const batchPatterns = await detectBatchCompanyEmailPatterns(
    patternInputs,
    20
  );

  const companyRosters = rawCompanyRosters.map((roster, idx) => {
    const dom = (
      roster[0]?.domain ||
      companiesToExtract[idx]?.domain ||
      ''
    ).toLowerCase();
    const detected = dom ? batchPatterns.get(dom) : undefined;
    return applyDetectedPatternToRoster(roster, detected);
  });

  const updatedCompanies = directoryPayload.companies.map((comp) => {
    const dom = (comp.domain || '').toLowerCase();
    const pat =
      (dom && batchPatterns.get(dom)) ||
      (dom && emailPatternCache.get(dom)?.data) ||
      undefined;
    if (pat) {
      return {
        ...comp,
        detectedFormulaId: pat.analysis.detectedFormulaId,
        detectedFormulaLabel: pat.analysis.formulaLabel,
        patternConfidence: pat.analysis.patternConfidence,
      };
    }
    return comp;
  });

  const nonEmptyRostersCount = companyRosters.filter(
    (r) => r.length > 0
  ).length;

  if (allValidCompanies.length > 65) {
    void mapWithConcurrency(allValidCompanies.slice(65, 165), 14, (comp) =>
      fetchQuickCompanyRoster(comp)
    );
  }

  const rangeCeilingMap: Record<string, number> = {
    '1 - 50': 45,
    '51 - 200': 195,
    '201 - 500': 490,
    '501 - 1,000': 980,
    '1,001 - 5,000': 4900,
    '5,001 - 10,000': 9900,
    '10,000+': 25000,
  };
  const maxAllowedPerCompany =
    companyParams.employeeRanges.length > 0
      ? Math.max(
          ...companyParams.employeeRanges.map(
            (r) => rangeCeilingMap[r] || 25000
          )
        )
      : 25000;

  const seenAllPersonDomain = new Set<string>();
  const seenMatchedPersonDomain = new Set<string>();
  const mergedEmployees: EmployeeRecord[] = [];

  const overrideDef =
    formulaOverride !== 'auto'
      ? getExcelFormulaDefinition(formulaOverride)
      : null;

  for (const fullRoster of companyRosters) {
    const roster =
      fullRoster.length > maxAllowedPerCompany
        ? fullRoster.slice(0, maxAllowedPerCompany)
        : fullRoster;
    for (const emp of roster) {
      const uniqueKey = `${emp.domain}:${emp.fullName.toLowerCase()}`;
      seenAllPersonDomain.add(uniqueKey);

      const resolvedEmail =
        formulaOverride === 'auto'
          ? emp.email
          : applyExcelEmailFormula(emp.fullName, emp.domain, formulaOverride);
      const resolvedAccuracy =
        formulaOverride === 'auto'
          ? emp.emailAccuracy
          : Math.max(62, emp.emailAccuracy - 6);

      if (resolvedAccuracy < minAccuracy || resolvedAccuracy > maxAccuracy) {
        continue;
      }
      if (seniorities.length > 0 && !seniorities.includes(emp.seniority)) {
        continue;
      }
      if (departments.length > 0 && !departments.includes(emp.department)) {
        continue;
      }
      if (roleKeyword && !emp.jobTitle.toLowerCase().includes(roleKeyword)) {
        continue;
      }
      if (
        contactSearch &&
        !emp.fullName.toLowerCase().includes(contactSearch) &&
        !resolvedEmail.toLowerCase().includes(contactSearch) &&
        !(emp.companyName || '').toLowerCase().includes(contactSearch)
      ) {
        continue;
      }

      if (seenMatchedPersonDomain.has(uniqueKey)) continue;
      seenMatchedPersonDomain.add(uniqueKey);

      mergedEmployees.push({
        ...emp,
        email: resolvedEmail,
        emailAccuracy: resolvedAccuracy,
        emailFormulaId:
          formulaOverride === 'auto' ? emp.emailFormulaId : formulaOverride,
        emailFormulaLabel:
          formulaOverride === 'auto'
            ? emp.emailFormulaLabel
            : overrideDef?.label,
      });
    }
  }

  mergedEmployees.sort((a, b) => {
    if (a.importanceScore !== b.importanceScore) {
      return a.importanceScore - b.importanceScore;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  const rankedEmployees = mergedEmployees.map((emp, idx) => ({
    ...emp,
    rank: idx + 1,
  }));

  const { departmentBreakdown, seniorityBreakdown } =
    computeBreakdowns(rankedEmployees);

  let totalMatchedContacts = 0;
  const totalOrgs = directoryPayload.totalCompanies;
  const hasContactFilter =
    Boolean(contactSearch) ||
    Boolean(roleKeyword) ||
    seniorities.length > 0 ||
    departments.length > 0 ||
    minAccuracy > 50 ||
    maxAccuracy < 99;

  if (totalOrgs === 0 || (hasContactFilter && rankedEmployees.length === 0)) {
    totalMatchedContacts = 0;
  } else if (
    totalOrgs <= companiesToExtract.length &&
    allValidCompanies.length <= companiesToExtract.length &&
    rankedEmployees.length >= totalOrgs
  ) {
    totalMatchedContacts = rankedEmployees.length;
  } else {
    const rangeAvg =
      updatedCompanies.length > 0
        ? updatedCompanies.reduce(
            (sum, c) => sum + estimateIndexedContactsForRange(c.employeeRange),
            0
          ) / updatedCompanies.length
        : 95;
    const empiricalUnfilteredAvg =
      nonEmptyRostersCount > 0
        ? Math.min(
            maxAllowedPerCompany,
            seenAllPersonDomain.size / nonEmptyRostersCount
          )
        : rangeAvg;
    const baseContactsPerOrg = Math.min(
      maxAllowedPerCompany,
      Math.max(10, Math.round(rangeAvg * 0.55 + empiricalUnfilteredAvg * 0.45))
    );
    const contactFilterRatio =
      seenAllPersonDomain.size > 0
        ? rankedEmployees.length / seenAllPersonDomain.size
        : 1;
    const effectivePerOrg = baseContactsPerOrg * contactFilterRatio;

    totalMatchedContacts = Math.max(
      rankedEmployees.length,
      Math.round(totalOrgs * effectivePerOrg)
    );
  }

  return {
    scopeTitle: directoryPayload.industryFullTitle,
    totalMatchedCompanies: directoryPayload.totalCompanies,
    totalMatchedContacts,
    sampledCompaniesCount: nonEmptyRostersCount,
    page: directoryPayload.page,
    totalPages: directoryPayload.totalPages,
    companies: updatedCompanies,
    employees: rankedEmployees,
    departmentBreakdown,
    seniorityBreakdown,
    fetchedAt: new Date().toISOString(),
  };
}
