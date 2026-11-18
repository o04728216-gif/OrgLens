import axios from 'axios';
import type { GlobalCompanyItem } from '../../src/types.ts';
import { expandFullIndustryTitle } from '../../src/utils/emailFormulas.ts';
import { estimateCompanyRevenueRange } from '../../src/utils/geographyAndRevenue.ts';
import {
  recordRegistryLiveTotal,
  type OfficerRecordInput,
} from '../store/companyVaultDb.ts';
import type { ConfirmedEmailHit } from '../types.ts';
import {
  browserHeaders,
  cleanWhitespace,
  extractDomainCore,
  humanizeSlug,
  isValidDomain,
  looksLikePersonName,
  normalizeDomain,
  slugifyName,
} from '../utils/textAndDomain.ts';
import {
  COUNTRY_SLUG_TO_ISO2,
  ISO2_TO_COUNTRY_LABEL,
  ISO2_TO_COUNTRY_SLUG,
} from './directoryConfig.ts';
import {
  fetchAustraliaAbnBusinesses,
  fetchAustraliaAsicCompanies,
  fetchColoradoBusinessEntities,
  fetchFranceSireneOdsCompanies,
  fetchNewYorkCorporations,
  fetchNpmCorporatePublishers,
  fetchOregonActiveBusinesses,
  fetchUsSecPublicCompanies,
  fetchUsTreasuryRecipients,
  probeFranceSireneOdsTotal,
  probeNpmRegistryTotal,
  probeUsStateRegistriesTotals,
} from './nationalRegistryConnectors.ts';

export interface ConnectorBatchResult {
  companies: GlobalCompanyItem[];
  reportedTotal: number;
  officers: OfficerRecordInput[];
  confirmedEmails: Array<{
    domain: string;
    companyName: string;
    hit: ConfirmedEmailHit;
  }>;
}

const INFRA_OR_CONSUMER_DOMAIN_DENYLIST = new Set([
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'googleusercontent.com',
  'googlevideo.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googletagmanager.com',
  'facebook.com',
  'fbcdn.net',
  'instagram.com',
  'whatsapp.com',
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'twitter.com',
  'x.com',
  'twimg.com',
  't.co',
  'tiktok.com',
  'tiktokcdn.com',
  'reddit.com',
  'redd.it',
  'wikipedia.org',
  'wikimedia.org',
  'wikidata.org',
  'w3.org',
  'amazonaws.com',
  'cloudfront.net',
  'cloudflare.com',
  'cloudflare-dns.com',
  'akamai.net',
  'akamaiedge.net',
  'akam.net',
  'akamaihd.net',
  'fastly.net',
  'edgekey.net',
  'edgesuite.net',
  'azurewebsites.net',
  'windows.net',
  'office.com',
  'live.com',
  'outlook.com',
  'hotmail.com',
  'gmail.com',
  'yahoo.com',
  'bing.com',
  'msn.com',
  'apple-dns.net',
  'icloud.com',
  'cdn77.org',
  'jsdelivr.net',
  'unpkg.com',
  'cdnjs.com',
  'blogspot.com',
  'wordpress.com',
  'wordpress.org',
  'medium.com',
  'github.io',
  'gitlab.io',
  'vercel.app',
  'netlify.app',
  'herokuapp.com',
  'pages.dev',
  'workers.dev',
  'archive.org',
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  'amazonaws.com.cn',
  'root-servers.net',
  'gtld-servers.net',
  'iana.org',
  'arpa',
]);

function isCleanCorporateDomain(domain: string): boolean {
  const clean = normalizeDomain(domain);
  if (!clean || !isValidDomain(clean)) return false;
  if (INFRA_OR_CONSUMER_DOMAIN_DENYLIST.has(clean)) return false;
  for (const blocked of INFRA_OR_CONSUMER_DOMAIN_DENYLIST) {
    if (clean.endsWith(`.${blocked}`)) return false;
  }
  if (
    /\b(porn|xxx|sex|adult|casino|betting|xvideos|pornhub|xnxx|xhamster|onlyfans|chaturbate)\b/i.test(
      clean
    )
  ) {
    return false;
  }
  const core = extractDomainCore(clean);
  if (core.length < 2 || /^\d+$/.test(core)) return false;
  if (/^(ns\d+|cdn\d*|static\d*|img\d*|api\d*|mail\d*|ntp\d*)$/i.test(core)) {
    return false;
  }
  return true;
}

function mapCountToEmployeeRange(count: number | null | undefined): string {
  if (!count || count <= 0) return '51 - 200';
  if (count <= 50) return '1 - 50';
  if (count <= 200) return '51 - 200';
  if (count <= 500) return '201 - 500';
  if (count <= 1000) return '501 - 1,000';
  if (count <= 5000) return '1,001 - 5,000';
  if (count <= 10000) return '5,001 - 10,000';
  return '10,000+';
}

function mapSireneTrancheToRange(tranche: string | null | undefined): string {
  const code = String(tranche || '').trim();
  if (!code || code === 'NN' || code === '00') return '1 - 50';
  if (['01', '02', '03', '11', '12'].includes(code)) return '1 - 50';
  if (['21', '22'].includes(code)) return '51 - 200';
  if (code === '31') return '201 - 500';
  if (code === '32') return '501 - 1,000';
  if (['41', '42'].includes(code)) return '1,001 - 5,000';
  if (code === '51') return '5,001 - 10,000';
  if (['52', '53'].includes(code)) return '10,000+';
  return '51 - 200';
}

