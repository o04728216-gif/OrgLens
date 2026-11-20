import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CandidateEmployee, PgpEmailHit, RawSearchHit } from '../types.ts';
import {
  browserHeaders,
  cleanJobTitle,
  cleanWhitespace,
  decodeRedirectUrl,
  looksLikePersonName,
} from '../utils/textAndDomain.ts';

const YAHOO_SEARCH_ENDPOINTS = [
  'https://search.yahoo.com/search',
  'https://uk.search.yahoo.com/search',
  'https://ca.search.yahoo.com/search',
  'https://au.search.yahoo.com/search',
];

let activeYahooRequests = 0;
const MAX_CONCURRENT_YAHOO = 12;
const yahooWaitQueue: Array<() => void> = [];
let endpointRoundRobin = 0;

function acquireYahooSlot(): Promise<void> {
  if (activeYahooRequests < MAX_CONCURRENT_YAHOO) {
    activeYahooRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    yahooWaitQueue.push(() => {
      activeYahooRequests++;
      resolve();
    });
  });
}

function releaseYahooSlot(): void {
  activeYahooRequests = Math.max(0, activeYahooRequests - 1);
  const next = yahooWaitQueue.shift();
  if (next) {
    next();
  }
}

export async function queryYahooSafe(
  query: string,
  offset = 1,
  count = 20,
  timeoutMs = 2200
): Promise<RawSearchHit[]> {
  await acquireYahooSlot();
  try {
    const endpoint =
      YAHOO_SEARCH_ENDPOINTS[
        endpointRoundRobin++ % YAHOO_SEARCH_ENDPOINTS.length
      ];
    try {
      const response = await axios.get(endpoint, {
        params: { p: query, n: count, b: offset },
        timeout: timeoutMs,
        headers: browserHeaders(),
        validateStatus: (s) => s === 200,
      });

      if (typeof response.data === 'string') {
        const $ = cheerio.load(response.data);
        const hits: RawSearchHit[] = [];
        $('div.algo').each((_, el) => {
          const h3 = $(el).find('h3').first();
          if (!h3.length) return;
          const h3Clone = h3.clone();
          h3Clone.find('span.fz-ms, span.d-b').remove();
          const title = cleanWhitespace(h3Clone.text() || h3.text());
          const url =
            h3.closest('a').attr('href') ||
            h3.find('a').first().attr('href') ||
            $(el)
              .find('a[href*="RU="], a[href*="linkedin.com"]')
              .first()
              .attr('href') ||
            '';
          const snippet = cleanWhitespace(
            $(el).find('.compText, p').first().text()
          );
          if (title && (url || snippet)) {
            hits.push({ title, url, snippet });
          }
        });
        return hits;
      }
    } catch {
      // Fast non-blocking fallback to parallel Bing/TheOrg engines
    }
    return [];
  } finally {
    releaseYahooSlot();
  }
}

export async function queryBingRss(
  query: string,
  first = 1,
  timeoutMs = 2100
): Promise<RawSearchHit[]> {
  const hits: RawSearchHit[] = [];
  try {
    const response = await axios.get('https://www.bing.com/search', {
      params: { format: 'rss', q: query, count: 30, first },
      timeout: timeoutMs,
      headers: browserHeaders(),
      validateStatus: (s) => s === 200,
    });

    if (typeof response.data === 'string') {
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('item').each((_, item) => {
        const title = cleanWhitespace($(item).find('title').text());
        const url = cleanWhitespace($(item).find('link').text());
        const snippet = cleanWhitespace($(item).find('description').text());
        if (title && url) hits.push({ title, url, snippet });
      });
    }
  } catch {
    // Non-fatal
  }
  return hits;
}

export async function queryBingHtml(
  query: string,
  timeoutMs = 2100
): Promise<RawSearchHit[]> {
  const hits: RawSearchHit[] = [];
  try {
    const response = await axios.get('https://www.bing.com/search', {
      params: { q: query, count: 30 },
      timeout: timeoutMs,
      headers: browserHeaders(),
      validateStatus: (s) => s === 200,
    });

    if (typeof response.data === 'string') {
      const $ = cheerio.load(response.data);
      $('li.b_algo').each((_, el) => {
        const anchor = $(el).find('h2 a').first();
        const title = cleanWhitespace(anchor.text());
        const url = anchor.attr('href') || '';
        const snippet = cleanWhitespace(
          $(el).find('.b_caption p, .b_algoSlug').first().text()
        );
        if (title && url) hits.push({ title, url, snippet });
      });
    }
  } catch {
    // Non-fatal
  }
  return hits;
}

export async function queryDuckDuckGoHtml(
  query: string,
  timeoutMs = 2000
): Promise<RawSearchHit[]> {
  const hits: RawSearchHit[] = [];
  try {
    const params = new URLSearchParams({ q: query, kl: 'us-en' });
    const response = await axios.post(
      'https://html.duckduckgo.com/html/',
      params.toString(),
      {
        timeout: timeoutMs,
        headers: browserHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://html.duckduckgo.com',
          Referer: 'https://html.duckduckgo.com/',
        }),
        validateStatus: (s) => s === 200,
      }
    );

    if (typeof response.data === 'string') {
      const $ = cheerio.load(response.data);
      $('.result, .web-result').each((_, el) => {
        const anchor = $(el).find('a.result__a').first();
        const title = cleanWhitespace(anchor.text());
        const url = anchor.attr('href') || '';
        const snippet = cleanWhitespace($(el).find('.result__snippet').text());
        if (title && url) hits.push({ title, url, snippet });
      });
    }
  } catch {
    // Non-fatal
  }
  return hits;
}

