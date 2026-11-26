import axios from 'axios';
import type { ZoomInfoCompanyIntel } from '../../src/types.ts';
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

  const revRangeMatch = mergedText.match(
    /(?:revenue(?:\s+is|\s+of|\s*:)?\s*)(<?\s*(?:US|CA|EU|GB|UK)?\s*[\$€£]\s*\d[\d,]*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|bn|mn|[TBMK])\s*(?:-|–|—|to)\s*(?:US|CA|EU|GB|UK)?\s*[\$€£]?\s*\d[\d,]*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|bn|mn|[TBMK])\b\+?)/i
  );
  const revSingleMatch =
    mergedText.match(
      /(?:revenue(?:\s+is|\s+of|\s*:)?\s*)(<?\s*(?:US|CA|EU|GB|UK)?\s*[\$€£]\s*\d[\d,]*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|bn|mn|[TBMK])\b\+?)/i
    ) ||
    mergedText.match(
      /(<?\s*(?:US|CA|EU|GB|UK)?\s*[\$€£]\s*\d[\d,]*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|bn|mn)\b\+?)(?:\s+in\s+revenue|\s+annual\s+revenue|\s+revenue)/i
    );
  const cleanedZoomRev = normalizeExtractedRevenue(
    revRangeMatch?.[1] || revSingleMatch?.[1] || ''
  );
  if (cleanedZoomRev) {
    intel.revenue = cleanedZoomRev;
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

function formatCompactRevenueNumber(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return '';
  if (num >= 100) return String(Math.round(num * 10) / 10).replace(/\.0$/, '');
  return String(Math.round(num * 100) / 100).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function normalizeSingleRevenueToken(raw: string): string | null {
  const cleaned = cleanWhitespace(raw)
    .replace(/^(?:US|CA|EU|GB|UK)\s*(?=[\$€£])/i, '')
    .trim();
  if (!cleaned) return null;

  // Reject strings containing multiple currency symbols or trailing garbage commas
  const currencyMatches = cleaned.match(/[\$€£]/g) || [];
  if (currencyMatches.length !== 1) return null;
  if (/[,;]\s*$/.test(cleaned)) return null;

  // Match explicit currency + amount + mandatory magnitude unit (K/M/B/T/Thousand/Million/Billion/Trillion)
  const unitMatch = cleaned.match(
    /^(<\s*)?([\$€£])\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?\s*(trillion|billion|million|thousand|bn|mn|T|B|M|K)\b(\+)?$/i
  );
  if (unitMatch) {
    const isLessThan = Boolean(unitMatch[1]);
    const symbol = unitMatch[2];
    const intPart = unitMatch[3].replace(/,/g, '');
    const decPart = unitMatch[4] ? `.${unitMatch[4]}` : '';
    let value = Number.parseFloat(`${intPart}${decPart}`);
    const rawUnit = unitMatch[5].toLowerCase();
    const hasPlus = Boolean(unitMatch[6]);

    let unit: 'K' | 'M' | 'B' | 'T' = 'M';
    if (rawUnit === 't' || rawUnit === 'trillion') unit = 'T';
    else if (rawUnit === 'b' || rawUnit === 'bn' || rawUnit === 'billion') unit = 'B';
    else if (rawUnit === 'm' || rawUnit === 'mn' || rawUnit === 'million') unit = 'M';
    else if (rawUnit === 'k' || rawUnit === 'thousand') unit = 'K';

    if (!Number.isFinite(value) || value <= 0) return null;

    // Normalize overflow units (e.g. "$2,168 million" -> "$2.17B")
    if (unit === 'K' && value >= 1000) {
      value /= 1000;
      unit = 'M';
    }
    if (unit === 'M' && value >= 1000) {
      value /= 1000;
      unit = 'B';
    }
    if (unit === 'B' && value >= 1000) {
      value /= 1000;
      unit = 'T';
    }

    // Plausibility guard (no company has > $50T revenue)
    if (unit === 'T' && value > 50) return null;

    const numStr = formatCompactRevenueNumber(value);
    if (!numStr) return null;
    return `${isLessThan ? '< ' : ''}${symbol}${numStr}${unit}${hasPlus ? '+' : ''}`;
  }

  // Also allow full 7+ digit comma-grouped amounts like "$450,000,000" -> "$450M"
  const fullIntMatch = cleaned.match(/^([\$€£])\s*(\d{1,3}(?:,\d{3}){2,})$/);
  if (fullIntMatch) {
    const symbol = fullIntMatch[1];
    const value = Number.parseFloat(fullIntMatch[2].replace(/,/g, ''));
    if (!Number.isFinite(value) || value < 1_000_000 || value > 50_000_000_000_000) {
      return null;
    }
    if (value >= 1_000_000_000_000) {
      return `${symbol}${formatCompactRevenueNumber(value / 1_000_000_000_000)}T`;
    }
    if (value >= 1_000_000_000) {
      return `${symbol}${formatCompactRevenueNumber(value / 1_000_000_000)}B`;
    }
    return `${symbol}${formatCompactRevenueNumber(value / 1_000_000)}M`;
  }

  return null;
}

/**
 * Validates and formats an extracted revenue string (from ZoomInfo or Wikipedia)
 * into clean compact notation (e.g. "$138.2B", "€36.8B", "$10M - $50M", "< $5M").
 * Rejects malformed or unitless currency fragments like "$2.168", "€36.8", or "$2.168,€36.8,".
 */
export function normalizeExtractedRevenue(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = cleanWhitespace(raw).trim();
  if (!cleaned || cleaned.length > 48) return null;

  // Support clean two-sided revenue ranges like "$10M - $50M"
  const rangeParts = cleaned.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (rangeParts.length === 2) {
    const left = normalizeSingleRevenueToken(rangeParts[0]);
    const leftCurrency = left?.match(/[\$€£]/)?.[0] || '$';
    const rightRaw = /^[\$€£]/.test(rangeParts[1].trim())
      ? rangeParts[1]
      : `${leftCurrency}${rangeParts[1]}`;
    const right = normalizeSingleRevenueToken(rightRaw);
    if (left && right) {
      return `${left} - ${right}`;
    }
    return null;
  }

  return normalizeSingleRevenueToken(cleaned);
}

function stripWikiMarkup(raw: string): string {
  return cleanWhitespace(
    raw
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<ref[^>]*\/>/gi, '')
      .replace(/&nbsp;|&#160;|&thinsp;|&#8201;/gi, ' ')
      .replace(/&euro;|&#8364;/gi, '€')
      .replace(/&pound;|&#163;/gi, '£')
      .replace(/&ndash;|&#8211;|&mdash;|&#8212;/gi, '-')
      .replace(/\{\{(?:nbsp|spaces)\}\}/gi, ' ')
      .replace(
        /\{\{(?:increase|decrease|steady|gain|loss|profit|up|down)[^}]*\}\}/gi,
        ' '
      )
      .replace(
        /\{\{(?:US\$|USD|\$)\|([^|}]+)(?:\|([^|}]+))?[^}]*\}\}/gi,
        (_m, amt: string, unit?: string) =>
          `$${amt}${
            unit && /^(?:thousand|million|billion|trillion|bn|mn|[KMBT])$/i.test(unit.trim())
              ? ` ${unit.trim()}`
              : ''
          }`
      )
      .replace(
        /\{\{(?:EUR|Euro|€)\|([^|}]+)(?:\|([^|}]+))?[^}]*\}\}/gi,
        (_m, amt: string, unit?: string) =>
          `€${amt}${
            unit && /^(?:thousand|million|billion|trillion|bn|mn|[KMBT])$/i.test(unit.trim())
              ? ` ${unit.trim()}`
              : ''
          }`
      )
      .replace(
        /\{\{(?:GBP|£)\|([^|}]+)(?:\|([^|}]+))?[^}]*\}\}/gi,
        (_m, amt: string, unit?: string) =>
          `£${amt}${
            unit && /^(?:thousand|million|billion|trillion|bn|mn|[KMBT])$/i.test(unit.trim())
              ? ` ${unit.trim()}`
              : ''
          }`
      )
      .replace(
        /\{\{currency\|([^|}]+)\|(USD|US\$|EUR|GBP)[^}]*\}\}/gi,
        (_m, amt: string, cur: string) => {
          const sym = /^EUR$/i.test(cur) ? '€' : /^GBP$/i.test(cur) ? '£' : '$';
          return `${sym}${amt}`;
        }
      )
      .replace(/\{\{nowrap\|([^{}]+)\}\}/gi, '$1')
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
    const revMatch =
      rawRev.match(
        /(?:US|CA|EU|GB|UK)?\s*[\$€£]\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,3})?\s*(?:trillion|billion|million|thousand|bn|mn|T|B|M|K)\b\+?/i
      ) ||
      rawRev.match(
        /(?:US|CA|EU|GB|UK)?\s*[\$€£]\s*\d{1,3}(?:,\d{3}){2,}\b/i
      );
    const cleanedWikiRev = normalizeExtractedRevenue(revMatch?.[0] || '');
    if (cleanedWikiRev) {
      intel.revenue = cleanedWikiRev;
    }

    const rawEmp = getField(['num_employees', 'employees']);
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
