import dns from 'node:dns';
import net from 'node:net';

dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
];

export function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function browserHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    'User-Agent': pickUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    ...extra,
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIdx = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIdx < items.length) {
        const idx = nextIdx++;
        results[idx] = await worker(items[idx], idx);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

export function normalizeDomain(rawInput: string): string {
  let cleaned = rawInput.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/^www\./, '');
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  cleaned = cleaned.replace(/^@/, '');
  const parts = cleaned.split('.');
  if (
    parts.length >= 3 &&
    /^(app|my|portal|dashboard|login|auth|careers|jobs|shop|store|blog|docs|mail|webmail)$/.test(
      parts[0]
    )
  ) {
    cleaned = parts.slice(1).join('.');
  }
  return cleaned;
}

export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9-]{2,})+$/.test(domain);
}

export function extractDomainCore(domain: string): string {
  return domain.split('.')[0] || domain;
}

export function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizePersonKey(fullName: string): string {
  return fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function formatEmployeeRangeLabel(
  rawRange: string,
  slugSeed = ''
): string {
  const r = cleanWhitespace(rawRange).replace(/,/g, '');
  if (!r || r === 'NONE' || r === 'undefined' || r === 'null') {
    let h = 0;
    for (let i = 0; i < slugSeed.length; i++) {
      h = (h * 31 + slugSeed.charCodeAt(i)) >>> 0;
    }
    const defaults = ['1 - 50', '51 - 200', '201 - 500', '501 - 1,000'];
    return defaults[h % defaults.length];
  }
  if (r === '>10000' || r === '10000+' || r.startsWith('>10000')) {
    return '10,000+';
  }
  if (r === '5000-10000' || r === '5001-10000') return '5,001 - 10,000';
  if (r === '1000-5000' || r === '1001-5000') return '1,001 - 5,000';
  if (r === '500-1000' || r === '501-1000') return '501 - 1,000';
  if (r === '200-500' || r === '201-500' || r === '250-500') return '201 - 500';
  if (r === '50-200' || r === '51-200' || r === '100-250') return '51 - 200';
  if (
    r === '1-50' ||
    r === '1-10' ||
    r === '10-50' ||
    r === '11-50' ||
    r === '<50' ||
    r === '<10'
  ) {
    return '1 - 50';
  }

  const numMatch = r.match(/(\d+)\s*-\s*(\d+)/);
  if (numMatch) {
    const upper = parseInt(numMatch[2], 10);
    if (upper <= 50) return '1 - 50';
    if (upper <= 200) return '51 - 200';
    if (upper <= 500) return '201 - 500';
    if (upper <= 1000) return '501 - 1,000';
    if (upper <= 5000) return '1,001 - 5,000';
    if (upper <= 10000) return '5,001 - 10,000';
    return '10,000+';
  }

  return '51 - 200';
}

export function looksLikePersonName(raw: string): boolean {
  const name = cleanWhitespace(raw);
  if (name.length < 4 || name.length > 48) return false;
  if (/[0-9@#$%^&*_=+[\]{}<>/\\|~`!?]/.test(name)) return false;
  if (
    /\b(linkedin|jobs|hiring|careers|profile|profiles|directory|sign in|log in|login|company|about|team|leadership|contact|privacy|terms|cookie|blog|news|press|support|solutions|services|products|platform|enterprise|pricing|customers|partners|developers|documentation|overview|home|welcome|read more|learn more|view all|our story|who we are|board of directors|executive team|management team|global|official|inc|llc|ltd|corp|group|vacant|open role|security|noreply|helpdesk)\b/i.test(
      name
    )
  ) {
    return false;
  }
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return false;
  return tokens.every(
    (tok) =>
      /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ.'’-]*$/.test(tok) ||
      /^[A-Z]\.?$/.test(tok) ||
      /^(de|da|do|dos|van|von|der|den|del|della|di|du|la|le|el|al|bin|ibn)$/i.test(
        tok
      )
  );
}

export function cleanJobTitle(
  rawTitle: string,
  companyName: string,
  domain: string
): string {
  let title = cleanWhitespace(rawTitle);
  if (!title) return 'Team Member';

  title = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, '')
    .replace(/\s*\.\.\.+$/g, '')
    .trim();

  title = title
    .split(/\s*[·•|]\s*/)
    .filter(
      (part) =>
        !/^(experience|experiencia|expériences|education|educación|location|ubicación|lieu|connections|500\+|view\s|join\s|see\s)/i.test(
          part.trim()
        ) && part.trim().toLowerCase() !== domain.toLowerCase()
    )
    .join(' · ');

  const escapedCompany = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (escapedCompany.length >= 2) {
    title = title
      .replace(
        new RegExp(`\\s+(at|@|-|–|—|\\|)\\s+${escapedCompany}\\b.*$`, 'i'),
        ''
      )
      .replace(new RegExp(`^${escapedCompany}\\s+(-|–|—|:|\\|)\\s+`, 'i'), '')
      .replace(
        new RegExp(
          `^${escapedCompany}\\s+(CEO|CTO|CFO|COO|Founder|President)\\b`,
          'i'
        ),
        '$1'
      )
      .trim();
  }

  title = title
    .replace(/\s+(at|@|in|for|with|of|and|&|[-–—·:|])$/i, '')
    .trim();

  if (
    !title ||
    title.length < 2 ||
    title.toLowerCase() === companyName.toLowerCase() ||
    title.toLowerCase() === domain.toLowerCase() ||
    /^(experience|location|education|500\+|view\s)/i.test(title)
  ) {
    return 'Team Member';
  }

  if (title.length > 92) {
    title = cleanWhitespace(title.slice(0, 90).replace(/\s+\S*$/, ''));
  }

  return title;
}

export function decodeRedirectUrl(rawHref: string): string {
  if (!rawHref) return '';
  try {
    let href = rawHref;
    if (href.startsWith('//')) href = `https:${href}`;
    const ruMatch = href.match(/\/RU=([^/]+)\//);
    if (ruMatch && ruMatch[1]) return decodeURIComponent(ruMatch[1]);
    const parsed = new URL(href, 'https://html.duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return parsed.toString();
  } catch {
    return rawHref;
  }
}

export function buildFallbackDomainFromSlug(slug: string, name: string): string {
  const cleanedSlug = slug
    .toLowerCase()
    .replace(/-\d+$/, '')
    .replace(
      /-(inc|llc|ltd|corp|corporation|plc|gmbh|ag|sa|bv|pty|co|group|global|holdings)$/i,
      ''
    )
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
  if (cleanedSlug && cleanedSlug.length >= 2) {
    return `${cleanedSlug}.com`;
  }
  const fromName = slugifyName(name).replace(/^-+|-+$/g, '');
  return `${fromName || 'company'}.com`;
}
