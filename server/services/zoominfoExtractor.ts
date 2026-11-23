import axios from 'axios';
import type { ZoomInfoCompanyIntel } from '../../src/types.ts';
import { sanitizeRevenueDisplay } from '../../src/utils/geographyAndRevenue.ts';
import type { CandidateEmployee, RawSearchHit } from '../types.ts';
import {
  cleanJobTitle,
  cleanWhitespace,
  extractDomainCore,
  looksLikePersonName,
  normalizePersonKey,
  slugifyName,
} from '../utils/textAndDomain.ts';
import {
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
 * Unwraps Bing click-tracking redirect URLs (`bing.com/ck/a?...&u=a1<base64>`)
 * so real `zoominfo.com/c/`, `zoominfo.com/p/`, and `zoominfo.com/pic/` URLs are recognized cleanly.
 */
function unwrapSearchUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (/bing\.com\/ck\/a/i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      const enc = parsed.searchParams.get('u');
      if (enc && enc.startsWith('a1')) {
        const decoded = Buffer.from(enc.slice(2), 'base64url').toString('utf8');
        if (decoded.startsWith('http')) return decoded;
      }
    } catch {
      // Fall back to raw URL
    }
  }
  return rawUrl;
}

function hitMatchesTargetCompany(
  hit: RawSearchHit,
  unwrappedUrl: string,
  companyName: string,
  domain: string
): boolean {
  const combined = `${hit.title || ''} ${hit.snippet || ''} ${unwrappedUrl}`.toLowerCase();
  const cleanDom = (domain || '').trim().toLowerCase();
  const domCore = extractDomainCore(cleanDom).toLowerCase();

  if (cleanDom) {
    const escapedDom = cleanDom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(`(?:^|[^a-z0-9])${escapedDom}(?:$|[^a-z0-9])`, 'i').test(
        combined
      )
    ) {
      return true;
    }
  }

  const brandWords = companyName
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        ![
          'inc',
          'llc',
          'ltd',
          'corp',
          'corporation',
          'group',
          'company',
          'the',
          'and',
          'limited',
          'holdings',
        ].includes(w)
    );

  if (brandWords.length === 0) {
    return domCore.length >= 3 && combined.includes(domCore);
  }

  const primary = brandWords[0];
  const escapedPrimary = primary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escapedPrimary}(?:$|[^a-z0-9])`, 'i').test(
    combined
  );
}

function parseZoomInfoCompanyHits(
  hits: RawSearchHit[],
  companyName: string,
  domain: string
): ZoomInfoCompanyIntel | null {
  const normalized = hits.map((h) => ({
    hit: h,
    url: unwrapSearchUrl(h.url || ''),
  }));

  const validHits = normalized.filter(
    ({ hit, url }) =>
      /zoominfo\.com\/(c|pic)\//i.test(url) &&
      hitMatchesTargetCompany(hit, url, companyName, domain)
  );
  if (validHits.length === 0) return null;

  const intel: ZoomInfoCompanyIntel = {};

  const companyProfileHit =
    validHits.find(({ url }) => /zoominfo\.com\/c\//i.test(url)) ||
    validHits[0];
  if (companyProfileHit?.url) {
    intel.profileUrl = companyProfileHit.url.split('?')[0];
  }

  const mergedText = validHits
    .map(
      ({ hit }) =>
        `${cleanWhitespace(hit.title || '')}. ${cleanWhitespace(hit.snippet || '')}`
    )
    .join(' | ');

  const revMatch =
    mergedText.match(
      /(?:revenue(?:\s+is|\s+of|\s*:)?\s*)((?:under\s+|<\s*)?[\$€£]\s*\d{1,4}(?:,\d{3})*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|tn|bn|mn|t|b|m|k)(?:\+|(?=\b|[^a-zA-Z]|$))(?:\s*[-–—]\s*[\$€£]?\s*\d{1,4}(?:,\d{3})*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|tn|bn|mn|t|b|m|k)(?:\+|(?=\b|[^a-zA-Z]|$)))?)/i
    ) ||
    mergedText.match(
      /((?:under\s+|<\s*)?[\$€£]\s*\d{1,4}(?:,\d{3})*(?:\.\d{1,3})?\s*(?:trillion|billion|million|bn|mn)(?:\+|(?=\b|[^a-zA-Z]|$)))(?:\s+in\s+revenue|\s+revenue)/i
    );
  if (revMatch?.[1]) {
    const cleanRev = sanitizeRevenueDisplay(revMatch[1]);
    if (cleanRev) {
      intel.revenue = cleanRev;
    }
  }

  const empMatch =
    mergedText.match(
      /(\d{1,3}(?:,\d{3})+|\d{2,6}\+?)\s*(?:employees|staff|workers)/i
    ) ||
    mergedText.match(
      /employs\s+(?:over\s+|approximately\s+)?(\d{1,3}(?:,\d{3})+|\d{2,6}\+?)/i
    );
  if (empMatch?.[1]) {
    intel.headcount = `${empMatch[1]} employees`;
  }

  const phoneMatch = mergedText.match(
    /(?:phone(?:\s+number)?(?:\s+is|\s*:)?\s*)?(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/i
  );
  if (phoneMatch?.[0]) {
    const cleanedPhone = phoneMatch[0]
      .replace(/^phone(?:\s+number)?(?:\s+is|\s*:)?\s*/i, '')
      .trim();
    if (cleanedPhone.length >= 10 && cleanedPhone.length <= 22) {
      intel.phone = cleanedPhone;
    }
  }

  const hqMatch = mergedText.match(
    /(?:headquartered|located)\s+in\s+([A-Z][A-Za-z\s.'-]{2,45}(?:,\s*[A-Z][A-Za-z\s.'-]{1,35}){0,2})/
  );
  if (hqMatch?.[1]) {
    const cleanedHq = cleanWhitespace(
      hqMatch[1].replace(/\s+(?:and|with|that|which|is|has|in)\b.*$/i, '')
    );
    if (cleanedHq.length >= 3 && cleanedHq.length <= 75) {
      intel.headquarters = cleanedHq;
    }
  }

  const indMatch = mergedText.match(
    /(?:industry(?:\s+is|\s*:)?\s*|operates\s+in\s+the\s+)([A-Z][A-Za-z0-9\s,&/-]{3,48}?)(?:\s+industry|\s+sector|\.|,|;|\|)/i
  );
  if (indMatch?.[1]) {
    intel.industry = cleanWhitespace(indMatch[1]);
  }

  const bestSnippet = cleanWhitespace(companyProfileHit?.hit.snippet || '');
  if (bestSnippet.length >= 30) {
    intel.summary = bestSnippet.slice(0, 260);
  }

  const hasAnySignal = Boolean(
    intel.profileUrl ||
      intel.revenue ||
      intel.headcount ||
      intel.phone ||
      intel.headquarters ||
      intel.summary
  );
  return hasAnySignal ? intel : null;
}

function parseZoomInfoPersonHit(
  hit: RawSearchHit,
  companyName: string,
  domain: string
): CandidateEmployee | null {
  const url = unwrapSearchUrl(hit.url || '');
  if (!/zoominfo\.com\/(p|pic)\//i.test(url)) return null;
  if (!hitMatchesTargetCompany(hit, url, companyName, domain)) return null;

  const rawTitle = cleanWhitespace(hit.title || '');
  const snippet = cleanWhitespace(hit.snippet || '');
  if (!rawTitle) return null;

  const stripped = rawTitle
    .replace(/\s*[|–—-]\s*ZoomInfo.*$/i, '')
    .replace(/\s*Email\s*&\s*Phone\s*Number.*$/i, '')
    .replace(/\s*Contact\s*Information.*$/i, '')
    .replace(/^View\s+/i, '')
    .trim();

  const parts = stripped
    .split(/\s+[–—-]\s+|\s*\|\s*|\s*,\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const candidateName = parts[0]
    .replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Prof\.?)\s+/i, '')
    .replace(/'s$/i, '')
    .trim();

  if (!looksLikePersonName(candidateName)) return null;
  if (normalizePersonKey(candidateName) === normalizePersonKey(companyName)) {
    return null;
  }

  let rawRole = parts.slice(1).join(' - ').trim();
  if (!rawRole && snippet) {
    const roleFromSnippet =
      snippet.match(
        new RegExp(
          `${candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:is\\s+(?:the\\s+|a\\s+)?|works\\s+as\\s+(?:a\\s+|an\\s+|the\\s+)?)([A-Z][A-Za-z0-9\\s,&/-]{2,65}?)(?:\\s+(?:at|for|with)\\s+|\\.|,|;|$)`,
          'i'
        )
      ) ||
      snippet.match(
        /(?:title|position|role)(?:\s+is|\s*:)\s*([A-Z][A-Za-z0-9\s,&/-]{2,60}?)(?:\.|,|;|\||at\s+)/i
      );
    if (roleFromSnippet?.[1]) {
      rawRole = roleFromSnippet[1].trim();
    }
  }

  const jobTitle = cleanJobTitle(
    rawRole || 'Decision Maker',
    companyName,
    domain
  );

  const isExec =
    /\b(ceo|cto|cfo|coo|cmo|cio|cro|chief|founder|president|chair|vp|vice president|partner|managing director|head of|director)\b/i.test(
      jobTitle
    );

  return {
    id: `zi-person-${slugifyName(domain || companyName)}-${slugifyName(candidateName)}`,
    fullName: candidateName,
    jobTitle,
    orgDepth: isExec ? 1 : 2,
    reportCount: isExec ? 5 : 1,
    profileUrl: url.split('?')[0],
    source: 'ZoomInfo Index',
  };
}

function extractNamesFromZoomInfoDirectorySnippets(
  hits: RawSearchHit[],
  companyName: string,
  domain: string
): CandidateEmployee[] {
  const out: CandidateEmployee[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const url = unwrapSearchUrl(hit.url || '');
    if (!/zoominfo\.com\/(c|pic)\//i.test(url)) continue;
    if (!hitMatchesTargetCompany(hit, url, companyName, domain)) continue;

    const snippet = cleanWhitespace(hit.snippet || '');
    if (!snippet) continue;

    const regex =
      /\b([A-Z][a-z]{1,18}\s+[A-Z][a-z'-]{1,22})\s*(?:\(([^)]{2,48})\)|,\s*((?:Chief|VP|Vice President|Director|Head|President|Founder|Co-Founder|CEO|CFO|CTO|COO|CMO|CIO|CRO|SVP|EVP|Manager|Lead)[A-Za-z\s&/-]{0,42}))/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(snippet)) !== null) {
      const name = cleanWhitespace(m[1] || '');
      const role = cleanWhitespace(m[2] || m[3] || '');
      if (!looksLikePersonName(name)) continue;
      if (normalizePersonKey(name) === normalizePersonKey(companyName)) continue;
      const key = normalizePersonKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      out.push({
        id: `zi-dir-${slugifyName(domain || companyName)}-${slugifyName(name)}`,
        fullName: name,
        jobTitle: cleanJobTitle(
          role || 'Executive Leadership',
          companyName,
          domain
        ),
        orgDepth: 1,
        reportCount: 4,
        profileUrl: url.split('?')[0],
        source: 'ZoomInfo Index',
      });
    }
  }

  return out;
}

function formatWikiCurrencyTemplate(
  symbol: string,
  paramsRaw: string
): string {
  const positional = paramsRaw
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p && !p.includes('='));
  if (positional.length === 0) return '';
  return `${symbol}${positional.slice(0, 2).join(' ')}`;
}

function stripWikiMarkup(raw: string): string {
  return cleanWhitespace(
    raw
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<ref[^>]*\/>/gi, '')
      .replace(/&nbsp;|&#160;|&#xA0;|\u00A0/gi, ' ')
      .replace(/&ndash;|&mdash;/gi, '-')
      .replace(/&amp;/gi, '&')
      .replace(/\{\{(?:nbsp|spaces)[^}]*\}\}/gi, ' ')
      .replace(/\{\{(?:increase|decrease|steady|gain|loss|profit|up|down)[^}]*\}\}/gi, '')
      .replace(/\{\{(?:nowrap|nobreak|circa|small)\s*\|([^}]+)\}\}/gi, '$1')
      .replace(/\{\{(?:US\$|USD|\$|CA\$|CAD|AU\$|AUD)\|([^}]+)\}\}/gi, (_, p: string) =>
        formatWikiCurrencyTemplate('$', p)
      )
      .replace(/\{\{(?:EUR|Euro|€)\|([^}]+)\}\}/gi, (_, p: string) =>
        formatWikiCurrencyTemplate('€', p)
      )
      .replace(/\{\{(?:GBP|£)\|([^}]+)\}\}/gi, (_, p: string) =>
        formatWikiCurrencyTemplate('£', p)
      )
      .replace(
        /\{\{currency\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi,
        (_, amount: string, code: string) => {
          const c = code.trim().toUpperCase();
          const sym =
            c === 'EUR' || c === 'EURO'
              ? '€'
              : c === 'GBP'
              ? '£'
              : c === 'USD' || c === 'US$' || c === 'US' || c === 'CAD' || c === 'AUD'
              ? '$'
              : '';
          return sym ? `${sym}${amount.trim()}` : amount.trim();
        }
      )
      .replace(/\{\{(?:ubl|unbulleted list|plainlist|hlist|flatlist)\s*\|/gi, ' ')
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\{\{[^}]*\}\}/g, ' ')
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/['*]+/g, '')
      .replace(/\s*\(\d{4}[^)]*\)/g, '')
  );
}

/**
 * Extracts verified corporate firmographics (Revenue, Headcount, HQ, Industry, Summary)
 * from Wikipedia's structured company infobox in < 650ms (zero API key, reliable everywhere).
 */
async function fetchWikipediaCompanyFirmographics(
  companyName: string,
  domain: string,
  timeoutMs = 1400
): Promise<ZoomInfoCompanyIntel | null> {
  const cleanCompany = cleanWhitespace(companyName);
  if (!cleanCompany || cleanCompany.length < 2) return null;

  try {
    const searchResp = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: domain
          ? `"${cleanCompany}" "${domain}"`
          : `"${cleanCompany}" company`,
        srlimit: 2,
        format: 'json',
      },
      timeout: Math.min(750, timeoutMs),
      headers: { 'User-Agent': 'OrgLensDirectory/2.0 (corporate-research)' },
      validateStatus: (s) => s === 200,
    });

    const firstHit = searchResp.data?.query?.search?.[0];
    if (!firstHit?.title) return null;
    const pageTitle = String(firstHit.title);
    const companyCore = cleanCompany.toLowerCase().split(/\s+/)[0] || '';
    if (companyCore.length >= 3 && !pageTitle.toLowerCase().includes(companyCore)) {
      return null;
    }

    const revResp = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        titles: pageTitle,
        prop: 'revisions|extracts',
        rvprop: 'content',
        rvslots: 'main',
        rvsection: 0,
        exintro: 1,
        explaintext: 1,
        exsentences: 2,
        format: 'json',
      },
      timeout: Math.min(750, timeoutMs),
      headers: { 'User-Agent': 'OrgLensDirectory/2.0 (corporate-research)' },
      validateStatus: (s) => s === 200,
    });

    const pages = revResp.data?.query?.pages || {};
    const pageObj = Object.values(pages)[0] as
      | {
          extract?: string;
          revisions?: Array<{ slots?: { main?: { '*'?: string } } }>;
        }
      | undefined;
    const wikitext = pageObj?.revisions?.[0]?.slots?.main?.['*'] || '';
    if (!wikitext) return null;

    const lowerWiki = wikitext.toLowerCase();
    const escapedDom = domain
      ? domain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';
    const hasExactWikiDomain =
      Boolean(escapedDom) &&
      new RegExp(`(?:^|[^a-z0-9])${escapedDom}(?:$|[^a-z0-9])`, 'i').test(
        lowerWiki
      );
    if (
      domain &&
      !hasExactWikiDomain &&
      !lowerWiki.includes('infobox company') &&
      !lowerWiki.includes('infobox organization')
    ) {
      return null;
    }

    const getField = (names: string[]): string => {
      for (const n of names) {
        const m = wikitext.match(
          new RegExp(`\\|\\s*${n}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n\\s*\\}\\}|$)`, 'i')
        );
        if (m?.[1]) {
          const val = stripWikiMarkup(m[1]).slice(0, 120);
          if (val) return val;
        }
      }
      return '';
    };

    const intel: ZoomInfoCompanyIntel = {};

    const rawRev = getField(['revenue']);
    const revMatch = rawRev.match(
      /(?:US|USD|CA|CAD|AU|AUD|EU|EUR|GB|GBP)?\s*[\$€£]\s*\d{1,4}(?:,\d{3})*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|tn|bn|mn|t|b|m|k)(?:\+|(?=\b|[^a-zA-Z]|$))/i
    );
    if (revMatch?.[0]) {
      const cleanRev = sanitizeRevenueDisplay(revMatch[0]);
      if (cleanRev) {
        intel.revenue = cleanRev;
      }
    }

    const rawEmp = getField(['num_employees', 'employees']).replace(
      /\b(?:as\s+of\s+|in\s+|fy\s*)?(?:19|20)\d{2}\b/gi,
      ''
    );
    const empMatch = rawEmp.match(/(\d{1,3}(?:,\d{3})+|\d{2,6}\+?)/);
    if (empMatch?.[1]) {
      intel.headcount = `${empMatch[1]} employees`;
    }

    const city = getField(['hq_location_city', 'location_city']);
    const country = getField(['hq_location_country', 'location_country']);
    const hqCombined =
      getField(['hq_location', 'headquarters', 'location']) ||
      [city, country].filter(Boolean).join(', ');
    if (hqCombined && hqCombined.length >= 3) {
      intel.headquarters = hqCombined.split(',')[0]
        ? hqCombined.slice(0, 70)
        : undefined;
    }

    const ind = getField(['industry']);
    if (ind) {
      intel.industry = ind.split(',')[0].trim().slice(0, 48);
    }

    const extract = cleanWhitespace(String(pageObj?.extract || ''));
    if (extract.length >= 25) {
      intel.summary = extract.slice(0, 260);
    }

    const hasAny = Boolean(
      intel.revenue ||
        intel.headcount ||
        intel.headquarters ||
        intel.industry ||
        intel.summary
    );
    return hasAny ? intel : null;
  } catch {
    return null;
  }
}

/**
 * Extracts public ZoomInfo company intelligence (HQ phone, revenue, headcount, profile link, summary)
 * and ZoomInfo-indexed decision-makers & employees in parallel with structured Wikipedia corporate
 * firmographics under a strict 2.2s budget.
 */
export async function extractZoomInfoIntel(
  companyName: string,
  domain: string,
  timeoutMs = 2200
): Promise<{
  companyIntel: ZoomInfoCompanyIntel | null;
  people: CandidateEmployee[];
}> {
  const cleanCompany = cleanWhitespace(companyName);
  const cleanDom = (domain || '').trim().toLowerCase();
  if (!cleanCompany && !cleanDom) {
    return { companyIntel: null, people: [] };
  }

  const isShortBrand = cleanCompany.length < 3;
  const anchor = isShortBrand && cleanDom ? cleanDom : cleanCompany || cleanDom;

  const qCompany = cleanDom
    ? `site:zoominfo.com/c/ "${anchor}" "${cleanDom}"`
    : `site:zoominfo.com/c/ "${anchor}"`;
  const qCompanyFallback = `site:zoominfo.com "${anchor}" revenue employees`;
  const qPeopleExec = `site:zoominfo.com/p/ "${anchor}" (CEO OR CFO OR CTO OR VP OR Director OR Head OR President OR Manager)`;
  const qPeopleBroad = `site:zoominfo.com/p/ "${anchor}"`;
  const qOrgDirectory = `site:zoominfo.com/pic/ "${anchor}"`;

  const [
    compBing,
    compDdg,
    peopleBing,
    peopleDdg,
    peopleYahoo,
    dirBing,
    wikiFirmographics,
  ] = await Promise.all([
    withTimeout(queryBingHtml(qCompany, Math.min(1800, timeoutMs)), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryDuckDuckGoHtml(qCompanyFallback, Math.min(1800, timeoutMs)), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryBingHtml(qPeopleExec, Math.min(1800, timeoutMs)), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryDuckDuckGoHtml(qPeopleBroad, Math.min(1800, timeoutMs)), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryYahooSafe(qPeopleExec, 1, 20, Math.min(1700, timeoutMs)), timeoutMs, [] as RawSearchHit[]),
    withTimeout(queryBingRss(qOrgDirectory, 1, Math.min(1700, timeoutMs)), timeoutMs, [] as RawSearchHit[]),
    withTimeout(
      fetchWikipediaCompanyFirmographics(cleanCompany, cleanDom, Math.min(1500, timeoutMs)),
      timeoutMs,
      null
    ),
  ]);

  const companyHits = [...compBing, ...compDdg, ...dirBing];
  const ziIntel = parseZoomInfoCompanyHits(companyHits, cleanCompany, cleanDom);

  // Merge ZoomInfo intel with structured Wikipedia firmographics (ZoomInfo wins when present, Wikipedia fills gaps)
  const mergedIntel: ZoomInfoCompanyIntel = {
    profileUrl: ziIntel?.profileUrl,
    phone: ziIntel?.phone,
    revenue: ziIntel?.revenue || wikiFirmographics?.revenue,
    headcount: ziIntel?.headcount || wikiFirmographics?.headcount,
    headquarters: ziIntel?.headquarters || wikiFirmographics?.headquarters,
    industry: ziIntel?.industry || wikiFirmographics?.industry,
    summary: ziIntel?.summary || wikiFirmographics?.summary,
  };

  const hasMergedIntel = Boolean(
    mergedIntel.profileUrl ||
      mergedIntel.phone ||
      mergedIntel.revenue ||
      mergedIntel.headcount ||
      mergedIntel.headquarters ||
      mergedIntel.industry ||
      mergedIntel.summary
  );

  const personMap = new Map<string, CandidateEmployee>();
  const addPerson = (p: CandidateEmployee | null) => {
    if (!p) return;
    const key = normalizePersonKey(p.fullName);
    if (!key || personMap.has(key)) return;
    personMap.set(key, p);
  };

  for (const hit of [...peopleBing, ...peopleDdg, ...peopleYahoo, ...dirBing]) {
    addPerson(parseZoomInfoPersonHit(hit, cleanCompany, cleanDom));
  }
  for (const dirPerson of extractNamesFromZoomInfoDirectorySnippets(
    companyHits,
    cleanCompany,
    cleanDom
  )) {
    addPerson(dirPerson);
  }

  return {
    companyIntel: hasMergedIntel ? mergedIntel : null,
    people: Array.from(personMap.values()).slice(0, 40),
  };
}
