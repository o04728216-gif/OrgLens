import type {
  DepartmentCategory,
  SeniorityLevel,
  SidebarFiltersState,
} from '../../types';
import { CONTINENTS_CATALOG } from '../../utils/geographyAndRevenue';

export const SENIORITY_OPTIONS: SeniorityLevel[] = [
  'Executive',
  'Director / VP',
  'Lead / Senior',
  'Individual Contributor',
];

export const DEPARTMENT_OPTIONS: DepartmentCategory[] = [
  'Leadership',
  'Engineering',
  'Product & Design',
  'Research & Data',
  'Sales & GTM',
  'Operations & Finance',
  'General',
];

export const EMPLOYEE_RANGE_OPTIONS = [
  '1 - 50',
  '51 - 200',
  '201 - 500',
  '501 - 1,000',
  '1,001 - 5,000',
  '5,001 - 10,000',
  '10,000+',
];

export type AccordionSectionId =
  | 'contact-name'
  | 'current-role'
  | 'accuracy-score'
  | 'company-name'
  | 'industry'
  | 'employee-count'
  | 'company-revenue'
  | 'locations';

export const INITIAL_SIDEBAR_FILTERS: SidebarFiltersState = {
  contactSearch: '',
  roleKeyword: '',
  seniorities: [],
  departments: [],
  minAccuracy: 50,
  maxAccuracy: 99,
  emailFormulaOverride: 'auto',
  companyNameFilter: '',
  selectedIndustrySlugs: [],
  industryMatchMode: 'any',
  industryKeyword: '',
  employeeRanges: [],
  revenueRanges: [],
  selectedContinents: [],
  selectedCountries: [],
  locationQuery: '',
};

export function countEnteredTerms(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function getSidebarSectionSelectedCounts(
  f: SidebarFiltersState
): Record<AccordionSectionId, number> {
  const selectedCountriesSet = new Set(f.selectedCountries);
  for (const contName of f.selectedContinents) {
    const cont = CONTINENTS_CATALOG.find((c) => c.name === contName);
    if (cont) {
      for (const ctry of cont.countries) {
        selectedCountriesSet.add(ctry.name);
      }
    }
  }

  return {
    'contact-name': countEnteredTerms(f.contactSearch),
    'current-role':
      countEnteredTerms(f.roleKeyword) +
      f.seniorities.length +
      f.departments.length,
    'accuracy-score': f.minAccuracy > 50 || f.maxAccuracy < 99 ? 1 : 0,
    'company-name': countEnteredTerms(f.companyNameFilter),
    industry:
      f.selectedIndustrySlugs.length + countEnteredTerms(f.industryKeyword),
    'employee-count': f.employeeRanges.length,
    'company-revenue': f.revenueRanges.length,
    locations: selectedCountriesSet.size + countEnteredTerms(f.locationQuery),
  };
}

export function countActiveSidebarFilters(f: SidebarFiltersState): number {
  const counts = getSidebarSectionSelectedCounts(f);
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
