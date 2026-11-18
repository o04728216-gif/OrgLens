import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  EMAIL_FORMULAS,
  applyExcelEmailFormula,
} from '../../src/utils/emailFormulas.ts';
import type {
  CandidateEmployee,
  ConfirmedEmailHit,
  WebsiteDiscoveryInfo,
} from '../types.ts';
import { inferIndustryFromText } from '../utils/rankingAndStats.ts';
import {
  browserHeaders,
  cleanJobTitle,
  cleanWhitespace,
  extractDomainCore,
  humanizeSlug,
  looksLikePersonName,
  normalizePersonKey,
  slugifyName,
} from '../utils/textAndDomain.ts';

/**
 * Decodes Cloudflare Email Protection hex strings (`data-cfemail` or `/cdn-cgi/l/email-protection#...`)
 */
function decodeCloudflareEmail(hexString: string): string {
  const cleanHex = hexString.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6,}$/.test(cleanHex) || cleanHex.length % 2 !== 0) {
    return '';
  }
  try {
    const key = parseInt(cleanHex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < cleanHex.length; i += 2) {
      const charCode = parseInt(cleanHex.slice(i, i + 2), 16) ^ key;
      out += String.fromCharCode(charCode);
    }
    return out.trim().toLowerCase();
  } catch {
    return '';
  }
}

const ROLE_INBOX_LABELS: Record<string, { label: string; title: string }> = {
  press: { label: 'Press & Media Desk', title: 'Media Relations' },
  media: { label: 'Media Relations Desk', title: 'Communications & Press' },
  pr: { label: 'Public Relations Desk', title: 'Public Relations' },
  ir: { label: 'Investor Relations Desk', title: 'Investor Relations' },
  investors: { label: 'Investor Relations', title: 'Investor Relations' },
  partnerships: { label: 'Partnerships Team', title: 'Business Development' },
  partners: { label: 'Partner Relations', title: 'Strategic Partnerships' },
  sales: { label: 'Enterprise Sales Desk', title: 'Sales & Commercial' },
  security: { label: 'Security Response Team', title: 'Information Security' },
  legal: { label: 'Legal & Compliance Desk', title: 'Legal Counsel' },
  careers: { label: 'Talent Acquisition Desk', title: 'Recruiting & People' },
  recruiting: { label: 'Recruiting Team', title: 'Talent Acquisition' },
  hr: { label: 'People Operations Desk', title: 'Human Resources' },
};

const SKIP_NOISE_INBOXES = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'abuse',
  'postmaster',
  'webmaster',
  'dmca',
  'privacy',
  'unsubscribe',
  'mailer-daemon',
  'example',
  'test',
  'responsible.disclosure',
  'responsible-disclosure',
  'vulnerability.disclosure',
  'bugbounty',
  'bug-bounty',
  'security',
  'cert',
  'csirt',
  'psirt',
  'dpo',
  'dataprotection',
  'data.protection',
  'info',
  'contact',
  'hello',
  'hi',
  'office',
  'general',
  'enquiries',
  'inquiries',
  'support',
  'help',
  'admin',
  'billing',
  'accounts',
  'finance',
  'marketing',
  'team',
  'jobs',
]);

const NON_PERSON_ROLE_TOKENS = new Set([
  ...Object.keys(ROLE_INBOX_LABELS),
  'responsible',
  'disclosure',
  'vulnerability',
  'bounty',
  'bug',
  'protection',
  'data',
  'privacy',
  'customer',
  'customers',
  'support',
  'service',
  'services',
  'investor',
  'relations',
  'public',
  'human',
  'resources',
  'talent',
  'acquisition',
  'corporate',
  'counsel',
  'department',
  'office',
  'desk',
  'team',
  'help',
  'tech',
  'billing',
  'accounts',
  'payable',
  'receivable',
  'procurement',
  'compliance',
  'notice',
  'enquiries',
  'inquiries',
  'general',
  'contact',
  'info',
  'admin',
]);

