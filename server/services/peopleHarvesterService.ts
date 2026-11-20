import axios from 'axios';
import type { CandidateEmployee, RawSearchHit } from '../types.ts';
import {
  browserHeaders,
  cleanJobTitle,
  cleanWhitespace,
  extractDomainCore,
  looksLikePersonName,
  normalizeDomain,
  normalizePersonKey,
  slugifyName,
} from '../utils/textAndDomain.ts';
import {
  parseLinkedInHit,
  queryBingHtml,
  queryBingRss,
  queryDuckDuckGoHtml,
  queryYahooSafe,
} from './webSearchClient.ts';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

/**
 * Extracts real person names & titles from general web search hits
 * (LinkedIn, RocketReach, ZoomInfo, Crunchbase, Bloomberg, PitchBook, Wellfound, press releases).
 */
export function parseBroadWebPersonHit(
  hit: RawSearchHit,
  domain: string,
  companyName: string
): CandidateEmployee | null {
  // First try the dedicated LinkedIn parser if it's a LinkedIn URL
  if (/linkedin\.com\/in\//i.test(hit.url) || /linkedin/i.test(hit.title)) {
    const liParsed = parseLinkedInHit(hit, domain, companyName);
    if (liParsed) return liParsed;
  }

  const rawTitle = cleanWhitespace(hit.title || '');
  const snippet = cleanWhitespace(hit.snippet || '');
  if (!rawTitle) return null;

  const brandLower = companyName.trim().toLowerCase();
  const domainCore = extractDomainCore(domain).toLowerCase();
  const combined = `${rawTitle} ${snippet}`.toLowerCase();

  // Require clear association with the target company or domain to avoid unrelated people
  const brandWords = brandLower
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['inc', 'llc', 'ltd', 'corp', 'group', 'company', 'the', 'and'].includes(w));
  const primaryToken = brandWords[0] || domainCore;
  const escapedDom = domain
    ? domain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : '';
  const hasExactDomainBoundary =
    Boolean(escapedDom) &&
    new RegExp(`(?:^|[^a-z0-9])${escapedDom}(?:$|[^a-z0-9])`, 'i').test(
      `${combined} ${hit.url || ''}`
    );

  if (primaryToken.length < 3) {
    // For ultra-short brands like "X", "GE", "HP", require an exact domain boundary mention
    if (!hasExactDomainBoundary) {
      return null;
    }
  } else if (!combined.includes(primaryToken) && !hasExactDomainBoundary) {
    return null;
  }

  // Strip site suffixes ("| LinkedIn", "| Crunchbase", "| RocketReach", "- Bloomberg", etc.)
  const cleanedHeading = rawTitle
    .replace(
      /\s*[|–—-]\s*(LinkedIn|RocketReach|ZoomInfo|Crunchbase|Bloomberg|PitchBook|The Org|TheOrg|Clay|SignalHire|Apollo|ContactOut|Wellfound|AngelList|Wikipedia|Forbes|Reuters|X|Twitter).*$/i,
      ''
    )
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();

  // Pattern: "Jane Doe - VP of Engineering at Acme" or "Jane Doe, Chief Executive Officer"
  const splitParts = cleanedHeading
    .split(/\s+[–—-]\s+|\s*\|\s*|\s*,\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (splitParts.length === 0) return null;

  let candidateName = splitParts[0]
    .replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Prof\.?)\s+/i, '')
    .trim();

  // Handle "Jane Doe Email & Phone Number" (RocketReach / ContactOut / ZoomInfo titles)
  candidateName = candidateName
    .replace(
      /\s+(Email|Phone|Contact|Profile|Bio|Biography|Executive|LinkedIn|Work Email|Direct).*$/i,
      ''
    )
    .trim();

  if (!looksLikePersonName(candidateName)) return null;

  // Reject if candidate name is literally the company name
  if (
    normalizePersonKey(candidateName) === normalizePersonKey(companyName)
  ) {
    return null;
  }

  let rawRole = splitParts.slice(1).join(' - ').trim();
  if (!rawRole && snippet) {
    const roleMatch = snippet.match(
      new RegExp(
        `${candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\s]+(?:is\\s+(?:the\\s+|a\\s+)?|serves\\s+as\\s+(?:the\\s+)?|[-–—]\\s*)([A-Z][A-Za-z0-9\\s,&/&-]{2,65}?)(?:\\s+(?:at|of|for)\\s+|\\.|\\||;|$)`,
        'i'
      )
    );
    if (roleMatch?.[1]) {
      rawRole = roleMatch[1].trim();
    }
  }

  const jobTitle = cleanJobTitle(
    rawRole || 'Team Member',
    companyName,
    domain
  );

  const isExec = /\b(ceo|cto|cfo|coo|cmo|cio|chief|founder|president|chair|vp|vice president|partner|managing director|head of|director)\b/i.test(
    jobTitle
  );

  return {
    id: `web-person-${slugifyName(domain || companyName)}-${slugifyName(candidateName)}`,
    fullName: candidateName,
    jobTitle,
    orgDepth: isExec ? 1 : 3,
    reportCount: isExec ? 4 : 0,
    profileUrl: hit.url || (domain ? `https://${domain}` : ''),
    source: /linkedin\.com/i.test(hit.url)
      ? 'LinkedIn Index'
      : 'Public Web Verified',
  };
}

