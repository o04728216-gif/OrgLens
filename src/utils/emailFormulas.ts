export type EmailFormulaId =
  | 'first_dot_last'
  | 'first_initial_last'
  | 'first_only'
  | 'first_last'
  | 'first_last_initial'
  | 'first_underscore_last'
  | 'first_initial_dot_last'
  | 'first_dot_last_initial'
  | 'last_dot_first'
  | 'last_first_initial'
  | 'first_initial_underscore_last'
  | 'first_hyphen_last'
  | 'last_initial_first'
  | 'last_initial_dot_first'
  | 'first_initial_last_initial'
  | 'last_only'
  | 'last_first'
  | 'last_underscore_first'
  | 'last_hyphen_first'
  | 'last_dot_first_initial'
  | 'last_underscore_first_initial'
  | 'last_hyphen_first_initial'
  | 'first_underscore_last_initial'
  | 'first_hyphen_last_initial'
  | 'first_initial_hyphen_last'
  | 'last_initial_underscore_first'
  | 'last_initial_hyphen_first'
  | 'first_initial_dot_last_initial'
  | 'first_initial_underscore_last_initial'
  | 'first_initial_hyphen_last_initial'
  | 'last_initial_first_initial'
  | 'last_initial_dot_first_initial'
  | 'first_middle_initial_last'
  | 'first_dot_middle_initial_dot_last';

export interface EmailFormulaDefinition {
  id: EmailFormulaId;
  label: string;
  exampleLocal: string;
  excelFormulaTemplate: (domain: string) => string;
}

