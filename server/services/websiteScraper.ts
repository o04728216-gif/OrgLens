import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CandidateEmployee, WebsiteDiscoveryInfo } from '../types.ts';
import { inferIndustryFromText } from '../utils/rankingAndStats.ts';
import {
  browserHeaders,
  cleanJobTitle,
  cleanWhitespace,
  extractDomainCore,
  humanizeSlug,
  looksLikePersonName,
  slugifyName,
} from '../utils/textAndDomain.ts';

export function extractEmployeesFromWebsiteHtml(
  html: string,
  pageUrl: string,
  domain: string,
  companyName: string
): CandidateEmployee[] {
  const found: CandidateEmployee[] = [];
  const $ = cheerio.load(html);

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
            found.push({
              id: `site-${slugifyName(name)}`,
              fullName: name,
              jobTitle,
              profileUrl: url,
              source: 'Company Site',
              observedEmail:
                rawEmail && rawEmail.endsWith(`@${domain.toLowerCase()}`)
                  ? rawEmail
                  : undefined,
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
    );
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

    found.push({
      id: profileUrl.toLowerCase(),
      fullName: headingText,
      jobTitle: cleanJobTitle(
        roleCandidate || 'Team Member',
        companyName,
        domain
      ),
      profileUrl,
      source: 'Company Site',
      observedEmail:
        cardMail && cardMail.endsWith(`@${domain.toLowerCase()}`)
          ? cardMail
          : undefined,
    });
  });

  if (/\b(team|leadership|people|staff|founders|management|attorneys|partners)\b/i.test(pageUrl)) {
    $('h3, h4').each((_, headingEl) => {
      const name = cleanWhitespace($(headingEl).text());
      if (!looksLikePersonName(name)) return;
      const nextSibling = $(headingEl).next('p, span, div, h5, h6');
      const parentRole = $(headingEl)
        .parent()
        .find('p, span')
        .filter((__, el) => cleanWhitespace($(el).text()) !== name)
        .first();
      const rawRole = cleanWhitespace(nextSibling.text() || parentRole.text());
      if (
        rawRole &&
        rawRole.length >= 2 &&
        rawRole.length <= 70 &&
        /\b(ceo|cto|cfo|coo|chief|founder|president|vp|vice president|director|head|lead|manager|engineer|designer|developer|partner|associate|counsel|attorney|lawyer|analyst|specialist|officer|coordinator|consultant|architect|scientist|editor|producer|advisor)\b/i.test(
          rawRole
        )
      ) {
        found.push({
          id: `site-card-${slugifyName(name)}`,
          fullName: name,
          jobTitle: cleanJobTitle(rawRole, companyName, domain),
          profileUrl: pageUrl,
          source: 'Company Site',
        });
      }
    });
  }

  return found;
}

