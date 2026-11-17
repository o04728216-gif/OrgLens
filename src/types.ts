import type { EmailFormulaId } from './utils/emailFormulas.ts';
import type { SearchCoinMeta } from './types/platformTypes.ts';

export type DepartmentCategory =
  | 'Leadership'
  | 'Engineering'
  | 'Product & Design'
  | 'Research & Data'
  | 'Sales & GTM'
  | 'Operations & Finance'
  | 'General';

export type SeniorityLevel =
  | 'Executive'
  | 'Director / VP'
  | 'Lead / Senior'
  | 'Individual Contributor';

export type DiscoverySource =
  | 'Org Chart'
  | 'LinkedIn Index'
  | 'Company Site'
  | 'Public Web Verified';

export interface EmailPatternAnalysis {
  detectedFormulaId: EmailFormulaId;
  formulaLabel: string;
  excelFormula: string;
  patternConfidence: number;
  mxVerified: boolean;
  mxProvider: string;
  detectionBasis: string;
  sampleObservedEmails: string[];
}

export interface EmployeeRecord {
  id: string;
  rank: number;
  importanceScore: number;
  fullName: string;
  companyName?: string;
  email: string;
  emailAccuracy: number;
  emailFormulaId?: EmailFormulaId;
  emailFormulaLabel?: string;
  emailVerifiedOnWeb?: boolean;
  jobTitle: string;
  industry: string;
  department: DepartmentCategory;
  seniority: SeniorityLevel;
  profileUrl: string;
  domain: string;
  source: DiscoverySource;
}

export interface DepartmentStat {
  department: DepartmentCategory;
  count: number;
  percentage: number;
}

export interface SeniorityStat {
  seniority: SeniorityLevel;
  count: number;
  percentage: number;
}

export interface SearchResponse {
  domain: string;
  companyName: string;
  companySlug?: string;
  industry: string;
  industryTags: string[];
  companyDescription: string;
  headquarters: string;
  employeeRange?: string;
  revenueRange?: string;
  emailPattern: EmailPatternAnalysis;
  sourcesUsed: DiscoverySource[];
  fetchedAt: string;
  durationMs: number;
  cached: boolean;
  employees: EmployeeRecord[];
  departmentBreakdown: DepartmentStat[];
  seniorityBreakdown: SeniorityStat[];
  coinMeta?: SearchCoinMeta;
}

export interface GlobalIndustryOption {
  slug: string;
  rawTitle: string;
  fullTitle: string;
  companyCount: number;
}

export interface GlobalCompanyItem {
  id: string;
  slug: string;
  name: string;
  domain?: string;
  websiteUrl?: string;
  logoUrl: string | null;
  location: string;
  industry: string;
  employeeRange: string;
  revenueRange: string;
  detectedFormulaId?: EmailFormulaId;
  detectedFormulaLabel?: string;
  patternConfidence?: number;
  sourceCountrySlug?: string;
  sourceIndustrySlugs?: string[];
}

export interface GlobalCompaniesResponse {
  industrySlug: string;
  industryFullTitle: string;
  page: number;
  perPage: number;
  totalCompanies: number;
  totalPages: number;
  companies: GlobalCompanyItem[];
}

export interface FilterExplorerResponse {
  scopeTitle: string;
  totalMatchedCompanies: number;
  totalMatchedContacts: number;
  sampledCompaniesCount: number;
  page: number;
  totalPages: number;
  companies: GlobalCompanyItem[];
  employees: EmployeeRecord[];
  departmentBreakdown: DepartmentStat[];
  seniorityBreakdown: SeniorityStat[];
  fetchedAt: string;
  emailsMaskedForZeroCoins?: boolean;
}

export interface SidebarFiltersState {
  contactSearch: string;
  roleKeyword: string;
  seniorities: SeniorityLevel[];
  departments: DepartmentCategory[];
  minAccuracy: number;
  maxAccuracy: number;
  emailFormulaOverride: EmailFormulaId | 'auto';
  companyNameFilter: string;
  selectedIndustrySlugs: string[];
  industryMatchMode: 'any' | 'primary';
  industryKeyword: string;
  employeeRanges: string[];
  revenueRanges: string[];
  selectedContinents: string[];
  selectedCountries: string[];
  locationQuery: string;
}

export interface SyncQueueItem {
  id: string;
  domain: string;
  queuedAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  errorMessage?: string;
}

export type SessionMode = 'domain' | 'filter';

export type PrimaryTab = 'full-names-emails' | 'command-hierarchy' | 'industry';

export type WidgetId =
  | 'saved-domains'
  | 'sync-queue'
  | 'analytics-charts';

export interface WidgetConfig {
  id: WidgetId;
  title: string;
  subtitle: string;
  visible: boolean;
}

export type * from './types/platformTypes.ts';