const ROLE_TITLE_PATTERN =
  /\b(ceo|cto|cfo|coo|cmo|cio|ciso|cro|cpo|chief|founder|co-founder|president|principal|associate principal|vp|vice president|director|managing|partner|head|lead|manager|project manager|engineer|designer|interior designer|developer|associate|counsel|attorney|lawyer|analyst|specialist|officer|coordinator|consultant|architect|job captain|drafter|planner|strategist|scientist|editor|producer|advisor|controller|accountant|executive|superintendent|estimator)\b/i;

function matchEmailAgainstKnownEmployees(
  cleanEmail: string,
  domain: string,
  employees: CandidateEmployee[]
): CandidateEmployee | null {
  for (const emp of employees) {
    for (const f of EMAIL_FORMULAS) {
      if (applyExcelEmailFormula(emp.fullName, domain, f.id) === cleanEmail) {
        return emp;
      }
    }
  }
  return null;
}

function extractConfirmedWebsiteEmailsFromHtml(
  html: string,
  pageUrl: string,
  domain: string,
  companyName: string,
  discoveredEmployees: CandidateEmployee[],
  preloadedCheerio?: cheerio.CheerioAPI
): { confirmedHits: ConfirmedEmailHit[]; observedPersonalEmails: string[] } {
  const lowerDom = domain.toLowerCase();
  const hits: ConfirmedEmailHit[] = [];
  const observedPersonalEmails = new Set<string>();
  const seen = new Set<string>();

  if (
    !html.includes(lowerDom) &&
    !/mailto:|data-cfemail|&#64;|&#x40;/i.test(html)
  ) {
    return { confirmedHits: [], observedPersonalEmails: [] };
  }

  const hasEntities = /&#64;|&#x40;|&#46;|&#x2e;/i.test(html);
  const decodedHtml = hasEntities
    ? html.replace(/&#64;|&#x40;/gi, '@').replace(/&#46;|&#x2e;/gi, '.')
    : html;

  const $ =
    !hasEntities && preloadedCheerio
      ? preloadedCheerio
      : cheerio.load(decodedHtml);

  const recordEmail = (
    rawEmail: string,
    nearbyName?: string,
    nearbyRole?: string
  ) => {
    const cleanEmail = rawEmail
      .replace(/^mailto:/i, '')
      .split('?')[0]
      .split('#')[0]
      .trim()
      .toLowerCase();
    if (!cleanEmail.endsWith(`@${lowerDom}`) || seen.has(cleanEmail)) return;

    const local = cleanEmail.split('@')[0] || '';
    if (
      !local ||
      SKIP_NOISE_INBOXES.has(local) ||
      ROLE_INBOX_LABELS[local] ||
      local.includes('+') ||
      /\d{3,}/.test(local)
    ) {
      return;
    }

    observedPersonalEmails.add(cleanEmail);

    // 1. Direct match against any discovered employee on the website across all 34 formulas
    // (e.g. `patrick@marketsquarearchitects.com` -> `Patrick Weber`, `awagner@` -> `Adam Wagner`)
    const formulaMatchedEmp = matchEmailAgainstKnownEmployees(
      cleanEmail,
      lowerDom,
      discoveredEmployees
    );
    if (formulaMatchedEmp) {
      seen.add(cleanEmail);
      hits.push({
        email: cleanEmail,
        fullName: formulaMatchedEmp.fullName,
        jobTitle: cleanJobTitle(
          nearbyRole || formulaMatchedEmp.jobTitle || 'Verified Website Contact',
          companyName,
          domain
        ),
        emailSource: 'Company Website',
        sourceUrl: pageUrl,
      });
      return;
    }

    // 2. Nearby person name on the same DOM card / bio page
    if (nearbyName && looksLikePersonName(nearbyName)) {
      const nameParts = cleanWhitespace(nearbyName).toLowerCase().split(/\s+/);
      const hasRoleWord = nameParts.some((w) => NON_PERSON_ROLE_TOKENS.has(w));
      if (!hasRoleWord) {
        seen.add(cleanEmail);
        hits.push({
          email: cleanEmail,
          fullName: cleanWhitespace(nearbyName),
          jobTitle: cleanJobTitle(
            nearbyRole || 'Verified Website Contact',
            companyName,
            domain
          ),
          emailSource: 'Company Website',
          sourceUrl: pageUrl,
        });
        return;
      }
    }

    // 3. Structured `firstname.lastname@domain` belonging to a real person
    const dotParts = local.match(/^([a-z]{2,15})[._-]([a-z]{2,18})$/);
    if (
      dotParts &&
      !NON_PERSON_ROLE_TOKENS.has(dotParts[1]) &&
      !NON_PERSON_ROLE_TOKENS.has(dotParts[2])
    ) {
      const candidateName = `${
        dotParts[1].charAt(0).toUpperCase() + dotParts[1].slice(1)
      } ${dotParts[2].charAt(0).toUpperCase() + dotParts[2].slice(1)}`;
      if (looksLikePersonName(candidateName)) {
        seen.add(cleanEmail);
        hits.push({
          email: cleanEmail,
          fullName: candidateName,
          jobTitle: 'Verified Website Contact',
          emailSource: 'Company Website',
          sourceUrl: pageUrl,
        });
      }
    }
  };

  for (const emp of discoveredEmployees) {
    if (emp.observedEmail) {
      recordEmail(emp.observedEmail, emp.fullName, emp.jobTitle);
    }
  }

  const pageHeadingName = cleanWhitespace($('h1').first().text());
  const bioPagePersonHint = looksLikePersonName(pageHeadingName)
    ? pageHeadingName
    : undefined;

  $('[data-cfemail]').each((_, el) => {
    const hex = $(el).attr('data-cfemail') || '';
    const decoded = decodeCloudflareEmail(hex);
    if (decoded) {
      const card = $(el).closest('li, article, div, tr, section');
      const heading = cleanWhitespace(
        card.find('h1, h2, h3, h4, h5, strong').first().text()
      );
      recordEmail(decoded, heading || bioPagePersonHint);
    }
  });

  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const hashIdx = href.indexOf('#');
    if (hashIdx !== -1) {
      const decoded = decodeCloudflareEmail(href.slice(hashIdx + 1));
      if (decoded) {
        const card = $(el).closest('li, article, div, tr, section');
        const heading = cleanWhitespace(
          card.find('h1, h2, h3, h4, h5, strong').first().text()
        );
        recordEmail(decoded, heading || bioPagePersonHint);
      }
    }
  });

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const card = $(el).closest('li, article, div, tr, section');
    const heading = cleanWhitespace(
      card.find('h1, h2, h3, h4, h5, strong').first().text()
    );
    const linkText = cleanWhitespace($(el).text());
    const nameHint = looksLikePersonName(linkText)
      ? linkText
      : looksLikePersonName(heading)
      ? heading
      : bioPagePersonHint;
    recordEmail(href, nameHint);
  });

  const escapedDom = lowerDom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plainRx = new RegExp(
    `\\b([a-zA-Z0-9][a-zA-Z0-9._-]{1,38})@${escapedDom}\\b`,
    'gi'
  );
  const visibleText = cleanWhitespace($.text());
  let m: RegExpExecArray | null;
  while ((m = plainRx.exec(visibleText)) !== null) {
    recordEmail(`${m[1]}@${lowerDom}`, bioPagePersonHint);
  }

  return {
    confirmedHits: hits,
    observedPersonalEmails: Array.from(observedPersonalEmails),
  };
}

