import type {
  EmployeeRecord,
  GlobalCompaniesResponse,
  GlobalIndustryOption,
  SearchResponse,
} from '../src/types.ts';
import type { CacheEntry, EnrichedEmailPatternResult } from './types.ts';

export const CACHE_TTL_MS = 1000 * 60 * 25;
export const EMAIL_PATTERN_TTL_MS = 1000 * 60 * 60 * 6;

export const domainCache = new Map<string, CacheEntry<SearchResponse>>();
export const emailPatternCache = new Map<
  string,
  CacheEntry<EnrichedEmailPatternResult>
>();
export const slugToDomainCache = new Map<string, string>();
export const slugToWebsiteCache = new Map<
  string,
  { domain: string; websiteUrl: string }
>();
export const industryCompaniesCache = new Map<
  string,
  CacheEntry<GlobalCompaniesResponse>
>();
export const countryCompaniesCache = new Map<
  string,
  CacheEntry<GlobalCompaniesResponse>
>();
export const quickRosterCache = new Map<string, CacheEntry<EmployeeRecord[]>>();
export const mxVerificationCache = new Map<
  string,
  CacheEntry<{ mxVerified: boolean; mxProvider: string }>
>();

let cachedGlobalIndustries: CacheEntry<GlobalIndustryOption[]> | null = null;

export function getCachedGlobalIndustries(): GlobalIndustryOption[] | null {
  if (cachedGlobalIndustries && cachedGlobalIndustries.expiresAt > Date.now()) {
    return cachedGlobalIndustries.data;
  }
  return null;
}

export function setCachedGlobalIndustries(data: GlobalIndustryOption[]): void {
  cachedGlobalIndustries = {
    data,
    expiresAt: Date.now() + 1000 * 60 * 60 * 6,
  };
}
