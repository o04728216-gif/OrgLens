import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  EMAIL_FORMULAS,
  type EmailFormulaId,
} from '../../src/utils/emailFormulas.ts';
import type { CandidateEmployee, ConfirmedEmailHit } from '../types.ts';
import {
  cleanJobTitle,
  cleanWhitespace,
  looksLikePersonName,
  slugifyName,
} from '../utils/textAndDomain.ts';

export interface WebGroundedEmailIntel {
  primaryFormulaId: EmailFormulaId | null;
  secondaryFormulaId: EmailFormulaId | null;
  reportedPercentage: number | null;
  rawConsensusText: string;
  confirmedEmails: ConfirmedEmailHit[];
  employees: CandidateEmployee[];
  groundingUrls: string[];
}

const VALID_FORMULA_IDS = new Set<string>(EMAIL_FORMULAS.map((f) => f.id));

const webGroundedCache = new Map<
  string,
  { data: WebGroundedEmailIntel; expiresAt: number }
>();
const inFlightGrounded = new Map<string, Promise<WebGroundedEmailIntel | null>>();

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const SYNTHETIC_LOCAL_PARTS = new Set([
  'jdoe',
  'janedoe',
  'johndoe',
  'jane.doe',
  'john.doe',
  'j.doe',
  'doej',
  'doe.j',
  'jsmith',
  'johnsmith',
  'janesmith',
  'john.smith',
  'jane.smith',
  'j.smith',
  'fmike',
  'frank.mike',
  'f.mike',
  'flast',
  'first.last',
  'firstname.lastname',
  'firstlast',
  'f.last',
  'first_last',
  'f_last',
  'first',
  'last',
  'example',
  'sample',
  'test',
  'user',
  'info',
  'contact',
  'sales',
  'support',
  'hello',
  'admin',
  'careers',
  'hr',
  'press',
  'media',
  'marketing',
  'office',
  'team',
  'billing',
  'legal',
  'privacy',
  'security',
  'noreply',
  'no-reply',
]);

let sharedAiClient: GoogleGenAI | null = null;
let sharedAiKey = '';

function getServerGenAiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!sharedAiClient || sharedAiKey !== apiKey) {
    sharedAiKey = apiKey;
    sharedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedAiClient;
}

function normalizeFormulaCandidate(raw: unknown): EmailFormulaId | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  if (VALID_FORMULA_IDS.has(cleaned)) {
    return cleaned as EmailFormulaId;
  }

  const compact = cleaned.replace(/\s+/g, '');
  if (
    compact.includes('[first_initial][last]') ||
    compact.includes('{f}{last}') ||
    compact === 'flast' ||
    compact === 'firstinitiallast' ||
    compact === 'jdoe'
  ) {
    return 'first_initial_last';
  }
  if (
    compact.includes('[first].[last]') ||
    compact.includes('{first}.{last}') ||
    compact === 'first.last' ||
    compact === 'firstname.lastname'
  ) {
    return 'first_dot_last';
  }
  if (
    compact.includes('[first_initial].[last]') ||
    compact.includes('{f}.{last}') ||
    compact === 'f.last'
  ) {
    return 'first_initial_dot_last';
  }
  if (
    compact.includes('[first][last_initial]') ||
    compact.includes('{first}{l}') ||
    compact === 'firstl'
  ) {
    return 'first_last_initial';
  }
  if (
    compact.includes('[first].[last_initial]') ||
    compact.includes('{first}.{l}') ||
    compact === 'first.l'
  ) {
    return 'first_dot_last_initial';
  }
  if (
    compact.includes('[first]_[last]') ||
    compact.includes('{first}_{last}') ||
    compact === 'first_last'
  ) {
    return 'first_underscore_last';
  }
  if (
    compact.includes('[first]-[last]') ||
    compact.includes('{first}-{last}') ||
    compact === 'first-last'
  ) {
    return 'first_hyphen_last';
  }
  if (
    compact.includes('[first][last]') ||
    compact.includes('{first}{last}') ||
    compact === 'firstlast'
  ) {
    return 'first_last';
  }
  if (
    compact === '[first]' ||
    compact === '{first}' ||
    compact === 'first' ||
    compact === 'firstname' ||
    compact === 'first_only'
  ) {
    return 'first_only';
  }
  if (
    compact === '[last]' ||
    compact === '{last}' ||
    compact === 'last' ||
    compact === 'lastname' ||
    compact === 'last_only'
  ) {
    return 'last_only';
  }
  if (
    compact.includes('[last].[first]') ||
    compact === 'last.first'
  ) {
    return 'last_dot_first';
  }
  if (
    compact.includes('[last][first_initial]') ||
    compact === 'lastf'
  ) {
    return 'last_first_initial';
  }
  return null;
}

