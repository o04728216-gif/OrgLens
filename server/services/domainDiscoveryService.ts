import type {
  DiscoverySource,
  EmployeeRecord,
  SearchResponse,
} from '../../src/types.ts';
import {
  EMAIL_FORMULAS,
  applyExcelEmailFormula,
  expandFullIndustryTitle,
  splitFullNameForExcel,
} from '../../src/utils/emailFormulas.ts';
import { estimateCompanyRevenueRange } from '../../src/utils/geographyAndRevenue.ts';
import { CACHE_TTL_MS, domainCache, slugToDomainCache } from '../cache.ts';
import type {
  CandidateEmployee,
  RawSearchHit,
  TheOrgFullDiscovery,
} from '../types.ts';
import {
  classifyDepartment,
  classifySeniority,
  computeBreakdowns,
  computeImportanceScore,
} from '../utils/rankingAndStats.ts';
import {
  humanizeSlug,
  looksLikePersonName,
  normalizeDomain,
  normalizePersonKey,
  slugifyName,
} from '../utils/textAndDomain.ts';
import { detectCompanyEmailPattern } from './emailIntelligence.ts';
import { discoverViaTheOrg } from './theOrgClient.ts';
import {
  parseLinkedInHit,
  queryBingHtml,
  queryBingRss,
  queryDuckDuckGoHtml,
  queryYahooSafe,
} from './webSearchClient.ts';
import { inspectTargetWebsite } from './websiteScraper.ts';
import { applyManualOverrideToSearchResponse } from './manualOverrideApplier.ts';