export function extractEmployeesFromWebsiteHtml(
  html: string,
  pageUrl: string,
  domain: string,
  companyName: string,
  preloadedCheerio?: cheerio.CheerioAPI
): { employees: CandidateEmployee[]; bioLinks: string[]; $?: cheerio.CheerioAPI } {
  const found: CandidateEmployee[] = [];
  const bioLinks = new Set<string>();
  const seenPersonKeys = new Set<string>();
  const $ = preloadedCheerio || cheerio.load(html);

  const pushUniqueEmployee = (cand: CandidateEmployee) => {
    const pk = normalizePersonKey(cand.fullName);
    if (!pk || seenPersonKeys.has(pk)) return;
    const parts = cand.fullName.toLowerCase().split(/\s+/);
    if (parts.some((w) => NON_PERSON_ROLE_TOKENS.has(w))) return;
    seenPersonKeys.add(pk);
    found.push(cand);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const rawJson = $(el).html();
    if (!rawJson) return;
    try {
      const parsed = JSON.parse(rawJson);
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        const obj = node as Record<string, unknown>;
        const typeVal = String(obj['@type'] || '');
        if (/\bPerson\b/i.test(typeVal) && typeof obj.name === 'string') {
          const name = cleanWhitespace(obj.name);
          if (looksLikePersonName(name)) {
            const rawRole =
              typeof obj.jobTitle === 'string' ? obj.jobTitle : 'Team Member';
            const jobTitle = cleanJobTitle(rawRole, companyName, domain);
            const sameAs = Array.isArray(obj.sameAs)
              ? (obj.sameAs.find(
                  (u) => typeof u === 'string' && /linkedin\.com\/in\//i.test(u)
                ) as string | undefined)
              : undefined;
            const url =
              sameAs || (typeof obj.url === 'string' ? obj.url : pageUrl);
            const rawEmail =
              typeof obj.email === 'string'
                ? obj.email.replace(/^mailto:/i, '').trim().toLowerCase()
                : undefined;
            const validObs =
              rawEmail && rawEmail.endsWith(`@${domain.toLowerCase()}`)
                ? rawEmail
                : undefined;
            pushUniqueEmployee({
              id: `site-${slugifyName(name)}`,
              fullName: name,
              jobTitle,
              profileUrl: url,
              source: 'Company Site',
              observedEmail: validObs,
              emailSource: validObs ? 'Company Website' : undefined,
              emailSourceUrl: validObs ? pageUrl : undefined,
            });
          }
        }
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') walk(val);
        }
      };
      walk(parsed);
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  // Extract person bio links like `/team/adam-wagner/`, `/people/john-puhr/`, `/leadership/...`, `/staff/...`, `/bios/...`
  $('a[href]').each((_, linkEl) => {
    const rawHref = $(linkEl).attr('href') || '';
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:')) {
      return;
    }
    let resolvedUrl = '';
    let pathname = '';
    try {
      const u = new URL(rawHref, pageUrl);
      if (!u.hostname.toLowerCase().endsWith(domain.toLowerCase())) return;
      resolvedUrl = u.toString();
      pathname = u.pathname;
    } catch {
      return;
    }

    const bioSlugMatch = pathname.match(
      /^\/(?:team|our-team|people|our-people|leadership|staff|bios|bio|principals|partners|attorneys|professionals|directory|about\/team)\/([a-z][a-z0-9-]{3,48})\/?$/i
    );
    if (!bioSlugMatch) return;

    const personSlug = bioSlugMatch[1];
    if (
      /^(index|all|join|careers|overview|leadership|management|board|archive|page)$/i.test(
        personSlug
      )
    ) {
      return;
    }

    bioLinks.add(resolvedUrl);

    const card = $(linkEl).closest('li, article, div');
    const cardHeading = cleanWhitespace(
      $(linkEl).find('h2, h3, h4, h5, strong').first().text() ||
        card.find('h2, h3, h4, h5, strong').first().text() ||
        $(linkEl).attr('title') ||
        ''
    );

    const cleanCardHeading = cardHeading
      .replace(/,\s*(AIA|NCARB|LEED.*|PE|RA|FAIA|IIDA|CPA|CFA|MBA|PhD|MD|Esq\.?)+$/i, '')
      .trim();

    const slugDerivedName = humanizeSlug(personSlug);
    const candidateName = looksLikePersonName(cleanCardHeading)
      ? cleanCardHeading
      : looksLikePersonName(slugDerivedName)
      ? slugDerivedName
      : '';

    if (!candidateName) return;

    let roleCandidate = '';
    const escapedCardHeading = cardHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedCandidateName = candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRoot =
      $(linkEl).find('p, span, div, h5, h6').length > 0 ? $(linkEl) : card;
    searchRoot.find('p, span, div, h5, h6').each((__, child) => {
      if (roleCandidate) return;
      if ($(child).children('h1, h2, h3, h4, p, div').length > 0) return;
      let txt = cleanWhitespace($(child).text());
      if (escapedCardHeading) {
        txt = txt.replace(new RegExp(`^${escapedCardHeading}\\s*[,|\\-–—/]?\\s*`, 'i'), '').trim();
      }
      if (escapedCandidateName) {
        txt = txt.replace(new RegExp(`^${escapedCandidateName}(?:,\\s*[A-Z.\\s]+)?\\s*[,|\\-–—/]?\\s*`, 'i'), '').trim();
      }
      if (
        txt &&
        txt !== cardHeading &&
        txt !== candidateName &&
        txt.length >= 2 &&
        txt.length <= 78 &&
        ROLE_TITLE_PATTERN.test(txt)
      ) {
        roleCandidate = txt;
      }
    });

    const mailtoHref =
      card.find('a[href^="mailto:"]').first().attr('href') || '';
    const cardMail = mailtoHref
      .replace(/^mailto:/i, '')
      .split('?')[0]
      .trim()
      .toLowerCase();
    const validCardMail =
      cardMail &&
      cardMail.endsWith(`@${domain.toLowerCase()}`) &&
      !SKIP_NOISE_INBOXES.has(cardMail.split('@')[0] || '')
        ? cardMail
        : undefined;

    pushUniqueEmployee({
      id: `site-bio-${slugifyName(candidateName)}`,
      fullName: candidateName,
      jobTitle: cleanJobTitle(
        roleCandidate || 'Team Member',
        companyName,
        domain
      ),
      profileUrl: resolvedUrl,
      source: 'Company Site',
      observedEmail: validCardMail,
      emailSource: validCardMail ? 'Company Website' : undefined,
      emailSourceUrl: validCardMail ? pageUrl : undefined,
    });
  });

  $('a[href*="linkedin.com/in/"]').each((_, linkEl) => {
    const rawHref = $(linkEl).attr('href') || '';
    let profileUrl = rawHref;
    try {
      const u = new URL(rawHref);
      profileUrl = `https://www.linkedin.com${u.pathname.replace(/\/+$/, '')}`;
    } catch {
      // keep rawHref
    }
    const card = $(linkEl).closest('li, article, div');
    const headingText = cleanWhitespace(
      card.find('h2, h3, h4, h5, strong').first().text() || $(linkEl).text()
    )
      .replace(/,\s*(AIA|NCARB|LEED.*|PE|RA|FAIA|IIDA|CPA|CFA|MBA|PhD|MD|Esq\.?)+$/i, '')
      .trim();
    if (!looksLikePersonName(headingText)) return;

    let roleCandidate = '';
    card.find('p, span, div').each((__, child) => {
      if (roleCandidate) return;
      const txt = cleanWhitespace($(child).text());
      if (
        txt &&
        txt !== headingText &&
        txt.length >= 2 &&
        txt.length <= 75 &&
        !looksLikePersonName(txt)
      ) {
        roleCandidate = txt;
      }
    });

    const mailtoHref = card.find('a[href^="mailto:"]').first().attr('href') || '';
    const cardMail = mailtoHref
      .replace(/^mailto:/i, '')
      .split('?')[0]
      .trim()
      .toLowerCase();
    const validCardMail =
      cardMail &&
      cardMail.endsWith(`@${domain.toLowerCase()}`) &&
      !SKIP_NOISE_INBOXES.has(cardMail.split('@')[0] || '')
        ? cardMail
        : undefined;

    pushUniqueEmployee({
      id: profileUrl.toLowerCase(),
      fullName: headingText,
      jobTitle: cleanJobTitle(
        roleCandidate || 'Team Member',
        companyName,
        domain
      ),
      profileUrl,
      source: 'Company Site',
      observedEmail: validCardMail,
      emailSource: validCardMail ? 'Company Website' : undefined,
      emailSourceUrl: validCardMail ? pageUrl : undefined,
    });
  });

  if (
    /\b(team|leadership|people|staff|founders|principals|management|attorneys|partners|board|studio|firm|press|newsroom|about)\b/i.test(
      pageUrl
    )
  ) {
    $('h2, h3, h4, h5').each((_, headingEl) => {
      const rawHeading = cleanWhitespace($(headingEl).text());
      const name = rawHeading
        .replace(
          /,\s*(AIA|NCARB|LEED.*|PE|RA|FAIA|IIDA|CPA|CFA|MBA|PhD|MD|Esq\.?)+$/i,
          ''
        )
        .trim();
      if (!looksLikePersonName(name)) return;
      const nextSibling = $(headingEl).next('p, span, div, h4, h5, h6');
      const parentRole = $(headingEl)
        .parent()
        .find('p, span, div')
        .filter((__, el) => {
          const t = cleanWhitespace($(el).text());
          return t !== rawHeading && t !== name && t.length <= 75;
        })
        .first();
      const rawRole = cleanWhitespace(nextSibling.text() || parentRole.text());
      if (
        rawRole &&
        rawRole.length >= 2 &&
        rawRole.length <= 75 &&
        ROLE_TITLE_PATTERN.test(rawRole)
      ) {
        pushUniqueEmployee({
          id: `site-card-${slugifyName(name)}`,
          fullName: name,
          jobTitle: cleanJobTitle(rawRole, companyName, domain),
          profileUrl: pageUrl,
          source: 'Company Site',
        });
      }
    });
  }

  return { employees: found, bioLinks: Array.from(bioLinks), $ };
}