/**
 * Queries the Ubuntu OpenPGP Keyserver in machine-readable format (`options=mr`)
 * to discover real, cryptographically signed `Full Name <user@domain>` records.
 */
export async function queryPgpKeyserverEmails(
  domain: string,
  timeoutMs = 1700
): Promise<PgpEmailHit[]> {
  const cleanDom = domain.trim().toLowerCase();
  if (!cleanDom) return [];

  const found: PgpEmailHit[] = [];
  const seenEmails = new Set<string>();

  try {
    const resp = await axios.get('https://keyserver.ubuntu.com/pks/lookup', {
      params: {
        op: 'index',
        options: 'mr',
        search: `@${cleanDom}`,
      },
      timeout: timeoutMs,
      headers: browserHeaders(),
      validateStatus: (s) => s === 200,
    });

    if (typeof resp.data !== 'string') return [];

    const lines = resp.data.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('uid:')) continue;
      const rawUidField = line.split(':')[1] || '';
      let decodedUid = rawUidField;
      try {
        decodedUid = decodeURIComponent(rawUidField);
      } catch {
        // Keep rawUidField
      }

      const uidMatch = decodedUid.match(
        /^([^<()]+?)\s*(?:\([^)]*\)\s*)?<([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+)>/
      );
      if (!uidMatch) continue;

      const rawName = cleanWhitespace(uidMatch[1] || '');
      const email = (uidMatch[2] || '').trim().toLowerCase();
      if (!email.endsWith(`@${cleanDom}`)) continue;
      if (email.includes('+')) continue;
      if (seenEmails.has(email)) continue;

      if (looksLikePersonName(rawName)) {
        seenEmails.add(email);
        found.push({ fullName: rawName, email });
      }
      if (found.length >= 60) break;
    }
  } catch {
    // Keyserver returns 404 when no keys exist for domain — completely normal
  }

  return found;
}

export function parseLinkedInHit(
  hit: RawSearchHit,
  domain: string,
  companyName: string
): CandidateEmployee | null {
  const cleanUrl = decodeRedirectUrl(hit.url);
  if (!/linkedin\.com\/in\//i.test(cleanUrl)) return null;

  const rawTitle = cleanWhitespace(
    hit.title
      .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, '')
      .replace(/\s*\.\.\.+$/g, '')
  );
  if (!rawTitle) return null;

  const segments = rawTitle
    .split(/\s+[-–—|]\s+/)
    .map((s) => cleanWhitespace(s))
    .filter(Boolean);

  const fullName = segments[0] || '';
  if (!looksLikePersonName(fullName)) return null;

  const combinedHitText = `${rawTitle} ${hit.snippet || ''}`.toLowerCase();
  const cleanCompanyLower = cleanWhitespace(companyName).toLowerCase();
  const escapedDom = domain
    ? domain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : '';
  const hasDomainBoundary =
    Boolean(escapedDom) &&
    new RegExp(`(?:^|[^a-z0-9])${escapedDom}(?:$|[^a-z0-9])`, 'i').test(
      combinedHitText
    );
  const significantTokens = cleanCompanyLower
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        !['inc', 'llc', 'ltd', 'corp', 'corporation', 'group', 'the', 'and'].includes(t)
    );
  const hasCompanyMention =
    significantTokens.length > 0 &&
    significantTokens.some((tok) => combinedHitText.includes(tok));

  if (cleanCompanyLower.length < 3) {
    if (!hasDomainBoundary) return null;
  } else if (significantTokens.length > 0 && !hasCompanyMention && !hasDomainBoundary) {
    return null;
  }

  let rawRole = '';
  if (segments.length >= 2) {
    const nonCompany = segments
      .slice(1)
      .filter(
        (seg) =>
          seg.toLowerCase() !== companyName.toLowerCase() &&
          seg.toLowerCase() !== domain.toLowerCase()
      );
    rawRole = nonCompany.join(' · ');
  }

  if (!rawRole && hit.snippet) {
    const firstClause = cleanWhitespace(
      hit.snippet.split(/\s*[·•|]\s*|\.\s+/)[0] || ''
    );
    if (
      firstClause &&
      !/^(experience|experiencia|education|location|ubicación|view\s|join\s|500\+)/i.test(
        firstClause
      )
    ) {
      rawRole = firstClause;
    }
  }

  const jobTitle = cleanJobTitle(rawRole || 'Team Member', companyName, domain);

  let canonicalUrl = cleanUrl;
  try {
    const parsed = new URL(cleanUrl);
    canonicalUrl = `https://www.linkedin.com${parsed.pathname.replace(
      /\/+$/,
      ''
    )}`;
  } catch {
    // keep cleanUrl
  }

  return {
    id: canonicalUrl.toLowerCase(),
    fullName,
    jobTitle,
    teamHint: hit.snippet,
    profileUrl: canonicalUrl,
    source: 'LinkedIn Index',
  };
}