function formatFrenchOfficerName(prenoms?: string, nom?: string): string {
  const first = cleanWhitespace(String(prenoms || ''))
    .split(/\s+/)[0]
    ?.trim();
  const last = cleanWhitespace(String(nom || ''));
  if (!first || !last) return '';
  const toTitle = (s: string) =>
    s
      .toLowerCase()
      .replace(/(?:^|[\s'-])\S/g, (ch) => ch.toUpperCase());
  return `${toTitle(first)} ${toTitle(last)}`;
}

// Cache Clearbit suggestions to avoid redundant calls
const clearbitQueryCache = new Map<
  string,
  { items: GlobalCompanyItem[]; expiresAt: number }
>();

export async function fetchClearbitCompanySuggestions(
  query: string,
  timeoutMs = 3800
): Promise<GlobalCompanyItem[]> {
  const q = cleanWhitespace(query);
  if (!q || q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = clearbitQueryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  try {
    const resp = await axios.get(
      'https://autocomplete.clearbit.com/v1/companies/suggest',
      {
        params: { query: q },
        timeout: timeoutMs,
        headers: browserHeaders({ Accept: 'application/json' }),
        validateStatus: (s) => s === 200,
      }
    );
    if (!Array.isArray(resp.data)) return [];

    const items: GlobalCompanyItem[] = [];
    for (const entry of resp.data) {
      const name = cleanWhitespace(String(entry?.name || ''));
      const dom = normalizeDomain(String(entry?.domain || ''));
      if (!name || !isCleanCorporateDomain(dom)) continue;
      const slug = slugifyName(name) || extractDomainCore(dom);
      const empRange = '51 - 200';
      items.push({
        id: `clearbit-${dom}`,
        slug,
        name,
        domain: dom,
        websiteUrl: `https://${dom}`,
        logoUrl: typeof entry?.logo === 'string' ? entry.logo : null,
        location: 'Global',
        industry: 'Information Technology & Business Services',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceRegistry: 'Clearbit Domain Index',
      });
    }

    clearbitQueryCache.set(key, {
      items,
      expiresAt: Date.now() + 1000 * 60 * 30,
    });
    return items;
  } catch {
    return [];
  }
}

/**
 * 1. GLEIF Global Legal Entity Identifier Registry (~3.50M verified legal entities worldwide)
 */
export async function fetchGleifCompanies(options: {
  countryIso2?: string;
  query?: string;
  page?: number;
  pageSize?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(1, Math.min(2000, options.page || 1));
  const pageSize = Math.max(1, Math.min(100, options.pageSize || 50));
  const params: Record<string, string | number> = {
    'page[size]': pageSize,
    'page[number]': page,
  };

  if (options.countryIso2) {
    params['filter[entity.legalAddress.country]'] =
      options.countryIso2.toUpperCase();
  }
  if (options.query && options.query.trim().length >= 2) {
    params['filter[entity.legalName]'] = options.query.trim();
  }

  try {
    const resp = await axios.get('https://api.gleif.org/api/v1/lei-records', {
      params,
      timeout: options.timeoutMs || 5500,
      headers: {
        Accept: 'application/vnd.api+json',
        'User-Agent': 'OrgLensDirectory/2.0',
      },
      validateStatus: (s) => s === 200,
    });

    const total = Number(resp.data?.meta?.pagination?.total || 0);
    if (!options.countryIso2 && !options.query && total > 0) {
      recordRegistryLiveTotal(
        'gleif',
        'GLEIF Global Legal Entities',
        total,
        'https://api.gleif.org/api/v1/lei-records'
      );
    }

    const records: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.data
    )
      ? resp.data.data
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const rec of records) {
      const id = String(rec.id || '');
      const attrs = (rec.attributes || {}) as Record<string, unknown>;
      const entity = (attrs.entity || {}) as Record<string, unknown>;
      const legalNameObj = (entity.legalName || {}) as { name?: string };
      const name = cleanWhitespace(String(legalNameObj.name || ''));
      if (!name || name.length < 2) continue;

      const addr = (entity.legalAddress || {}) as {
        city?: string;
        region?: string;
        country?: string;
      };
      const iso2 = String(addr.country || '').toUpperCase();
      const countryLabel = ISO2_TO_COUNTRY_LABEL[iso2] || iso2 || 'Global';
      const city = cleanWhitespace(String(addr.city || ''));
      const location = [city, countryLabel].filter(Boolean).join(', ');
      const countrySlug = ISO2_TO_COUNTRY_SLUG[iso2];

      const category = String(entity.category || '');
      const industry =
        category === 'FUND'
          ? 'Financial Services & Investment Management'
          : 'Corporate & Financial Services';
      const slug = slugifyName(name) || `lei-${id.toLowerCase()}`;
      const empRange = '201 - 500';

      companies.push({
        id: id || slug,
        slug: `${slug}-${id.slice(0, 6).toLowerCase()}`,
        name,
        logoUrl: null,
        location: location || 'Global',
        industry,
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: countrySlug,
        sourceRegistry: 'GLEIF Legal Registry',
      });
    }

    return {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 2. Norway Brønnøysundregistrene (Brreg) Official Register (~1.18M Norwegian entities with direct websites)
 */
export async function fetchNorwayBrregCompanies(options: {
  query?: string;
  page?: number;
  size?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(0, Math.min(95, (options.page || 1) - 1));
  const size = Math.max(1, Math.min(100, options.size || 60));
  const params: Record<string, string | number> = { page, size };
  if (options.query && options.query.trim().length >= 2) {
    params.navn = options.query.trim();
  }

  try {
    const resp = await axios.get(
      'https://data.brreg.no/enhetsregisteret/api/enheter',
      {
        params,
        timeout: options.timeoutMs || 5200,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );

    const total = Number(resp.data?.page?.totalElements || 0);
    if (!options.query && total > 0) {
      recordRegistryLiveTotal(
        'norway_brreg',
        'Norway Brreg Business Register',
        total,
        'https://data.brreg.no/enhetsregisteret/api/enheter'
      );
    }

    const list: Array<Record<string, unknown>> = Array.isArray(
      resp.data?._embedded?.enheter
    )
      ? resp.data._embedded.enheter
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const item of list) {
      const orgnr = String(item.organisasjonsnummer || '');
      const name = cleanWhitespace(String(item.navn || ''));
      if (!name) continue;

      const rawWeb = String(item.hjemmeside || '');
      const dom = rawWeb ? normalizeDomain(rawWeb) : '';
      const validDom = isCleanCorporateDomain(dom) ? dom : undefined;

      const addr = (item.forretningsadresse || item.postadresse || {}) as {
        poststed?: string;
      };
      const city = cleanWhitespace(String(addr.poststed || ''));
      const location = city
        ? `${city.charAt(0) + city.slice(1).toLowerCase()}, Norway`
        : 'Norway';

      const naering = (item.naeringskode1 || {}) as { beskrivelse?: string };
      const rawInd = cleanWhitespace(String(naering.beskrivelse || ''));
      const industry = rawInd
        ? expandFullIndustryTitle(rawInd)
        : 'Nordic Enterprise & Commerce';

      const empCount = Number(item.antallAnsatte || 0);
      const employeeRange = mapCountToEmployeeRange(empCount);
      const baseSlug = slugifyName(name) || `no-${orgnr}`;

      companies.push({
        id: `brreg-${orgnr}`,
        slug: validDom ? baseSlug : `${baseSlug}-${orgnr.slice(-4)}`,
        name,
        domain: validDom,
        websiteUrl: validDom ? `https://${validDom}` : undefined,
        logoUrl: null,
        location,
        industry,
        employeeRange,
        revenueRange: estimateCompanyRevenueRange(employeeRange, name),
        sourceCountrySlug: 'norway',
        sourceRegistry: 'Norway Brreg Register',
      });
    }

    return {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 3. France SIRENE Official National Business Registry (Active Enterprises + Registered Executive Dirigeants)
 */
export async function fetchFranceSireneCompanies(options: {
  query?: string;
  departement?: string;
  page?: number;
  perPage?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(1, Math.min(350, options.page || 1));
  const perPage = Math.max(1, Math.min(25, options.perPage || 25));

  const params: Record<string, string | number> = {
    etat_administratif: 'A',
    page,
    per_page: perPage,
  };

  if (options.query && options.query.trim().length >= 3) {
    params.q = options.query.trim();
  } else if (options.departement) {
    params.departement = options.departement;
  } else {
    params.departement = '75';
  }

  try {
    const resp = await axios.get(
      'https://recherche-entreprises.api.gouv.fr/search',
      {
        params,
        timeout: options.timeoutMs || 5200,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );

    const total = Number(resp.data?.total_results || 0);
    const results: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.results
    )
      ? resp.data.results
      : [];

    const companies: GlobalCompanyItem[] = [];
    const officers: OfficerRecordInput[] = [];

    for (const item of results) {
      const siren = String(item.siren || '');
      const rawName = cleanWhitespace(
        String(item.nom_complet || item.nom_raison_sociale || '')
      );
      if (!rawName || rawName.length < 2) continue;

      // Format ALL-CAPS French corporate names cleanly when appropriate
      const formattedName =
        rawName === rawName.toUpperCase() && rawName.length > 5
          ? rawName
              .toLowerCase()
              .replace(/(?:^|[\s'-])\S/g, (ch) => ch.toUpperCase())
          : rawName;

      const siege = (item.siege || {}) as {
        libelle_commune?: string;
      };
      const cityRaw = cleanWhitespace(String(siege.libelle_commune || ''));
      const city = cityRaw
        ? cityRaw
            .toLowerCase()
            .replace(/(?:^|[\s'-])\S/g, (ch) => ch.toUpperCase())
        : '';
      const location = city ? `${city}, France` : 'France';

      const employeeRange = mapSireneTrancheToRange(
        String(item.tranche_effectif_salarie || '')
      );
      const slug = `${slugifyName(formattedName)}-${siren.slice(-4)}`;

      companies.push({
        id: `sirene-${siren}`,
        slug,
        name: formattedName,
        logoUrl: null,
        location,
        industry: 'European Enterprise & Commercial Services',
        employeeRange,
        revenueRange: estimateCompanyRevenueRange(employeeRange, formattedName),
        sourceCountrySlug: 'france',
        sourceRegistry: 'France SIRENE Registry',
      });

      const dirigeants = Array.isArray(item.dirigeants) ? item.dirigeants : [];
      for (const d of dirigeants.slice(0, 8)) {
        const dObj = d as {
          nom?: string;
          prenoms?: string;
          qualite?: string;
          type_dirigeant?: string;
        };
        if (dObj.type_dirigeant && dObj.type_dirigeant !== 'personne physique') {
          continue;
        }
        const fullName = formatFrenchOfficerName(dObj.prenoms, dObj.nom);
        if (fullName && looksLikePersonName(fullName)) {
          officers.push({
            companySlug: slug,
            fullName,
            jobTitle: cleanWhitespace(String(dObj.qualite || 'Executive Officer')),
            sourceRegistry: 'France SIRENE Registry',
          });
        }
      }
    }

    return {
      companies,
      reportedTotal: total,
      officers,
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 4. Finland PRH Open Data Business Register (~830,073 Finnish companies)
 */
export async function fetchFinlandPrhCompanies(options: {
  name?: string;
  page?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(1, Math.min(500, options.page || 1));
  const params: Record<string, string | number> = { page };
  if (options.name && options.name.trim().length >= 2) {
    params.name = options.name.trim();
  }

  try {
    const resp = await axios.get(
      'https://avoindata.prh.fi/opendata-ytj-api/v3/companies',
      {
        params,
        timeout: options.timeoutMs || 5500,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );

    const total = Number(resp.data?.totalResults || 0);
    if (!options.name && total > 0) {
      recordRegistryLiveTotal(
        'finland_prh',
        'Finland PRH Business Register',
        total,
        'https://avoindata.prh.fi/opendata-ytj-api/v3/companies'
      );
    }

    const list: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.companies
    )
      ? resp.data.companies
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const c of list) {
      const bizId = String(
        (c.businessId as { value?: string } | undefined)?.value || ''
      );
      const namesArr = Array.isArray(c.names) ? c.names : [];
      const activeNameObj =
        namesArr.find(
          (n: { endDate?: string; name?: string }) => !n.endDate && n.name
        ) || namesArr[0];
      const name = cleanWhitespace(String(activeNameObj?.name || ''));
      if (!name || name.length < 2) continue;

      const websiteObj = c.website as { url?: string } | undefined;
      const rawWeb = String(websiteObj?.url || '');
      const dom = rawWeb ? normalizeDomain(rawWeb) : '';
      const validDom = isCleanCorporateDomain(dom) ? dom : undefined;

      const mainBiz = c.mainBusinessLine as
        | { descriptions?: Array<{ languageCode?: string; description?: string }> }
        | undefined;
      const enDesc =
        mainBiz?.descriptions?.find((d) => d.languageCode === '3')?.description ||
        mainBiz?.descriptions?.[0]?.description ||
        '';
      const industry = enDesc
        ? expandFullIndustryTitle(cleanWhitespace(enDesc))
        : 'Nordic Technology & Commerce';

      const addresses = Array.isArray(c.addresses) ? c.addresses : [];
      const postOffices = Array.isArray(addresses[0]?.postOffices)
        ? addresses[0].postOffices
        : [];
      const cityRaw = cleanWhitespace(String(postOffices[0]?.city || ''));
      const city = cityRaw
        ? cityRaw.charAt(0) + cityRaw.slice(1).toLowerCase()
        : '';
      const location = city ? `${city}, Finland` : 'Finland';

      const slug = validDom
        ? slugifyName(name)
        : `${slugifyName(name)}-${bizId.replace(/[^a-z0-9]/gi, '').slice(-4)}`;
      const empRange = '1 - 50';

      companies.push({
        id: `prh-${bizId || slug}`,
        slug,
        name,
        domain: validDom,
        websiteUrl: validDom ? `https://${validDom}` : undefined,
        logoUrl: null,
        location,
        industry,
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'finland',
        sourceRegistry: 'Finland PRH Register',
      });
    }

    return {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 5. Denmark / Norway CVR Direct Company & Confirmed Email Lookup
 */
export async function fetchDenmarkCvrCompany(
  query: string,
  country: 'dk' | 'no' = 'dk',
  timeoutMs = 3600
): Promise<ConnectorBatchResult> {
  const cleanQ = cleanWhitespace(query);
  if (!cleanQ || cleanQ.length < 2) {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }

  try {
    const resp = await axios.get('https://cvrapi.dk/api', {
      params: { search: cleanQ, country },
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'OrgLensDirectory/2.0 (+https://orglens.io)',
        Accept: 'application/json',
      },
      validateStatus: (s) => s === 200,
    });

    const data = resp.data as Record<string, unknown>;
    const name = cleanWhitespace(String(data?.name || ''));
    if (!name) {
      return {
        companies: [],
        reportedTotal: 0,
        officers: [],
        confirmedEmails: [],
      };
    }

    const vat = String(data?.vat || '');
    const rawEmail = cleanWhitespace(String(data?.email || '')).toLowerCase();
    const emailDom = rawEmail.includes('@')
      ? normalizeDomain(rawEmail.split('@')[1] || '')
      : '';
    const validDom = isCleanCorporateDomain(emailDom) ? emailDom : undefined;

    const city = cleanWhitespace(String(data?.city || ''));
    const countryName = country === 'dk' ? 'Denmark' : 'Norway';
    const location = city ? `${city}, ${countryName}` : countryName;
    const indDesc = cleanWhitespace(String(data?.industrydesc || ''));
    const empCount = Number(data?.employees || 0);
    const employeeRange = mapCountToEmployeeRange(empCount);
    const slug = `${slugifyName(name)}-${vat.slice(-4)}`;

    const companies: GlobalCompanyItem[] = [
      {
        id: `cvr-${country}-${vat}`,
        slug,
        name,
        domain: validDom,
        websiteUrl: validDom ? `https://${validDom}` : undefined,
        logoUrl: null,
        location,
        industry: indDesc || 'Nordic Commercial Enterprise',
        employeeRange,
        revenueRange: estimateCompanyRevenueRange(employeeRange, name),
        sourceCountrySlug: country === 'dk' ? 'denmark' : 'norway',
        sourceRegistry: 'Denmark CVR Register',
      },
    ];

    const confirmedEmails: ConnectorBatchResult['confirmedEmails'] = [];
    if (validDom && rawEmail.endsWith(`@${validDom}`)) {
      confirmedEmails.push({
        domain: validDom,
        companyName: name,
        hit: {
          email: rawEmail,
          fullName: `${name} Registry Desk`,
          jobTitle: 'Official Registered Contact',
          emailSource: 'Business Registry',
          sourceUrl: 'https://datacvr.virk.dk',
        },
      });
    }

    return {
      companies,
      reportedTotal: 1,
      officers: [],
      confirmedEmails,
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 6. OpenAlex Global Organizations & Enterprises (~145,454 organizations with verified homepage_url)
 */
export async function fetchOpenAlexInstitutions(options: {
  countryIso2?: string;
  search?: string;
  page?: number;
  perPage?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(1, Math.min(200, options.page || 1));
  const perPage = Math.max(1, Math.min(100, options.perPage || 60));
  const params: Record<string, string | number> = {
    page,
    'per-page': perPage,
    mailto: 'directory@orglens.io',
  };

  if (options.countryIso2) {
    params.filter = `country_code:${options.countryIso2.toUpperCase()}`;
  }
  if (options.search && options.search.trim().length >= 2) {
    params.search = options.search.trim();
  }

  try {
    const resp = await axios.get('https://api.openalex.org/institutions', {
      params,
      timeout: options.timeoutMs || 5200,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s === 200,
    });

    const total = Number(resp.data?.meta?.count || 0);
    if (!options.countryIso2 && !options.search && total > 0) {
      recordRegistryLiveTotal(
        'openalex',
        'OpenAlex Global Institutions & Labs',
        total,
        'https://api.openalex.org/institutions'
      );
    }

    const list: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.results
    )
      ? resp.data.results
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const inst of list) {
      const name = cleanWhitespace(String(inst.display_name || ''));
      if (!name || name.length < 2) continue;

      const rawUrl = String(inst.homepage_url || '');
      const dom = rawUrl ? normalizeDomain(rawUrl) : '';
      const validDom = isCleanCorporateDomain(dom) ? dom : undefined;

      const geo = (inst.geo || {}) as {
        city?: string;
        country?: string;
        country_code?: string;
      };
      const iso2 = String(
        geo.country_code || inst.country_code || ''
      ).toUpperCase();
      const countryName =
        cleanWhitespace(String(geo.country || '')) ||
        ISO2_TO_COUNTRY_LABEL[iso2] ||
        'Global';
      const city = cleanWhitespace(String(geo.city || ''));
      const location = [city, countryName].filter(Boolean).join(', ');

      const rawType = String(inst.type || '').toLowerCase();
      const industry =
        rawType === 'company'
          ? 'Research, Technology & Enterprise R&D'
          : rawType === 'healthcare'
          ? 'Healthcare & Medical Centers'
          : rawType === 'education'
          ? 'Higher Education & Research Institutions'
          : 'Science, Research & Innovation Organizations';

      const idStr = String(inst.id || '').split('/').pop() || slugifyName(name);
      const slug = validDom
        ? slugifyName(name)
        : `${slugifyName(name)}-${idStr.toLowerCase().slice(-4)}`;
      const empRange = '201 - 500';

      companies.push({
        id: `openalex-${idStr}`,
        slug,
        name,
        domain: validDom,
        websiteUrl: validDom ? `https://${validDom}` : undefined,
        logoUrl:
          typeof inst.image_thumbnail_url === 'string'
            ? inst.image_thumbnail_url
            : null,
        location: location || 'Global',
        industry,
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: ISO2_TO_COUNTRY_SLUG[iso2],
        sourceRegistry: 'OpenAlex Global Index',
      });
    }

    return {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 7. ROR (Research Organization Registry v2 — ~143,297 verified global organizations with domains)
 */
export async function fetchRorOrganizations(options: {
  query?: string;
  page?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(1, Math.min(500, options.page || 1));
  const params: Record<string, string | number> = { page };
  if (options.query && options.query.trim().length >= 2) {
    params.query = options.query.trim();
  }

  try {
    const resp = await axios.get('https://api.ror.org/v2/organizations', {
      params,
      timeout: options.timeoutMs || 5200,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s === 200,
    });

    const total = Number(resp.data?.number_of_results || 0);
    if (!options.query && total > 0) {
      recordRegistryLiveTotal(
        'ror_v2',
        'ROR Global Organization Registry',
        total,
        'https://api.ror.org/v2/organizations'
      );
    }

    const items: Array<Record<string, unknown>> = Array.isArray(resp.data?.items)
      ? resp.data.items
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const item of items) {
      const rorId = String(item.id || '').split('/').pop() || '';
      const names = Array.isArray(item.names) ? item.names : [];
      const displayObj =
        names.find((n: { types?: string[] }) =>
          n.types?.includes('ror_display')
        ) || names[0];
      const name = cleanWhitespace(String(displayObj?.value || ''));
      if (!name) continue;

      const links = Array.isArray(item.links) ? item.links : [];
      const webLink =
        links.find((l: { type?: string }) => l.type === 'website')?.value ||
        links[0]?.value ||
        '';
      const dom = webLink ? normalizeDomain(String(webLink)) : '';
      const validDom = isCleanCorporateDomain(dom) ? dom : undefined;

      const locations = Array.isArray(item.locations) ? item.locations : [];
      const geo = (locations[0]?.geonames_details || {}) as {
        name?: string;
        country_name?: string;
        country_code?: string;
      };
      const iso2 = String(geo.country_code || '').toUpperCase();
      const location = [geo.name, geo.country_name].filter(Boolean).join(', ');

      const types = Array.isArray(item.types) ? item.types : [];
      const primaryType = String(types[0] || '').toLowerCase();
      const industry =
        primaryType === 'company'
          ? 'Enterprise R&D & Biotechnology'
          : primaryType === 'healthcare'
          ? 'Healthcare & Clinical Systems'
          : 'Research & Global Institutions';

      const slug = validDom
        ? slugifyName(name)
        : `${slugifyName(name)}-${rorId.slice(-4)}`;
      const empRange = '201 - 500';

      companies.push({
        id: `ror-${rorId || slug}`,
        slug,
        name,
        domain: validDom,
        websiteUrl: validDom ? `https://${validDom}` : undefined,
        logoUrl: null,
        location: location || 'Global',
        industry,
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: ISO2_TO_COUNTRY_SLUG[iso2],
        sourceRegistry: 'ROR Global Registry',
      });
    }

    return {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 8. Wikidata Business Enterprises (`P31=Q4830453` + `P856` official websites — ~277,448+ business enterprises)
 */
export async function fetchWikidataEnterprises(options: {
  query?: string;
  offset?: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const offset = Math.max(0, Math.min(9500, options.offset || 0));
  const limit = Math.max(1, Math.min(40, options.limit || 25));
  const srsearch = options.query
    ? `${options.query.trim()} haswbstatement:P31=Q4830453`
    : 'haswbstatement:P31=Q4830453 haswbstatement:P856';

  try {
    const searchResp = await axios.get('https://www.wikidata.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch,
        srlimit: limit,
        sroffset: offset,
        format: 'json',
      },
      timeout: options.timeoutMs || 5200,
      headers: {
        'User-Agent': 'OrgLensDirectory/2.0 (https://orglens.io)',
        Accept: 'application/json',
      },
      validateStatus: (s) => s === 200,
    });

    const total = Number(searchResp.data?.query?.searchinfo?.totalhits || 0);
    if (!options.query && total > 0) {
      recordRegistryLiveTotal(
        'wikidata_enterprises',
        'Wikidata Business Enterprises',
        total,
        'https://www.wikidata.org/w/api.php'
      );
    }

    const searchItems: Array<{ title?: string }> = Array.isArray(
      searchResp.data?.query?.search
    )
      ? searchResp.data.query.search
      : [];
    const qids = searchItems
      .map((s) => String(s.title || '').trim())
      .filter((id) => /^Q\d+$/.test(id));
    if (qids.length === 0) {
      return {
        companies: [],
        reportedTotal: total,
        officers: [],
        confirmedEmails: [],
      };
    }

    const entitiesResp = await axios.get('https://www.wikidata.org/w/api.php', {
      params: {
        action: 'wbgetentities',
        ids: qids.join('|'),
        props: 'labels|descriptions|claims',
        languages: 'en',
        format: 'json',
      },
      timeout: options.timeoutMs || 5200,
      headers: {
        'User-Agent': 'OrgLensDirectory/2.0 (https://orglens.io)',
        Accept: 'application/json',
      },
      validateStatus: (s) => s === 200,
    });

    const entitiesObj = (entitiesResp.data?.entities || {}) as Record<
      string,
      Record<string, unknown>
    >;
    const companies: GlobalCompanyItem[] = [];

    for (const qid of qids) {
      const ent = entitiesObj[qid];
      if (!ent) continue;
      const labels = (ent.labels || {}) as { en?: { value?: string } };
      const descriptions = (ent.descriptions || {}) as {
        en?: { value?: string };
      };
      const name = cleanWhitespace(String(labels.en?.value || ''));
      if (!name || /^Q\d+$/.test(name)) continue;

      const claims = (ent.claims || {}) as Record<
        string,
        Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
      >;
      const p856 = claims.P856?.[0]?.mainsnak?.datavalue?.value;
      const rawWeb = typeof p856 === 'string' ? p856 : '';
      const dom = rawWeb ? normalizeDomain(rawWeb) : '';
      const validDom = isCleanCorporateDomain(dom) ? dom : undefined;

      const desc = cleanWhitespace(String(descriptions.en?.value || ''));
      const industry = desc
        ? expandFullIndustryTitle(
            desc.charAt(0).toUpperCase() + desc.slice(1)
          )
        : 'Global Corporate Enterprise';

      const slug = validDom
        ? slugifyName(name)
        : `${slugifyName(name)}-${qid.toLowerCase()}`;
      const empRange = '201 - 500';

      companies.push({
        id: `wikidata-${qid}`,
        slug,
        name,
        domain: validDom,
        websiteUrl: validDom ? `https://${validDom}` : undefined,
        logoUrl: null,
        location: 'Global',
        industry,
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceRegistry: 'Wikidata Corporate Graph',
      });
    }

    return {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 9. GitHub Global Organizations (~9.74M Verified Tech & Corporate Organizations)
 */
const githubOrgSearchCache = new Map<
  string,
  { result: ConnectorBatchResult; expiresAt: number }
>();

export async function fetchGithubOrganizations(options: {
  query?: string;
  page?: number;
  perPage?: number;
  timeoutMs?: number;
}): Promise<ConnectorBatchResult> {
  const page = Math.max(1, Math.min(30, options.page || 1));
  const perPage = Math.max(1, Math.min(40, options.perPage || 30));
  const q = options.query
    ? `${options.query.trim()} type:org`
    : 'type:org followers:>25';
  const cacheKey = `${q}:${page}:${perPage}`;
  const cached = githubOrgSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  try {
    const resp = await axios.get('https://api.github.com/search/users', {
      params: { q, page, per_page: perPage },
      timeout: options.timeoutMs || 4500,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'OrgLensDirectory/2.0',
      },
      validateStatus: (s) => s === 200,
    });

    const total = Number(resp.data?.total_count || 0);
    if (!options.query && q === 'type:org' && total > 0) {
      recordRegistryLiveTotal(
        'github_orgs',
        'GitHub Global Organizations',
        total,
        'https://api.github.com/search/users?q=type:org'
      );
    }

    const items: Array<Record<string, unknown>> = Array.isArray(resp.data?.items)
      ? resp.data.items
      : [];

    const companies: GlobalCompanyItem[] = items.map((org) => {
      const login = String(org.login || '').trim();
      const name = humanizeSlug(login) || login;
      const slug = slugifyName(login) || login.toLowerCase();
      const empRange = '51 - 200';
      return {
        id: `gh-org-${org.id || login}`,
        slug: `gh-${slug}`,
        name,
        logoUrl: typeof org.avatar_url === 'string' ? org.avatar_url : null,
        location: 'Global',
        industry: 'Software Development & Engineering',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceRegistry: 'GitHub Organizations',
      };
    });

    const result: ConnectorBatchResult = {
      companies,
      reportedTotal: total,
      officers: [],
      confirmedEmails: [],
    };
    githubOrgSearchCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + 1000 * 60 * 20,
    });
    return result;
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 10. Majestic Million Live Corporate Domain Stream (HTTP 206 Byte-Range CSV)
 */
export async function crawlMajesticDomainChunk(
  byteOffset: number,
  byteLength = 65536
): Promise<{ companies: GlobalCompanyItem[]; nextByteOffset: number }> {
  // Cap stream scan window to 4MB when upstream serves HTTP 200 full stream instead of 206
  const safeOffset = Math.max(0, byteOffset % (4 * 1024 * 1024));
  const endByte = safeOffset + byteLength - 1;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7500);
    const resp = await fetch(
      'https://downloads.majestic.com/majestic_million.csv',
      {
        headers: {
          Range: `bytes=${safeOffset}-${endByte}`,
          'User-Agent': 'OrgLensDirectory/2.0',
        },
        signal: ctrl.signal,
      }
    );

    if (resp.status !== 200 && resp.status !== 206) {
      clearTimeout(timer);
      return { companies: [], nextByteOffset: safeOffset };
    }

    recordRegistryLiveTotal(
      'majestic_million',
      'Majestic Million Global Domains',
      1_000_000,
      'https://downloads.majestic.com/majestic_million.csv'
    );

    let rawText = '';
    if (resp.status === 206) {
      rawText = await resp.text();
    } else if (resp.body) {
      const reader = resp.body.getReader();
      const targetEnd = safeOffset + byteLength;
      let totalRead = 0;
      const chunks: Buffer[] = [];
      while (totalRead < targetEnd) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const nextTotal = totalRead + value.byteLength;
        if (nextTotal > safeOffset) {
          const sliceStart = Math.max(0, safeOffset - totalRead);
          const sliceEnd = Math.min(value.byteLength, targetEnd - totalRead);
          if (sliceEnd > sliceStart) {
            chunks.push(Buffer.from(value.subarray(sliceStart, sliceEnd)));
          }
        }
        totalRead = nextTotal;
      }
      await reader.cancel().catch(() => undefined);
      rawText = Buffer.concat(chunks).toString('utf8');
    }
    clearTimeout(timer);

    const lines = rawText.split(/\r?\n/);
    const usableLines = lines.slice(1, -1);

    const companies: GlobalCompanyItem[] = [];
    for (const line of usableLines) {
      const cols = line.split(',');
      if (cols.length < 4) continue;
      const rank = parseInt(cols[0] || '0', 10) || 50000;
      const dom = normalizeDomain(cols[2] || '');
      if (!isCleanCorporateDomain(dom)) continue;

      const core = extractDomainCore(dom);
      const name = humanizeSlug(core);
      if (!name || name.length < 2) continue;

      const empRange =
        rank <= 2500
          ? '1,001 - 5,000'
          : rank <= 25000
          ? '201 - 500'
          : '51 - 200';

      const tld = (cols[3] || '').toLowerCase();
      const tldIsoMap: Record<string, string> = {
        uk: 'GB',
        de: 'DE',
        fr: 'FR',
        ca: 'CA',
        au: 'AU',
        nl: 'NL',
        jp: 'JP',
        in: 'IN',
        br: 'BR',
        ch: 'CH',
        es: 'ES',
        it: 'IT',
        se: 'SE',
        no: 'NO',
        dk: 'DK',
        fi: 'FI',
        pl: 'PL',
        ie: 'IE',
        sg: 'SG',
      };
      const iso2 = tldIsoMap[tld];

      companies.push({
        id: `majestic-${dom}`,
        slug: slugifyName(core) || dom.replace(/\./g, '-'),
        name,
        domain: dom,
        websiteUrl: `https://${dom}`,
        logoUrl: null,
        location: iso2 ? ISO2_TO_COUNTRY_LABEL[iso2] || 'Global' : 'Global',
        industry: 'Digital Commerce & Enterprise Web',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: iso2 ? ISO2_TO_COUNTRY_SLUG[iso2] : undefined,
        sourceRegistry: 'Majestic Million Domains',
      });
    }

    const nextByteOffset =
      rawText.length < byteLength / 2 ? 0 : safeOffset + byteLength - 256;
    return { companies, nextByteOffset };
  } catch {
    return { companies: [], nextByteOffset: safeOffset };
  }
}

/**
 * 11. Tranco Daily Top 1M Active Global Domains Stream (HTTP 206 Byte-Range CSV)
 */
let cachedTrancoDownloadUrl: { url: string; expiresAt: number } | null = null;

async function resolveTrancoDownloadUrl(): Promise<string | null> {
  if (cachedTrancoDownloadUrl && cachedTrancoDownloadUrl.expiresAt > Date.now()) {
    return cachedTrancoDownloadUrl.url;
  }
  try {
    const meta = await axios.get('https://tranco-list.eu/api/lists/date/latest', {
      timeout: 5000,
      validateStatus: (s) => s === 200,
    });
    const downloadUrl = String(meta.data?.download || '');
    if (downloadUrl.startsWith('https://')) {
      cachedTrancoDownloadUrl = {
        url: downloadUrl,
        expiresAt: Date.now() + 1000 * 60 * 60 * 4,
      };
      recordRegistryLiveTotal(
        'tranco_top1m',
        'Tranco Top 1M Active Domains',
        1_000_000,
        'https://tranco-list.eu/api/lists/date/latest'
      );
      return downloadUrl;
    }
  } catch {
    // Non-fatal
  }
  return null;
}

export async function crawlTrancoDomainChunk(
  byteOffset: number,
  byteLength = 49152
): Promise<{ companies: GlobalCompanyItem[]; nextByteOffset: number }> {
  const url = await resolveTrancoDownloadUrl();
  if (!url) return { companies: [], nextByteOffset: byteOffset };

  const safeOffset = Math.max(0, byteOffset);
  const endByte = safeOffset + byteLength - 1;

  try {
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: {
        Range: `bytes=${safeOffset}-${endByte}`,
        'User-Agent': 'OrgLensDirectory/2.0',
      },
      responseType: 'text',
      validateStatus: (s) => s === 206 || s === 200,
    });

    const rawText = typeof resp.data === 'string' ? resp.data : '';
    const lines = rawText.split(/\r?\n/);
    const usableLines = lines.slice(1, -1);

    const companies: GlobalCompanyItem[] = [];
    for (const line of usableLines) {
      const [rankStr, rawDom] = line.split(',');
      if (!rawDom) continue;
      const dom = normalizeDomain(rawDom);
      if (!isCleanCorporateDomain(dom)) continue;

      const rank = parseInt(rankStr || '50000', 10) || 50000;
      const core = extractDomainCore(dom);
      const name = humanizeSlug(core);
      if (!name || name.length < 2) continue;

      const empRange =
        rank <= 2500
          ? '1,001 - 5,000'
          : rank <= 25000
          ? '201 - 500'
          : '51 - 200';

      companies.push({
        id: `tranco-${dom}`,
        slug: slugifyName(core) || dom.replace(/\./g, '-'),
        name,
        domain: dom,
        websiteUrl: `https://${dom}`,
        logoUrl: null,
        location: 'Global',
        industry: 'Global Active Web Enterprise',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceRegistry: 'Tranco Global Domains',
      });
    }

    const nextByteOffset =
      rawText.length < byteLength / 2 ? 0 : safeOffset + byteLength - 200;
    return { companies, nextByteOffset };
  } catch {
    return { companies: [], nextByteOffset: safeOffset };
  }
}

/**
 * Queries relevant live national/international registries in parallel for interactive Filter Explorer searches.
 */
export async function fetchFederatedRegistryCompaniesForFilter(params: {
  countrySlugs: string[];
  companyQuery: string;
  industryKeyword: string;
  page: number;
}): Promise<ConnectorBatchResult> {
  const { countrySlugs, companyQuery, industryKeyword, page } = params;
  const effectiveQuery = companyQuery || industryKeyword || '';
  const tasks: Array<Promise<ConnectorBatchResult>> = [];

  const isoCodes = countrySlugs
    .map((slug) => COUNTRY_SLUG_TO_ISO2[slug])
    .filter(Boolean);

  if (effectiveQuery) {
    tasks.push(
      fetchClearbitCompanySuggestions(effectiveQuery).then((items) => ({
        companies: items,
        reportedTotal: items.length,
        officers: [],
        confirmedEmails: [],
      }))
    );
    tasks.push(
      fetchGleifCompanies({
        countryIso2: isoCodes[0],
        query: effectiveQuery,
        page,
        pageSize: 35,
      })
    );
    tasks.push(
      fetchOpenAlexInstitutions({
        countryIso2: isoCodes[0],
        search: effectiveQuery,
        page,
        perPage: 30,
      })
    );
    tasks.push(fetchRorOrganizations({ query: effectiveQuery, page }));
    tasks.push(
      fetchWikidataEnterprises({
        query: effectiveQuery,
        offset: (page - 1) * 20,
        limit: 20,
      })
    );
  } else if (isoCodes.length === 1) {
    const iso = isoCodes[0];
    tasks.push(
      fetchGleifCompanies({ countryIso2: iso, page, pageSize: 45 })
    );
    tasks.push(
      fetchOpenAlexInstitutions({ countryIso2: iso, page, perPage: 35 })
    );
    if (iso === 'NO') {
      tasks.push(fetchNorwayBrregCompanies({ page, size: 60 }));
    } else if (iso === 'FR') {
      tasks.push(fetchFranceSireneCompanies({ page, perPage: 25 }));
      tasks.push(
        fetchFranceSireneOdsCompanies({ offset: (page - 1) * 40, limit: 40 })
      );
    } else if (iso === 'FI') {
      tasks.push(fetchFinlandPrhCompanies({ page }));
    } else if (iso === 'AU') {
      tasks.push(
        fetchAustraliaAsicCompanies({ offset: (page - 1) * 40, limit: 40 })
      );
      tasks.push(
        fetchAustraliaAbnBusinesses({ offset: (page - 1) * 35, limit: 35 })
      );
    } else if (iso === 'US') {
      tasks.push(fetchUsTreasuryRecipients({ page, limit: 40 }));
      tasks.push(
        fetchUsSecPublicCompanies({ offset: (page - 1) * 40, limit: 40 })
      );
      tasks.push(
        fetchNewYorkCorporations({ offset: (page - 1) * 30, limit: 30 })
      );
    }
  } else {
    tasks.push(fetchGleifCompanies({ page, pageSize: 35 }));
    tasks.push(fetchOpenAlexInstitutions({ page, perPage: 30 }));
    tasks.push(
      fetchNpmCorporatePublishers({ topicIdx: page, from: 0, size: 25 })
    );
  }

  if (countrySlugs.includes('norway') && effectiveQuery) {
    tasks.push(
      fetchNorwayBrregCompanies({ query: effectiveQuery, page, size: 40 })
    );
  }
  if (countrySlugs.includes('france') && effectiveQuery.length >= 3) {
    tasks.push(
      fetchFranceSireneCompanies({ query: effectiveQuery, page, perPage: 25 })
    );
    tasks.push(
      fetchFranceSireneOdsCompanies({
        query: effectiveQuery,
        offset: (page - 1) * 30,
        limit: 30,
      })
    );
  }
  if (countrySlugs.includes('finland') && effectiveQuery) {
    tasks.push(fetchFinlandPrhCompanies({ name: effectiveQuery, page }));
  }
  if (countrySlugs.includes('denmark') && effectiveQuery) {
    tasks.push(fetchDenmarkCvrCompany(effectiveQuery, 'dk'));
  }
  if (countrySlugs.includes('australia') && effectiveQuery) {
    tasks.push(
      fetchAustraliaAsicCompanies({
        query: effectiveQuery,
        offset: (page - 1) * 30,
        limit: 30,
      })
    );
    tasks.push(
      fetchAustraliaAbnBusinesses({
        query: effectiveQuery,
        offset: (page - 1) * 25,
        limit: 25,
      })
    );
  }
  if (countrySlugs.includes('united-states') && effectiveQuery) {
    tasks.push(
      fetchUsTreasuryRecipients({ keyword: effectiveQuery, page, limit: 30 })
    );
    tasks.push(
      fetchUsSecPublicCompanies({
        query: effectiveQuery,
        offset: (page - 1) * 30,
        limit: 30,
      })
    );
    tasks.push(
      fetchNewYorkCorporations({
        query: effectiveQuery,
        offset: (page - 1) * 25,
        limit: 25,
      })
    );
    tasks.push(
      fetchColoradoBusinessEntities({
        query: effectiveQuery,
        offset: (page - 1) * 20,
        limit: 20,
      })
    );
    tasks.push(
      fetchOregonActiveBusinesses({
        query: effectiveQuery,
        offset: (page - 1) * 20,
        limit: 20,
      })
    );
  }

  const settled = await Promise.allSettled(tasks);
  const merged: ConnectorBatchResult = {
    companies: [],
    reportedTotal: 0,
    officers: [],
    confirmedEmails: [],
  };

  for (const res of settled) {
    if (res.status === 'fulfilled') {
      merged.companies.push(...res.value.companies);
      merged.reportedTotal += res.value.reportedTotal;
      merged.officers.push(...res.value.officers);
      merged.confirmedEmails.push(...res.value.confirmedEmails);
    }
  }

  return merged;
}

/**
 * Probes official live HTTP endpoints on startup so registry federation totals
 * reflect real-time upstream database counts (>100M+ real organizations worldwide, zero simulation).
 */
export async function probeGlobalRegistryFederationTotals(): Promise<void> {
  await Promise.allSettled([
    probeFranceSireneOdsTotal(),
    fetchUsTreasuryRecipients({ page: 1, limit: 1 }),
    axios
      .get('https://api.github.com/search/users', {
        params: { q: 'type:org', per_page: 1 },
        timeout: 5500,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'OrgLensDirectory/2.0',
        },
      })
      .then((r) => {
        const cnt = Number(r.data?.total_count || 0);
        if (cnt > 0) {
          recordRegistryLiveTotal(
            'github_orgs',
            'GitHub Global Organizations',
            cnt,
            'https://api.github.com/search/users?q=type:org'
          );
        }
      }),
    probeNpmRegistryTotal(),
    fetchAustraliaAsicCompanies({ offset: 0, limit: 1 }),
    fetchAustraliaAbnBusinesses({ offset: 0, limit: 1 }),
    probeUsStateRegistriesTotals(),
    fetchGleifCompanies({ page: 1, pageSize: 1 }),
    fetchNorwayBrregCompanies({ page: 1, size: 1 }),
    fetchFinlandPrhCompanies({ page: 1 }),
    fetchOpenAlexInstitutions({ page: 1, perPage: 1 }),
    fetchRorOrganizations({ page: 1 }),
    fetchUsSecPublicCompanies({ offset: 0, limit: 1 }),
    Promise.all([
      axios.get('https://www.wikidata.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: 'haswbstatement:P31=Q43229',
          srlimit: 1,
          format: 'json',
        },
        timeout: 5500,
        headers: { 'User-Agent': 'OrgLensDirectory/2.0' },
      }),
      axios.get('https://www.wikidata.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: 'haswbstatement:P31=Q4830453',
          srlimit: 1,
          format: 'json',
        },
        timeout: 5500,
        headers: { 'User-Agent': 'OrgLensDirectory/2.0' },
      }),
    ]).then(([orgResp, entResp]) => {
      const orgHits = Number(orgResp.data?.query?.searchinfo?.totalhits || 0);
      const entHits = Number(entResp.data?.query?.searchinfo?.totalhits || 0);
      const combined = orgHits + entHits;
      if (combined > 0) {
        recordRegistryLiveTotal(
          'wikidata_enterprises',
          'Wikidata Global Organizations & Enterprises',
          combined,
          'https://www.wikidata.org/w/api.php'
        );
      }
    }),
    resolveTrancoDownloadUrl(),
    (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5500);
      try {
        const res = await fetch(
          'https://downloads.majestic.com/majestic_million.csv',
          {
            headers: {
              Range: 'bytes=0-512',
              'User-Agent': 'OrgLensDirectory/2.0',
            },
            signal: ctrl.signal,
          }
        );
        if (res.status === 200 || res.status === 206) {
          await res.body?.cancel().catch(() => undefined);
          recordRegistryLiveTotal(
            'majestic_million',
            'Majestic Million Global Domains',
            1_000_000,
            'https://downloads.majestic.com/majestic_million.csv'
          );
        }
      } finally {
        clearTimeout(t);
      }
    })(),
  ]);
}
