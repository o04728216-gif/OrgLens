import axios from 'axios';
import type { ConfirmedEmailSource } from '../../src/types.ts';
import {
  EMAIL_FORMULAS,
  applyExcelEmailFormula,
} from '../../src/utils/emailFormulas.ts';
import {
  getConfirmedContactsForDomain,
  upsertConfirmedContacts,
} from '../store/companyVaultDb.ts';
import type { ConfirmedEmailHit, RawSearchHit } from '../types.ts';
import {
  browserHeaders,
  cleanWhitespace,
  decodeRedirectUrl,
  extractDomainCore,
  humanizeSlug,
  isValidDomain,
  looksLikePersonName,
  normalizeDomain,
  normalizePersonKey,
} from '../utils/textAndDomain.ts';
import {
  queryBingHtml,
  queryBingRss,
  queryDuckDuckGoHtml,
  queryPgpKeyserverEmails,
  queryYahooSafe,
} from './webSearchClient.ts';

const EXCLUDED_GENERIC_PREFIXES = new Set([
  'info',
  'support',
  'sales',
  'contact',
  'press',
  'media',
  'hello',
  'hi',
  'team',
  'jobs',
  'careers',
  'privacy',
  'legal',
  'security',
  'abuse',
  'admin',
  'administrator',
  'billing',
  'help',
  'noreply',
  'no-reply',
  'donotreply',
  'marketing',
  'ir',
  'investors',
  'partners',
  'partnerships',
  'hr',
  'recruiting',
  'talent',
  'office',
  'enquiries',
  'inquiries',
  'feedback',
  'webmaster',
  'postmaster',
  'compliance',
  'accounts',
  'finance',
  'pr',
  'news',
  'events',
  'customercare',
  'customerservice',
  'newsletter',
  'updates',
  'notifications',
  'orders',
  'service',
  'reception',
  'mail',
  'general',
  'booking',
  'reservations',
  'responsible',
  'disclosure',
  'vulnerability',
  'bounty',
  'bugbounty',
  'protection',
  'dataprotection',
  'dpo',
  'data',
  'customer',
  'customers',
  'investor',
  'relations',
  'public',
  'human',
  'resources',
  'corporate',
  'counsel',
  'department',
  'desk',
  'tech',
  'payable',
  'receivable',
  'procurement',
  'notice',
  'responsible.disclosure',
  'responsible-disclosure',
  'vulnerability.disclosure',
  'investor.relations',
  'customer.service',
  'media.relations',
  'data.protection',
  'legal.notice',
  'dmca',
  'copyright',
  'cert',
  'csirt',
  'psirt',
  'example',
  'test',
  'user',
  'email',
  'firstname',
  'lastname',
  'jane.doe',
  'john.doe',
  'jdoe',
  'janedoe',
  'johndoe',
  'john.smith',
  'jane.smith',
]);

