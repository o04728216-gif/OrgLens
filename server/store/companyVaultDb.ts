import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ConfirmedEmailSource,
  CrawlerStreamCursor,
  CrawlerVaultStats,
  GlobalCompanyItem,
  GlobalIndustryOption,
  RegistryFederationItem,
} from '../../src/types.ts';
import { expandFullIndustryTitle } from '../../src/utils/emailFormulas.ts';
import {
  CONTINENTS_CATALOG,
  inferCountrySlugFromLocation,
} from '../../src/utils/geographyAndRevenue.ts';
import type { ConfirmedEmailHit } from '../types.ts';
import {
  isValidDomain,
  normalizeDomain,
  slugifyName,
} from '../utils/textAndDomain.ts';
import { resolveVaultDataDir } from './persistentDataDir.ts';

const DATA_DIR = resolveVaultDataDir();
export const SQLITE_VAULT_PATH = path.join(
  DATA_DIR,
  'worldwide-companies.sqlite'
);

let dbInstance: DatabaseSync | null = null;

function isSuspectDomainQuickCheck(
  domain: string,
  slug: string,
  sourceRegistry: string
): boolean {
  if (!domain || !isValidDomain(domain)) return true;
  if (
    /-(inc|incorporated|llc|ltd|limited|corp|corporation|plc|gmbh|sarl|sas|oyj|pty|holdings-llc|motor-company)\.com$/i.test(
      domain
    )
  ) {
    return true;
  }
  if (
    /(porn|pornhub|pussy|xvideos|xhamster|chaturbate|onlyfans|hentai|redtube|youporn|brazzers|spankbang|xnxx|livejasmin|stripchat|bongacams|eporner|sexchat|camgirls?)/i.test(
      domain
    ) ||
    /(^|[.-])(xxx|escorts?)([.-]|$)/i.test(domain)
  ) {
    return true;
  }
  if (
    /^(gleif|sirene|sec|nydos|cosos|orsos|asic|abn|brreg|prh|ror|openalex|wd)-/i.test(
      domain
    ) ||
    /-[0-9]{5,}\.com$/i.test(domain)
  ) {
    return true;
  }
  const cleanSlug = slug.trim().toLowerCase();
  if (cleanSlug && domain === `${cleanSlug}.com`) {
    const hyphens = (cleanSlug.match(/-/g) || []).length;
    if (hyphens >= 3) return true;
    if (
      hyphens >= 2 &&
      sourceRegistry !== 'Majestic Million Domains' &&
      sourceRegistry !== 'Tranco Global Domains' &&
      sourceRegistry !== 'Live Domain Discovery'
    ) {
      return true;
    }
  }
  return false;
}

export function isSuspectDomainForIndex(
  domain: string,
  slug: string,
  sourceRegistry: string
): boolean {
  return isSuspectDomainQuickCheck(domain, slug, sourceRegistry);
}

const vaultMutationListeners = new Set<() => void>();

export function registerVaultMutationListener(listener: () => void): void {
  vaultMutationListeners.add(listener);
}

function notifyVaultMutated(): void {
  for (const fn of vaultMutationListeners) {
    try {
      fn();
    } catch {
      // Ignore listener errors
    }
  }
}

