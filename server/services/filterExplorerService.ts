import type { Request } from 'express';
import type {
  ConfirmedEmailSource,
  DepartmentCategory,
  DiscoverySource,
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
import {
  CACHE_TTL_MS,
  emailPatternCache,
  quickRosterCache,
  slugToDomainCache,
  slugToWebsiteCache,
} from '../cache.ts';
import {
  getCompanyOfficersBySlugOrDomain,
  getConfirmedContactsForDomain,
  getVaultQuickRoster,
  saveVaultQuickRoster,
} from '../store/companyVaultDb.ts';
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
  computeFilterFacetsAndTotals,
  parseGlobalFilterParams,
  resolveFilteredGlobalCompanies,
} from './globalDirectoryService.ts';
import {
  isDisallowedDirectoryDomain,
  isSuspectGeneratedDomain,
  resolveSingleRealCompanyDomain,
} from './realDomainResolver.ts';
import { queryTheOrgGraphQL } from './theOrgClient.ts';
import { markUserApiActivity } from './worldwideCrawlerDaemon.ts';

function mapSourceFromEmailSource(
  src: ConfirmedEmailSource | undefined,
  fallback: DiscoverySource
): DiscoverySource {
  if (!src) return fallback;
  switch (src) {
    case 'Company Website':
      return 'Company Site';
    case 'GitHub Commit':
      return 'GitHub Commit';
    case 'OpenPGP Keyserver':
      return 'OpenPGP Keyserver';
    case 'NPM Registry':
      return 'NPM Registry';
    case 'Business Registry':
      return 'Business Registry';
    default:
      return 'Public Web Verified';
  }
}

/**
 * Applies a company's live-detected internet email format & real confirmed emails
 * onto all contacts in its roster, and appends standalone confirmed contacts.
 */
export function applyDetectedPatternToRoster(
  roster: EmployeeRecord[],
  patternResult: EnrichedEmailPatternResult | undefined,
  companyMeta?: { companyName: string; domain: string; industry: string }
): EmployeeRecord[] {
  if (!patternResult) return roster;

  const { analysis, verifiedPersonEmails, discoveredContacts } = patternResult;
  const observedSet = new Set(
    analysis.sampleObservedEmails.map((s) => s.toLowerCase())
  );

  const updated = roster.map((emp) => {
    const normKey = normalizePersonKey(emp.fullName);
    const confirmedHit = verifiedPersonEmails.get(normKey);

    if (confirmedHit) {
      const matchedF = EMAIL_FORMULAS.find(
        (f) =>
          applyExcelEmailFormula(emp.fullName, emp.domain, f.id) ===
          confirmedHit.email.toLowerCase()
      );
      return {
        ...emp,
        email: confirmedHit.email.toLowerCase(),
        emailAccuracy: 99,
        emailFormulaId: matchedF?.id || analysis.detectedFormulaId,
        emailFormulaLabel: matchedF?.label || analysis.formulaLabel,
        emailVerifiedOnWeb: true,
        emailSource: confirmedHit.emailSource,
        emailSourceUrl: confirmedHit.sourceUrl,
      };
    }

    const email = applyExcelEmailFormula(
      emp.fullName,
      emp.domain,
      analysis.detectedFormulaId
    );
    const { lastName, hasComplexParts } = splitFullNameForExcel(emp.fullName);
    let acc = analysis.patternConfidence;
    if (!lastName) acc = Math.max(54, acc - 15);
    else if (hasComplexParts) acc = Math.max(66, acc - 4);
    if (!analysis.mxVerified) acc = Math.max(52, acc - 10);

    const isObserved = Boolean(email && observedSet.has(email.toLowerCase()));
    if (isObserved) {
      acc = 99;
    }

    return {
      ...emp,
      email,
      emailAccuracy: Math.min(99, Math.max(50, Math.round(acc))),
      emailFormulaId: analysis.detectedFormulaId,
      emailFormulaLabel: analysis.formulaLabel,
      emailVerifiedOnWeb: isObserved || emp.emailVerifiedOnWeb,
      emailSource: isObserved
        ? emp.emailSource || 'Public Web Index'
        : emp.emailSource,
    };
  });

  // Append standalone confirmed contacts not yet in the roster
  const existingEmails = new Set(updated.map((e) => e.email.toLowerCase()));
  const baseDomain = companyMeta?.domain || updated[0]?.domain || '';
  const baseCompany = companyMeta?.companyName || updated[0]?.companyName || '';
  const baseIndustry =
    companyMeta?.industry ||
    updated[0]?.industry ||
    'Information Technology & Business Services';

  if (baseDomain && discoveredContacts.length > 0) {
    for (const hit of discoveredContacts) {
      const cleanEmail = hit.email.toLowerCase();
      if (existingEmails.has(cleanEmail)) continue;
      existingEmails.add(cleanEmail);
      const role = hit.jobTitle || 'Verified Contact';
      updated.push({
        id: `confirmed-${slugifyName(baseDomain)}-${slugifyName(cleanEmail)}`,
        rank: 0,
        importanceScore: computeImportanceScore(role, 2, 1),
        fullName: hit.fullName,
        companyName: baseCompany,
        email: cleanEmail,
        emailAccuracy: 99,
        emailFormulaId: analysis.detectedFormulaId,
        emailFormulaLabel: analysis.formulaLabel,
        emailVerifiedOnWeb: true,
        emailSource: hit.emailSource,
        emailSourceUrl: hit.sourceUrl,
        jobTitle: role,
        industry: baseIndustry,
        department: classifyDepartment(role, ''),
        seniority: classifySeniority(role),
        profileUrl: hit.sourceUrl || `https://${baseDomain}`,
        domain: baseDomain,
        source: mapSourceFromEmailSource(
          hit.emailSource,
          'Public Web Verified'
        ),
      });
    }
  }

  return updated;
}