function isPlaceholderOrBotEmail(localPart: string): boolean {
  const lower = localPart.toLowerCase();
  if (!lower || lower.length < 2) return true;
  if (EXCLUDED_GENERIC_PREFIXES.has(lower)) return true;
  if (lower.includes('+') || /\d{3,}/.test(lower)) return true;
  const splitParts = lower.split(/[._-]/);
  if (
    splitParts.length === 2 &&
    (EXCLUDED_GENERIC_PREFIXES.has(splitParts[0]) ||
      EXCLUDED_GENERIC_PREFIXES.has(splitParts[1]))
  ) {
    return true;
  }
  if (
    /^(jane|john|frank|mary)[._-]?(doe|smith|bloggs)$/i.test(lower) ||
    /^(jdoe|jsmith|fbloggs|first\.last|flast|f\.last|first_last)$/i.test(lower)
  ) {
    return true;
  }
  if (/\b(bot|dependabot|github-actions|renovate|automation|ci|cd|release|deploy)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function inferPersonNameFromStructuredLocalPart(
  localPart: string
): string | null {
  const m = localPart.match(/^([a-z]{2,16})[._-]([a-z]{2,18})$/i);
  if (!m) return null;
  const first = m[1].toLowerCase();
  const last = m[2].toLowerCase();
  if (
    EXCLUDED_GENERIC_PREFIXES.has(first) ||
    EXCLUDED_GENERIC_PREFIXES.has(last)
  ) {
    return null;
  }
  const candidate = `${first.charAt(0).toUpperCase() + first.slice(1)} ${
    last.charAt(0).toUpperCase() + last.slice(1)
  }`;
  return looksLikePersonName(candidate) ? candidate : null;
}

/**
 * Queries ProtonMail OpenPGP Keyserver in machine-readable format for `@domain` keys.
 */
async function queryProtonPgpKeyserver(
  domain: string,
  timeoutMs = 3400
): Promise<ConfirmedEmailHit[]> {
  const hits: ConfirmedEmailHit[] = [];
  try {
    const resp = await axios.get('https://api.protonmail.ch/pks/lookup', {
      params: { op: 'index', options: 'mr', search: `@${domain}` },
      timeout: timeoutMs,
      headers: browserHeaders(),
      validateStatus: (s) => s === 200,
    });
    if (typeof resp.data !== 'string') return [];

    const seen = new Set<string>();
    for (const line of resp.data.split(/\r?\n/)) {
      if (!line.startsWith('uid:')) continue;
      const rawUid = line.split(':')[1] || '';
      let decoded = rawUid;
      try {
        decoded = decodeURIComponent(rawUid);
      } catch {
        // Keep rawUid
      }
      const match = decoded.match(
        /^([^<()]+?)\s*(?:\([^)]*\)\s*)?<([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+)>/
      );
      if (!match) continue;
      const fullName = cleanWhitespace(match[1] || '');
      const email = (match[2] || '').trim().toLowerCase();
      if (!email.endsWith(`@${domain}`) || seen.has(email)) continue;
      const local = email.split('@')[0] || '';
      if (isPlaceholderOrBotEmail(local)) continue;
      if (!looksLikePersonName(fullName)) continue;
      seen.add(email);
      hits.push({
        email,
        fullName,
        jobTitle: 'Cryptographically Verified Contact',
        emailSource: 'OpenPGP Keyserver',
        sourceUrl: `https://keyserver.ubuntu.com/pks/lookup?op=index&search=%40${encodeURIComponent(
          domain
        )}`,
      });
    }
  } catch {
    // 404 when no keys exist is expected
  }
  return hits;
}

const githubDomainCommitCache = new Map<
  string,
  { hits: ConfirmedEmailHit[]; expiresAt: number }
>();

/**
 * Discovers real author & committer emails ending in `@domain` from public GitHub organization commits.
 */
async function queryGithubOrgCommitEmails(
  domain: string,
  companyName: string,
  timeoutMs = 1700
): Promise<ConfirmedEmailHit[]> {
  const cached = githubDomainCommitCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.hits;
  }

  const hits: ConfirmedEmailHit[] = [];
  const seen = new Set<string>();
  const candidateOrgLogins = Array.from(
    new Set([
      extractDomainCore(domain).toLowerCase(),
      companyName.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    ])
  ).filter((s) => s.length >= 2 && s.length <= 38);

  if (candidateOrgLogins.length === 0) return [];

  try {
    let resolvedOrgLogin = '';
    let repos: Array<{ name?: string; html_url?: string }> = [];

    try {
      const winner = await Promise.any(
        candidateOrgLogins.slice(0, 2).map(async (candidateOrg) => {
          const reposResp = await axios.get(
            `https://api.github.com/orgs/${encodeURIComponent(candidateOrg)}/repos`,
            {
              params: { sort: 'pushed', per_page: 4, type: 'public' },
              timeout: timeoutMs,
              headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'OrgLensDirectory/2.0',
              },
              validateStatus: (s) => s === 200,
            }
          );
          if (Array.isArray(reposResp.data) && reposResp.data.length > 0) {
            return {
              login: candidateOrg,
              repos: reposResp.data as Array<{ name?: string; html_url?: string }>,
            };
          }
          throw new Error('No public repos');
        })
      );
      resolvedOrgLogin = winner.login;
      repos = winner.repos;
    } catch {
      // Org handle not found
    }

    if (resolvedOrgLogin && repos.length > 0) {
      const commitResponses = await Promise.allSettled(
        repos.slice(0, 4).map((repo) =>
          axios.get(
            `https://api.github.com/repos/${encodeURIComponent(
              resolvedOrgLogin
            )}/${encodeURIComponent(String(repo.name || ''))}/commits`,
            {
              params: { per_page: 25 },
              timeout: timeoutMs,
              headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'OrgLensDirectory/2.0',
              },
              validateStatus: (s) => s === 200,
            }
          )
        )
      );

      for (let i = 0; i < commitResponses.length; i++) {
        const res = commitResponses[i];
        if (res.status !== 'fulfilled' || !Array.isArray(res.value.data)) continue;
        for (const commitItem of res.value.data) {
          const actors = [
            commitItem?.commit?.author as { name?: string; email?: string } | undefined,
            commitItem?.commit?.committer as { name?: string; email?: string } | undefined,
          ];
          for (const actor of actors) {
            const email = String(actor?.email || '').trim().toLowerCase();
            if (!email.endsWith(`@${domain}`) || seen.has(email)) continue;
            const local = email.split('@')[0] || '';
            if (isPlaceholderOrBotEmail(local)) continue;

            const rawName = cleanWhitespace(String(actor?.name || ''));
            const fullName = looksLikePersonName(rawName)
              ? rawName
              : inferPersonNameFromStructuredLocalPart(local);
            if (!fullName) continue;

            seen.add(email);
            hits.push({
              email,
              fullName,
              jobTitle: 'Software Engineer',
              emailSource: 'GitHub Commit',
              sourceUrl:
                typeof commitItem?.html_url === 'string'
                  ? commitItem.html_url
                  : repos[i]?.html_url || `https://github.com/${resolvedOrgLogin}`,
            });
          }
        }
      }
    }
  } catch {
    // Graceful fallback on 404 or GitHub unauthenticated rate-limit
  }

  githubDomainCommitCache.set(domain, {
    hits,
    expiresAt: Date.now() + 1000 * 60 * 45,
  });
  return hits;
}