export const EMAIL_FORMULAS: EmailFormulaDefinition[] = [
  // Original 16 Excel Sheet Function Styles
  {
    id: 'first_dot_last',
    label: 'First name dot last name',
    exampleLocal: 'frank.mike',
    excelFormulaTemplate: (d) => `=LOWER(A2 & "." & B2 & "@${d}")`,
  },
  {
    id: 'first_initial_last',
    label: 'First initial and last name',
    exampleLocal: 'fmike',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(A2, 1) & B2 & "@${d}")`,
  },
  {
    id: 'first_only',
    label: 'First name',
    exampleLocal: 'frank',
    excelFormulaTemplate: (d) => `=LOWER(CONCATENATE(A2, "@${d}"))`,
  },
  {
    id: 'first_last',
    label: 'First name and last name',
    exampleLocal: 'frankmike',
    excelFormulaTemplate: (d) =>
      `=IF(AND(A2<>"", B2<>""), LOWER(A2 & "" & B2 & "@${d}"), "")`,
  },
  {
    id: 'first_last_initial',
    label: 'First name and last initial',
    exampleLocal: 'frankm',
    excelFormulaTemplate: (d) => `=LOWER(A2 & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'first_underscore_last',
    label: 'First name _ last name',
    exampleLocal: 'frank_mike',
    excelFormulaTemplate: (d) =>
      `=IF(AND(A2<>"", B2<>""), LOWER(SUBSTITUTE(A2, " ", "") & "_" & SUBSTITUTE(B2, " ", "") & "@${d}"), "")`,
  },
  {
    id: 'first_initial_dot_last',
    label: 'First initial dot last name',
    exampleLocal: 'f.mike',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(A2, 1) & "." & B2 & "@${d}")`,
  },
  {
    id: 'first_dot_last_initial',
    label: 'First name dot last initial',
    exampleLocal: 'frank.m',
    excelFormulaTemplate: (d) => `=LOWER(A2 & "." & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'last_dot_first',
    label: 'Last name dot first name',
    exampleLocal: 'mike.frank',
    excelFormulaTemplate: (d) => `=LOWER(PROPER(B2) & "." & PROPER(A2) & "@${d}")`,
  },
  {
    id: 'last_first_initial',
    label: 'Last name and first initial',
    exampleLocal: 'mikef',
    excelFormulaTemplate: (d) => `=LOWER(B2 & LEFT(A2, 1) & "@${d}")`,
  },
  {
    id: 'first_initial_underscore_last',
    label: 'First initial _ last name',
    exampleLocal: 'f_mike',
    excelFormulaTemplate: (d) =>
      `=IF(AND(A2<>"", B2<>""), LOWER(LEFT(A2, 1) & "_" & B2 & "@${d}"), "")`,
  },
  {
    id: 'first_hyphen_last',
    label: 'First name - last name',
    exampleLocal: 'frank-mike',
    excelFormulaTemplate: (d) => `=LOWER(A2 & "-" & B2 & "@${d}")`,
  },
  {
    id: 'last_initial_first',
    label: 'Last initial and first name',
    exampleLocal: 'mfrank',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(B2, 1) & A2 & "@${d}")`,
  },
  {
    id: 'last_initial_dot_first',
    label: 'Last initial dot first name',
    exampleLocal: 'm.frank',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(B2, 1) & "." & A2 & "@${d}")`,
  },
  {
    id: 'first_initial_last_initial',
    label: 'First initial and last initial',
    exampleLocal: 'fm',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(A2, 1) & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'last_only',
    label: 'Last name',
    exampleLocal: 'mike',
    excelFormulaTemplate: (d) => `=LOWER(CONCATENATE(B2, "@${d}"))`,
  },

  // Additional 18 Complete Corporate Excel Sheet Email Functions
  {
    id: 'last_first',
    label: 'Last name and first name',
    exampleLocal: 'mikefrank',
    excelFormulaTemplate: (d) =>
      `=IF(AND(A2<>"", B2<>""), LOWER(B2 & A2 & "@${d}"), "")`,
  },
  {
    id: 'last_underscore_first',
    label: 'Last name _ first name',
    exampleLocal: 'mike_frank',
    excelFormulaTemplate: (d) =>
      `=IF(AND(A2<>"", B2<>""), LOWER(SUBSTITUTE(B2, " ", "") & "_" & SUBSTITUTE(A2, " ", "") & "@${d}"), "")`,
  },
  {
    id: 'last_hyphen_first',
    label: 'Last name - first name',
    exampleLocal: 'mike-frank',
    excelFormulaTemplate: (d) => `=LOWER(B2 & "-" & A2 & "@${d}")`,
  },
  {
    id: 'last_dot_first_initial',
    label: 'Last name dot first initial',
    exampleLocal: 'mike.f',
    excelFormulaTemplate: (d) => `=LOWER(B2 & "." & LEFT(A2, 1) & "@${d}")`,
  },
  {
    id: 'last_underscore_first_initial',
    label: 'Last name _ first initial',
    exampleLocal: 'mike_f',
    excelFormulaTemplate: (d) => `=LOWER(B2 & "_" & LEFT(A2, 1) & "@${d}")`,
  },
  {
    id: 'last_hyphen_first_initial',
    label: 'Last name - first initial',
    exampleLocal: 'mike-f',
    excelFormulaTemplate: (d) => `=LOWER(B2 & "-" & LEFT(A2, 1) & "@${d}")`,
  },
  {
    id: 'first_underscore_last_initial',
    label: 'First name _ last initial',
    exampleLocal: 'frank_m',
    excelFormulaTemplate: (d) => `=LOWER(A2 & "_" & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'first_hyphen_last_initial',
    label: 'First name - last initial',
    exampleLocal: 'frank-m',
    excelFormulaTemplate: (d) => `=LOWER(A2 & "-" & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'first_initial_hyphen_last',
    label: 'First initial - last name',
    exampleLocal: 'f-mike',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(A2, 1) & "-" & B2 & "@${d}")`,
  },
  {
    id: 'last_initial_underscore_first',
    label: 'Last initial _ first name',
    exampleLocal: 'm_frank',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(B2, 1) & "_" & A2 & "@${d}")`,
  },
  {
    id: 'last_initial_hyphen_first',
    label: 'Last initial - first name',
    exampleLocal: 'm-frank',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(B2, 1) & "-" & A2 & "@${d}")`,
  },
  {
    id: 'first_initial_dot_last_initial',
    label: 'First initial dot last initial',
    exampleLocal: 'f.m',
    excelFormulaTemplate: (d) =>
      `=LOWER(LEFT(A2, 1) & "." & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'first_initial_underscore_last_initial',
    label: 'First initial _ last initial',
    exampleLocal: 'f_m',
    excelFormulaTemplate: (d) =>
      `=LOWER(LEFT(A2, 1) & "_" & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'first_initial_hyphen_last_initial',
    label: 'First initial - last initial',
    exampleLocal: 'f-m',
    excelFormulaTemplate: (d) =>
      `=LOWER(LEFT(A2, 1) & "-" & LEFT(B2, 1) & "@${d}")`,
  },
  {
    id: 'last_initial_first_initial',
    label: 'Last initial and first initial',
    exampleLocal: 'mf',
    excelFormulaTemplate: (d) => `=LOWER(LEFT(B2, 1) & LEFT(A2, 1) & "@${d}")`,
  },
  {
    id: 'last_initial_dot_first_initial',
    label: 'Last initial dot first initial',
    exampleLocal: 'm.f',
    excelFormulaTemplate: (d) =>
      `=LOWER(LEFT(B2, 1) & "." & LEFT(A2, 1) & "@${d}")`,
  },
  {
    id: 'first_middle_initial_last',
    label: 'First initial, middle initial & last name',
    exampleLocal: 'fjmike',
    excelFormulaTemplate: (d) =>
      `=LOWER(LEFT(A2, 1) & LEFT(C2, 1) & B2 & "@${d}")`,
  },
  {
    id: 'first_dot_middle_initial_dot_last',
    label: 'First dot middle initial dot last name',
    exampleLocal: 'frank.j.mike',
    excelFormulaTemplate: (d) =>
      `=LOWER(A2 & IF(C2<>"", "." & LEFT(C2, 1), "") & "." & B2 & "@${d}")`,
  },
];

function stripDiacriticsAndClean(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export function splitFullNameForExcel(fullName: string): {
  firstName: string;
  middleName: string;
  lastName: string;
  hasComplexParts: boolean;
} {
  // Remove honorifics/credentials like Dr., PhD, MBA, CFA, Jr., III
  const cleaned = fullName
    .replace(/\b(dr|mr|mrs|ms|prof|phd|md|mba|cfa|cpa|esq|jr|sr|ii|iii|iv)\.?\b/gi, '')
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawParts = cleaned.split(' ').filter(Boolean);
  if (rawParts.length === 0) {
    return { firstName: '', middleName: '', lastName: '', hasComplexParts: true };
  }
  if (rawParts.length === 1) {
    return {
      firstName: stripDiacriticsAndClean(rawParts[0]),
      middleName: '',
      lastName: '',
      hasComplexParts: true,
    };
  }

  const firstName = stripDiacriticsAndClean(rawParts[0]);
  const lastName = stripDiacriticsAndClean(rawParts[rawParts.length - 1]);
  const middleName =
    rawParts.length >= 3 ? stripDiacriticsAndClean(rawParts[1]) : '';
  const hasComplexParts =
    rawParts.length > 2 ||
    fullName.includes('-') ||
    /[^\u0000-\u007f]/.test(fullName);

  return { firstName, middleName, lastName, hasComplexParts };
}

/**
 * Executes the exact Excel sheet function style for cells A2 (firstName), B2 (lastName), and C2 (middleName)
 */
export function applyExcelEmailFormula(
  fullName: string,
  domain: string,
  formulaId: EmailFormulaId
): string {
  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
  if (!cleanDomain) return '';

  const {
    firstName: a2,
    middleName: c2,
    lastName: b2,
  } = splitFullNameForExcel(fullName);
  if (!a2 && !b2) return '';

  // Single-name fallback
  if (!b2) {
    return `${a2}@${cleanDomain}`;
  }

  const leftA1 = a2.slice(0, 1);
  const leftB1 = b2.slice(0, 1);
  const leftC1 = c2.slice(0, 1);

  switch (formulaId) {
    case 'first_initial_last':
      return `${leftA1}${b2}@${cleanDomain}`;
    case 'first_last_initial':
      return `${a2}${leftB1}@${cleanDomain}`;
    case 'first_last':
      return a2 && b2 ? `${a2}${b2}@${cleanDomain}` : '';
    case 'first_initial_last_initial':
      return `${leftA1}${leftB1}@${cleanDomain}`;
    case 'first_dot_last':
      return `${a2}.${b2}@${cleanDomain}`;
    case 'last_dot_first':
      return `${b2}.${a2}@${cleanDomain}`;
    case 'first_dot_last_initial':
      return `${a2}.${leftB1}@${cleanDomain}`;
    case 'first_initial_underscore_last':
      return a2 && b2 ? `${leftA1}_${b2}@${cleanDomain}` : '';
    case 'first_initial_dot_last':
      return `${leftA1}.${b2}@${cleanDomain}`;
    case 'last_initial_first':
      return `${leftB1}${a2}@${cleanDomain}`;
    case 'last_initial_dot_first':
      return `${leftB1}.${a2}@${cleanDomain}`;
    case 'last_first_initial':
      return `${b2}${leftA1}@${cleanDomain}`;
    case 'first_only':
      return `${a2}@${cleanDomain}`;
    case 'last_only':
      return `${b2}@${cleanDomain}`;
    case 'first_underscore_last':
      return a2 && b2 ? `${a2}_${b2}@${cleanDomain}` : '';
    case 'first_hyphen_last':
      return `${a2}-${b2}@${cleanDomain}`;
    case 'last_first':
      return a2 && b2 ? `${b2}${a2}@${cleanDomain}` : '';
    case 'last_underscore_first':
      return a2 && b2 ? `${b2}_${a2}@${cleanDomain}` : '';
    case 'last_hyphen_first':
      return `${b2}-${a2}@${cleanDomain}`;
    case 'last_dot_first_initial':
      return `${b2}.${leftA1}@${cleanDomain}`;
    case 'last_underscore_first_initial':
      return `${b2}_${leftA1}@${cleanDomain}`;
    case 'last_hyphen_first_initial':
      return `${b2}-${leftA1}@${cleanDomain}`;
    case 'first_underscore_last_initial':
      return `${a2}_${leftB1}@${cleanDomain}`;
    case 'first_hyphen_last_initial':
      return `${a2}-${leftB1}@${cleanDomain}`;
    case 'first_initial_hyphen_last':
      return `${leftA1}-${b2}@${cleanDomain}`;
    case 'last_initial_underscore_first':
      return `${leftB1}_${a2}@${cleanDomain}`;
    case 'last_initial_hyphen_first':
      return `${leftB1}-${a2}@${cleanDomain}`;
    case 'first_initial_dot_last_initial':
      return `${leftA1}.${leftB1}@${cleanDomain}`;
    case 'first_initial_underscore_last_initial':
      return `${leftA1}_${leftB1}@${cleanDomain}`;
    case 'first_initial_hyphen_last_initial':
      return `${leftA1}-${leftB1}@${cleanDomain}`;
    case 'last_initial_first_initial':
      return `${leftB1}${leftA1}@${cleanDomain}`;
    case 'last_initial_dot_first_initial':
      return `${leftB1}.${leftA1}@${cleanDomain}`;
    case 'first_middle_initial_last':
      return `${leftA1}${leftC1}${b2}@${cleanDomain}`;
    case 'first_dot_middle_initial_dot_last':
      return leftC1
        ? `${a2}.${leftC1}.${b2}@${cleanDomain}`
        : `${a2}.${b2}@${cleanDomain}`;
    default:
      return `${a2}.${b2}@${cleanDomain}`;
  }
}

export function getExcelFormulaDefinition(
  formulaId: EmailFormulaId
): EmailFormulaDefinition {
  return (
    EMAIL_FORMULAS.find((f) => f.id === formulaId) || EMAIL_FORMULAS[0]
  );
}

/**
 * Expands short-form industry labels into complete, formal English industry titles.
 */
export function expandFullIndustryTitle(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return 'Information Technology & Business Services';

  const exactMap: Record<string, string> = {
    fintech: 'Financial Technology & Banking Services',
    finance: 'Financial Services & Capital Markets',
    banking: 'Banking & Financial Institutions',
    insurance: 'Insurance & Risk Management Services',
    insurtech: 'Insurance Technology & Underwriting Services',
    software: 'Computer Software & Cloud Applications',
    'developer tools': 'Software Development Tools & Infrastructure',
    saas: 'Enterprise Cloud Software & Applications',
    ai: 'Artificial Intelligence & Machine Learning',
    'artificial intelligence': 'Artificial Intelligence & Machine Learning',
    'machine learning': 'Artificial Intelligence & Machine Learning',
    it: 'Information Technology & Enterprise Systems',
    'information technology': 'Information Technology & Enterprise Systems',
    edtech: 'Education Technology & Academic Platforms',
    education: 'Education, Universities & Learning Institutions',
    healthtech: 'Healthcare Technology & Digital Medicine',
    medtech: 'Medical Devices & Clinical Technology',
    healthcare: 'Healthcare Services, Hospitals & Pharmaceuticals',
    biotech: 'Biotechnology, Pharmaceuticals & Life Sciences',
    biotechnology: 'Biotechnology, Pharmaceuticals & Life Sciences',
    pharma: 'Pharmaceutical Manufacturing & Life Sciences',
    proptech: 'Real Estate & Property Management Technology',
    'real estate': 'Commercial & Residential Real Estate',
    retail: 'Retail Trade, Department Stores & Superstores',
    ecommerce: 'Electronic Commerce & Online Marketplaces',
    'e-commerce': 'Electronic Commerce & Online Marketplaces',
    media: 'Media, Broadcasting & Digital Publishing',
    'media & internet': 'Media, Digital Publishing & Internet Platforms',
    telecom: 'Telecommunications & Network Infrastructure',
    telecommunications: 'Telecommunications & Network Infrastructure',
    transportation: 'Transportation, Logistics & Supply Chain',
    logistics: 'Logistics, Freight & Supply Chain Management',
    automotive: 'Automotive & Motor Vehicle Manufacturing',
    manufacturing: 'Industrial Equipment & Commercial Manufacturing',
    energy: 'Energy, Oil, Gas & Renewable Utilities',
    cleantech: 'Clean Energy & Sustainability Technology',
    'minerals & mining': 'Minerals, Metals & Natural Resource Mining',
    organizations: 'Membership, Civic & Non-Profit Organizations',
    nonprofit: 'Non-Profit & Philanthropic Organizations',
    hospitality: 'Hospitality, Hotels, Travel & Tourism',
    'food & beverage': 'Food Production, Consumer Packaged Goods & Beverages',
    cybersecurity: 'Cybersecurity & Enterprise Identity Protection',
    security: 'Cybersecurity & Enterprise Identity Protection',
    marketing: 'Advertising, Marketing & Brand Communications',
    advertising: 'Advertising, Marketing & Brand Communications',
    hr: 'Human Resources & Talent Management Services',
    hrtech: 'Human Resources & Workforce Software',
    legal: 'Legal Services & Corporate Law Practices',
    consulting: 'Management Consulting & Professional Advisory',
    technology: 'Information Technology & Software Engineering',
  };

  const segments = cleaned
    .split(/\s*[·,|/]\s*/)
    .map((seg) => {
      const lower = seg.trim().toLowerCase();
      if (exactMap[lower]) return exactMap[lower];
      return seg
        .replace(/\bFinTech\b/gi, 'Financial Technology')
        .replace(/\bEdTech\b/gi, 'Education Technology')
        .replace(/\bHealthTech\b/gi, 'Healthcare Technology')
        .replace(/\bBioTech\b/gi, 'Biotechnology')
        .replace(/\bPropTech\b/gi, 'Property Technology')
        .replace(/\bInsurTech\b/gi, 'Insurance Technology')
        .replace(/\bSaaS\b/gi, 'Enterprise Cloud Software')
        .replace(/\bAI\b/g, 'Artificial Intelligence')
        .replace(/\bIT\b/g, 'Information Technology')
        .replace(/\bHR\b/g, 'Human Resources')
        .replace(/\bPR\b/g, 'Public Relations')
        .replace(/\bE-Commerce\b/gi, 'Electronic Commerce')
        .trim();
    })
    .filter(Boolean);

  const deduplicated = Array.from(new Set(segments));
  return deduplicated.join(', ') || 'Information Technology & Business Services';
}

/**
 * Enforces single-line industry display capped strictly at 20 characters + "..."
 */
export function truncateIndustry20(rawTitle: string): string {
  const clean = (rawTitle || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Information Technolo...';
  if (clean.length <= 20) return clean;
  return `${clean.slice(0, 20).trimEnd()}...`;
}