export async function inspectTargetWebsite(
  domain: string
): Promise<WebsiteDiscoveryInfo> {
  let brandName = humanizeSlug(extractDomainCore(domain));
  let description = '';
  let linkedinCompanySlug: string | null = null;
  const employeesByKey = new Map<string, CandidateEmployee>();
  const confirmedEmailMap = new Map<string, ConfirmedEmailHit>();
  const observedEmailSet = new Set<string>();
  const discoveredBioLinks = new Set<string>();
  let rawWebsiteCorpus = '';

  const mergeEmployees = (list: CandidateEmployee[]) => {
    for (const emp of list) {
      const pk = normalizePersonKey(emp.fullName);
      if (!pk) continue;
      const existing = employeesByKey.get(pk);
      if (!existing) {
        employeesByKey.set(pk, emp);
      } else {
        const betterTitle =
          existing.jobTitle === 'Team Member' && emp.jobTitle !== 'Team Member'
            ? emp.jobTitle
            : existing.jobTitle;
        employeesByKey.set(pk, {
          ...existing,
          jobTitle: betterTitle,
          observedEmail: existing.observedEmail || emp.observedEmail,
          emailSource: existing.emailSource || emp.emailSource,
          emailSourceUrl: existing.emailSourceUrl || emp.emailSourceUrl,
        });
      }
    }
  };

  let homeHtml = '';
  let finalBaseUrl = `https://${domain}`;

  // Fire Homepage + high-yield `/team/`, `/people/`, `/about/`, `/contact/` CONCURRENTLY at t = 0ms
  // (trailing slashes avoid WordPress/CMS 301 redirect round-trips while keeping connection count gentle)
  const initialDirectPaths = ['/team/', '/people/', '/about/', '/contact/'];

  const [homeAttempt, ...initialSubResults] = await Promise.all([
    Promise.any(
      [`https://${domain}/`, `https://www.${domain}/`].map(
        async (candidateUrl) => {
          const resp = await axios.get(candidateUrl, {
            timeout: 2600,
            maxRedirects: 3,
            headers: browserHeaders(),
            validateStatus: (s) => s >= 200 && s < 400,
          });
          if (typeof resp.data === 'string' && resp.data.length > 150) {
            return { html: resp.data, url: candidateUrl };
          }
          throw new Error('Empty response');
        }
      )
    ).catch(() => null),
    ...initialDirectPaths.map((subPath) =>
      axios
        .get(`https://${domain}${subPath}`, {
          timeout: 2600,
          maxRedirects: 3,
          headers: browserHeaders(),
          validateStatus: (s) => s >= 200 && s < 400,
        })
        .then((resp) =>
          typeof resp.data === 'string' && resp.data.length > 60
            ? { url: `https://${domain}${subPath}`, html: resp.data }
            : null
        )
        .catch(() => null)
    ),
  ]);

  if (homeAttempt) {
    homeHtml = homeAttempt.html;
    finalBaseUrl = homeAttempt.url.replace(/\/+$/, '');
  }

  const validInitialSubs = initialSubResults.filter(
    (item): item is { url: string; html: string } => item !== null
  );

  if (!homeHtml && validInitialSubs.length === 0) {
    return {
      brandName,
      description,
      inferredIndustries: inferIndustryFromText(domain),
      linkedinCompanySlug,
      employees: [],
      confirmedEmails: [],
      observedEmails: [],
      rawWebsiteCorpus,
    };
  }

  let rawPageTitle = '';
  const extraLinkedUrls = new Set<string>();
  const alreadyFetchedPaths = new Set<string>(
    initialDirectPaths.map((p) => p.replace(/\/+$/, '').toLowerCase())
  );

  const home$ = homeHtml ? cheerio.load(homeHtml) : undefined;
  if (homeHtml && home$) {
    rawWebsiteCorpus += homeHtml.slice(0, 65000);
    const $ = home$;
    const ogSiteName = cleanWhitespace(
      $('meta[property="og:site_name"]').attr('content') || ''
    );
    const appName = cleanWhitespace(
      $('meta[name="application-name"]').attr('content') || ''
    );
    rawPageTitle = cleanWhitespace($('title').first().text());
    description = cleanWhitespace(
      $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        ''
    );

    if (ogSiteName && ogSiteName.length >= 2 && ogSiteName.length <= 42) {
      brandName = ogSiteName;
    } else if (appName && appName.length >= 2 && appName.length <= 42) {
      brandName = appName;
    } else if (rawPageTitle) {
      const titleParts = rawPageTitle
        .split(/\s*[|\-–—:]\s*/)
        .map((s) => cleanWhitespace(s))
        .filter((s) => s.length >= 2 && s.length <= 40);
      const core = extractDomainCore(domain).toLowerCase();
      const matchingPart = titleParts.find((p) =>
        p.toLowerCase().replace(/\s+/g, '').includes(core.slice(0, 4))
      );
      if (matchingPart) {
        brandName = matchingPart;
      } else if (titleParts[0] && titleParts[0].split(' ').length <= 5) {
        brandName = titleParts[0];
      }
    }

    const liCompanyMatch = homeHtml.match(
      /linkedin\.com\/company\/([a-z0-9_-]{2,60})/i
    );
    if (liCompanyMatch && liCompanyMatch[1]) {
      linkedinCompanySlug = liCompanyMatch[1].toLowerCase();
    }

    const homeParsed = extractEmployeesFromWebsiteHtml(
      homeHtml,
      finalBaseUrl,
      domain,
      brandName,
      $
    );
    mergeEmployees(homeParsed.employees);
    homeParsed.bioLinks.forEach((u) => discoveredBioLinks.add(u));

    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (
        !href ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#')
      ) {
        if (href.startsWith('mailto:')) {
          rawWebsiteCorpus += ` ${href} `;
        }
        return;
      }
      try {
        const resolved = new URL(href, finalBaseUrl);
        if (!resolved.hostname.toLowerCase().endsWith(domain.toLowerCase())) {
          return;
        }
        const normPath = resolved.pathname.replace(/\/+$/, '').toLowerCase();
        if (alreadyFetchedPaths.has(normPath)) return;
        if (
          /^\/(our-team|our-people|our-leadership|staff|principals|partners|attorneys|management|about-us|studio|firm|contact-us|press|newsroom)\/?$/i.test(
            resolved.pathname
          )
        ) {
          extraLinkedUrls.add(resolved.toString());
        }
      } catch {
        // Ignore invalid URL
      }
    });
  }

  const fetchedSubPages: Array<{
    url: string;
    html: string;
    $?: cheerio.CheerioAPI;
  }> = homeHtml ? [{ url: finalBaseUrl, html: homeHtml, $: home$ }] : [];

  for (const sub of validInitialSubs) {
    rawWebsiteCorpus += ` ${sub.html.slice(0, 48000)}`;
    if (!linkedinCompanySlug) {
      const match = sub.html.match(
        /linkedin\.com\/company\/([a-z0-9_-]{2,60})/i
      );
      if (match && match[1]) linkedinCompanySlug = match[1].toLowerCase();
    }
    const subParsed = extractEmployeesFromWebsiteHtml(
      sub.html,
      sub.url,
      domain,
      brandName
    );
    mergeEmployees(subParsed.employees);
    subParsed.bioLinks.forEach((u) => discoveredBioLinks.add(u));
    fetchedSubPages.push({ url: sub.url, html: sub.html, $: subParsed.$ });
  }

  // Only fetch extra custom nav links (like `/our-team` or `/contact-us`) if initial `/team` & `/people` found < 3 people
  if (employeesByKey.size < 3 && extraLinkedUrls.size > 0) {
    const extraPages = Array.from(extraLinkedUrls).slice(0, 3);
    const extraResponses = await Promise.allSettled(
      extraPages.map((url) =>
        axios.get(url, {
          timeout: 1150,
          maxRedirects: 3,
          headers: browserHeaders(),
          validateStatus: (s) => s >= 200 && s < 400,
        })
      )
    );
    for (let i = 0; i < extraResponses.length; i++) {
      const res = extraResponses[i];
      if (res.status === 'fulfilled' && typeof res.value.data === 'string') {
        const subHtml = res.value.data;
        const subUrl = extraPages[i];
        rawWebsiteCorpus += ` ${subHtml.slice(0, 48000)}`;
        const subParsed = extractEmployeesFromWebsiteHtml(
          subHtml,
          subUrl,
          domain,
          brandName
        );
        mergeEmployees(subParsed.employees);
        subParsed.bioLinks.forEach((u) => discoveredBioLinks.add(u));
        fetchedSubPages.push({ url: subUrl, html: subHtml, $: subParsed.$ });
      }
    }
  }

  // Now that ALL employees across Home + /team + /people + /about + /contact are merged,
  // run email matching so `patrick@marketsquarearchitects.com` on `/team` matches `Patrick Weber`!
  const allEmployeesSoFar = Array.from(employeesByKey.values());
  for (const page of fetchedSubPages) {
    const extracted = extractConfirmedWebsiteEmailsFromHtml(
      page.html,
      page.url,
      domain,
      brandName,
      allEmployeesSoFar,
      page.$
    );
    for (const hit of extracted.confirmedHits) {
      if (!confirmedEmailMap.has(hit.email)) {
        confirmedEmailMap.set(hit.email, hit);
      }
    }
    for (const obs of extracted.observedPersonalEmails) {
      observedEmailSet.add(obs);
    }
  }

  // Optional fast bio-page probe: if we found person bio links (e.g. `/team/adam-wagner/`) and fewer than 3 confirmed emails,
  // inspect up to 3 bio pages in parallel (850ms budget) to catch direct individual `mailto:` addresses!
  if (confirmedEmailMap.size < 3 && discoveredBioLinks.size > 0) {
    const bioSample = Array.from(discoveredBioLinks).slice(0, 3);
    const bioResponses = await Promise.allSettled(
      bioSample.map((bioUrl) =>
        axios.get(bioUrl, {
          timeout: 900,
          maxRedirects: 2,
          headers: browserHeaders(),
          validateStatus: (s) => s >= 200 && s < 400,
        })
      )
    );
    const updatedEmpPool = Array.from(employeesByKey.values());
    for (let i = 0; i < bioResponses.length; i++) {
      const bRes = bioResponses[i];
      if (bRes.status === 'fulfilled' && typeof bRes.value.data === 'string') {
        const bioHtml = bRes.value.data;
        const bioUrl = bioSample[i];
        rawWebsiteCorpus += ` ${bioHtml.slice(0, 22000)}`;
        const bioEmails = extractConfirmedWebsiteEmailsFromHtml(
          bioHtml,
          bioUrl,
          domain,
          brandName,
          updatedEmpPool
        );
        for (const hit of bioEmails.confirmedHits) {
          if (!confirmedEmailMap.has(hit.email)) {
            confirmedEmailMap.set(hit.email, hit);
          }
        }
        for (const obs of bioEmails.observedPersonalEmails) {
          observedEmailSet.add(obs);
        }
      }
    }
  }

  const confirmedEmails = Array.from(confirmedEmailMap.values());
  for (const ce of confirmedEmails) {
    observedEmailSet.add(ce.email);
    rawWebsiteCorpus += ` ${ce.email} `;
  }

  return {
    brandName,
    description,
    inferredIndustries: inferIndustryFromText(
      `${brandName} ${rawPageTitle} ${description}`
    ),
    linkedinCompanySlug,
    employees: Array.from(employeesByKey.values()),
    confirmedEmails,
    observedEmails: Array.from(observedEmailSet),
    rawWebsiteCorpus,
  };
}