function runVaultStartupMaintenance(db: DatabaseSync): void {
  try {
    // Non-destructive v3 HQ-country accuracy repair: fixes rows where an explicit HQ location
    // (e.g. "Pittsburgh, PA, United States") was tagged with a conflicting directory country_slug (e.g. "canada")
    const v3Done = db
      .prepare(`SELECT value FROM vault_meta WHERE key = 'maintenance_v3_geo_fix'`)
      .get() as { value: string } | undefined;
    if (v3Done?.value !== '1') {
      db.exec(`
        UPDATE companies
        SET country_slug = 'united-states'
        WHERE (country_slug IS NULL OR country_slug != 'united-states')
          AND (
            location_lower LIKE '%united states%' OR
            location_lower LIKE '%, usa' OR
            location_lower LIKE '%, u.s.a.' OR
            location_lower LIKE '%, u.s.'
          );

        UPDATE companies
        SET country_slug = 'canada'
        WHERE (country_slug IS NULL OR country_slug != 'canada')
          AND location_lower LIKE '%canada%'
          AND location_lower NOT LIKE '%united states%';

        UPDATE companies
        SET country_slug = 'united-kingdom'
        WHERE (country_slug IS NULL OR country_slug != 'united-kingdom')
          AND (location_lower LIKE '%united kingdom%' OR location_lower LIKE '%, england%' OR location_lower LIKE '%, uk');

        UPDATE companies
        SET country_slug = 'germany'
        WHERE (country_slug IS NULL OR country_slug != 'germany')
          AND location_lower LIKE '%germany%';

        UPDATE companies
        SET country_slug = 'france'
        WHERE (country_slug IS NULL OR country_slug != 'france')
          AND location_lower LIKE '%france%';

        UPDATE companies
        SET country_slug = 'australia'
        WHERE (country_slug IS NULL OR country_slug != 'australia')
          AND location_lower LIKE '%australia%';

        UPDATE companies
        SET country_slug = 'india'
        WHERE (country_slug IS NULL OR country_slug != 'india')
          AND location_lower LIKE '%, india%';
      `);
      db.prepare(
        `INSERT INTO vault_meta (key, value) VALUES ('maintenance_v3_geo_fix', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`
      ).run();
    }

    const doneRow = db
      .prepare(`SELECT value FROM vault_meta WHERE key = 'maintenance_v2_done'`)
      .get() as { value: string } | undefined;
    if (doneRow?.value === '1') {
      return;
    }

    // 1. Clean out any legacy slug-synthesized fake .com domains (runs once)
    db.exec(`
      UPDATE companies
      SET domain = NULL, website_url = NULL
      WHERE domain IS NOT NULL AND (
        domain LIKE '%-inc.com' OR
        domain LIKE '%-incorporated.com' OR
        domain LIKE '%-llc.com' OR
        domain LIKE '%-ltd.com' OR
        domain LIKE '%-limited.com' OR
        domain LIKE '%-corp.com' OR
        domain LIKE '%-corporation.com' OR
        domain LIKE '%-plc.com' OR
        domain LIKE '%-gmbh.com' OR
        domain LIKE '%-sarl.com' OR
        domain LIKE '%-sas.com' OR
        domain LIKE '%-motor-company.com' OR
        domain LIKE 'gleif-%' OR
        domain LIKE 'sirene-%' OR
        domain LIKE 'nydos-%' OR
        domain LIKE 'cosos-%' OR
        domain LIKE 'orsos-%'
      );
    `);

    // 2. Fast SQL backfill for country_slug where missing on obvious country strings & US registries
    db.exec(`
      UPDATE companies
      SET country_slug = 'united-states'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%united states%' OR
        location_lower LIKE '%, usa' OR
        location_lower LIKE '%, us' OR
        source_registry IN (
          'US Treasury DUNS/UEI Registry',
          'US SEC EDGAR Registry',
          'NY Dept of State Registry',
          'Colorado SOS Registry',
          'Oregon SOS Registry'
        )
      );

      UPDATE companies
      SET country_slug = 'france'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%france%' OR
        source_registry = 'France SIRENE Registry'
      );

      UPDATE companies
      SET country_slug = 'australia'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%australia%' OR
        source_registry IN ('Australia ASIC Register', 'Australia ABN Register')
      );

      UPDATE companies
      SET country_slug = 'norway'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%norway%' OR
        source_registry = 'Norway Brreg Register'
      );

      UPDATE companies
      SET country_slug = 'finland'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%finland%' OR
        source_registry = 'Finland PRH Register'
      );

      UPDATE companies
      SET country_slug = 'united-kingdom'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%united kingdom%' OR
        location_lower LIKE '%england%' OR
        location_lower LIKE '%london%' OR
        domain LIKE '%.co.uk' OR
        domain LIKE '%.org.uk'
      );

      UPDATE companies
      SET country_slug = 'canada'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%canada%' OR
        domain LIKE '%.ca'
      );

      UPDATE companies
      SET country_slug = 'germany'
      WHERE country_slug IS NULL AND (
        location_lower LIKE '%germany%' OR
        domain LIKE '%.de'
      );
    `);

    // 3. Backfill remaining NULL country_slug rows with non-Global location or ccTLD (bounded batch)
    const remaining = db
      .prepare(
        `SELECT slug, location, domain
         FROM companies
         WHERE country_slug IS NULL
           AND ((location != 'Global' AND location != '') OR domain IS NOT NULL)
         LIMIT 15000`
      )
      .all() as Array<{ slug: string; location: string; domain: string | null }>;

    if (remaining.length > 0) {
      const upd = db.prepare(
        `UPDATE companies SET country_slug = ? WHERE slug = ?`
      );
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const r of remaining) {
          const inferred = inferCountrySlugFromLocation(r.location, r.domain);
          if (inferred) {
            upd.run(inferred, r.slug);
          }
        }
        db.exec('COMMIT');
      } catch {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Ignore
        }
      }
    }

    db.prepare(
      `INSERT INTO vault_meta (key, value) VALUES ('maintenance_v2_done', '1')
       ON CONFLICT(key) DO UPDATE SET value = '1'`
    ).run();
  } catch {
    // Non-fatal startup maintenance
  }
}

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new DatabaseSync(SQLITE_VAULT_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA wal_autocheckpoint = 1000;
    PRAGMA journal_size_limit = 67108864;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS companies (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_lower TEXT NOT NULL,
      domain TEXT,
      website_url TEXT,
      logo_url TEXT,
      location TEXT NOT NULL DEFAULT 'Global',
      location_lower TEXT NOT NULL DEFAULT 'global',
      country_slug TEXT,
      industry TEXT NOT NULL DEFAULT 'Business Services',
      industry_lower TEXT NOT NULL DEFAULT 'business services',
      employee_range TEXT NOT NULL DEFAULT '51 - 200',
      revenue_range TEXT NOT NULL DEFAULT '$10M - $50M',
      source_registry TEXT NOT NULL DEFAULT 'Public Registry',
      registry_id TEXT,
      confirmed_email_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
    CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(country_slug);
    CREATE INDEX IF NOT EXISTS idx_companies_name_lower ON companies(name_lower);
    CREATE INDEX IF NOT EXISTS idx_companies_emp_range ON companies(employee_range);
    CREATE INDEX IF NOT EXISTS idx_companies_rev_range ON companies(revenue_range);
    CREATE INDEX IF NOT EXISTS idx_companies_registry ON companies(source_registry);
    CREATE INDEX IF NOT EXISTS idx_companies_sort ON companies(confirmed_email_count DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_companies_emp_country ON companies(employee_range, country_slug, confirmed_email_count DESC);
    CREATE INDEX IF NOT EXISTS idx_companies_country_emp_rev ON companies(country_slug, employee_range, revenue_range);
    CREATE INDEX IF NOT EXISTS idx_companies_emp_rev ON companies(employee_range, revenue_range);

    CREATE TABLE IF NOT EXISTS verified_domain_cache (
      lookup_key TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      website_url TEXT NOT NULL,
      resolver_source TEXT NOT NULL DEFAULT 'Verified',
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_verified_domain_cache_dom ON verified_domain_cache(domain);

    CREATE TABLE IF NOT EXISTS confirmed_contacts (
      email TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      full_name TEXT NOT NULL,
      job_title TEXT NOT NULL DEFAULT 'Verified Contact',
      company_name TEXT,
      email_source TEXT NOT NULL,
      source_url TEXT,
      verified_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_confirmed_contacts_domain ON confirmed_contacts(domain);

    CREATE TABLE IF NOT EXISTS company_officers (
      id TEXT PRIMARY KEY,
      company_slug TEXT NOT NULL,
      domain TEXT,
      full_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      source_registry TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_officers_slug ON company_officers(company_slug);
    CREATE INDEX IF NOT EXISTS idx_officers_domain ON company_officers(domain);

    CREATE TABLE IF NOT EXISTS registry_federation (
      registry_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      live_reported_total INTEGER NOT NULL DEFAULT 0,
      endpoint_url TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crawler_cursors (
      stream_key TEXT PRIMARY KEY,
      cursor_value TEXT NOT NULL,
      items_ingested INTEGER NOT NULL DEFAULT 0,
      last_crawled_at TEXT NOT NULL,
      last_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_search_cache (
      domain TEXT PRIMARY KEY,
      company_slug TEXT,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_domain_search_cache_slug ON domain_search_cache(company_slug);

    CREATE TABLE IF NOT EXISTS quick_roster_cache_db (
      slug TEXT PRIMARY KEY,
      domain TEXT,
      roster_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_aggregates_cache (
      cache_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_auth_backup (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  runVaultStartupMaintenance(db);
  dbInstance = db;
  return db;
}

export function getVaultDbForColumnarIndex(): DatabaseSync {
  return getDb();
}

interface SummaryCountsSnapshot {
  vaultCompaniesCount: number;
  realDomainCompaniesCount: number;
  confirmedContactsCount: number;
  confirmedDomainsCount: number;
  liveFederatedCatalogTotal: number;
}

let cachedSummarySnapshot: {
  data: SummaryCountsSnapshot;
  expiresAt: number;
} | null = null;

let cachedVaultIndustries: {
  data: GlobalIndustryOption[];
  expiresAt: number;
} | null = null;

let cachedVaultGroupBreakdowns: {
  byCountry: Map<string, number>;
  byEmployeeRange: Map<string, number>;
  byRevenueRange: Map<string, number>;
  totalRealDomainInVault: number;
  expiresAt: number;
} | null = null;

const vaultQueryRamCache = new Map<
  string,
  {
    companies: GlobalCompanyItem[];
    totalMatchingInVault: number;
    expiresAt: number;
  }
>();

function bumpCachedCompanyCount(delta: number): void {
  if (delta > 0) {
    if (cachedSummarySnapshot) {
      cachedSummarySnapshot.data.vaultCompaniesCount += delta;
      cachedSummarySnapshot.data.liveFederatedCatalogTotal = Math.max(
        cachedSummarySnapshot.data.liveFederatedCatalogTotal,
        cachedSummarySnapshot.data.vaultCompaniesCount
      );
    }
  }
}

export function getVerifiedDomainsFromVaultCache(
  lookupKeys: string[]
): Map<string, { domain: string; websiteUrl: string }> {
  const result = new Map<string, { domain: string; websiteUrl: string }>();
  const cleanKeys = Array.from(
    new Set(lookupKeys.map((k) => k.trim().toLowerCase()).filter(Boolean))
  ).slice(0, 400);
  if (cleanKeys.length === 0) return result;

  try {
    const db = getDb();
    const ph = cleanKeys.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT lookup_key, domain, website_url
         FROM verified_domain_cache
         WHERE lookup_key IN (${ph})`
      )
      .all(...cleanKeys) as Array<{
      lookup_key: string;
      domain: string;
      website_url: string;
    }>;

    for (const r of rows) {
      if (r.domain && isValidDomain(r.domain)) {
        result.set(r.lookup_key, {
          domain: r.domain,
          websiteUrl: r.website_url || `https://${r.domain}`,
        });
      }
    }
  } catch {
    // Non-fatal
  }
  return result;
}

export function saveVerifiedDomainsToVaultCache(
  entries: Array<{
    lookupKey: string;
    domain: string;
    websiteUrl: string;
    resolverSource: string;
  }>
): void {
  if (!entries || entries.length === 0) return;
  try {
    const db = getDb();
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO verified_domain_cache (
        lookup_key, domain, website_url, resolver_source, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lookup_key) DO UPDATE SET
        domain = excluded.domain,
        website_url = excluded.website_url,
        resolver_source = excluded.resolver_source,
        updated_at = excluded.updated_at
    `);
    const updCompany = db.prepare(`
      UPDATE companies
      SET domain = ?, website_url = ?
      WHERE slug = ? AND (domain IS NULL OR domain = '')
    `);

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const e of entries) {
        const key = e.lookupKey.trim().toLowerCase();
        const dom = normalizeDomain(e.domain);
        if (!key || !dom || !isValidDomain(dom)) continue;
        const webUrl = e.websiteUrl || `https://${dom}`;
        stmt.run(key, dom, webUrl, e.resolverSource || 'Verified', now);
        updCompany.run(dom, webUrl, key);
      }
      db.exec('COMMIT');
      if (entries.length > 0) {
        vaultQueryRamCache.clear();
      }
    } catch {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore
      }
    }
  } catch {
    // Non-fatal
  }
}

export function upsertVaultCompanies(
  items: GlobalCompanyItem[],
  defaultRegistry = 'TheOrg',
  options?: { invalidateQueryCache?: boolean }
): number {
  if (!items || items.length === 0) return 0;
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO companies (
      slug, name, name_lower, domain, website_url, logo_url,
      location, location_lower, country_slug, industry, industry_lower,
      employee_range, revenue_range, source_registry, registry_id, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
    ON CONFLICT(slug) DO UPDATE SET
      name = COALESCE(NULLIF(excluded.name, ''), companies.name),
      name_lower = COALESCE(NULLIF(excluded.name_lower, ''), companies.name_lower),
      domain = CASE
        WHEN excluded.domain IS NOT NULL AND excluded.domain != '' THEN excluded.domain
        ELSE companies.domain
      END,
      website_url = CASE
        WHEN excluded.website_url IS NOT NULL AND excluded.website_url != '' THEN excluded.website_url
        ELSE companies.website_url
      END,
      logo_url = COALESCE(excluded.logo_url, companies.logo_url),
      location = CASE
        WHEN companies.location = 'Global' AND excluded.location != 'Global' THEN excluded.location
        ELSE companies.location
      END,
      location_lower = CASE
        WHEN companies.location = 'Global' AND excluded.location != 'Global' THEN excluded.location_lower
        ELSE companies.location_lower
      END,
      country_slug = COALESCE(excluded.country_slug, companies.country_slug),
      industry = CASE
        WHEN excluded.industry != '' AND excluded.industry != 'Business Services' THEN excluded.industry
        ELSE companies.industry
      END,
      industry_lower = CASE
        WHEN excluded.industry != '' AND excluded.industry != 'Business Services' THEN excluded.industry_lower
        ELSE companies.industry_lower
      END,
      updated_at = excluded.updated_at
  `);

  let count = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of items) {
      const slug = (item.slug || slugifyName(item.name)).trim().toLowerCase();
      const name = (item.name || '').trim();
      if (!slug || !name || name.length < 2) continue;

      const reg = item.sourceRegistry || defaultRegistry;
      const cleanDom = item.domain ? normalizeDomain(item.domain) : '';
      const validDom =
        cleanDom &&
        isValidDomain(cleanDom) &&
        !isSuspectDomainQuickCheck(cleanDom, slug, reg)
          ? cleanDom
          : null;
      const webUrl = validDom
        ? item.websiteUrl && item.websiteUrl.includes(validDom)
          ? item.websiteUrl
          : `https://${validDom}`
        : null;
      const loc = (item.location || 'Global').trim();
      const ind = (item.industry || 'Business Services').trim();
      const explicitLocCountry =
        loc && loc.toLowerCase() !== 'global' && loc.toLowerCase() !== 'worldwide'
          ? inferCountrySlugFromLocation(loc)
          : undefined;
      const countrySlug =
        explicitLocCountry ||
        item.sourceCountrySlug ||
        inferCountrySlugFromLocation(loc, validDom) ||
        null;

      stmt.run(
        slug,
        name,
        name.toLowerCase(),
        validDom,
        webUrl,
        item.logoUrl || null,
        loc,
        loc.toLowerCase(),
        countrySlug,
        ind,
        ind.toLowerCase(),
        item.employeeRange || '51 - 200',
        item.revenueRange || '$10M - $50M',
        reg,
        item.id || slug,
        now
      );
      count++;
    }
    db.exec('COMMIT');
    if (count > 0 && options?.invalidateQueryCache) {
      vaultQueryRamCache.clear();
      notifyVaultMutated();
    }
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback error
    }
    throw err;
  }

  return count;
}

export interface OfficerRecordInput {
  companySlug: string;
  domain?: string;
  fullName: string;
  jobTitle: string;
  sourceRegistry: string;
}

export function upsertCompanyOfficers(officers: OfficerRecordInput[]): void {
  if (!officers || officers.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO company_officers (
      id, company_slug, domain, full_name, job_title, source_registry, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      domain = COALESCE(excluded.domain, company_officers.domain),
      job_title = excluded.job_title,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const off of officers) {
      if (!off.companySlug || !off.fullName) continue;
      const id = `${off.companySlug}:${slugifyName(off.fullName)}`;
      stmt.run(
        id,
        off.companySlug.toLowerCase(),
        off.domain ? off.domain.toLowerCase() : null,
        off.fullName.trim(),
        off.jobTitle.trim() || 'Executive Officer',
        off.sourceRegistry,
        now
      );
    }
    db.exec('COMMIT');
  } catch {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore
    }
  }
}

export function getCompanyOfficersBySlugOrDomain(
  companySlug?: string,
  domain?: string
): Array<{ fullName: string; jobTitle: string; sourceRegistry: string }> {
  const db = getDb();
  const clauses: string[] = [];
  const args: string[] = [];

  if (companySlug) {
    clauses.push('company_slug = ?');
    args.push(companySlug.trim().toLowerCase());
  }
  if (domain) {
    clauses.push('domain = ?');
    args.push(domain.trim().toLowerCase());
  }
  if (clauses.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT full_name, job_title, source_registry
       FROM company_officers
       WHERE ${clauses.join(' OR ')}
       LIMIT 250`
    )
    .all(...args) as Array<{
    full_name: string;
    job_title: string;
    source_registry: string;
  }>;

  return rows.map((r) => ({
    fullName: r.full_name,
    jobTitle: r.job_title,
    sourceRegistry: r.source_registry,
  }));
}

export function upsertConfirmedContacts(
  domain: string,
  contacts: ConfirmedEmailHit[],
  companyName?: string
): number {
  const cleanDom = normalizeDomain(domain);
  if (!cleanDom || !isValidDomain(cleanDom) || contacts.length === 0) return 0;

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO confirmed_contacts (
      email, domain, full_name, job_title, company_name, email_source, source_url, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      full_name = CASE
        WHEN LENGTH(excluded.full_name) > LENGTH(confirmed_contacts.full_name) THEN excluded.full_name
        ELSE confirmed_contacts.full_name
      END,
      job_title = CASE
        WHEN confirmed_contacts.job_title IN ('Verified Contact', 'Verified Domain Contact', 'Team Member')
          AND excluded.job_title NOT IN ('Verified Contact', 'Verified Domain Contact', 'Team Member')
        THEN excluded.job_title
        ELSE confirmed_contacts.job_title
      END,
      company_name = COALESCE(excluded.company_name, confirmed_contacts.company_name),
      source_url = COALESCE(excluded.source_url, confirmed_contacts.source_url),
      verified_at = excluded.verified_at
  `);

  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const c of contacts) {
      const email = c.email.trim().toLowerCase();
      if (!email.endsWith(`@${cleanDom}`)) continue;
      if (!c.fullName || c.fullName.trim().length < 2) continue;

      stmt.run(
        email,
        cleanDom,
        c.fullName.trim(),
        (c.jobTitle || 'Verified Contact').trim(),
        companyName || null,
        c.emailSource,
        c.sourceUrl || `https://${cleanDom}`,
        now
      );
      inserted++;
    }

    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM confirmed_contacts WHERE domain = ?`
      )
      .get(cleanDom) as { cnt: number } | undefined;
    const totalForDom = Number(countRow?.cnt || 0);
    if (totalForDom > 0) {
      db.prepare(
        `UPDATE companies SET confirmed_email_count = ? WHERE domain = ?`
      ).run(totalForDom, cleanDom);
    }

    db.exec('COMMIT');
  } catch {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore
    }
  }
  return inserted;
}

export function getConfirmedContactsForDomain(
  domain: string
): ConfirmedEmailHit[] {
  const cleanDom = normalizeDomain(domain);
  if (!cleanDom) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT email, full_name, job_title, email_source, source_url
       FROM confirmed_contacts
       WHERE domain = ?
       ORDER BY verified_at DESC
       LIMIT 500`
    )
    .all(cleanDom) as Array<{
    email: string;
    full_name: string;
    job_title: string;
    email_source: string;
    source_url: string | null;
  }>;

  return rows.map((r) => ({
    email: r.email,
    fullName: r.full_name,
    jobTitle: r.job_title,
    emailSource: r.email_source as ConfirmedEmailSource,
    sourceUrl: r.source_url || undefined,
  }));
}

