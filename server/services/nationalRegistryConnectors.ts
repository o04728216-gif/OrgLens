import axios from 'axios';
import type { GlobalCompanyItem } from '../../src/types.ts';
import { estimateCompanyRevenueRange } from '../../src/utils/geographyAndRevenue.ts';
import {
  recordRegistryLiveTotal,
  type OfficerRecordInput,
} from '../store/companyVaultDb.ts';
import type { ConfirmedEmailHit } from '../types.ts';
import {
  cleanWhitespace,
  extractDomainCore,
  humanizeSlug,
  isValidDomain,
  looksLikePersonName,
  normalizeDomain,
  slugifyName,
} from '../utils/textAndDomain.ts';

export interface NationalBatchResult {
  companies: GlobalCompanyItem[];
  reportedTotal: number;
  officers: OfficerRecordInput[];
  confirmedEmails: Array<{
    domain: string;
    companyName: string;
    hit: ConfirmedEmailHit;
  }>;
}

const INFRA_HOST_DENYLIST = new Set([
  'github.com',
  'github.io',
  'gitlab.com',
  'gitlab.io',
  'npmjs.com',
  'npmjs.org',
  'bitbucket.org',
  'vercel.app',
  'netlify.app',
  'herokuapp.com',
  'pages.dev',
  'workers.dev',
  'js.org',
  'readthedocs.io',
  'google.com',
  'microsoft.com',
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'protonmail.com',
  'proton.me',
  'icloud.com',
  'users.noreply.github.com',
]);

function isCorporateCustomDomain(rawUrlOrDomain: string): string | undefined {
  const dom = normalizeDomain(rawUrlOrDomain);
  if (!dom || !isValidDomain(dom)) return undefined;
  if (INFRA_HOST_DENYLIST.has(dom)) return undefined;
  for (const blocked of INFRA_HOST_DENYLIST) {
    if (dom.endsWith(`.${blocked}`)) return undefined;
  }
  const core = extractDomainCore(dom);
  if (!core || core.length < 2 || /^\d+$/.test(core)) return undefined;
  return dom;
}

