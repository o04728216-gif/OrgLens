import type { DiscoverySource, EmailPatternAnalysis } from '../src/types.ts';

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface CandidateEmployee {
  id: string;
  fullName: string;
  jobTitle: string;
  teamHint?: string;
  orgDepth?: number;
  reportCount?: number;
  profileUrl: string;
  source: DiscoverySource;
  observedEmail?: string;
}

export interface WebsiteDiscoveryInfo {
  brandName: string;
  description: string;
  inferredIndustries: string[];
  linkedinCompanySlug: string | null;
  employees: CandidateEmployee[];
  rawWebsiteCorpus: string;
}

export interface TheOrgFullDiscovery {
  companyName: string;
  companySlug: string;
  resolvedDomain: string;
  industries: string[];
  description: string;
  headquarters: string;
  employeeRange: string;
  employees: CandidateEmployee[];
}

export interface GraphQLTeam {
  name: string;
  slug: string;
  memberCount: number;
  members: Array<{
    id: number | string;
    slug: string;
    fullName: string;
    role: string;
  }>;
}

export interface GraphQLOrgNode {
  id: string;
  title?: string;
  parentId?: string | null;
  reportCount?: number;
  node?: {
    position?: {
      id?: number | string;
      fullName?: string;
      role?: string;
      slug?: string;
    };
  };
}

export interface RawSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface PgpEmailHit {
  fullName: string;
  email: string;
}

export interface EnrichedEmailPatternResult {
  analysis: EmailPatternAnalysis;
  verifiedPersonEmails: Map<string, string>;
  discoveredContacts: PgpEmailHit[];
}

export interface GlobalFilterParams {
  rawSlugs: string[];
  industryMatchMode: string;
  industryKeyword: string;
  selectedContinents: string[];
  selectedCountries: string[];
  locationQuery: string;
  employeeRanges: string[];
  revenueRanges: string[];
  companyQuery: string;
  page: number;
}