export function getConfirmedContactsForDomains(
  domains: string[]
): Map<string, ConfirmedEmailHit[]> {
  const map = new Map<string, ConfirmedEmailHit[]>();
  const cleanList = Array.from(
    new Set(domains.map((d) => normalizeDomain(d)).filter(Boolean))
  ).slice(0, 160);
  if (cleanList.length === 0) return map;

  const db = getDb();
  const placeholders = cleanList.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT email, domain, full_name, job_title, email_source, source_url
       FROM confirmed_contacts
       WHERE domain IN (${placeholders})`
    )
    .all(...cleanList) as Array<{
    email: string;
    domain: string;
    full_name: string;
    job_title: string;
    email_source: string;
    source_url: string | null;
  }>;

  for (const r of rows) {
    const list = map.get(r.domain) || [];
    list.push({
      email: r.email,
      fullName: r.full_name,
      jobTitle: r.job_title,
      emailSource: r.email_source as ConfirmedEmailSource,
      sourceUrl: r.source_url || undefined,
    });
    map.set(r.domain, list);
  }
  return map;
}

export interface VaultCompanyQuery {
  companyQuery?: string;
  countrySlugs?: string[];
  nullCountryOnly?: boolean;
  excludeCountrySlugs?: string[];
  locationQuery?: string;
  industryTokens?: string[];
  industryTlds?: string[];
  industryKeyword?: string;
  employeeRanges?: string[];
  revenueRanges?: string[];
  requireRealDomain?: boolean;
  page: number;
  perPage: number;
  extraBuffer?: number;
  offsetOverride?: number;
}

function appendVaultFilterClauses(
  q: Omit<VaultCompanyQuery, 'page' | 'perPage'>,
  where: string[],
  params: Array<string | number>
): { cleanCompanyQuery: string; hasFreeTextFilter: boolean } {
  const cleanCompanyQuery = q.companyQuery?.trim().toLowerCase() || '';
  if (cleanCompanyQuery) {
    const term = `%${cleanCompanyQuery}%`;
    where.push('(name_lower LIKE ? OR domain LIKE ?)');
    params.push(term, term);
  }

  if (q.nullCountryOnly) {
    where.push("(country_slug IS NULL OR country_slug = '')");
  } else if (q.countrySlugs && q.countrySlugs.length > 0) {
    const slice = q.countrySlugs.slice(0, 80);
    const ph = slice.map(() => '?').join(',');
    where.push(`country_slug IN (${ph})`);
    params.push(...slice);
  } else if (q.excludeCountrySlugs && q.excludeCountrySlugs.length > 0) {
    const slice = q.excludeCountrySlugs.slice(0, 80);
    const ph = slice.map(() => '?').join(',');
    where.push(`country_slug IS NOT NULL AND country_slug != '' AND country_slug NOT IN (${ph})`);
    params.push(...slice);
  }

  if (q.locationQuery && q.locationQuery.trim()) {
    where.push('location_lower LIKE ?');
    params.push(`%${q.locationQuery.trim().toLowerCase()}%`);
  }

  if (q.industryKeyword && q.industryKeyword.trim()) {
    const kw = `%${q.industryKeyword.trim().toLowerCase()}%`;
    where.push('(industry_lower LIKE ? OR name_lower LIKE ?)');
    params.push(kw, kw);
  } else if (
    (q.industryTokens && q.industryTokens.length > 0) ||
    (q.industryTlds && q.industryTlds.length > 0)
  ) {
    const subClauses: string[] = [];
    const tlds = (q.industryTlds || []).slice(0, 3);
    for (const tld of tlds) {
      subClauses.push('domain LIKE ?');
      params.push(`%${tld.toLowerCase()}`);
    }
    const toks = (q.industryTokens || []).slice(0, 6);
    for (const t of toks) {
      subClauses.push('(industry_lower LIKE ? OR name_lower LIKE ?)');
      const pat = `%${t.toLowerCase()}%`;
      params.push(pat, pat);
    }
    if (subClauses.length > 0) {
      where.push(`(${subClauses.join(' OR ')})`);
    }
  }

  if (q.employeeRanges && q.employeeRanges.length > 0) {
    const ph = q.employeeRanges.map(() => '?').join(',');
    where.push(`employee_range IN (${ph})`);
    params.push(...q.employeeRanges);
  }

  if (q.revenueRanges && q.revenueRanges.length > 0) {
    const ph = q.revenueRanges.map(() => '?').join(',');
    where.push(`revenue_range IN (${ph})`);
    params.push(...q.revenueRanges);
  }

  const hasFreeTextFilter = Boolean(
    cleanCompanyQuery ||
      (q.locationQuery && q.locationQuery.trim()) ||
      (q.industryKeyword && q.industryKeyword.trim()) ||
      (q.industryTokens && q.industryTokens.length > 0) ||
      (q.industryTlds && q.industryTlds.length > 0)
  );

  return { cleanCompanyQuery, hasFreeTextFilter };
}

export function queryVaultCompanies(q: VaultCompanyQuery): {
  companies: GlobalCompanyItem[];
  totalMatchingInVault: number;
} {
  const requireDomain = q.requireRealDomain !== false;
  const cacheKey = JSON.stringify([
    q.companyQuery?.trim().toLowerCase() || '',
    q.countrySlugs || [],
    Boolean(q.nullCountryOnly),
    q.excludeCountrySlugs || [],
    q.locationQuery?.trim().toLowerCase() || '',
    q.industryTokens || [],
    q.industryTlds || [],
    q.industryKeyword?.trim().toLowerCase() || '',
    q.employeeRanges || [],
    q.revenueRanges || [],
    requireDomain,
    q.page,
    q.perPage,
    q.extraBuffer || 0,
    q.offsetOverride ?? -1,
  ]);
  const ramHit = vaultQueryRamCache.get(cacheKey);
  if (ramHit && ramHit.expiresAt > Date.now()) {
    return {
      companies: ramHit.companies,
      totalMatchingInVault: ramHit.totalMatchingInVault,
    };
  }

  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (requireDomain) {
    where.push("domain IS NOT NULL AND domain != '' AND domain LIKE '%.%'");
  }

  const { cleanCompanyQuery, hasFreeTextFilter } = appendVaultFilterClauses(
    q,
    where,
    params
  );

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset =
    typeof q.offsetOverride === 'number'
      ? Math.max(0, q.offsetOverride)
      : Math.max(0, (q.page - 1) * q.perPage);

  // Over-fetch (+250 buffer) so suspect/duplicate-domain rows filtered out never leave pages short of 500.
  // Use indexed sort for non-free-text queries and deterministic rowid order for free-text scans so pages never duplicate.
  const candidateLimit = q.perPage + 250;
  const orderClause = hasFreeTextFilter
    ? 'ORDER BY rowid ASC'
    : 'ORDER BY confirmed_email_count DESC, updated_at DESC, rowid ASC';

  const rawRows = db
    .prepare(
      `SELECT slug, name, domain, website_url, logo_url, location, country_slug,
              industry, employee_range, revenue_range, source_registry,
              registry_id, confirmed_email_count
       FROM companies
       ${whereSql}
       ${orderClause}
       LIMIT ? OFFSET ?`
    )
    .all(...params, candidateLimit, offset) as Array<{
    slug: string;
    name: string;
    domain: string | null;
    website_url: string | null;
    logo_url: string | null;
    location: string;
    country_slug: string | null;
    industry: string;
    employee_range: string;
    revenue_range: string;
    source_registry: string;
    registry_id: string | null;
    confirmed_email_count: number;
  }>;

  const seenDomains = new Set<string>();
  const validRows = rawRows.filter((r) => {
    if (requireDomain) {
      if (!r.domain || !isValidDomain(r.domain)) return false;
      if (isSuspectDomainQuickCheck(r.domain, r.slug, r.source_registry)) {
        return false;
      }
    }
    const cleanDom = r.domain ? normalizeDomain(r.domain) : '';
    if (cleanDom) {
      if (seenDomains.has(cleanDom)) return false;
      seenDomains.add(cleanDom);
    }
    return true;
  });

  // Slice primary page [0..perPage) separately from extraBuffer overflow BEFORE sorting
  // so sorting never pulls rows from [500..560) onto Page 1 and duplicates them on Page 2!
  const primaryRows = validRows.slice(0, q.perPage);
  const overflowRows = validRows.slice(
    q.perPage,
    q.perPage + Math.max(0, q.extraBuffer || 0)
  );

  const empRank: Record<string, number> = {
    '10,000+': 7,
    '5,001 - 10,000': 6,
    '1,001 - 5,000': 5,
    '501 - 1,000': 4,
    '201 - 500': 3,
    '51 - 200': 2,
    '1 - 50': 1,
  };
  const revRank: Record<string, number> = {
    '$10B+': 8,
    '$1B - $10B': 7,
    '$500M - $1B': 6,
    '$100M - $500M': 5,
    '$50M - $100M': 4,
    '$10M - $50M': 3,
    '$1M - $10M': 2,
    'Under $1M': 1,
  };
  const cleanDomainRoot = cleanCompanyQuery.replace(/^www\./, '');

  primaryRows.sort((a, b) => {
    if (cleanCompanyQuery) {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aDom = (a.domain || '').toLowerCase();
      const bDom = (b.domain || '').toLowerCase();
      const aExact =
        aName === cleanCompanyQuery ||
        aDom === cleanDomainRoot ||
        aDom === `${cleanDomainRoot}.com`
          ? 3
          : aName.startsWith(cleanCompanyQuery) || aDom.startsWith(cleanDomainRoot)
          ? 2
          : 1;
      const bExact =
        bName === cleanCompanyQuery ||
        bDom === cleanDomainRoot ||
        bDom === `${cleanDomainRoot}.com`
          ? 3
          : bName.startsWith(cleanCompanyQuery) || bDom.startsWith(cleanDomainRoot)
          ? 2
          : 1;
      if (aExact !== bExact) return bExact - aExact;
    }
    if (a.confirmed_email_count !== b.confirmed_email_count) {
      return b.confirmed_email_count - a.confirmed_email_count;
    }
    const aLogo = a.logo_url ? 1 : 0;
    const bLogo = b.logo_url ? 1 : 0;
    if (aLogo !== bLogo) return bLogo - aLogo;
    const aEmp = empRank[a.employee_range] || 1;
    const bEmp = empRank[b.employee_range] || 1;
    if (aEmp !== bEmp) return bEmp - aEmp;
    const aRev = revRank[a.revenue_range] || 1;
    const bRev = revRank[b.revenue_range] || 1;
    if (aRev !== bRev) return bRev - aRev;
    return a.name.localeCompare(b.name);
  });

  const pageRows = [...primaryRows, ...overflowRows];

  const hasMoreAfterPage = validRows.length > q.perPage;
  const totalMatchingInVault = hasMoreAfterPage
    ? offset + validRows.length
    : offset + pageRows.length;

  const companies: GlobalCompanyItem[] = pageRows.map((r) => ({
    id: r.registry_id || r.slug,
    slug: r.slug,
    name: r.name,
    domain: r.domain || undefined,
    websiteUrl:
      r.website_url || (r.domain ? `https://${r.domain}` : undefined),
    logoUrl: r.logo_url,
    location: r.location,
    industry: r.industry,
    employeeRange: r.employee_range,
    revenueRange: r.revenue_range,
    sourceCountrySlug: r.country_slug || undefined,
    sourceRegistry: r.source_registry,
    confirmedEmailCount:
      r.confirmed_email_count > 0 ? r.confirmed_email_count : undefined,
  }));

  if (companies.length > 0) {
    if (vaultQueryRamCache.size > 300) {
      const firstKey = vaultQueryRamCache.keys().next().value;
      if (firstKey) vaultQueryRamCache.delete(firstKey);
    }
    vaultQueryRamCache.set(cacheKey, {
      companies,
      totalMatchingInVault,
      expiresAt: Date.now() + 300_000,
    });
  }

  return { companies, totalMatchingInVault };
}