const filterExplorerRamCache = new Map<
  string,
  { data: FilterExplorerResponse; expiresAt: number }
>();

export async function fetchQuickCompanyRoster(
  comp: GlobalCompanyItem
): Promise<EmployeeRecord[]> {
  const slug = comp.slug.trim().toLowerCase();
  if (!slug) return [];

  const cached = quickRosterCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    const dom = (cached.data[0]?.domain || comp.domain || '').toLowerCase();
    if (
      dom &&
      !isSuspectGeneratedDomain(dom, slug, comp.name, comp.sourceRegistry)
    ) {
      const cachedPat = emailPatternCache.get(dom);
      return cachedPat && cachedPat.expiresAt > Date.now()
        ? applyDetectedPatternToRoster(cached.data, cachedPat.data, {
            companyName: comp.name,
            domain: dom,
            industry: comp.industry,
          })
        : cached.data;
    }
  }

  const sqliteRoster = getVaultQuickRoster<EmployeeRecord[]>(slug);
  if (sqliteRoster && sqliteRoster.length > 0) {
    const dom = (sqliteRoster[0]?.domain || comp.domain || '').toLowerCase();
    if (
      dom &&
      !isSuspectGeneratedDomain(dom, slug, comp.name, comp.sourceRegistry)
    ) {
      quickRosterCache.set(slug, {
        data: sqliteRoster,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      const cachedPat = emailPatternCache.get(dom);
      return cachedPat && cachedPat.expiresAt > Date.now()
        ? applyDetectedPatternToRoster(sqliteRoster, cachedPat.data, {
            companyName: comp.name,
            domain: dom,
            industry: comp.industry,
          })
        : sqliteRoster;
    }
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

    const isExternalRegistryOnly =
      comp.sourceRegistry &&
      comp.sourceRegistry !== 'TheOrg Directory' &&
      comp.sourceRegistry !== 'Live Domain Discovery';

    let companyObj: Record<string, unknown> = {};
    let teams: GraphQLTeam[] = [];
    const initialNodes: GraphQLOrgNode[] = [];

    if (!isExternalRegistryOnly) {
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
          mLimit: 350,
        },
        1400
      );

      companyObj = gqlResp?.company || {};
      teams = gqlResp?.teamsByCompany || [];
    }

    const rawExts = Array.isArray(companyObj.extensions)
      ? companyObj.extensions
      : [];
    const extensions: string[] = rawExts
      .map((e: unknown) => normalizeDomain(String(e)))
      .filter((d) => isValidDomain(d) && !isDisallowedDirectoryDomain(d));
    const socialObj = companyObj.social as { websiteUrl?: string } | undefined;
    const rawWebsiteUrl = String(socialObj?.websiteUrl || '');
    const websiteDomain = rawWebsiteUrl ? normalizeDomain(rawWebsiteUrl) : '';

    let resolvedDomain =
      (websiteDomain &&
      isValidDomain(websiteDomain) &&
      !isDisallowedDirectoryDomain(websiteDomain)
        ? websiteDomain
        : '') ||
      extensions[0] ||
      (comp.domain &&
      isValidDomain(comp.domain) &&
      !isSuspectGeneratedDomain(
        comp.domain,
        slug,
        comp.name,
        comp.sourceRegistry
      )
        ? normalizeDomain(comp.domain)
        : '');

    if (!resolvedDomain) {
      resolvedDomain = await resolveSingleRealCompanyDomain(comp.name, slug);
    }

    if (!resolvedDomain || !isValidDomain(resolvedDomain)) {
      return [];
    }

    slugToDomainCache.set(slug, resolvedDomain);
    slugToWebsiteCache.set(slug, {
      domain: resolvedDomain,
      websiteUrl: `https://${resolvedDomain}`,
    });

    const resolvedCompanyName =
      cleanWhitespace(String(companyObj?.name || comp.name)) ||
      humanizeSlug(slug);
    const primaryIndustry =
      comp.industry || 'Information Technology & Business Services';

    const defaultFormula: EmailFormulaId =
      comp.employeeRange === '1 - 50' ? 'first_only' : 'first_dot_last';
    const defaultDef = getExcelFormulaDefinition(defaultFormula);
    const baseConfidence = defaultFormula === 'first_only' ? 84 : 88;

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
        const pSlug = String(
          m?.slug || m?.id || `${slugifyName(fullName)}-${slugifyName(teamName)}`
        );
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

    const officers = getCompanyOfficersBySlugOrDomain(slug, resolvedDomain);
    for (const off of officers) {
      const pSlug = slugifyName(off.fullName);
      if (pSlug && !candidates.has(pSlug)) {
        candidates.set(pSlug, {
          id: `officer-${slug}-${pSlug}`,
          fullName: off.fullName,
          jobTitle: off.jobTitle,
          orgDepth: 1,
          reportCount: 3,
          profileUrl: `https://${resolvedDomain}`,
          source: 'Business Registry',
        });
      }
    }

    const confirmedHits = getConfirmedContactsForDomain(resolvedDomain);
    for (const hit of confirmedHits) {
      const pSlug = slugifyName(hit.fullName) || slugifyName(hit.email);
      const existing = candidates.get(pSlug);
      if (!existing) {
        candidates.set(pSlug, {
          id: `vault-confirmed-${slug}-${slugifyName(hit.email)}`,
          fullName: hit.fullName,
          jobTitle: hit.jobTitle || 'Verified Contact',
          orgDepth: 2,
          reportCount: 1,
          profileUrl: hit.sourceUrl || `https://${resolvedDomain}`,
          source: mapSourceFromEmailSource(
            hit.emailSource,
            'Public Web Verified'
          ),
          observedEmail: hit.email,
          emailSource: hit.emailSource,
          emailSourceUrl: hit.sourceUrl,
        });
      } else if (!existing.observedEmail) {
        candidates.set(pSlug, {
          ...existing,
          observedEmail: hit.email,
          emailSource: hit.emailSource,
          emailSourceUrl: hit.sourceUrl,
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
        const email =
          cand.observedEmail ||
          applyExcelEmailFormula(
            cand.fullName,
            resolvedDomain,
            defaultFormula
          );
        const { lastName, hasComplexParts } = splitFullNameForExcel(
          cand.fullName
        );
        let acc = cand.observedEmail ? 99 : baseConfidence;
        if (!cand.observedEmail) {
          if (!lastName) acc = Math.max(54, acc - 15);
          else if (hasComplexParts) acc = Math.max(66, acc - 4);
        }

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
          emailVerifiedOnWeb: Boolean(cand.observedEmail),
          emailSource: cand.emailSource,
          emailSourceUrl: cand.emailSourceUrl,
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
      if (a.emailVerifiedOnWeb !== b.emailVerifiedOnWeb) {
        return a.emailVerifiedOnWeb ? -1 : 1;
      }
      return a.fullName.localeCompare(b.fullName);
    });

    quickRosterCache.set(slug, {
      data: roster,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    if (roster.length > 0) {
      saveVaultQuickRoster(slug, resolvedDomain, roster);
    }

    const cachedPat = emailPatternCache.get(resolvedDomain.toLowerCase());
    if (cachedPat && cachedPat.expiresAt > Date.now()) {
      return applyDetectedPatternToRoster(roster, cachedPat.data, {
        companyName: resolvedCompanyName,
        domain: resolvedDomain,
        industry: primaryIndustry,
      });
    }

    return roster;
  } catch {
    return [];
  }
}

export async function buildFilterExplorerResponse(
  req: Request
): Promise<FilterExplorerResponse> {
  markUserApiActivity();
  const fullCacheKey = JSON.stringify(req.query || {});
  const cachedExplorer = filterExplorerRamCache.get(fullCacheKey);
  if (cachedExplorer && cachedExplorer.expiresAt > Date.now()) {
    return cachedExplorer.data;
  }

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

  // Fetch directory companies AND unified mathematical facets simultaneously
  const [directoryPayload, facets] = await Promise.all([
    resolveFilteredGlobalCompanies(companyParams),
    computeFilterFacetsAndTotals(companyParams, {
      contactSearch,
      roleKeyword,
      senioritiesCount: seniorities.length,
      departmentsCount: departments.length,
      minAccuracy,
      maxAccuracy,
    }),
  ]);

  const allValidCompanies = directoryPayload.companies.filter((c) =>
    Boolean(c.slug && c.domain)
  );

  // Prioritize already-cached rosters + confirmed-email companies + TheOrg companies for instant extraction
  const prioritizedForRosters = [...allValidCompanies]
    .sort((a, b) => {
      const aCached = quickRosterCache.has(a.slug.toLowerCase()) ? 1 : 0;
      const bCached = quickRosterCache.has(b.slug.toLowerCase()) ? 1 : 0;
      if (aCached !== bCached) return bCached - aCached;
      const aTheOrg = a.sourceRegistry === 'TheOrg Directory' ? 1 : 0;
      const bTheOrg = b.sourceRegistry === 'TheOrg Directory' ? 1 : 0;
      if (aTheOrg !== bTheOrg) return bTheOrg - aTheOrg;
      return (b.confirmedEmailCount || 0) - (a.confirmedEmailCount || 0);
    })
    .slice(0, 24);

  const rawCompanyRosters = await Promise.race([
    mapWithConcurrency(prioritizedForRosters, 16, (comp) =>
      fetchQuickCompanyRoster(comp)
    ),
    new Promise<EmployeeRecord[][]>((resolve) =>
      setTimeout(
        () =>
          resolve(
            prioritizedForRosters.map(
              (c) => quickRosterCache.get(c.slug.toLowerCase())?.data || []
            )
          ),
        1500
      )
    ),
  ]);

  const patternInputs = prioritizedForRosters
    .map((comp, idx) => {
      const roster = rawCompanyRosters[idx] || [];
      const dom = (roster[0]?.domain || comp.domain || '').toLowerCase();
      return {
        domain: dom,
        companyName: roster[0]?.companyName || comp.name,
        employees: roster.slice(0, 60),
        employeeRange: comp.employeeRange,
      };
    })
    .filter((item) => Boolean(item.domain && isValidDomain(item.domain)));

  // Apply cached patterns immediately (0ms) and warm uncached patterns non-blockingly in the background!
  const batchPatterns = await detectBatchCompanyEmailPatterns(
    patternInputs,
    0
  );

  const companyRosters = rawCompanyRosters.map((roster, idx) => {
    const comp = prioritizedForRosters[idx];
    const dom = (roster[0]?.domain || comp?.domain || '').toLowerCase();
    const detected = dom ? batchPatterns.get(dom) : undefined;
    return applyDetectedPatternToRoster(roster, detected, {
      companyName: comp?.name || '',
      domain: dom,
      industry: comp?.industry || 'Information Technology & Business Services',
    });
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
        confirmedEmailCount:
          pat.discoveredContacts.length > 0
            ? pat.discoveredContacts.length
            : comp.confirmedEmailCount,
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

  if (allValidCompanies.length > 24) {
    void mapWithConcurrency(allValidCompanies.slice(24, 54), 6, (comp) =>
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
      const uniqueKey = `${emp.domain}:${emp.id || emp.fullName.toLowerCase()}`;

      const resolvedEmail =
        formulaOverride === 'auto' || emp.emailVerifiedOnWeb
          ? emp.email
          : applyExcelEmailFormula(emp.fullName, emp.domain, formulaOverride);
      const resolvedAccuracy =
        formulaOverride === 'auto' || emp.emailVerifiedOnWeb
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
          formulaOverride === 'auto' || emp.emailVerifiedOnWeb
            ? emp.emailFormulaId
            : formulaOverride,
        emailFormulaLabel:
          formulaOverride === 'auto' || emp.emailVerifiedOnWeb
            ? emp.emailFormulaLabel
            : overrideDef?.label,
      });
    }
  }

  mergedEmployees.sort((a, b) => {
    if (a.importanceScore !== b.importanceScore) {
      return a.importanceScore - b.importanceScore;
    }
    if (a.emailVerifiedOnWeb !== b.emailVerifiedOnWeb) {
      return a.emailVerifiedOnWeb ? -1 : 1;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  const rankedEmployees = mergedEmployees.map((emp, idx) => ({
    ...emp,
    rank: idx + 1,
  }));

  const confirmedEmailsCount = rankedEmployees.filter(
    (e) => e.emailVerifiedOnWeb
  ).length;

  const { departmentBreakdown, seniorityBreakdown } =
    computeBreakdowns(rankedEmployees);

  // Use the EXACT same coherent totalMatchedCompanies & totalMatchedContacts as `/api/filter-facets` & `/api/industry-companies`!
  const totalOrgs = directoryPayload.totalCompanies;
  const hasContactFilter =
    Boolean(contactSearch) ||
    Boolean(roleKeyword) ||
    seniorities.length > 0 ||
    departments.length > 0 ||
    minAccuracy > 50 ||
    maxAccuracy < 99;

  let totalMatchedContacts = facets.totalMatchedContacts;
  if (totalOrgs === 0 || (hasContactFilter && rankedEmployees.length === 0)) {
    totalMatchedContacts = 0;
  } else if (
    totalOrgs <= prioritizedForRosters.length &&
    allValidCompanies.length <= prioritizedForRosters.length
  ) {
    totalMatchedContacts = rankedEmployees.length;
  } else {
    totalMatchedContacts = Math.max(
      rankedEmployees.length,
      facets.totalMatchedContacts
    );
  }

  const responsePayload: FilterExplorerResponse = {
    scopeTitle: directoryPayload.industryFullTitle,
    totalMatchedCompanies: totalOrgs,
    totalMatchedContacts,
    sampledCompaniesCount: nonEmptyRostersCount,
    confirmedEmailsCount,
    vaultCompaniesCount: facets.vaultCompaniesCount,
    liveFederatedCatalogTotal: facets.liveFederatedCatalogTotal,
    page: directoryPayload.page,
    totalPages: directoryPayload.totalPages,
    companies: updatedCompanies,
    employees: rankedEmployees,
    departmentBreakdown,
    seniorityBreakdown,
    fetchedAt: new Date().toISOString(),
  };

  if (filterExplorerRamCache.size > 250) {
    const oldestKey = filterExplorerRamCache.keys().next().value;
    if (oldestKey) filterExplorerRamCache.delete(oldestKey);
  }
  filterExplorerRamCache.set(fullCacheKey, {
    data: responsePayload,
    expiresAt: Date.now() + 90_000,
  });

  return responsePayload;
}