function toTitleCaseCorporate(raw: string): string {
  const cleaned = cleanWhitespace(raw);
  if (!cleaned) return '';
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 4) {
    return cleaned
      .toLowerCase()
      .replace(/(?:^|[\s'&/-])\S/g, (ch) => ch.toUpperCase())
      .replace(/\b(Llc|Inc|Corp|Ltd|Plc|Pty|Llp|Pc|Pllc|Sa|Sas|Sarl)\b/g, (m) =>
        m.toUpperCase()
      );
  }
  return cleaned;
}

/**
 * 1. France INSEE SIRENE V3 Full National Establishment & Enterprise Register (~44.28M records via OpenDataSoft)
 */
export async function probeFranceSireneOdsTotal(): Promise<void> {
  try {
    const resp = await axios.get(
      'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/records',
      {
        params: { limit: 1 },
        timeout: 6000,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );
    const total = Number(resp.data?.total_count || 0);
    if (total > 0) {
      recordRegistryLiveTotal(
        'france_sirene',
        'France INSEE SIRENE V3 National Register',
        total,
        'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/records'
      );
    }
  } catch {
    // Non-fatal
  }
}

export async function fetchFranceSireneOdsCompanies(options: {
  offset?: number;
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const offset = Math.max(0, Math.min(9800, options.offset || 0));
  const limit = Math.max(1, Math.min(80, options.limit || 50));
  const whereClauses = [
    "etatadministratifetablissement='Actif'",
    'denominationunitelegale is not null',
  ];
  if (options.query && options.query.trim().length >= 2) {
    const safeQ = options.query.trim().replace(/"/g, '');
    whereClauses.push(`search(denominationunitelegale, "${safeQ}")`);
  }

  try {
    const resp = await axios.get(
      'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/records',
      {
        params: {
          where: whereClauses.join(' and '),
          limit,
          offset,
        },
        timeout: options.timeoutMs || 5500,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );

    const results: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.results
    )
      ? resp.data.results
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const row of results) {
      const siren = String(row.siren || '');
      const siret = String(row.siret || siren);
      const rawName = String(row.denominationunitelegale || '');
      const name = toTitleCaseCorporate(rawName);
      if (!name || name.length < 2) continue;

      const city = toTitleCaseCorporate(
        String(row.libellecommuneetablissement || '')
      );
      const location = city ? `${city}, France` : 'France';
      const section = cleanWhitespace(String(row.sectionetablissement || ''));
      const industry = section || 'European Commercial & Industrial Enterprise';
      const tranche = Number(row.trancheeffectifsetablissementtriable || 0);
      const employeeRange =
        tranche >= 12
          ? '1,001 - 5,000'
          : tranche >= 8
          ? '201 - 500'
          : tranche >= 4
          ? '51 - 200'
          : '1 - 50';
      const slug = `${slugifyName(name)}-${siret.slice(-5)}`;

      companies.push({
        id: `sirene-v3-${siret}`,
        slug,
        name,
        logoUrl: null,
        location,
        industry,
        employeeRange,
        revenueRange: estimateCompanyRevenueRange(employeeRange, name),
        sourceCountrySlug: 'france',
        sourceRegistry: 'France SIRENE Registry',
      });
    }

    return {
      companies,
      reportedTotal: Number(resp.data?.total_count || 0),
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 2. US Treasury USAspending Registered Corporate & Institutional Recipients (~18.32M DUNS/UEI entities)
 */
export async function fetchUsTreasuryRecipients(options: {
  page?: number;
  limit?: number;
  keyword?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const page = Math.max(1, Math.min(2000, options.page || 1));
  const limit = Math.max(1, Math.min(80, options.limit || 50));
  const body: Record<string, unknown> = {
    order: 'desc',
    sort: 'amount',
    page,
    limit,
  };
  if (options.keyword && options.keyword.trim().length >= 2) {
    body.keyword = options.keyword.trim();
  }

  try {
    const resp = await axios.post(
      'https://api.usaspending.gov/api/v2/recipient/',
      body,
      {
        timeout: options.timeoutMs || 5800,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        validateStatus: (s) => s === 200,
      }
    );

    const total = Number(resp.data?.page_metadata?.total || 0);
    if (!options.keyword && total > 0) {
      recordRegistryLiveTotal(
        'us_treasury_recipients',
        'US Treasury DUNS & UEI Corporate Registry',
        total,
        'https://api.usaspending.gov/api/v2/recipient/'
      );
    }

    const rows: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.results
    )
      ? resp.data.results
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const r of rows) {
      const rawName = String(r.name || '');
      const name = toTitleCaseCorporate(rawName);
      if (!name || name.length < 2) continue;
      const uei = String(r.uei || r.duns || r.id || '').trim();
      const amount = Number(r.amount || 0);
      const employeeRange =
        amount >= 500_000_000
          ? '5,001 - 10,000'
          : amount >= 50_000_000
          ? '1,001 - 5,000'
          : amount >= 5_000_000
          ? '201 - 500'
          : '51 - 200';
      const slug = `${slugifyName(name)}-${uei
        .replace(/[^a-z0-9]/gi, '')
        .slice(-5)
        .toLowerCase()}`;

      companies.push({
        id: `uei-${uei || slug}`,
        slug,
        name,
        logoUrl: null,
        location: 'United States',
        industry: 'Enterprise Contracting, Defense & Commercial Services',
        employeeRange,
        revenueRange: estimateCompanyRevenueRange(employeeRange, name),
        sourceCountrySlug: 'united-states',
        sourceRegistry: 'US Treasury DUNS/UEI Registry',
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
 * 3. Australia ASIC Official National Company Register (~4.46M ACN/ABN Corporations)
 */
export async function fetchAustraliaAsicCompanies(options: {
  offset?: number;
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const offset = Math.max(0, options.offset || 0);
  const limit = Math.max(1, Math.min(80, options.limit || 60));
  const params: Record<string, string | number> = {
    resource_id: '5c3914e6-413e-4a2c-b890-bf8efe3eabf2',
    limit,
    offset,
  };
  if (options.query && options.query.trim().length >= 2) {
    params.q = options.query.trim();
  }

  try {
    const resp = await axios.get(
      'https://data.gov.au/data/api/3/action/datastore_search',
      {
        params,
        timeout: options.timeoutMs || 5800,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );

    const total = Number(resp.data?.result?.total || 0);
    if (!options.query && total > 0) {
      recordRegistryLiveTotal(
        'australia_asic_companies',
        'Australia ASIC National Company Register',
        total,
        'https://data.gov.au/data/api/3/action/datastore_search?resource_id=5c3914e6-413e-4a2c-b890-bf8efe3eabf2'
      );
    }

    const records: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.result?.records
    )
      ? resp.data.result.records
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const rec of records) {
      const status = String(rec.Status || '').toUpperCase();
      if (status && status !== 'REGD') continue;
      const rawName = String(
        rec['Current Name'] || rec['Company Name'] || ''
      ).trim();
      const name = toTitleCaseCorporate(rawName);
      if (!name || name.length < 2) continue;

      const acn = String(rec.ACN || rec.ABN || rec._id || '').trim();
      const state = cleanWhitespace(
        String(rec['Previous State of Registration'] || '')
      );
      const location = state ? `${state}, Australia` : 'Australia';
      const empRange = '51 - 200';
      const slug = `${slugifyName(name)}-${acn.slice(-5)}`;

      companies.push({
        id: `asic-${acn}`,
        slug,
        name,
        logoUrl: null,
        location,
        industry: 'Asia-Pacific Corporate & Commercial Enterprise',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'australia',
        sourceRegistry: 'Australia ASIC Register',
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
 * 4. Australia Official ABN Business Names Register (~3.32M Registered Australian Businesses)
 */
export async function fetchAustraliaAbnBusinesses(options: {
  offset?: number;
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const offset = Math.max(0, options.offset || 0);
  const limit = Math.max(1, Math.min(80, options.limit || 60));
  const params: Record<string, string | number> = {
    resource_id: '55ad4b1c-5eeb-44ea-8b29-d410da431be3',
    limit,
    offset,
  };
  if (options.query && options.query.trim().length >= 2) {
    params.q = options.query.trim();
  }

  try {
    const resp = await axios.get(
      'https://data.gov.au/data/api/3/action/datastore_search',
      {
        params,
        timeout: options.timeoutMs || 5800,
        headers: { Accept: 'application/json' },
        validateStatus: (s) => s === 200,
      }
    );

    const total = Number(resp.data?.result?.total || 0);
    if (!options.query && total > 0) {
      recordRegistryLiveTotal(
        'australia_abn_businesses',
        'Australia ABN Business Names Register',
        total,
        'https://data.gov.au/data/api/3/action/datastore_search?resource_id=55ad4b1c-5eeb-44ea-8b29-d410da431be3'
      );
    }

    const records: Array<Record<string, unknown>> = Array.isArray(
      resp.data?.result?.records
    )
      ? resp.data.result.records
      : [];

    const companies: GlobalCompanyItem[] = [];
    for (const rec of records) {
      if (String(rec.BN_STATUS || '') !== 'Registered') continue;
      const name = toTitleCaseCorporate(String(rec.BN_NAME || ''));
      if (!name || name.length < 2) continue;

      const abn = String(rec.BN_ABN || rec._id || '').trim();
      const state = cleanWhitespace(String(rec.BN_STATE_OF_REG || ''));
      const location = state ? `${state}, Australia` : 'Australia';
      const empRange = '1 - 50';
      const slug = `${slugifyName(name)}-${abn.slice(-5)}`;

      companies.push({
        id: `abn-${abn}`,
        slug,
        name,
        logoUrl: null,
        location,
        industry: 'Australian Commercial & Retail Services',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'australia',
        sourceRegistry: 'Australia ABN Register',
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
 * 5. New York Department of State Active Corporations (~4.32M Registered NY Corporations)
 */
export async function probeUsStateRegistriesTotals(): Promise<void> {
  await Promise.allSettled([
    axios
      .get('https://data.ny.gov/resource/n9v6-gdp6.json?$select=count(*)', {
        timeout: 6500,
      })
      .then((r) => {
        const cnt = Number(r.data?.[0]?.count || 0);
        if (cnt > 0) {
          recordRegistryLiveTotal(
            'us_ny_dos_corps',
            'New York Dept. of State Active Corporations',
            cnt,
            'https://data.ny.gov/resource/n9v6-gdp6.json'
          );
        }
      }),
    axios
      .get(
        'https://data.colorado.gov/resource/4ykn-tg5h.json?$select=count(*)',
        { timeout: 6500 }
      )
      .then((r) => {
        const cnt = Number(r.data?.[0]?.count || 0);
        if (cnt > 0) {
          recordRegistryLiveTotal(
            'us_colorado_sos',
            'Colorado Secretary of State Business Entities',
            cnt,
            'https://data.colorado.gov/resource/4ykn-tg5h.json'
          );
        }
      }),
    axios
      .get('https://data.oregon.gov/resource/tckn-sxa6.json?$select=count(*)', {
        timeout: 6500,
      })
      .then((r) => {
        const cnt = Number(r.data?.[0]?.count || 0);
        if (cnt > 0) {
          recordRegistryLiveTotal(
            'us_oregon_sos',
            'Oregon Secretary of State Active Businesses',
            cnt,
            'https://data.oregon.gov/resource/tckn-sxa6.json'
          );
        }
      }),
  ]);
}

export async function fetchNewYorkCorporations(options: {
  offset?: number;
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const offset = Math.max(0, options.offset || 0);
  const limit = Math.max(1, Math.min(80, options.limit || 50));
  const where = options.query
    ? `current_entity_name IS NOT NULL AND upper(current_entity_name) like '%${options.query
        .trim()
        .toUpperCase()
        .replace(/'/g, "''")}%'`
    : 'current_entity_name IS NOT NULL';

  try {
    const resp = await axios.get('https://data.ny.gov/resource/n9v6-gdp6.json', {
      params: { $where: where, $limit: limit, $offset: offset },
      timeout: options.timeoutMs || 5500,
      validateStatus: (s) => s === 200,
    });

    const rows: Array<Record<string, unknown>> = Array.isArray(resp.data)
      ? resp.data
      : [];
    const companies: GlobalCompanyItem[] = [];
    const officers: OfficerRecordInput[] = [];

    for (const r of rows) {
      const name = toTitleCaseCorporate(String(r.current_entity_name || ''));
      if (!name || name.length < 2) continue;
      const dosId = String(r.dos_id || '').trim();
      const city = toTitleCaseCorporate(
        String(r.dos_process_city || r.county || '')
      );
      const location = city
        ? `${city}, NY, United States`
        : 'New York, United States';
      const empRange = '51 - 200';
      const slug = `${slugifyName(name)}-ny${dosId.slice(-5)}`;

      companies.push({
        id: `ny-dos-${dosId}`,
        slug,
        name,
        logoUrl: null,
        location,
        industry: 'Corporate, Financial & Commercial Enterprise',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'united-states',
        sourceRegistry: 'NY Dept of State Registry',
      });

      const ceoName = toTitleCaseCorporate(String(r.ceo_name || ''));
      if (ceoName && looksLikePersonName(ceoName)) {
        officers.push({
          companySlug: slug,
          fullName: ceoName,
          jobTitle: 'Chief Executive Officer',
          sourceRegistry: 'NY Dept of State Registry',
        });
      }
    }

    return {
      companies,
      reportedTotal: companies.length,
      officers,
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 6. Colorado Secretary of State Business Entities (~3.14M Business Entities)
 */
export async function fetchColoradoBusinessEntities(options: {
  offset?: number;
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const offset = Math.max(0, options.offset || 0);
  const limit = Math.max(1, Math.min(80, options.limit || 50));
  const where = options.query
    ? `entitystatus='Good Standing' AND upper(entityname) like '%${options.query
        .trim()
        .toUpperCase()
        .replace(/'/g, "''")}%'`
    : "entitystatus='Good Standing'";

  try {
    const resp = await axios.get(
      'https://data.colorado.gov/resource/4ykn-tg5h.json',
      {
        params: { $where: where, $limit: limit, $offset: offset },
        timeout: options.timeoutMs || 5500,
        validateStatus: (s) => s === 200,
      }
    );

    const rows: Array<Record<string, unknown>> = Array.isArray(resp.data)
      ? resp.data
      : [];
    const companies: GlobalCompanyItem[] = [];

    for (const r of rows) {
      const name = toTitleCaseCorporate(String(r.entityname || ''));
      if (!name || name.length < 2) continue;
      const entId = String(r.entityid || '').trim();
      const city = toTitleCaseCorporate(String(r.principalcity || ''));
      const location = city
        ? `${city}, CO, United States`
        : 'Colorado, United States';
      const empRange = '1 - 50';
      const slug = `${slugifyName(name)}-co${entId.slice(-5)}`;

      companies.push({
        id: `co-sos-${entId}`,
        slug,
        name,
        logoUrl: null,
        location,
        industry: 'US Commercial & Professional Enterprise',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'united-states',
        sourceRegistry: 'Colorado SOS Registry',
      });
    }

    return {
      companies,
      reportedTotal: companies.length,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 7. Oregon Secretary of State Active Businesses (~1.59M Active Businesses + Registered Principals)
 */
export async function fetchOregonActiveBusinesses(options: {
  offset?: number;
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const offset = Math.max(0, options.offset || 0);
  const limit = Math.max(1, Math.min(80, options.limit || 50));
  const params: Record<string, string | number> = {
    $limit: limit,
    $offset: offset,
  };
  if (options.query && options.query.trim().length >= 2) {
    params.$where = `upper(business_name) like '%${options.query
      .trim()
      .toUpperCase()
      .replace(/'/g, "''")}%'`;
  }

  try {
    const resp = await axios.get(
      'https://data.oregon.gov/resource/tckn-sxa6.json',
      {
        params,
        timeout: options.timeoutMs || 5500,
        validateStatus: (s) => s === 200,
      }
    );

    const rows: Array<Record<string, unknown>> = Array.isArray(resp.data)
      ? resp.data
      : [];
    const companies: GlobalCompanyItem[] = [];
    const officers: OfficerRecordInput[] = [];

    for (const r of rows) {
      const name = toTitleCaseCorporate(String(r.business_name || ''));
      if (!name || name.length < 2) continue;
      const regNo = String(r.registry_number || '').trim();
      const city = toTitleCaseCorporate(String(r.city || ''));
      const location = city
        ? `${city}, OR, United States`
        : 'Oregon, United States';
      const empRange = '1 - 50';
      const slug = `${slugifyName(name)}-or${regNo.slice(-5)}`;

      companies.push({
        id: `or-sos-${regNo}`,
        slug,
        name,
        logoUrl: null,
        location,
        industry: 'North American Commercial Business',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'united-states',
        sourceRegistry: 'Oregon SOS Registry',
      });

      const first = toTitleCaseCorporate(String(r.first_name || ''));
      const last = toTitleCaseCorporate(String(r.last_name || ''));
      const fullName = cleanWhitespace(`${first} ${last}`);
      if (first && last && looksLikePersonName(fullName)) {
        const roleRaw = toTitleCaseCorporate(
          String(r.associated_name_type || 'Principal Officer')
        );
        officers.push({
          companySlug: slug,
          fullName,
          jobTitle: roleRaw || 'Principal Officer',
          sourceRegistry: 'Oregon SOS Registry',
        });
      }
    }

    return {
      companies,
      reportedTotal: companies.length,
      officers,
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 8. NPM Global Software Publishers & Organizations (~4.62M Published Packages + Confirmed Corporate Emails)
 */
const NPM_ENTERPRISE_TOPICS = [
  'sdk',
  'cloud',
  'enterprise',
  'payments',
  'fintech',
  'security',
  'analytics',
  'platform',
  'commerce',
  'ai',
  'database',
  'observability',
  'auth',
  'banking',
  'healthcare',
  'robotics',
  'logistics',
  'devtools',
];

export async function probeNpmRegistryTotal(): Promise<void> {
  try {
    const resp = await axios.get('https://replicate.npmjs.com/', {
      timeout: 5500,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s === 200,
    });
    const docCount = Number(resp.data?.doc_count || 0);
    if (docCount > 0) {
      recordRegistryLiveTotal(
        'npm_global_publishers',
        'NPM Global Software Publishers & Orgs',
        docCount,
        'https://registry.npmjs.org'
      );
    }
  } catch {
    // Non-fatal
  }
}

export async function fetchNpmCorporatePublishers(options: {
  topicIdx?: number;
  from?: number;
  size?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<NationalBatchResult> {
  const topic =
    options.query ||
    NPM_ENTERPRISE_TOPICS[
      Math.max(0, options.topicIdx || 0) % NPM_ENTERPRISE_TOPICS.length
    ];
  const from = Math.max(0, Math.min(2500, options.from || 0));
  const size = Math.max(1, Math.min(60, options.size || 45));

  try {
    const resp = await axios.get('https://registry.npmjs.org/-/v1/search', {
      params: { text: topic, from, size },
      timeout: options.timeoutMs || 5200,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s === 200,
    });

    const objects: Array<{
      package?: {
        name?: string;
        links?: { homepage?: string; npm?: string };
        publisher?: { username?: string; email?: string };
        maintainers?: Array<{ username?: string; email?: string }>;
      };
    }> = Array.isArray(resp.data?.objects) ? resp.data.objects : [];

    const companies: GlobalCompanyItem[] = [];
    const confirmedEmails: NationalBatchResult['confirmedEmails'] = [];
    const seenDomains = new Set<string>();

    for (const obj of objects) {
      const pkg = obj.package;
      if (!pkg) continue;

      const homepageDom = pkg.links?.homepage
        ? isCorporateCustomDomain(pkg.links.homepage)
        : undefined;

      const people = [
        ...(pkg.publisher ? [pkg.publisher] : []),
        ...(Array.isArray(pkg.maintainers) ? pkg.maintainers : []),
      ];

      let resolvedDomain = homepageDom;
      if (!resolvedDomain) {
        for (const p of people) {
          const email = String(p?.email || '').trim().toLowerCase();
          const emailDom = email.includes('@')
            ? isCorporateCustomDomain(email.split('@')[1] || '')
            : undefined;
          if (emailDom) {
            resolvedDomain = emailDom;
            break;
          }
        }
      }

      if (!resolvedDomain || seenDomains.has(resolvedDomain)) continue;
      seenDomains.add(resolvedDomain);

      const core = extractDomainCore(resolvedDomain);
      const companyName = humanizeSlug(core);
      if (!companyName || companyName.length < 2) continue;
      const slug = slugifyName(core) || resolvedDomain.replace(/\./g, '-');
      const empRange = '51 - 200';

      companies.push({
        id: `npm-${resolvedDomain}`,
        slug,
        name: companyName,
        domain: resolvedDomain,
        websiteUrl: `https://${resolvedDomain}`,
        logoUrl: null,
        location: 'Global',
        industry: 'Software Engineering & Cloud Infrastructure',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, companyName),
        sourceRegistry: 'NPM Global Publishers',
      });

      for (const p of people) {
        const email = String(p?.email || '').trim().toLowerCase();
        if (!email.endsWith(`@${resolvedDomain}`)) continue;
        const local = email.split('@')[0] || '';
        const dotMatch = local.match(/^([a-z]{2,15})[._-]([a-z]{2,18})$/);
        const candidateName = dotMatch
          ? `${dotMatch[1].charAt(0).toUpperCase() + dotMatch[1].slice(1)} ${
              dotMatch[2].charAt(0).toUpperCase() + dotMatch[2].slice(1)
            }`
          : p?.username && looksLikePersonName(humanizeSlug(p.username))
          ? humanizeSlug(p.username)
          : '';
        if (candidateName && looksLikePersonName(candidateName)) {
          confirmedEmails.push({
            domain: resolvedDomain,
            companyName,
            hit: {
              email,
              fullName: candidateName,
              jobTitle: 'Software Engineer & Maintainer',
              emailSource: 'NPM Registry',
              sourceUrl:
                pkg.links?.npm ||
                `https://www.npmjs.com/package/${encodeURIComponent(
                  pkg.name || core
                )}`,
            },
          });
        }
      }
    }

    return {
      companies,
      reportedTotal: Number(resp.data?.total || 0),
      officers: [],
      confirmedEmails,
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}

/**
 * 9. US SEC EDGAR Publicly Traded Companies (~10,400 US Exchange-Listed Corporations)
 */
let secTickersCache: {
  entries: Array<{ cik_str: number; ticker: string; title: string }>;
  expiresAt: number;
} | null = null;

export async function fetchUsSecPublicCompanies(options: {
  offset?: number;
  limit?: number;
  query?: string;
}): Promise<NationalBatchResult> {
  try {
    if (!secTickersCache || secTickersCache.expiresAt <= Date.now()) {
      const resp = await axios.get(
        'https://www.sec.gov/files/company_tickers.json',
        {
          timeout: 6000,
          headers: {
            'User-Agent': 'OrgLensDirectory/2.0 (directory@orglens.io)',
            Accept: 'application/json',
          },
          validateStatus: (s) => s === 200,
        }
      );
      const rawObj = (resp.data || {}) as Record<
        string,
        { cik_str: number; ticker: string; title: string }
      >;
      const entries = Object.values(rawObj).filter(
        (e) => e && typeof e.title === 'string'
      );
      secTickersCache = {
        entries,
        expiresAt: Date.now() + 1000 * 60 * 60 * 6,
      };
      if (entries.length > 0) {
        recordRegistryLiveTotal(
          'us_sec_edgar',
          'US SEC EDGAR Public Corporations',
          entries.length,
          'https://www.sec.gov/files/company_tickers.json'
        );
      }
    }

    const q = (options.query || '').trim().toLowerCase();
    const filtered = q
      ? secTickersCache.entries.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.ticker.toLowerCase().includes(q)
        )
      : secTickersCache.entries;

    const offset = Math.max(0, options.offset || 0);
    const limit = Math.max(1, Math.min(100, options.limit || 60));
    const slice = filtered.slice(offset, offset + limit);

    const companies: GlobalCompanyItem[] = slice.map((e) => {
      const name = toTitleCaseCorporate(e.title);
      const empRange = '1,001 - 5,000';
      return {
        id: `sec-cik-${e.cik_str}`,
        slug: `${slugifyName(name)}-${String(e.ticker || e.cik_str).toLowerCase()}`,
        name,
        logoUrl: null,
        location: 'United States',
        industry: 'Publicly Listed Corporation (SEC EDGAR)',
        employeeRange: empRange,
        revenueRange: estimateCompanyRevenueRange(empRange, name),
        sourceCountrySlug: 'united-states',
        sourceRegistry: 'US SEC EDGAR Registry',
      };
    });

    return {
      companies,
      reportedTotal: filtered.length,
      officers: [],
      confirmedEmails: [],
    };
  } catch {
    return { companies: [], reportedTotal: 0, officers: [], confirmedEmails: [] };
  }
}