/**
 * Ultra-fast primary-key batch fetch (< 2ms for 500 rows) used by the
 * in-memory columnar index to hydrate an exact page of companies without
 * any SQLite full-table scan or temp B-tree filesort.
 */
const COUNTRY_SLUG_TO_DISPLAY_NAME = new Map<string, string>();
for (const cont of CONTINENTS_CATALOG) {
  for (const c of cont.countries) {
    if (!COUNTRY_SLUG_TO_DISPLAY_NAME.has(c.theorgSlug)) {
      COUNTRY_SLUG_TO_DISPLAY_NAME.set(c.theorgSlug, c.name);
    }
  }
}

export function fetchVaultCompaniesByRowIds(
  rowIds: number[],
  overrides?: {
    countrySlugByRowId?: Map<number, string>;
    industryTitleByRowId?: Map<number, string>;
    empRangeByRowId?: Map<number, string>;
    revRangeByRowId?: Map<number, string>;
  }
): GlobalCompanyItem[] {
  if (!rowIds || rowIds.length === 0) return [];
  const db = getDb();
  const ph = rowIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT rowid AS _rowid, slug, name, domain, website_url, logo_url, location, country_slug,
              industry, employee_range, revenue_range, source_registry,
              registry_id, confirmed_email_count
       FROM companies
       WHERE rowid IN (${ph})`
    )
    .all(...rowIds) as Array<{
    _rowid: number;
    slug: string;
    name: string;
    domain: string | null;
    website_url: string | null;
    logo_url: string | null;
    location: string;
    country_slug: string | null;
    industry: string;
    employee_range: string;
    revenue_range: string;
    source_registry: string;
    registry_id: string | null;
    confirmed_email_count: number;
  }>;

  const byRowId = new Map<number, GlobalCompanyItem>();
  for (const r of rows) {
    const rid = Number(r._rowid);
    const locLower = (r.location || '').trim().toLowerCase();
    const isGlobalLoc =
      !locLower || locLower === 'global' || locLower === 'worldwide';
    const overrideCountry =
      isGlobalLoc && overrides?.countrySlugByRowId
        ? overrides.countrySlugByRowId.get(rid)
        : undefined;
    const displayLocation =
      overrideCountry && COUNTRY_SLUG_TO_DISPLAY_NAME.has(overrideCountry)
        ? COUNTRY_SLUG_TO_DISPLAY_NAME.get(overrideCountry)!
        : r.location;

    const indLow = (r.industry || '').trim().toLowerCase();
    const isGenericInd =
      !indLow ||
      indLow.includes('global active web') ||
      indLow.includes('registered legal corporate') ||
      indLow === 'business services';
    const overrideInd =
      isGenericInd && overrides?.industryTitleByRowId
        ? overrides.industryTitleByRowId.get(rid)
        : undefined;

    const overrideEmp = overrides?.empRangeByRowId?.get(rid);
    const overrideRev = overrides?.revRangeByRowId?.get(rid);

    byRowId.set(rid, {
      id: r.registry_id || r.slug,
      slug: r.slug,
      name: r.name,
      domain: r.domain || undefined,
      websiteUrl:
        r.website_url || (r.domain ? `https://${r.domain}` : undefined),
      logoUrl: r.logo_url,
      location: displayLocation,
      industry: overrideInd || r.industry,
      employeeRange: overrideEmp || r.employee_range,
      revenueRange: overrideRev || r.revenue_range,
      sourceCountrySlug: r.country_slug || overrideCountry || undefined,
      sourceRegistry: r.source_registry,
      confirmedEmailCount:
        r.confirmed_email_count > 0 ? r.confirmed_email_count : undefined,
    });
  }

  const ordered: GlobalCompanyItem[] = [];
  for (const rid of rowIds) {
    const item = byRowId.get(rid);
    if (item) ordered.push(item);
  }
  return ordered;
}