function isSyntheticPlaceholderPerson(fullName: string, emailLocal: string): boolean {
  const lowerName = cleanWhitespace(fullName).toLowerCase();
  if (
    /\b(john doe|jane doe|john smith|jane smith|frank mike|first last|example|placeholder|sample)\b/.test(
      lowerName
    )
  ) {
    return true;
  }
  return SYNTHETIC_LOCAL_PARTS.has(emailLocal.toLowerCase());
}

function extractBalancedJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall back to natural language parsing
  }
  return null;
}

let groundingCooldownUntil = 0;

/**
 * Uses server-side Google Search Grounding (`@google/genai` + `tools: [{ googleSearch: {} }]`)
 * to search the World Wide Web in real time for:
 *  1) `"email format" <domain>` consensus (e.g. `[first_initial][last]@marketsquarearchitects.com`, `FLast@...`, `%` share),
 *  2) Real publicly published valid `@<domain>` employee email addresses, and
 *  3) Real current leadership & employees at `<companyName>` (`<domain>`).
 */
export async function searchDomainEmailIntelligenceOnWeb(
  domain: string,
  companyName: string,
  timeoutMs = 3600,
  forceRefresh = false
): Promise<WebGroundedEmailIntel | null> {
  const cleanDom = domain.trim().toLowerCase();
  if (!cleanDom || !cleanDom.includes('.')) return null;

  if (Date.now() < groundingCooldownUntil) return null;

  const ai = getServerGenAiClient();
  if (!ai) return null;

  if (!forceRefresh) {
    const cached = webGroundedCache.get(cleanDom);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const existing = inFlightGrounded.get(cleanDom);
  if (existing) return existing;

  const task = (async (): Promise<WebGroundedEmailIntel | null> => {
    try {
      const allowedFormulaList = [
        'first_dot_last (e.g. jane.doe@domain)',
        'first_initial_last (e.g. [first_initial][last], FLast, jdoe@domain)',
        'first_only (e.g. [first], jane@domain)',
        'first_last (e.g. [first][last], janedoe@domain)',
        'first_last_initial (e.g. [first][last_initial], janed@domain)',
        'first_underscore_last (e.g. jane_doe@domain)',
        'first_initial_dot_last (e.g. j.doe@domain)',
        'first_dot_last_initial (e.g. jane.d@domain)',
        'last_dot_first (e.g. doe.jane@domain)',
        'last_first_initial (e.g. doej@domain)',
        'first_initial_underscore_last (e.g. j_doe@domain)',
        'first_hyphen_last (e.g. jane-doe@domain)',
        'first_initial_hyphen_last (e.g. j-doe@domain)',
        'last_initial_first (e.g. djane@domain)',
        'last_initial_dot_first (e.g. d.jane@domain)',
        'first_initial_last_initial (e.g. jd@domain)',
        'last_only (e.g. doe@domain)',
        'last_first (e.g. doejane@domain)',
      ].join('; ');

      const prompt = [
        `Search Google right now for:`,
        `1. "email format" "${cleanDom}" and "${companyName}" email format`,
        `2. "@${cleanDom}" real published employee email addresses`,
        `3. "${companyName}" "${cleanDom}" team leadership principals employees`,
        ``,
        `Return ONLY a single valid JSON object (no markdown commentary) with these exact keys:`,
        `{`,
        `  "primaryFormulaId": "<exact ID from: ${allowedFormulaList}, or null if unknown>",`,
        `  "secondaryFormulaId": "<second most common ID if reported, or null>",`,
        `  "reportedPercentage": <number 15-99 if web sources state a percentage for the #1 format, else null>,`,
        `  "consensusSummary": "<verbatim 1-2 sentence summary of what web search says about ${cleanDom}'s most common email format, e.g. 'The most common email format for ... is [first_initial][last]@${cleanDom} (such as jdoe@${cleanDom})...'>",`,
        `  "confirmedEmails": [`,
        `    { "fullName": "<real employee full name>", "email": "<exact real published personal email ending in @${cleanDom}>", "jobTitle": "<role>", "sourceUrl": "<public webpage URL>" }`,
        `  ],`,
        `  "employees": [`,
        `    { "fullName": "<real current employee full name at ${companyName}>", "jobTitle": "<exact role/title>", "profileUrl": "<public LinkedIn or company bio URL>" }`,
        `  ]`,
        `}`,
        `CRITICAL RULES:`,
        `- In "confirmedEmails", ONLY include REAL published employee emails actually found on the web ending in @${cleanDom}. NEVER include placeholder examples like jdoe@${cleanDom}, jane.doe@${cleanDom}, john.smith@${cleanDom}, or generic inboxes like info@${cleanDom}, contact@${cleanDom}, sales@${cleanDom}.`,
        `- In "employees", list up to 35 real people who work at ${companyName} (${cleanDom}) found via Google Search (company team page, LinkedIn profiles, press releases). Never invent names.`,
      ].join('\n');

      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), timeoutMs)
        ),
      ]);

      if (!response) return null;

      const rawText = (response.text ?? '').trim();
      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingUrls: string[] = [];
      for (const ch of chunks) {
        const uri = ch?.web?.uri;
        if (typeof uri === 'string' && uri.startsWith('http')) {
          groundingUrls.push(uri);
        }
      }

      const parsedJson = extractBalancedJsonObject(rawText);
      const primaryFormulaId = parsedJson
        ? normalizeFormulaCandidate(parsedJson.primaryFormulaId)
        : null;
      const secondaryFormulaId = parsedJson
        ? normalizeFormulaCandidate(parsedJson.secondaryFormulaId)
        : null;

      let reportedPercentage: number | null = null;
      if (parsedJson && typeof parsedJson.reportedPercentage === 'number') {
        const pct = Math.round(parsedJson.reportedPercentage);
        if (pct >= 15 && pct <= 99) reportedPercentage = pct;
      }

      const consensusSummary =
        parsedJson && typeof parsedJson.consensusSummary === 'string'
          ? cleanWhitespace(parsedJson.consensusSummary)
          : cleanWhitespace(rawText.slice(0, 800));

      const confirmedEmails: ConfirmedEmailHit[] = [];
      const seenEmails = new Set<string>();

      if (parsedJson && Array.isArray(parsedJson.confirmedEmails)) {
        for (const item of parsedJson.confirmedEmails) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const rawEmail =
            typeof rec.email === 'string'
              ? rec.email.trim().toLowerCase()
              : '';
          const rawName =
            typeof rec.fullName === 'string' ? cleanWhitespace(rec.fullName) : '';
          if (!rawEmail.endsWith(`@${cleanDom}`) || seenEmails.has(rawEmail)) {
            continue;
          }
          const local = rawEmail.split('@')[0] || '';
          if (
            !local ||
            !looksLikePersonName(rawName) ||
            isSyntheticPlaceholderPerson(rawName, local)
          ) {
            continue;
          }
          seenEmails.add(rawEmail);
          const rawUrl =
            typeof rec.sourceUrl === 'string' && rec.sourceUrl.startsWith('http')
              ? rec.sourceUrl
              : groundingUrls[0] || `https://${cleanDom}`;
          const isCompanySite = rawUrl.toLowerCase().includes(cleanDom);
          confirmedEmails.push({
            fullName: rawName,
            email: rawEmail,
            jobTitle: cleanJobTitle(
              typeof rec.jobTitle === 'string'
                ? rec.jobTitle
                : 'Verified Web Contact',
              companyName,
              cleanDom
            ),
            emailSource: isCompanySite ? 'Company Website' : 'Public Web Index',
            sourceUrl: rawUrl,
          });
        }
      }

      const employees: CandidateEmployee[] = [];
      const seenNames = new Set<string>();
      if (parsedJson && Array.isArray(parsedJson.employees)) {
        for (const item of parsedJson.employees) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const rawName =
            typeof rec.fullName === 'string' ? cleanWhitespace(rec.fullName) : '';
          if (
            !looksLikePersonName(rawName) ||
            isSyntheticPlaceholderPerson(rawName, '')
          ) {
            continue;
          }
          const key = rawName.toLowerCase();
          if (seenNames.has(key)) continue;
          seenNames.add(key);

          const rawRole =
            typeof rec.jobTitle === 'string' ? rec.jobTitle : 'Team Member';
          const rawProfile =
            typeof rec.profileUrl === 'string' &&
            rec.profileUrl.startsWith('http')
              ? rec.profileUrl
              : `https://${cleanDom}`;
          const isLinkedIn = /linkedin\.com\/in\//i.test(rawProfile);

          employees.push({
            id: `web-grounded-${slugifyName(cleanDom)}-${slugifyName(rawName)}`,
            fullName: rawName,
            jobTitle: cleanJobTitle(rawRole, companyName, cleanDom),
            profileUrl: rawProfile,
            source: isLinkedIn
              ? 'LinkedIn Index'
              : rawProfile.toLowerCase().includes(cleanDom)
                ? 'Company Site'
                : 'Public Web Verified',
          });
        }
      }

      const intel: WebGroundedEmailIntel = {
        primaryFormulaId,
        secondaryFormulaId,
        reportedPercentage,
        rawConsensusText: consensusSummary,
        confirmedEmails,
        employees,
        groundingUrls,
      };

      webGroundedCache.set(cleanDom, {
        data: intel,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return intel;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402|403|429|RESOURCE_EXHAUSTED|PERMISSION_DENIED/i.test(msg)) {
        groundingCooldownUntil = Date.now() + 1000 * 60 * 10;
      }
      return null;
    }
  })();

  inFlightGrounded.set(cleanDom, task);
  try {
    return await task;
  } finally {
    inFlightGrounded.delete(cleanDom);
  }
}