/**
 * Discovers real package maintainer & publisher emails ending in `@domain` from the NPM Registry.
 */
async function queryNpmMaintainerEmails(
  domain: string,
  timeoutMs = 3600
): Promise<ConfirmedEmailHit[]> {
  const core = extractDomainCore(domain).toLowerCase();
  if (!core || core.length < 2) return [];

  const hits: ConfirmedEmailHit[] = [];
  const seen = new Set<string>();

  try {
    const resp = await axios.get('https://registry.npmjs.org/-/v1/search', {
      params: { text: core, size: 16 },
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s === 200,
    });

    const objects: Array<{
      package?: {
        name?: string;
        links?: { npm?: string };
        publisher?: { username?: string; email?: string };
        maintainers?: Array<{ username?: string; email?: string }>;
      };
    }> = Array.isArray(resp.data?.objects) ? resp.data.objects : [];

    for (const obj of objects) {
      const pkg = obj.package;
      if (!pkg) continue;
      const people = [
        ...(pkg.publisher ? [pkg.publisher] : []),
        ...(Array.isArray(pkg.maintainers) ? pkg.maintainers : []),
      ];

      for (const person of people) {
        const email = String(person?.email || '').trim().toLowerCase();
        if (!email.endsWith(`@${domain}`) || seen.has(email)) continue;
        const local = email.split('@')[0] || '';
        if (isPlaceholderOrBotEmail(local)) continue;

        const inferred =
          inferPersonNameFromStructuredLocalPart(local) ||
          (person?.username && looksLikePersonName(humanizeSlug(person.username))
            ? humanizeSlug(person.username)
            : null);
        if (!inferred) continue;

        seen.add(email);
        hits.push({
          email,
          fullName: inferred,
          jobTitle: 'Open-Source Package Maintainer',
          emailSource: 'NPM Registry',
          sourceUrl:
            pkg.links?.npm ||
            `https://www.npmjs.com/package/${encodeURIComponent(
              pkg.name || core
            )}`,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  return hits;
}

/**
 * Extracts real confirmed `@domain` emails from open-web search snippets (`Yahoo`, `Bing`, `DuckDuckGo`)
 * and matches them to known employees or explicit `Full Name <email@domain>` mentions.
 */
function extractConfirmedHitsFromSearchSnippets(
  searchHits: RawSearchHit[],
  domain: string,
  knownEmployees: Array<{ fullName: string; jobTitle?: string }>
): ConfirmedEmailHit[] {
  const escapedDom = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const emailRegex = new RegExp(
    `\\b([a-zA-Z0-9][a-zA-Z0-9._-]{0,40})@${escapedDom}\\b`,
    'gi'
  );
  const namedBracketRegex = new RegExp(
    `([A-Z][a-z]+(?:\\s+[A-Z][a-z.'-]+){1,3})\\s*[<(\\[\\-–:]\\s*([a-zA-Z0-9][a-zA-Z0-9._-]{0,40}@${escapedDom})`,
    'g'
  );

  const found: ConfirmedEmailHit[] = [];
  const seen = new Set<string>();

  for (const hit of searchHits) {
    // Skip email-pattern aggregator sites that print synthetic `jdoe@domain` examples
    const cleanSourceUrl = decodeRedirectUrl(hit.url || '');
    if (
      /\b(rocketreach|leadiq|signalhire|contactout|zoominfo|lusha|skrapp|hunter\.io|prospeo|anymailfinder|adapt\.io|aeroleads|swordfish\.ai|Seamless\.AI)\b/i.test(
        `${cleanSourceUrl} ${hit.title}`
      )
    ) {
      continue;
    }

    const corpus = `${hit.title} ${hit.snippet}`;

    let bracketMatch: RegExpExecArray | null;
    while ((bracketMatch = namedBracketRegex.exec(corpus)) !== null) {
      const candidateName = cleanWhitespace(bracketMatch[1] || '');
      const fullEmail = (bracketMatch[2] || '').trim().toLowerCase();
      const local = fullEmail.split('@')[0] || '';
      if (seen.has(fullEmail) || isPlaceholderOrBotEmail(local)) continue;
      if (looksLikePersonName(candidateName)) {
        seen.add(fullEmail);
        found.push({
          email: fullEmail,
          fullName: candidateName,
          jobTitle: 'Verified Public Web Contact',
          emailSource: 'Public Web Index',
          sourceUrl: cleanSourceUrl || `https://${domain}`,
        });
      }
    }

    let match: RegExpExecArray | null;
    while ((match = emailRegex.exec(corpus)) !== null) {
      const local = (match[1] || '').toLowerCase();
      const fullEmail = `${local}@${domain}`;
      if (seen.has(fullEmail) || isPlaceholderOrBotEmail(local)) continue;

      // 1. Check if this exact email matches a known employee in the company
      let matchedEmp: { fullName: string; jobTitle?: string } | undefined;
      for (const emp of knownEmployees) {
        for (const f of EMAIL_FORMULAS) {
          if (applyExcelEmailFormula(emp.fullName, domain, f.id) === fullEmail) {
            matchedEmp = emp;
            break;
          }
        }
        if (matchedEmp) break;
      }

      if (matchedEmp) {
        seen.add(fullEmail);
        found.push({
          email: fullEmail,
          fullName: matchedEmp.fullName,
          jobTitle: matchedEmp.jobTitle || 'Verified Team Member',
          emailSource: 'Public Web Index',
          sourceUrl: cleanSourceUrl || `https://${domain}`,
        });
        continue;
      }

      // 2. Check if localPart is an unambiguous `firstname.lastname` real person address
      const inferredName = inferPersonNameFromStructuredLocalPart(local);
      if (inferredName) {
        seen.add(fullEmail);
        found.push({
          email: fullEmail,
          fullName: inferredName,
          jobTitle: 'Verified Public Web Contact',
          emailSource: 'Public Web Index',
          sourceUrl: cleanSourceUrl || `https://${domain}`,
        });
      }
    }
  }

  return found;
}

export interface RealEmailCrawlResult {
  confirmedByPersonKey: Map<string, ConfirmedEmailHit>;
  allConfirmedContacts: ConfirmedEmailHit[];
  observedEmails: string[];
}

/**
 * Master Real Confirmed Email Crawler:
 * Combines Company Website `mailto:` / decoded Cloudflare emails, SQLite Vault,
 * Ubuntu + Proton OpenPGP Keyservers, GitHub Public Commits, NPM Maintainers,
 * and Multi-Engine Open-Web `@domain` Search Snippets.
 */
export async function crawlRealConfirmedEmails(params: {
  domain: string;
  companyName: string;
  knownEmployees: Array<{ fullName: string; jobTitle?: string }>;
  websiteConfirmedEmails?: ConfirmedEmailHit[];
  fastMode?: boolean;
}): Promise<RealEmailCrawlResult> {
  const cleanDom = normalizeDomain(params.domain);
  const confirmedByPersonKey = new Map<string, ConfirmedEmailHit>();
  if (!cleanDom || !isValidDomain(cleanDom)) {
    return {
      confirmedByPersonKey,
      allConfirmedContacts: [],
      observedEmails: [],
    };
  }

  const vaultExisting = getConfirmedContactsForDomain(cleanDom);
  const timeoutMs = params.fastMode ? 1400 : 1900;

  const [
    ubuntuPgp,
    protonPgp,
    githubHits,
    npmHits,
    yahooWebHits,
    bingRssHits,
    bingHtmlHits,
    ddgHits,
  ] = await Promise.all([
    queryPgpKeyserverEmails(cleanDom, timeoutMs),
    params.fastMode
      ? Promise.resolve([] as ConfirmedEmailHit[])
      : queryProtonPgpKeyserver(cleanDom, timeoutMs),
    queryGithubOrgCommitEmails(cleanDom, params.companyName, timeoutMs),
    queryNpmMaintainerEmails(cleanDom, timeoutMs),
    params.fastMode
      ? Promise.resolve([] as RawSearchHit[])
      : queryYahooSafe(
          `"@${cleanDom}" -site:rocketreach.co -site:signalhire.com -site:leadiq.com`,
          1,
          18,
          timeoutMs
        ),
    queryBingRss(`"@${cleanDom}" -info -support -sales -privacy`, 1, timeoutMs),
    params.fastMode
      ? Promise.resolve([] as RawSearchHit[])
      : queryBingHtml(`"@${cleanDom}" -info -support -privacy`, timeoutMs),
    params.fastMode
      ? Promise.resolve([] as RawSearchHit[])
      : queryDuckDuckGoHtml(`"@${cleanDom}"`, timeoutMs),
  ]);

  const formattedUbuntuPgp: ConfirmedEmailHit[] = ubuntuPgp.map((p) => ({
    email: p.email.toLowerCase(),
    fullName: p.fullName,
    jobTitle: 'Cryptographically Verified Contact',
    emailSource: 'OpenPGP Keyserver' as ConfirmedEmailSource,
    sourceUrl: `https://keyserver.ubuntu.com/pks/lookup?op=index&search=%40${encodeURIComponent(
      cleanDom
    )}`,
  }));

  const snippetConfirmed = extractConfirmedHitsFromSearchSnippets(
    [...yahooWebHits, ...bingRssHits, ...bingHtmlHits, ...ddgHits],
    cleanDom,
    params.knownEmployees
  );

  // Merge in priority order: Company Website > OpenPGP > GitHub > NPM > Public Web > Vault
  const orderedHits: ConfirmedEmailHit[] = [
    ...(params.websiteConfirmedEmails || []),
    ...formattedUbuntuPgp,
    ...protonPgp,
    ...githubHits,
    ...npmHits,
    ...snippetConfirmed,
    ...vaultExisting,
  ];

  const byEmail = new Map<string, ConfirmedEmailHit>();
  for (const hit of orderedHits) {
    const email = hit.email.trim().toLowerCase();
    if (!email.endsWith(`@${cleanDom}`)) continue;
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, { ...hit, email });
    } else if (
      (existing.jobTitle === 'Verified Contact' ||
        existing.jobTitle === 'Verified Public Web Contact') &&
      hit.jobTitle &&
      hit.jobTitle !== 'Verified Contact'
    ) {
      byEmail.set(email, { ...existing, jobTitle: hit.jobTitle });
    }
  }

  // Upgrade job titles when a confirmed email matches a known employee in the org chart / LinkedIn
  const knownByPersonKey = new Map<
    string,
    { fullName: string; jobTitle?: string }
  >();
  for (const emp of params.knownEmployees) {
    const k = normalizePersonKey(emp.fullName);
    if (k && !knownByPersonKey.has(k)) {
      knownByPersonKey.set(k, emp);
    }
  }

  const finalContacts: ConfirmedEmailHit[] = [];
  for (const hit of byEmail.values()) {
    let enrichedHit = hit;
    const pKey = normalizePersonKey(hit.fullName);
    const matchedKnown = pKey ? knownByPersonKey.get(pKey) : undefined;
    if (matchedKnown) {
      enrichedHit = {
        ...hit,
        fullName: matchedKnown.fullName,
        jobTitle:
          matchedKnown.jobTitle && matchedKnown.jobTitle !== 'Team Member'
            ? matchedKnown.jobTitle
            : hit.jobTitle,
      };
    } else {
      // Also check formula match across known employees
      for (const emp of params.knownEmployees) {
        const matchesFormula = EMAIL_FORMULAS.some(
          (f) => applyExcelEmailFormula(emp.fullName, cleanDom, f.id) === hit.email
        );
        if (matchesFormula) {
          enrichedHit = {
            ...hit,
            fullName: emp.fullName,
            jobTitle:
              emp.jobTitle && emp.jobTitle !== 'Team Member'
                ? emp.jobTitle
                : hit.jobTitle,
          };
          break;
        }
      }
    }

    finalContacts.push(enrichedHit);
    const finalKey = normalizePersonKey(enrichedHit.fullName);
    if (finalKey && !confirmedByPersonKey.has(finalKey)) {
      confirmedByPersonKey.set(finalKey, enrichedHit);
    }
  }

  if (finalContacts.length > 0) {
    upsertConfirmedContacts(cleanDom, finalContacts, params.companyName);
  }

  return {
    confirmedByPersonKey,
    allConfirmedContacts: finalContacts,
    observedEmails: finalContacts.map((c) => c.email),
  };
}