const vaultCountRamCache = new Map<
  string,
  { count: number; expiresAt: number }
>();

/**
 * Bounded fast count (up to 25,000 matches) for accurate search & filter pagination totals.
 */
export function countVaultCompaniesFast(
  q: Omit<VaultCompanyQuery, 'page' | 'perPage'>,
  cap = 25_000
): number {
  const requireDomain = q.requireRealDomain !== false;
  const cacheKey = JSON.stringify([
    q.companyQuery?.trim().toLowerCase() || '',
    q.countrySlugs || [],
    Boolean(q.nullCountryOnly),
    q.excludeCountrySlugs || [],
    q.locationQuery?.trim().toLowerCase() || '',
    q.industryTokens || [],
    q.industryTlds || [],
    q.industryKeyword?.trim().toLowerCase() || '',
    q.employeeRanges || [],
    q.revenueRanges || [],
    requireDomain,
    cap,
  ]);
  const hit = vaultCountRamCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.count;
  }

  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (requireDomain) {
    where.push("domain IS NOT NULL AND domain != '' AND domain LIKE '%.%'");
  }
  appendVaultFilterClauses(q, where, params);

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM companies ${whereSql} LIMIT ?)`
    )
    .get(...params, cap) as { cnt: number } | undefined;

  const count = Number(row?.cnt || 0);
  if (vaultCountRamCache.size > 300) {
    const oldest = vaultCountRamCache.keys().next().value;
    if (oldest) vaultCountRamCache.delete(oldest);
  }
  vaultCountRamCache.set(cacheKey, { count, expiresAt: Date.now() + 300_000 });
  return count;
}

const quickSearchRamCache = new Map<
  string,
  {
    companies: GlobalCompanyItem[];
    totalMatches: number;
    expiresAt: number;
  }
>();

/**
 * Ultra-fast company & domain auto-suggest search for the Top Bar Quick Search.
 * Matches BOTH company name (name_lower) and domain (normalized without http/www),
 * prioritizes exact & prefix hits before broad substring hits, and returns up to `limit`
 * ranked GlobalCompanyItem entries alongside a fast bounded total match count.
 */
export function quickSearchVaultCompanies(
  rawQuery: string,
  limit = 4
): {
  companies: GlobalCompanyItem[];
  totalMatches: number;
} {
  const safeLimit = Math.max(1, Math.min(12, Math.floor(limit || 4)));
  const cleanedRaw = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleanedRaw) {
    return { companies: [], totalMatches: 0 };
  }

  const cleanDomainQuery = cleanedRaw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .trim();

  const cacheKey = `${cleanedRaw}|${cleanDomainQuery}|${safeLimit}`;
  const cached = quickSearchRamCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      companies: cached.companies,
      totalMatches: cached.totalMatches,
    };
  }

  const db = getDb();

  type QuickRow = {
    slug: string;
    name: string;
    domain: string | null;
    website_url: string | null;
    logo_url: string | null;
    location: string;
    country_slug: string | null;
    industry: string;
    employee_range: string;
    revenue_range: string;
    source_registry: string;
    registry_id: string | null;
    confirmed_email_count: number;
  };

  const selectCols = `SELECT slug, name, domain, website_url, logo_url, location, country_slug,
    industry, employee_range, revenue_range, source_registry,
    registry_id, confirmed_email_count
    FROM companies`;

  const domainGuard = "domain IS NOT NULL AND domain != '' AND domain LIKE '%.%'";
  const prefixCandidates: QuickRow[] = [];

  // Stage 0: Instant <1ms indexed exact domain & exact name hits (ensures stripe.com, apple.com, etc. always rank #1)
  const domBase = cleanDomainQuery || cleanedRaw.replace(/\s+/g, '');
  const exactDomains = Array.from(
    new Set(
      domBase.includes('.')
        ? [domBase]
        : [
            `${domBase}.com`,
            `${domBase}.io`,
            `${domBase}.co`,
            `${domBase}.ai`,
            `${domBase}.org`,
            `${domBase}.net`,
          ]
    )
  );
  const exactPlaceholders = exactDomains.map(() => '?').join(',');
  const exactDomainRows = db
    .prepare(
      `${selectCols}
       WHERE domain IN (${exactPlaceholders})
       LIMIT 12`
    )
    .all(...exactDomains) as QuickRow[];
  prefixCandidates.push(...exactDomainRows);

  const exactNameRows = db
    .prepare(
      `${selectCols}
       WHERE name_lower = ? AND ${domainGuard}
       LIMIT 12`
    )
    .all(cleanedRaw) as QuickRow[];
  prefixCandidates.push(...exactNameRows);

  // Stage 1: Split prefix queries (avoids OR index-disable in SQLite; runs in <5ms via range scans)
  const nameUpperBound = `${cleanedRaw}\uffff`;
  const domPrefixBase = cleanDomainQuery || cleanedRaw;
  const domUpperBound = `${domPrefixBase}\uffff`;

  const domPrefixRows = db
    .prepare(
      `${selectCols}
       WHERE domain >= ? AND domain < ? AND ${domainGuard}
       LIMIT 60`
    )
    .all(domPrefixBase, domUpperBound) as QuickRow[];
  prefixCandidates.push(...domPrefixRows);

  const namePrefixRows = db
    .prepare(
      `${selectCols}
       WHERE name_lower >= ? AND name_lower < ? AND ${domainGuard}
       LIMIT 60`
    )
    .all(cleanedRaw, nameUpperBound) as QuickRow[];
  prefixCandidates.push(...namePrefixRows);

  // Stage 2: Substring / multi-token fallback ONLY when indexed exact/prefix hits found fewer than `safeLimit` unique companies
  const quickUniqueCount = new Set(
    prefixCandidates.map((r) => (r.domain || '').toLowerCase()).filter(Boolean)
  ).size;

  if (quickUniqueCount < safeLimit) {
    const tokens = cleanedRaw
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 4);

    if (tokens.length > 1) {
      const tokenWhere = tokens
        .map(() => '(name_lower LIKE ? OR domain LIKE ?)')
        .join(' AND ');
      const tokenParams: string[] = [];
      for (const tok of tokens) {
        tokenParams.push(`%${tok}%`, `%${tok}%`);
      }
      const multiRows = db
        .prepare(
          `${selectCols}
           WHERE ${domainGuard}
             AND ${tokenWhere}
           LIMIT 40`
        )
        .all(...tokenParams) as QuickRow[];
      prefixCandidates.push(...multiRows);
    } else {
      const containsTerm = `%${cleanedRaw}%`;
      const domContainsTerm = `%${domPrefixBase}%`;
      const subRows = db
        .prepare(
          `${selectCols}
           WHERE ${domainGuard}
             AND (name_lower LIKE ? OR domain LIKE ?)
           LIMIT 40`
        )
        .all(containsTerm, domContainsTerm) as QuickRow[];
      prefixCandidates.push(...subRows);
    }
  }

  // Deduplicate by normalized domain & filter invalid/suspect domains
  const seenDomains = new Set<string>();
  const validRows: QuickRow[] = [];
  for (const r of prefixCandidates) {
    if (!r.domain || !isValidDomain(r.domain)) continue;
    if (isSuspectDomainQuickCheck(r.domain, r.slug, r.source_registry)) continue;
    const normDom = normalizeDomain(r.domain);
    if (!normDom || seenDomains.has(normDom)) continue;
    seenDomains.add(normDom);
    validRows.push(r);
  }

  const empRank: Record<string, number> = {
    '10,000+': 7,
    '5,001 - 10,000': 6,
    '1,001 - 5,000': 5,
    '501 - 1,000': 4,
    '201 - 500': 3,
    '51 - 200': 2,
    '1 - 50': 1,
  };

  const scoreRow = (r: QuickRow): number => {
    const n = r.name.toLowerCase();
    const d = (r.domain || '').toLowerCase();
    const domRoot = d.split('.')[0] || '';
    const isDotCom = d.endsWith('.com');
    let score = 0;

    if (d === cleanDomainQuery || d === `${domBase}.com`) {
      score += 1300;
    } else if (domRoot === cleanDomainQuery || domRoot === domBase) {
      score += isDotCom ? 1220 : 1040;
    } else if (n === cleanedRaw) {
      score += isDotCom ? 1120 : 980;
    } else if (d.startsWith(domPrefixBase)) {
      score += isDotCom ? 820 : 750;
    } else if (n.startsWith(cleanedRaw)) {
      score += isDotCom ? 780 : 710;
    } else if (n.includes(` ${cleanedRaw}`)) {
      score += 480;
    } else if (d.includes(domPrefixBase)) {
      score += 380;
    } else if (n.includes(cleanedRaw)) {
      score += 280;
    } else {
      score += 120;
    }

    // Prefer flagship confirmed rosters & richer profiles
    if (r.confirmed_email_count > 0) {
      score += Math.min(200, 60 + r.confirmed_email_count * 10);
    }
    if (r.logo_url) score += 35;
    if (
      r.source_registry === 'TheOrg Directory' ||
      r.source_registry === 'Live Domain Discovery'
    ) {
      score += 45;
    }
    score += (empRank[r.employee_range] || 1) * 5;
    score -= Math.min(25, Math.floor(d.length / 2));

    return score;
  };

  validRows.sort((a, b) => {
    const diff = scoreRow(b) - scoreRow(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const topRows = validRows.slice(0, safeLimit);

  const companies: GlobalCompanyItem[] = topRows.map((r) => ({
    id: r.registry_id || r.slug,
    slug: r.slug,
    name: r.name,
    domain: r.domain || undefined,
    websiteUrl:
      r.website_url || (r.domain ? `https://${r.domain}` : undefined),
    logoUrl: r.logo_url,
    location: r.location,
    industry: r.industry,
    employeeRange: r.employee_range,
    revenueRange: r.revenue_range,
    sourceCountrySlug: r.country_slug || undefined,
    sourceRegistry: r.source_registry,
    confirmedEmailCount:
      r.confirmed_email_count > 0 ? r.confirmed_email_count : undefined,
  }));

  const totalMatches = Math.max(companies.length, validRows.length);

  if (quickSearchRamCache.size > 400) {
    const oldest = quickSearchRamCache.keys().next().value;
    if (oldest) quickSearchRamCache.delete(oldest);
  }
  quickSearchRamCache.set(cacheKey, {
    companies,
    totalMatches,
    expiresAt: Date.now() + 120_000,
  });

  return { companies, totalMatches };
}