export async function inspectTargetWebsite(
  domain: string
): Promise<WebsiteDiscoveryInfo> {
  let brandName = humanizeSlug(extractDomainCore(domain));
  let description = '';
  let linkedinCompanySlug: string | null = null;
  const employees: CandidateEmployee[] = [];
  let rawWebsiteCorpus = '';

  let homeHtml = '';
  let finalBaseUrl = `https://${domain}`;

  for (const candidateUrl of [
    `https://${domain}`,
    `https://www.${domain}`,
    `http://${domain}`,
  ]) {
    try {
      const resp = await axios.get(candidateUrl, {
        timeout: 4800,
        maxRedirects: 4,
        headers: browserHeaders(),
        validateStatus: (s) => s >= 200 && s < 400,
      });
      if (typeof resp.data === 'string' && resp.data.length > 200) {
        homeHtml = resp.data;
        finalBaseUrl = candidateUrl;
        break;
      }
    } catch {
      // Try next variant
    }
  }

  if (!homeHtml) {
    return {
      brandName,
      description,
      inferredIndustries: inferIndustryFromText(domain),
      linkedinCompanySlug,
      employees,
      rawWebsiteCorpus,
    };
  }

  rawWebsiteCorpus += homeHtml.slice(0, 65000);
  const $ = cheerio.load(homeHtml);
  const ogSiteName = cleanWhitespace(
    $('meta[property="og:site_name"]').attr('content') || ''
  );
  const appName = cleanWhitespace(
    $('meta[name="application-name"]').attr('content') || ''
  );
  const rawPageTitle = cleanWhitespace($('title').first().text());
  description = cleanWhitespace(
    $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
  );

  if (ogSiteName && ogSiteName.length >= 2 && ogSiteName.length <= 36) {
    brandName = ogSiteName;
  } else if (appName && appName.length >= 2 && appName.length <= 36) {
    brandName = appName;
  } else if (rawPageTitle) {
    const titleParts = rawPageTitle
      .split(/\s*[|\-–—:]\s*/)
      .map((s) => cleanWhitespace(s))
      .filter((s) => s.length >= 2 && s.length <= 34);
    const core = extractDomainCore(domain).toLowerCase();
    const matchingPart = titleParts.find((p) =>
      p.toLowerCase().replace(/\s+/g, '').includes(core.slice(0, 4))
    );
    if (matchingPart) {
      brandName = matchingPart;
    } else if (titleParts[0] && titleParts[0].split(' ').length <= 4) {
      brandName = titleParts[0];
    }
  }

  const liCompanyMatch = homeHtml.match(
    /linkedin\.com\/company\/([a-z0-9_-]{2,60})/i
  );
  if (liCompanyMatch && liCompanyMatch[1]) {
    linkedinCompanySlug = liCompanyMatch[1].toLowerCase();
  }

  employees.push(
    ...extractEmployeesFromWebsiteHtml(homeHtml, finalBaseUrl, domain, brandName)
  );

  const subLinks = new Set<string>();
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
      if (!resolved.hostname.endsWith(domain)) return;
      if (
        /^\/(team|our-team|about|about-us|leadership|our-leadership|people|our-people|who-we-are|company|management|founders|attorneys|partners|contact|press)\/?$/i.test(
          resolved.pathname
        )
      ) {
        subLinks.add(resolved.toString());
      }
    } catch {
      // Ignore
    }
  });

  if (subLinks.size === 0) {
    subLinks.add(`${finalBaseUrl}/team`);
    subLinks.add(`${finalBaseUrl}/about`);
    subLinks.add(`${finalBaseUrl}/contact`);
  }

  const pagesToFetch = Array.from(subLinks).slice(0, 4);
  const subResponses = await Promise.allSettled(
    pagesToFetch.map((url) =>
      axios.get(url, {
        timeout: 4200,
        maxRedirects: 3,
        headers: browserHeaders(),
        validateStatus: (s) => s === 200,
      })
    )
  );

  for (let i = 0; i < subResponses.length; i++) {
    const res = subResponses[i];
    if (res.status === 'fulfilled' && typeof res.value.data === 'string') {
      const subHtml = res.value.data;
      rawWebsiteCorpus += ` ${subHtml.slice(0, 45000)}`;
      const subDoc = cheerio.load(subHtml);
      subDoc('a[href^="mailto:"]').each((_, mEl) => {
        rawWebsiteCorpus += ` ${subDoc(mEl).attr('href') || ''} `;
      });
      if (!linkedinCompanySlug) {
        const match = subHtml.match(
          /linkedin\.com\/company\/([a-z0-9_-]{2,60})/i
        );
        if (match && match[1]) linkedinCompanySlug = match[1].toLowerCase();
      }
      employees.push(
        ...extractEmployeesFromWebsiteHtml(
          subHtml,
          pagesToFetch[i],
          domain,
          brandName
        )
      );
    }
  }

  return {
    brandName,
    description,
    inferredIndustries: inferIndustryFromText(
      `${brandName} ${rawPageTitle} ${description}`
    ),
    linkedinCompanySlug,
    employees,
    rawWebsiteCorpus,
  };
}