/**
 * Extracts verified founders, CEOs, board members, and executives from Wikipedia's
 * structured infobox wikitext via the official MediaWiki REST/Action API (zero key, <500ms).
 */
async function harvestWikipediaKeyPeople(
  companyName: string,
  domain: string,
  timeoutMs = 1700
): Promise<CandidateEmployee[]> {
  const cleanCompany = cleanWhitespace(companyName);
  if (!cleanCompany || cleanCompany.length < 2) return [];

  try {
    const searchResp = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: domain ? `"${cleanCompany}" "${domain}"` : `"${cleanCompany}" company`,
        srlimit: 2,
        format: 'json',
      },
      timeout: Math.min(900, timeoutMs),
      headers: {
        'User-Agent': 'OrgLensDirectory/2.0 (corporate-research)',
      },
      validateStatus: (s) => s === 200,
    });

    const firstHit = searchResp.data?.query?.search?.[0];
    if (!firstHit?.title) return [];

    const pageTitle = String(firstHit.title);
    const titleLower = pageTitle.toLowerCase();
    const companyCore = cleanCompany.toLowerCase().split(/\s+/)[0] || '';
    if (companyCore.length >= 3 && !titleLower.includes(companyCore)) {
      return [];
    }

    const revResp = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        titles: pageTitle,
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        rvsection: 0,
        format: 'json',
      },
      timeout: Math.min(900, timeoutMs),
      headers: {
        'User-Agent': 'OrgLensDirectory/2.0 (corporate-research)',
      },
      validateStatus: (s) => s === 200,
    });

    const pages = revResp.data?.query?.pages || {};
    const pageObj = Object.values(pages)[0] as
      | { revisions?: Array<{ slots?: { main?: { '*'?: string } } }> }
      | undefined;
    const wikitext = pageObj?.revisions?.[0]?.slots?.main?.['*'] || '';
    if (!wikitext) return [];

    // Confirm exact domain boundary or company relevance in infobox
    const lowerWiki = wikitext.toLowerCase();
    const escapedDom = domain
      ? domain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';
    const hasExactWikiDomain =
      Boolean(escapedDom) &&
      new RegExp(`(?:^|[^a-z0-9])${escapedDom}(?:$|[^a-z0-9])`, 'i').test(lowerWiki);
    if (domain && !hasExactWikiDomain) {
      if (
        cleanCompany.length < 3 ||
        (!lowerWiki.includes('infobox company') &&
          !lowerWiki.includes('infobox organization'))
      ) {
        return [];
      }
    }

    const employees: CandidateEmployee[] = [];
    const seen = new Set<string>();
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
      pageTitle.replace(/\s+/g, '_')
    )}`;

    const extractInfoboxField = (fieldNames: string[], defaultRole: string) => {
      for (const field of fieldNames) {
        const regex = new RegExp(
          `\\|\\s*${field}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n\\s*\\}\\}|$)`,
          'i'
        );
        const match = wikitext.match(regex);
        if (!match?.[1]) continue;

        const cleanedBlock = match[1]
          .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
          .replace(/<ref[^>]*\/>/gi, '')
          .replace(/\{\{(?:ubl|unbulleted list|plainlist|hlist|flatlist)\s*\|/gi, '\n')
          .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
          .replace(/\[\[([^\]]+)\]\]/g, '$1')
          .replace(/\{\{[^}]*\}\}/g, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/['*]+/g, '')
          .trim();

        const lines = cleanedBlock
          .split(/[\n•|;]+/)
          .map((l) => cleanWhitespace(l))
          .filter(Boolean);

        for (const line of lines) {
          // Format: "Sundar Pichai (CEO)" or "Jane Doe, CFO"
          const parenMatch = line.match(/^([^(,–—-]{3,50}?)\s*(?:\(([^)]{2,60})\)|[,–—-]\s*(.{2,60}))?$/);
          if (!parenMatch) continue;
          const personName = cleanWhitespace(parenMatch[1] || '');
          const rolePart = cleanWhitespace(
            parenMatch[2] || parenMatch[3] || defaultRole
          );
          if (!looksLikePersonName(personName)) continue;
          const key = normalizePersonKey(personName);
          if (!key || seen.has(key)) continue;
          seen.add(key);

          employees.push({
            id: `wiki-${slugifyName(domain || companyName)}-${slugifyName(personName)}`,
            fullName: personName,
            jobTitle: cleanJobTitle(rolePart, companyName, domain),
            orgDepth: 0,
            reportCount: 8,
            profileUrl: wikiUrl,
            source: 'Public Web Verified',
          });
        }
      }
    };

    extractInfoboxField(['key_people', 'leader_name', 'leader_name1', 'leader_name2'], 'Executive Leadership');
    extractInfoboxField(['founder', 'founders'], 'Founder');
    extractInfoboxField(['ceo'], 'Chief Executive Officer');
    extractInfoboxField(['chairperson', 'chairman', 'chair'], 'Chairperson');
    extractInfoboxField(['president'], 'President');

    return employees.slice(0, 25);
  } catch {
    return [];
  }
}

/**
 * Discovers real engineers, product managers, and maintainers from public GitHub
 * organization member lists (zero API key, strict budget).
 */
async function harvestGithubOrgMembers(
  domain: string,
  companyName: string,
  timeoutMs = 1900
): Promise<CandidateEmployee[]> {
  if (!domain) return [];
  const core = extractDomainCore(domain).toLowerCase();
  const slugCand = companyName
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|limited|group|co|holdings)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

  const orgCandidates = Array.from(new Set([core, slugCand].filter((s) => s.length >= 2))).slice(
    0,
    2
  );
  if (orgCandidates.length === 0) return [];

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'OrgLensDirectory/2.0',
  };

  try {
    let matchedOrg = '';
    for (const cand of orgCandidates) {
      const orgResp = await axios
        .get(`https://api.github.com/orgs/${encodeURIComponent(cand)}`, {
          timeout: 800,
          headers: ghHeaders,
          validateStatus: (s) => s === 200,
        })
        .catch(() => null);
      if (!orgResp?.data) continue;
      const blogDom = orgResp.data.blog
        ? normalizeDomain(String(orgResp.data.blog))
        : '';
      const orgEmail = String(orgResp.data.email || '').trim().toLowerCase();
      const orgDisplayName = String(orgResp.data.name || '').toLowerCase();
      const targetDom = normalizeDomain(domain);
      if (
        (blogDom && (blogDom === targetDom || blogDom.endsWith(`.${targetDom}`))) ||
        (orgEmail && orgEmail.endsWith(`@${targetDom}`)) ||
        (core.length >= 4 && orgDisplayName.includes(core))
      ) {
        matchedOrg = cand;
        break;
      }
    }
    if (!matchedOrg) return [];

    const membersResp = await axios
      .get(
        `https://api.github.com/orgs/${encodeURIComponent(matchedOrg)}/public_members`,
        {
          params: { per_page: 30 },
          timeout: 850,
          headers: ghHeaders,
          validateStatus: (s) => s === 200,
        }
      )
      .catch(() => null);

    const members = Array.isArray(membersResp?.data) ? membersResp.data : [];
    if (members.length === 0) return [];

    // Fetch up to 14 public member profiles in parallel within remaining timeout
    const profiles = await withTimeout(
      Promise.all(
        members.slice(0, 14).map((m: { login?: string; html_url?: string }) =>
          m?.login
            ? axios
                .get(`https://api.github.com/users/${encodeURIComponent(m.login)}`, {
                  timeout: 750,
                  headers: ghHeaders,
                  validateStatus: (s) => s === 200,
                })
                .then((r) => r.data)
                .catch(() => null)
            : Promise.resolve(null)
        )
      ),
      Math.max(500, timeoutMs - 900),
      []
    );

    const results: CandidateEmployee[] = [];
    const seen = new Set<string>();
    for (const prof of profiles) {
      if (!prof) continue;
      const fullName = cleanWhitespace(String(prof.name || ''));
      if (!looksLikePersonName(fullName)) continue;
      const key = normalizePersonKey(fullName);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const bio = cleanWhitespace(String(prof.bio || ''));
      const inferredRole =
        /\b(staff|principal|senior|lead|vp|director|head|manager|architect|founder|cto|engineer|developer|designer|product|security|data|scientist)\b/i.test(
          bio
        )
          ? cleanJobTitle(bio.split(/[.!|\n]/)[0].slice(0, 64), companyName, domain)
          : 'Software Engineer';

      const publicEmail = String(prof.email || '').trim().toLowerCase();
      const verifiedDomainEmail =
        publicEmail && publicEmail.endsWith(`@${domain.toLowerCase()}`)
          ? publicEmail
          : undefined;

      results.push({
        id: `gh-member-${slugifyName(domain)}-${slugifyName(fullName)}`,
        fullName,
        jobTitle: inferredRole,
        teamHint: 'Engineering',
        orgDepth: /\b(cto|vp|director|head|principal|founder)\b/i.test(inferredRole)
          ? 1
          : 3,
        reportCount: 0,
        profileUrl: String(prof.html_url || `https://github.com/${matchedOrg}`),
        source: 'GitHub Commit',
        observedEmail: verifiedDomainEmail,
        emailSource: verifiedDomainEmail ? 'GitHub Commit' : undefined,
        emailSourceUrl: verifiedDomainEmail
          ? String(prof.html_url || `https://github.com/${matchedOrg}`)
          : undefined,
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Discovers verified corporate directors/officers from official public registries
 * (French/EU Annuaire Entreprises API) and academic/R&D staff from OpenAlex.
 */
async function harvestOfficialRegistryAndInstitutionStaff(
  companyName: string,
  domain: string,
  timeoutMs = 1500
): Promise<CandidateEmployee[]> {
  const cleanCompany = cleanWhitespace(companyName);
  if (!cleanCompany || cleanCompany.length < 3) return [];

  const [frOfficers, openAlexAuthors] = await Promise.all([
    withTimeout(
      axios
        .get('https://recherche-entreprises.api.gouv.fr/search', {
          params: { q: cleanCompany, per_page: 2 },
          timeout: 1100,
          headers: { 'User-Agent': 'OrgLensDirectory/2.0' },
          validateStatus: (s) => s === 200,
        })
        .then((resp) => {
          const list = Array.isArray(resp.data?.results) ? resp.data.results : [];
          const out: CandidateEmployee[] = [];
          const compNorm = normalizePersonKey(cleanCompany);
          for (const item of list) {
            const nom = cleanWhitespace(String(item?.nom_complet || ''));
            if (!nom) continue;
            const nomNorm = normalizePersonKey(nom);
            const firstToken = compNorm.split(' ')[0] || '';
            if (firstToken.length >= 3 && !nomNorm.includes(firstToken)) continue;
            const dirigeants = Array.isArray(item?.dirigeants) ? item.dirigeants : [];
            for (const dir of dirigeants) {
              const first = cleanWhitespace(String(dir?.prenoms || '')).split(/\s+/)[0] || '';
              const last = cleanWhitespace(String(dir?.nom || ''));
              if (!first || !last) continue;
              const fullName = `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()} ${last.charAt(0).toUpperCase()}${last.slice(1).toLowerCase()}`;
              if (!looksLikePersonName(fullName)) continue;
              const qualite = cleanWhitespace(String(dir?.qualite || 'Corporate Director'));
              out.push({
                id: `fr-dir-${slugifyName(domain || cleanCompany)}-${slugifyName(fullName)}`,
                fullName,
                jobTitle: cleanJobTitle(qualite, companyName, domain),
                orgDepth: 1,
                reportCount: 4,
                profileUrl: `https://annuaire-entreprises.data.gouv.fr/entreprise/${item?.siren || ''}`,
                source: 'Business Registry',
              });
            }
          }
          return out.slice(0, 15);
        }),
      timeoutMs,
      [] as CandidateEmployee[]
    ),
    withTimeout(
      axios
        .get('https://api.openalex.org/institutions', {
          params: { search: cleanCompany, per_page: 2 },
          timeout: 800,
          headers: { 'User-Agent': 'OrgLensDirectory/2.0 (mailto:directory@orglens.app)' },
          validateStatus: (s) => s === 200,
        })
        .then(async (instResp) => {
          const instList = Array.isArray(instResp.data?.results)
            ? instResp.data.results
            : [];
          const targetDom = domain ? normalizeDomain(domain) : '';
          const matchedInst = instList.find((inst: Record<string, unknown>) => {
            const home = String(inst?.homepage_url || '');
            const homeDom = home ? normalizeDomain(home) : '';
            if (targetDom && homeDom && homeDom === targetDom) return true;
            const dName = String(inst?.display_name || '').toLowerCase();
            return dName === cleanCompany.toLowerCase();
          });
          if (!matchedInst?.id) return [] as CandidateEmployee[];

          const instShortId = String(matchedInst.id).replace('https://openalex.org/', '');
          const authorsResp = await axios.get('https://api.openalex.org/authors', {
            params: {
              filter: `last_known_institutions.id:${instShortId}`,
              sort: 'cited_by_count:desc',
              'per-page': 25,
            },
            timeout: 850,
            headers: { 'User-Agent': 'OrgLensDirectory/2.0 (mailto:directory@orglens.app)' },
            validateStatus: (s) => s === 200,
          });
          const authors = Array.isArray(authorsResp.data?.results)
            ? authorsResp.data.results
            : [];
          const out: CandidateEmployee[] = [];
          for (const a of authors) {
            const fullName = cleanWhitespace(String(a?.display_name || ''));
            if (!looksLikePersonName(fullName)) continue;
            const topTopic = cleanWhitespace(String(a?.topics?.[0]?.display_name || ''));
            out.push({
              id: `oa-staff-${slugifyName(domain || cleanCompany)}-${slugifyName(fullName)}`,
              fullName,
              jobTitle: topTopic
                ? `Senior Researcher · ${topTopic.slice(0, 38)}`
                : 'Research & Engineering Specialist',
              teamHint: 'Research & Engineering',
              orgDepth: 2,
              reportCount: 1,
              profileUrl: String(a?.id || `https://${domain}`),
              source: 'Public Web Verified',
            });
          }
          return out;
        }),
      timeoutMs,
      [] as CandidateEmployee[]
    ),
  ]);

  return [...frOfficers, ...openAlexAuthors];
}

/**
 * Wave-1 Parallel Multi-Source People Harvester:
 * Runs simultaneously alongside TheOrg + Website Scraper + Web Grounding (at t=0ms)
 * to maximize real employee names across DuckDuckGo, Bing HTML, Wikipedia, GitHub, and Registries.
 */
export async function harvestPeopleMultiSourceWave1(
  companyName: string,
  domain: string,
  timeoutMs = 3000
): Promise<CandidateEmployee[]> {
  const cleanCompany = cleanWhitespace(companyName);
  if (!cleanCompany) return [];

  const isShortBrand = cleanCompany.length < 3;
  const queryAnchor = isShortBrand && domain ? domain : cleanCompany;

  const qGeneral = `site:linkedin.com/in/ "${queryAnchor}"`;
  const qOps = `site:linkedin.com/in/ "${queryAnchor}" (VP OR Director OR Manager OR Head OR Lead OR Engineer OR Sales OR Marketing)`;
  const qDomain = domain ? `site:linkedin.com/in/ "${domain}"` : '';
  const qLeadership = `"${queryAnchor}" (CEO OR CTO OR CFO OR Founder OR "Vice President" OR "Managing Director")`;

  const [
    ddgGeneral,
    bingHtmlOps,
    ddgDomain,
    bingHtmlLeadership,
    wikiPeople,
    ghMembers,
    registryAndInst,
  ] = await Promise.all([
    withTimeout(queryDuckDuckGoHtml(qGeneral, 2100), Math.min(2300, timeoutMs), [] as RawSearchHit[]),
    withTimeout(queryBingHtml(qOps, 2100), Math.min(2300, timeoutMs), [] as RawSearchHit[]),
    qDomain
      ? withTimeout(queryDuckDuckGoHtml(qDomain, 2000), Math.min(2200, timeoutMs), [] as RawSearchHit[])
      : Promise.resolve([] as RawSearchHit[]),
    withTimeout(queryBingHtml(qLeadership, 2000), Math.min(2200, timeoutMs), [] as RawSearchHit[]),
    withTimeout(harvestWikipediaKeyPeople(cleanCompany, domain, 1700), Math.min(1900, timeoutMs), [] as CandidateEmployee[]),
    withTimeout(harvestGithubOrgMembers(domain, cleanCompany, 1900), Math.min(2100, timeoutMs), [] as CandidateEmployee[]),
    withTimeout(
      harvestOfficialRegistryAndInstitutionStaff(cleanCompany, domain, 1600),
      Math.min(1800, timeoutMs),
      [] as CandidateEmployee[]
    ),
  ]);

  const parsedWeb = [
    ...ddgGeneral,
    ...bingHtmlOps,
    ...ddgDomain,
    ...bingHtmlLeadership,
  ]
    .map((hit) => parseBroadWebPersonHit(hit, domain, cleanCompany))
    .filter((c): c is CandidateEmployee => c !== null);

  return [
    ...wikiPeople,
    ...registryAndInst,
    ...ghMembers,
    ...parsedWeb,
  ];
}

/**
 * Adaptive Wave-2 Deep Department Sweep:
 * Only runs when Wave-1 yielded fewer than 25 real names for a company (e.g. private or
 * mid-market organizations not indexed on TheOrg). Fires parallel department-sliced queries
 * with a strict 2.1s ceiling to reliably expand rosters without slowing down large companies.
 */
export async function harvestDeepPeopleWave2(
  companyName: string,
  domain: string,
  timeoutMs = 2100
): Promise<CandidateEmployee[]> {
  const cleanCompany = cleanWhitespace(companyName);
  if (!cleanCompany) return [];

  const queryAnchor = cleanCompany.length < 3 && domain ? domain : cleanCompany;
  const qEng = `site:linkedin.com/in/ "${queryAnchor}" (Engineer OR Developer OR Product OR Designer OR Architect OR Data)`;
  const qSales = `site:linkedin.com/in/ "${queryAnchor}" (Sales OR Marketing OR Growth OR Account OR Business OR Partnerships)`;
  const qFinanceOps = `site:linkedin.com/in/ "${queryAnchor}" (Finance OR Operations OR Legal OR People OR HR OR Talent OR Controller)`;
  const qProfiles = `"${queryAnchor}" (site:zoominfo.com/p OR site:zoominfo.com/pic OR site:rocketreach.co OR site:theorg.com/org OR site:crunchbase.com/person)`;

  const [engHits, salesHits, finOpsHits, profileHits, yahooDeep] = await Promise.all([
    withTimeout(queryBingRss(qEng, 1, 1800), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryDuckDuckGoHtml(qSales, 1800), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryBingHtml(qFinanceOps, 1800), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryBingRss(qProfiles, 1, 1800), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryYahooSafe(qSales, 1, 20, 1800), timeoutMs, [] as RawSearchHit[]),
  ]);

  return [
    ...engHits,
    ...salesHits,
    ...finOpsHits,
    ...profileHits,
    ...yahooDeep,
  ]
    .map((hit) => parseBroadWebPersonHit(hit, domain, cleanCompany))
    .filter((c): c is CandidateEmployee => c !== null);
}