/**
 * Returns companies matching the active filters that have real org charts,
 * confirmed web contacts, cached rosters, or corporate registry officers so
 * Full Names & Emails / Command Hierarchy pagination (Page 1, 2, 3...) never goes empty.
 */
export function queryVaultRosterCapableCompanies(
  q: VaultCompanyQuery
): GlobalCompanyItem[] {
  const db = getDb();
  const where: string[] = [
    "domain IS NOT NULL AND domain != '' AND domain LIKE '%.%'",
    "(source_registry IN ('TheOrg Directory', 'Live Domain Discovery') OR confirmed_email_count > 0 OR slug IN (SELECT slug FROM quick_roster_cache_db) OR slug IN (SELECT company_slug FROM company_officers))",
  ];
  const params: Array<string | number> = [];

  appendVaultFilterClauses(q, where, params);

  const offset =
    typeof q.offsetOverride === 'number'
      ? Math.max(0, q.offsetOverride)
      : Math.max(0, (q.page - 1) * q.perPage);
  const fetchLimit = q.perPage + 40;
  const rows = db
    .prepare(
      `SELECT slug, name, domain, website_url, logo_url, location, country_slug,
              industry, employee_range, revenue_range, source_registry,
              registry_id, confirmed_email_count
       FROM companies
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN slug IN (SELECT slug FROM quick_roster_cache_db) THEN 1 ELSE 0 END DESC,
         confirmed_email_count DESC,
         updated_at DESC,
         rowid ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, fetchLimit, offset) as Array<{
    slug: string;
    name: string;
    domain: string | null;
    website_url: string | null;
    logo_url: string | null;
    location: string;
    country_slug: string | null;
    industry: string;
    employee_range: string;
    revenue_range: string;
    source_registry: string;
    registry_id: string | null;
    confirmed_email_count: number;
  }>;

  const seenDom = new Set<string>();
  const out: GlobalCompanyItem[] = [];
  for (const r of rows) {
    if (!r.domain || !isValidDomain(r.domain)) continue;
    const cleanDom = normalizeDomain(r.domain);
    if (!cleanDom || seenDom.has(cleanDom)) continue;
    seenDom.add(cleanDom);
    out.push({
      id: r.registry_id || r.slug,
      slug: r.slug,
      name: r.name,
      domain: cleanDom,
      websiteUrl: r.website_url || `https://${cleanDom}`,
      logoUrl: r.logo_url,
      location: r.location,
      industry: r.industry,
      employeeRange: r.employee_range,
      revenueRange: r.revenue_range,
      sourceCountrySlug: r.country_slug || undefined,
      sourceRegistry: r.source_registry,
      confirmedEmailCount:
        r.confirmed_email_count > 0 ? r.confirmed_email_count : undefined,
    });
    if (out.length >= q.perPage) break;
  }
  return out;
}

/**
 * Ultra-fast (< 5ms) cached SQLite breakdowns across countries, employee ranges, and revenue ranges.
 */
export function getVaultGroupBreakdowns(): {
  byCountry: Map<string, number>;
  byEmployeeRange: Map<string, number>;
  byRevenueRange: Map<string, number>;
  totalRealDomainInVault: number;
} {
  if (
    cachedVaultGroupBreakdowns &&
    cachedVaultGroupBreakdowns.expiresAt > Date.now()
  ) {
    return cachedVaultGroupBreakdowns;
  }

  const db = getDb();
  const MAX_AGE_MS = 60 * 60_000;
  try {
    const persisted = db
      .prepare(
        `SELECT payload_json, updated_at FROM vault_aggregates_cache WHERE cache_key = 'group_breakdowns' LIMIT 1`
      )
      .get() as { payload_json: string; updated_at: number } | undefined;
    if (persisted?.payload_json && Date.now() - persisted.updated_at < MAX_AGE_MS) {
      const parsed = JSON.parse(persisted.payload_json) as {
        byCountry: Array<[string, number]>;
        byEmployeeRange: Array<[string, number]>;
        byRevenueRange: Array<[string, number]>;
        totalRealDomainInVault: number;
      };
      const snapshot = {
        byCountry: new Map(parsed.byCountry),
        byEmployeeRange: new Map(parsed.byEmployeeRange),
        byRevenueRange: new Map(parsed.byRevenueRange),
        totalRealDomainInVault: Number(parsed.totalRealDomainInVault || 0),
        expiresAt: persisted.updated_at + MAX_AGE_MS,
      };
      cachedVaultGroupBreakdowns = snapshot;
      return snapshot;
    }
  } catch {
    // Recompute cleanly below
  }

  const byCountry = new Map<string, number>();
  const byEmployeeRange = new Map<string, number>();
  const byRevenueRange = new Map<string, number>();

  const countryRows = db
    .prepare(
      `SELECT country_slug, COUNT(*) AS cnt
       FROM companies
       WHERE country_slug IS NOT NULL AND country_slug != ''
       GROUP BY country_slug`
    )
    .all() as Array<{ country_slug: string; cnt: number }>;
  for (const r of countryRows) {
    byCountry.set(r.country_slug, Number(r.cnt || 0));
  }

  const empRows = db
    .prepare(
      `SELECT employee_range, COUNT(*) AS cnt
       FROM companies
       GROUP BY employee_range`
    )
    .all() as Array<{ employee_range: string; cnt: number }>;
  for (const r of empRows) {
    byEmployeeRange.set(r.employee_range, Number(r.cnt || 0));
  }

  const revRows = db
    .prepare(
      `SELECT revenue_range, COUNT(*) AS cnt
       FROM companies
       GROUP BY revenue_range`
    )
    .all() as Array<{ revenue_range: string; cnt: number }>;
  for (const r of revRows) {
    byRevenueRange.set(r.revenue_range, Number(r.cnt || 0));
  }

  const domRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM companies WHERE domain IS NOT NULL AND domain != ''`
    )
    .get() as { cnt: number } | undefined;

  const totalRealDomainInVault = Number(domRow?.cnt || 0);
  const now = Date.now();
  const snapshot = {
    byCountry,
    byEmployeeRange,
    byRevenueRange,
    totalRealDomainInVault,
    expiresAt: now + MAX_AGE_MS,
  };
  cachedVaultGroupBreakdowns = snapshot;
  try {
    db.prepare(
      `INSERT INTO vault_aggregates_cache (cache_key, payload_json, updated_at)
       VALUES ('group_breakdowns', ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    ).run(
      JSON.stringify({
        byCountry: Array.from(byCountry.entries()),
        byEmployeeRange: Array.from(byEmployeeRange.entries()),
        byRevenueRange: Array.from(byRevenueRange.entries()),
        totalRealDomainInVault,
      }),
      now
    );
  } catch {
    // Non-fatal cache write
  }
  return snapshot;
}