export async function discoverDomainEmployees(
  rawDomain: string,
  forceRefresh = false,
  explicitCompanySlug?: string
): Promise<SearchResponse> {
  const startedAt = Date.now();
  let domain = rawDomain ? normalizeDomain(rawDomain) : '';

  if (
    !domain &&
    explicitCompanySlug &&
    slugToDomainCache.has(explicitCompanySlug)
  ) {
    domain = slugToDomainCache.get(explicitCompanySlug) || '';
  }

  if (domain && !forceRefresh) {
    const cachedEntry = domainCache.get(domain);
    if (cachedEntry && cachedEntry.expiresAt > startedAt) {
      return applyManualOverrideToSearchResponse({
        ...cachedEntry.data,
        cached: true,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  let preloadedTheOrg: TheOrgFullDiscovery | null = null;
  if (explicitCompanySlug) {
    preloadedTheOrg = await discoverViaTheOrg(
      domain,
      humanizeSlug(explicitCompanySlug),
      null,
      explicitCompanySlug
    );
    if (preloadedTheOrg && !domain) {
      domain = preloadedTheOrg.resolvedDomain;
    }
  }

  const siteInfo = domain
    ? await inspectTargetWebsite(domain)
    : {
        brandName:
          preloadedTheOrg?.companyName ||
          humanizeSlug(explicitCompanySlug || ''),
        description: '',
        inferredIndustries: ['Information Technology & Business Services'],
        linkedinCompanySlug: null,
        employees: [],
        rawWebsiteCorpus: '',
      };

  let companyName = preloadedTheOrg?.companyName || siteInfo.brandName;

  const linkedInCompanyQuery = `site:linkedin.com/in/ "${companyName}"`;
  const linkedInDomainQuery = domain
    ? `site:linkedin.com/in/ "${domain}"`
    : linkedInCompanyQuery;

  const [
    theOrgResult,
    yahooPage1,
    bingRssCompanyPage1,
    bingRssCompanyPage2,
    bingRssDomainHits,
    bingHtmlHits,
    ddgHits,
  ] = await Promise.all([
    preloadedTheOrg
      ? Promise.resolve(preloadedTheOrg)
      : discoverViaTheOrg(domain, companyName, siteInfo.linkedinCompanySlug),
    queryYahooSafe(linkedInCompanyQuery, 1),
    queryBingRss(linkedInCompanyQuery, 1),
    queryBingRss(linkedInCompanyQuery, 31),
    queryBingRss(linkedInDomainQuery, 1),
    queryBingHtml(linkedInCompanyQuery),
    domain
      ? queryDuckDuckGoHtml(`site:linkedin.com/in/ AND "@${domain}"`)
      : Promise.resolve([] as RawSearchHit[]),
  ]);

  if (theOrgResult?.companyName) {
    companyName = theOrgResult.companyName;
  }
  if (!domain && theOrgResult?.resolvedDomain) {
    domain = theOrgResult.resolvedDomain;
  }

  let searchHits: RawSearchHit[] = [
    ...yahooPage1,
    ...bingRssDomainHits,
    ...bingRssCompanyPage1,
    ...bingRssCompanyPage2,
    ...bingHtmlHits,
    ...ddgHits,
  ];

  if (!theOrgResult || theOrgResult.employees.length < 80) {
    const [yahooPage2, yahooLeadership, yahooEngSales] = await Promise.all([
      queryYahooSafe(linkedInCompanyQuery, 31),
      queryYahooSafe(
        `site:linkedin.com/in/ "${companyName}" (CEO OR Founder OR President OR VP OR Director OR Head)`,
        1
      ),
      queryYahooSafe(
        `site:linkedin.com/in/ "${companyName}" (Engineer OR Manager OR Product OR Sales OR Operations)`,
        1
      ),
    ]);
    searchHits = [
      ...searchHits,
      ...yahooLeadership,
      ...yahooEngSales,
      ...yahooPage2,
    ];
  }

  const parsedSearchCandidates = searchHits
    .map((hit) => parseLinkedInHit(hit, domain, companyName))
    .filter((item): item is CandidateEmployee => item !== null);

  const rawIndustryList =
    theOrgResult && theOrgResult.industries.length > 0
      ? theOrgResult.industries
      : siteInfo.inferredIndustries;

  const industryTags = Array.from(
    new Set(rawIndustryList.map((tag) => expandFullIndustryTitle(tag)))
  );
  const primaryIndustry =
    industryTags.join(', ') || 'Information Technology & Business Services';

  const companyDescription =
    theOrgResult?.description || siteInfo.description || '';
  const headquarters = theOrgResult?.headquarters || '';

  const candidateMap = new Map<string, CandidateEmployee>();
  const initialCandidates: CandidateEmployee[] = [
    ...(theOrgResult?.employees || []),
    ...siteInfo.employees,
    ...parsedSearchCandidates,
  ];

  for (const cand of initialCandidates) {
    const normName = normalizePersonKey(cand.fullName);
    if (!normName) continue;
    const existing = candidateMap.get(normName);
    if (!existing) {
      candidateMap.set(normName, cand);
    } else {
      const upgradedTitle =
        existing.jobTitle === 'Team Member' && cand.jobTitle !== 'Team Member'
          ? cand.jobTitle
          : existing.jobTitle;
      const observedEmail = existing.observedEmail || cand.observedEmail;
      if (
        upgradedTitle !== existing.jobTitle ||
        observedEmail !== existing.observedEmail
      ) {
        candidateMap.set(normName, {
          ...existing,
          jobTitle: upgradedTitle,
          observedEmail,
        });
      }
    }
  }

  const preliminaryList = Array.from(candidateMap.values());

  // Detect live internet highest-% email format + verified public @domain emails
  const enrichedPattern = await detectCompanyEmailPattern(
    domain,
    companyName,
    preliminaryList,
    siteInfo.rawWebsiteCorpus,
    {
      forceRefresh,
      employeeRangeHint: theOrgResult?.employeeRange,
    }
  );
  const emailPattern = enrichedPattern.analysis;

  // Merge any additional real cryptographically-verified PGP / web contacts discovered for this domain
  for (const pgpContact of enrichedPattern.discoveredContacts) {
    if (!looksLikePersonName(pgpContact.fullName)) continue;
    const normName = normalizePersonKey(pgpContact.fullName);
    if (!normName) continue;
    const existing = candidateMap.get(normName);
    if (!existing) {
      candidateMap.set(normName, {
        id: `pgp-${slugifyName(domain)}-${slugifyName(pgpContact.fullName)}`,
        fullName: pgpContact.fullName,
        jobTitle: 'Verified Domain Contact',
        orgDepth: 4,
        reportCount: 0,
        profileUrl: `https://${domain}`,
        source: 'Public Web Verified',
        observedEmail: pgpContact.email,
      });
    } else if (!existing.observedEmail) {
      candidateMap.set(normName, {
        ...existing,
        observedEmail: pgpContact.email,
      });
    }
  }

  const deduplicatedCandidates = Array.from(candidateMap.values());
  const observedEmailSet = new Set(
    emailPattern.sampleObservedEmails.map((s) => s.toLowerCase())
  );

  const unrankedEmployees: EmployeeRecord[] = deduplicatedCandidates.map(
    (cand) => {
      const importanceScore = computeImportanceScore(
        cand.jobTitle,
        cand.orgDepth ?? 4,
        cand.reportCount ?? 0
      );

      const normKey = normalizePersonKey(cand.fullName);
      const directWebEmail =
        cand.observedEmail || enrichedPattern.verifiedPersonEmails.get(normKey);

      let email = '';
      let empAccuracy = emailPattern.patternConfidence;
      let emailVerifiedOnWeb = false;
      let emailFormulaId = emailPattern.detectedFormulaId;
      let emailFormulaLabel = emailPattern.formulaLabel;

      if (directWebEmail) {
        email = directWebEmail.toLowerCase();
        empAccuracy = 99;
        emailVerifiedOnWeb = true;
        const matchedFormula = EMAIL_FORMULAS.find(
          (f) => applyExcelEmailFormula(cand.fullName, domain, f.id) === email
        );
        if (matchedFormula) {
          emailFormulaId = matchedFormula.id;
          emailFormulaLabel = matchedFormula.label;
        }
      } else {
        email = applyExcelEmailFormula(
          cand.fullName,
          domain,
          emailPattern.detectedFormulaId
        );
        const { lastName, hasComplexParts } = splitFullNameForExcel(
          cand.fullName
        );
        if (!lastName) {
          empAccuracy = Math.max(52, empAccuracy - 14);
        } else if (hasComplexParts) {
          empAccuracy = Math.max(65, empAccuracy - 4);
        }

        if (email && observedEmailSet.has(email.toLowerCase())) {
          empAccuracy = 99;
          emailVerifiedOnWeb = true;
        }
      }

      return {
        id: cand.id,
        rank: 0,
        importanceScore,
        fullName: cand.fullName,
        companyName,
        email,
        emailAccuracy: empAccuracy,
        emailFormulaId,
        emailFormulaLabel,
        emailVerifiedOnWeb,
        jobTitle: cand.jobTitle,
        industry: primaryIndustry,
        department: classifyDepartment(cand.jobTitle, cand.teamHint || ''),
        seniority: classifySeniority(cand.jobTitle),
        profileUrl: cand.profileUrl,
        domain,
        source: cand.source,
      };
    }
  );

  unrankedEmployees.sort((a, b) => {
    if (a.importanceScore !== b.importanceScore) {
      return a.importanceScore - b.importanceScore;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  const rankedEmployees = unrankedEmployees.map((emp, idx) => ({
    ...emp,
    rank: idx + 1,
  }));

  const sourcesUsed = Array.from(
    new Set(rankedEmployees.map((e) => e.source))
  ) as DiscoverySource[];

  const { departmentBreakdown, seniorityBreakdown } =
    computeBreakdowns(rankedEmployees);

  const effectiveEmpRange =
    theOrgResult?.employeeRange ||
    (rankedEmployees.length >= 1000
      ? '1,001 - 5,000'
      : rankedEmployees.length >= 200
      ? '201 - 500'
      : '51 - 200');

  const result: SearchResponse = {
    domain,
    companyName,
    companySlug: theOrgResult?.companySlug || explicitCompanySlug,
    industry: primaryIndustry,
    industryTags,
    companyDescription,
    headquarters,
    employeeRange: effectiveEmpRange,
    revenueRange: estimateCompanyRevenueRange(effectiveEmpRange, companyName),
    emailPattern,
    sourcesUsed,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    cached: false,
    employees: rankedEmployees,
    departmentBreakdown,
    seniorityBreakdown,
  };

  if (rankedEmployees.length > 0 && domain) {
    domainCache.set(domain, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  return applyManualOverrideToSearchResponse(result);
}