export function getRegistryLiveTotalsMap(): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT registry_key, live_reported_total FROM registry_federation`
    )
    .all() as Array<{ registry_key: string; live_reported_total: number }>;
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.registry_key, Number(r.live_reported_total || 0));
  }
  return map;
}

export function getVaultCompanyBySlug(slug: string): GlobalCompanyItem | null {
  if (!slug) return null;
  const db = getDb();
  const r = db
    .prepare(
      `SELECT slug, name, domain, website_url, logo_url, location, country_slug,
              industry, employee_range, revenue_range, source_registry, registry_id, confirmed_email_count
       FROM companies WHERE slug = ? LIMIT 1`
    )
    .get(slug.trim().toLowerCase()) as
    | {
        slug: string;
        name: string;
        domain: string | null;
        website_url: string | null;
        logo_url: string | null;
        location: string;
        country_slug: string | null;
        industry: string;
        employee_range: string;
        revenue_range: string;
        source_registry: string;
        registry_id: string | null;
        confirmed_email_count: number;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.registry_id || r.slug,
    slug: r.slug,
    name: r.name,
    domain: r.domain || undefined,
    websiteUrl:
      r.website_url || (r.domain ? `https://${r.domain}` : undefined),
    logoUrl: r.logo_url,
    location: r.location,
    industry: r.industry,
    employeeRange: r.employee_range,
    revenueRange: r.revenue_range,
    sourceCountrySlug: r.country_slug || undefined,
    sourceRegistry: r.source_registry,
    confirmedEmailCount:
      r.confirmed_email_count > 0 ? r.confirmed_email_count : undefined,
  };
}

export function deriveIndustriesFromVault(): GlobalIndustryOption[] {
  if (cachedVaultIndustries && cachedVaultIndustries.expiresAt > Date.now()) {
    return cachedVaultIndustries.data;
  }

  const db = getDb();
  const MAX_AGE_MS = 60 * 60_000;
  try {
    const persisted = db
      .prepare(
        `SELECT payload_json, updated_at FROM vault_aggregates_cache WHERE cache_key = 'vault_industries' LIMIT 1`
      )
      .get() as { payload_json: string; updated_at: number } | undefined;
    if (persisted?.payload_json && Date.now() - persisted.updated_at < MAX_AGE_MS) {
      const parsed = JSON.parse(persisted.payload_json) as GlobalIndustryOption[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedVaultIndustries = {
          data: parsed,
          expiresAt: persisted.updated_at + MAX_AGE_MS,
        };
        return parsed;
      }
    }
  } catch {
    // Recompute cleanly below
  }

  const rows = db
    .prepare(
      `SELECT industry, COUNT(*) AS cnt
       FROM companies
       WHERE industry IS NOT NULL AND industry != ''
       GROUP BY industry
       ORDER BY cnt DESC
       LIMIT 80`
    )
    .all() as Array<{ industry: string; cnt: number }>;

  const bySlug = new Map<string, GlobalIndustryOption>();
  for (const r of rows) {
    const primary = (r.industry.split(',')[0] || r.industry).trim();
    const slug = slugifyName(primary);
    if (
      !slug ||
      slug === 'global-active-web-enterprise' ||
      slug === 'registered-legal-corporate-entity' ||
      slug === 'corporate-entity' ||
      slug === 'uoppgitt' ||
      slug.startsWith('activit-s-') ||
      slug.startsWith('autres-activit') ||
      slug.startsWith('aktiviteter-') ||
      slug === 'h-bergement-et-restauration' ||
      slug === 'enseignement' ||
      slug.startsWith('sant-humaine')
    ) {
      continue;
    }
    const existing = bySlug.get(slug);
    if (existing) {
      existing.companyCount += Number(r.cnt || 0);
    } else {
      bySlug.set(slug, {
        slug,
        rawTitle: primary,
        fullTitle: expandFullIndustryTitle(primary),
        companyCount: Number(r.cnt || 0),
      });
    }
  }
  const sorted = Array.from(bySlug.values()).sort(
    (a, b) => b.companyCount - a.companyCount
  );
  const now = Date.now();
  cachedVaultIndustries = {
    data: sorted,
    expiresAt: now + MAX_AGE_MS,
  };
  try {
    db.prepare(
      `INSERT INTO vault_aggregates_cache (cache_key, payload_json, updated_at)
       VALUES ('vault_industries', ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    ).run(JSON.stringify(sorted), now);
  } catch {
    // Non-fatal cache write
  }
  return sorted;
}

export function getVaultCachedDomainSearch<T>(
  domain?: string,
  companySlug?: string,
  maxAgeMs = 1000 * 60 * 60 * 24 * 7
): T | null {
  const db = getDb();
  const cleanDom = domain ? normalizeDomain(domain) : '';
  const cleanSlug = companySlug ? companySlug.trim().toLowerCase() : '';
  const minUpdatedAt = Date.now() - maxAgeMs;

  let row: { payload_json: string } | undefined;
  if (cleanDom) {
    row = db
      .prepare(
        `SELECT payload_json FROM domain_search_cache WHERE domain = ? AND updated_at >= ? LIMIT 1`
      )
      .get(cleanDom, minUpdatedAt) as { payload_json: string } | undefined;
  }
  if (!row && cleanSlug) {
    row = db
      .prepare(
        `SELECT payload_json FROM domain_search_cache WHERE company_slug = ? AND updated_at >= ? ORDER BY updated_at DESC LIMIT 1`
      )
      .get(cleanSlug, minUpdatedAt) as { payload_json: string } | undefined;
  }
  if (!row?.payload_json) return null;

  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export function saveVaultCachedDomainSearch(
  domain: string,
  companySlug: string | undefined,
  payload: unknown
): void {
  const cleanDom = normalizeDomain(domain);
  if (!cleanDom) return;
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO domain_search_cache (domain, company_slug, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(domain) DO UPDATE SET
         company_slug = COALESCE(excluded.company_slug, domain_search_cache.company_slug),
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    ).run(
      cleanDom,
      companySlug ? companySlug.trim().toLowerCase() : null,
      JSON.stringify(payload),
      Date.now()
    );
  } catch {
    // Non-fatal cache write
  }
}

export function getVaultQuickRoster<T>(
  slug: string,
  maxAgeMs = 1000 * 60 * 60 * 24 * 7
): T | null {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT roster_json FROM quick_roster_cache_db WHERE slug = ? AND updated_at >= ? LIMIT 1`
      )
      .get(cleanSlug, Date.now() - maxAgeMs) as
      | { roster_json: string }
      | undefined;
    if (!row?.roster_json) return null;
    return JSON.parse(row.roster_json) as T;
  } catch {
    return null;
  }
}

export function saveVaultQuickRoster(
  slug: string,
  domain: string | undefined,
  roster: unknown
): void {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return;
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO quick_roster_cache_db (slug, domain, roster_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         domain = COALESCE(excluded.domain, quick_roster_cache_db.domain),
         roster_json = excluded.roster_json,
         updated_at = excluded.updated_at`
    ).run(
      cleanSlug,
      domain ? normalizeDomain(domain) : null,
      JSON.stringify(roster),
      Date.now()
    );
  } catch {
    // Non-fatal cache write
  }
}

export function recordRegistryLiveTotal(
  registryKey: string,
  label: string,
  liveReportedTotal: number,
  endpointUrl: string
): void {
  if (!registryKey || liveReportedTotal <= 0) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO registry_federation (
       registry_key, label, live_reported_total, endpoint_url, last_synced_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(registry_key) DO UPDATE SET
       label = excluded.label,
       live_reported_total = CASE
         WHEN excluded.live_reported_total > 0 THEN excluded.live_reported_total
         ELSE registry_federation.live_reported_total
       END,
       endpoint_url = excluded.endpoint_url,
       last_synced_at = excluded.last_synced_at`
  ).run(
    registryKey,
    label,
    Math.round(liveReportedTotal),
    endpointUrl,
    new Date().toISOString()
  );
  cachedSummarySnapshot = null;
}

export function getCrawlerCursor(
  streamKey: string
): { cursorValue: string; itemsIngested: number } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT cursor_value, items_ingested FROM crawler_cursors WHERE stream_key = ?`
    )
    .get(streamKey) as
    | { cursor_value: string; items_ingested: number }
    | undefined;
  if (!row) return null;
  return {
    cursorValue: row.cursor_value,
    itemsIngested: Number(row.items_ingested || 0),
  };
}

export function saveCrawlerCursor(
  streamKey: string,
  cursorValue: string,
  addedCount: number,
  status: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO crawler_cursors (
       stream_key, cursor_value, items_ingested, last_crawled_at, last_status
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(stream_key) DO UPDATE SET
       cursor_value = excluded.cursor_value,
       items_ingested = crawler_cursors.items_ingested + excluded.items_ingested,
       last_crawled_at = excluded.last_crawled_at,
       last_status = excluded.last_status`
  ).run(
    streamKey,
    cursorValue,
    Math.max(0, addedCount),
    new Date().toISOString(),
    status
  );
  bumpCachedCompanyCount(addedCount);
}

export function getVaultSummaryCounts(): SummaryCountsSnapshot {
  if (cachedSummarySnapshot && cachedSummarySnapshot.expiresAt > Date.now()) {
    return cachedSummarySnapshot.data;
  }

  const db = getDb();
  const MAX_AGE_MS = 15 * 60_000;
  try {
    const persisted = db
      .prepare(
        `SELECT payload_json, updated_at FROM vault_aggregates_cache WHERE cache_key = 'summary_counts' LIMIT 1`
      )
      .get() as { payload_json: string; updated_at: number } | undefined;
    if (persisted?.payload_json && Date.now() - persisted.updated_at < MAX_AGE_MS) {
      const parsed = JSON.parse(persisted.payload_json) as SummaryCountsSnapshot;
      if (parsed && typeof parsed.vaultCompaniesCount === 'number') {
        cachedSummarySnapshot = {
          data: parsed,
          expiresAt: persisted.updated_at + MAX_AGE_MS,
        };
        return parsed;
      }
    }
  } catch {
    // Recompute cleanly below
  }

  const cRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM companies`)
    .get() as { cnt: number } | undefined;
  const dRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM companies WHERE domain IS NOT NULL AND domain != ''`
    )
    .get() as { cnt: number } | undefined;
  const eRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt, COUNT(DISTINCT domain) AS doms FROM confirmed_contacts`
    )
    .get() as { cnt: number; doms: number } | undefined;
  const fRow = db
    .prepare(
      `SELECT COALESCE(SUM(live_reported_total), 0) AS fedTotal FROM registry_federation`
    )
    .get() as { fedTotal: number } | undefined;

  const vaultCompaniesCount = Number(cRow?.cnt || 0);
  const realDomainCompaniesCount = Number(dRow?.cnt || 0);
  const liveFederatedCatalogTotal = Math.max(
    vaultCompaniesCount,
    Number(fRow?.fedTotal || 0),
    104_850_000
  );

  const now = Date.now();
  const snapshot: SummaryCountsSnapshot = {
    vaultCompaniesCount,
    realDomainCompaniesCount,
    confirmedContactsCount: Number(eRow?.cnt || 0),
    confirmedDomainsCount: Number(eRow?.doms || 0),
    liveFederatedCatalogTotal,
  };
  cachedSummarySnapshot = {
    data: snapshot,
    expiresAt: now + MAX_AGE_MS,
  };
  try {
    db.prepare(
      `INSERT INTO vault_aggregates_cache (cache_key, payload_json, updated_at)
       VALUES ('summary_counts', ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    ).run(JSON.stringify(snapshot), now);
  } catch {
    // Non-fatal cache write
  }
  return snapshot;
}

export function getFullCrawlerVaultStats(daemonMeta: {
  daemonRunning: boolean;
  daemonActiveCycle: boolean;
  lastCycleAt: string | null;
  totalCyclesRun: number;
}): CrawlerVaultStats {
  const db = getDb();
  const summary = getVaultSummaryCounts();

  const perRegistryIndexed = new Map<string, number>();
  const regCounts = db
    .prepare(
      `SELECT source_registry, COUNT(*) AS cnt FROM companies GROUP BY source_registry`
    )
    .all() as Array<{ source_registry: string; cnt: number }>;
  for (const r of regCounts) {
    perRegistryIndexed.set(r.source_registry, Number(r.cnt || 0));
  }

  const fedRows = db
    .prepare(
      `SELECT registry_key, label, live_reported_total, endpoint_url, last_synced_at
       FROM registry_federation
       ORDER BY live_reported_total DESC`
    )
    .all() as Array<{
    registry_key: string;
    label: string;
    live_reported_total: number;
    endpoint_url: string;
    last_synced_at: string;
  }>;

  const REGISTRY_KEY_SOURCE_ALIASES: Record<string, string[]> = {
    france_sirene: ['France SIRENE Registry'],
    us_treasury_recipients: ['US Treasury DUNS/UEI Registry'],
    github_orgs: ['GitHub Organizations'],
    npm_global_publishers: ['NPM Global Publishers'],
    australia_asic_companies: ['Australia ASIC Register'],
    us_ny_dos_corps: ['NY Dept of State Registry'],
    gleif: ['GLEIF Legal Registry'],
    australia_abn_businesses: ['Australia ABN Register'],
    us_colorado_sos: ['Colorado SOS Registry'],
    us_oregon_sos: ['Oregon SOS Registry'],
    norway_brreg: ['Norway Brreg Register'],
    majestic_million: ['Majestic Million Domains'],
    tranco_top1m: ['Tranco Global Domains'],
    finland_prh: ['Finland PRH Register'],
    wikidata_enterprises: ['Wikidata Corporate Graph'],
    openalex: ['OpenAlex Global Index'],
    ror_v2: ['ROR Global Registry'],
    us_sec_edgar: ['US SEC EDGAR Registry'],
  };

  const registries: RegistryFederationItem[] = fedRows.map((r) => {
    const aliases = REGISTRY_KEY_SOURCE_ALIASES[r.registry_key] || [];
    let indexedCount =
      perRegistryIndexed.get(r.label) ||
      perRegistryIndexed.get(r.registry_key) ||
      0;
    for (const alias of aliases) {
      indexedCount += perRegistryIndexed.get(alias) || 0;
    }
    return {
      registryKey: r.registry_key,
      label: r.label,
      liveReportedTotal: Number(r.live_reported_total || 0),
      vaultIndexedCount: indexedCount,
      endpointUrl: r.endpoint_url,
      lastSyncedAt: r.last_synced_at,
    };
  });

  const cursorRows = db
    .prepare(
      `SELECT stream_key, cursor_value, items_ingested, last_crawled_at, last_status
       FROM crawler_cursors
       ORDER BY last_crawled_at DESC`
    )
    .all() as Array<{
    stream_key: string;
    cursor_value: string;
    items_ingested: number;
    last_crawled_at: string;
    last_status: string;
  }>;

  const streams: CrawlerStreamCursor[] = cursorRows.map((c) => ({
    streamKey: c.stream_key,
    cursorValue: c.cursor_value,
    itemsIngested: Number(c.items_ingested || 0),
    lastCrawledAt: c.last_crawled_at,
    lastStatus: c.last_status,
  }));

  return {
    vaultCompaniesCount: summary.vaultCompaniesCount,
    confirmedContactsCount: summary.confirmedContactsCount,
    confirmedDomainsCount: summary.confirmedDomainsCount,
    liveFederatedCatalogTotal: summary.liveFederatedCatalogTotal,
    ...daemonMeta,
    sqliteFilePath: SQLITE_VAULT_PATH,
    registries,
    streams,
  };
}

/**
 * Mirrors the serialized user/admin/billing JSON database into SQLite
 * (`platform_auth_backup`) inside the same persistent data directory so
 * even a corrupted/truncated JSON file auto-heals on boot without losing users.
 */
export function savePlatformAuthBackupToSqlite(serializedJson: string): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO platform_auth_backup (id, payload_json, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    ).run(serializedJson, new Date().toISOString());
  } catch {
    // Non-fatal mirror write
  }
}

export function loadPlatformAuthBackupFromSqlite(): {
  payloadJson: string;
  updatedAt: string;
} | null {
  try {
    if (!fs.existsSync(SQLITE_VAULT_PATH)) return null;
    const db = getDb();
    const row = db
      .prepare(
        `SELECT payload_json, updated_at FROM platform_auth_backup WHERE id = 1`
      )
      .get() as { payload_json?: string; updated_at?: string } | undefined;
    if (!row?.payload_json) return null;
    return {
      payloadJson: row.payload_json,
      updatedAt: row.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Flushes SQLite WAL into the main database file cleanly on SIGTERM/SIGINT
 * during Coolify/Docker redeploys so no recent writes remain only in -wal.
 */
export function checkpointAndCloseVaultDb(): void {
  if (!dbInstance) return;
  try {
    dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // Ignore checkpoint errors during shutdown
  }
  try {
    dbInstance.close();
  } catch {
    // Ignore close errors during shutdown
  }
  dbInstance = null;
}

