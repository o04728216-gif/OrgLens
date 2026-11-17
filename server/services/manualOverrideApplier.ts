import type {
  EmployeeRecord,
  FilterExplorerResponse,
  SearchResponse,
} from '../../src/types.ts';
import {
  applyExcelEmailFormula,
  getExcelFormulaDefinition,
} from '../../src/utils/emailFormulas.ts';
import {
  getAllCompanyManualOverrides,
  getCompanyManualOverride,
} from '../store/vpsStore.ts';
import {
  computeBreakdowns,
  computeImportanceScore,
} from '../utils/rankingAndStats.ts';

export function applyManualOverrideToSearchResponse(
  result: SearchResponse
): SearchResponse {
  const domain = (result.domain || '').trim().toLowerCase();
  if (!domain) return result;

  const override = getCompanyManualOverride(domain);
  if (!override) return result;

  if (override.blocked) {
    return {
      ...result,
      employees: [],
      departmentBreakdown: [],
      seniorityBreakdown: [],
    };
  }

  const companyName = override.companyName?.trim() || result.companyName;
  const industry = override.industry?.trim() || result.industry;
  const headquarters = override.headquarters?.trim() || result.headquarters;
  const employeeRange = override.employeeRange?.trim() || result.employeeRange;
  const revenueRange = override.revenueRange?.trim() || result.revenueRange;

  let emailPattern = { ...result.emailPattern };
  const forcedId =
    override.forcedFormulaId && override.forcedFormulaId !== 'auto'
      ? override.forcedFormulaId
      : null;

  if (forcedId) {
    const def = getExcelFormulaDefinition(forcedId);
    emailPattern = {
      ...emailPattern,
      detectedFormulaId: forcedId,
      formulaLabel: def.label,
      excelFormula: def.excelFormulaTemplate(domain),
      patternConfidence: override.forcedConfidence || 97,
      detectionBasis: 'Administrator Pinned Format Override',
    };
  } else if (override.forcedConfidence) {
    emailPattern = {
      ...emailPattern,
      patternConfidence: override.forcedConfidence,
    };
  }

  const blockedEmailSet = new Set(
    (override.blockedEmails || []).map((e) => e.toLowerCase())
  );

  let updatedEmployees: EmployeeRecord[] = result.employees
    .map((emp) => {
      let nextEmail = emp.email;
      let nextFormulaId = emp.emailFormulaId;
      let nextFormulaLabel = emp.emailFormulaLabel;
      let nextAcc = emp.emailAccuracy;

      if (forcedId && !emp.emailVerifiedOnWeb) {
        nextEmail = applyExcelEmailFormula(emp.fullName, domain, forcedId);
        nextFormulaId = forcedId;
        nextFormulaLabel = emailPattern.formulaLabel;
        nextAcc = emailPattern.patternConfidence;
      }

      return {
        ...emp,
        companyName,
        industry,
        email: nextEmail,
        emailFormulaId: nextFormulaId,
        emailFormulaLabel: nextFormulaLabel,
        emailAccuracy: nextAcc,
      };
    })
    .filter((emp) => !blockedEmailSet.has(emp.email.toLowerCase()));

  if (Array.isArray(override.addedContacts) && override.addedContacts.length > 0) {
    const existingEmails = new Set(
      updatedEmployees.map((e) => e.email.toLowerCase())
    );
    for (const custom of override.addedContacts) {
      const cleanEmail = custom.email.trim().toLowerCase();
      if (!cleanEmail || existingEmails.has(cleanEmail)) continue;
      if (blockedEmailSet.has(cleanEmail)) continue;
      existingEmails.add(cleanEmail);

      updatedEmployees.push({
        id: `manual-${domain}-${custom.id}`,
        rank: 0,
        importanceScore: computeImportanceScore(custom.jobTitle, 1, 5),
        fullName: custom.fullName,
        companyName,
        email: cleanEmail,
        emailAccuracy: custom.emailAccuracy || 99,
        emailFormulaId: emailPattern.detectedFormulaId,
        emailFormulaLabel: 'Admin Verified',
        emailVerifiedOnWeb: true,
        jobTitle: custom.jobTitle,
        industry,
        department: custom.department,
        seniority: custom.seniority,
        profileUrl: `https://${domain}`,
        domain,
        source: 'Public Web Verified',
      });
    }
  }

  updatedEmployees.sort((a, b) => {
    if (a.importanceScore !== b.importanceScore) {
      return a.importanceScore - b.importanceScore;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  updatedEmployees = updatedEmployees.map((emp, idx) => ({
    ...emp,
    rank: idx + 1,
  }));

  const { departmentBreakdown, seniorityBreakdown } =
    computeBreakdowns(updatedEmployees);

  return {
    ...result,
    companyName,
    industry,
    industryTags: override.industry?.trim()
      ? [override.industry.trim()]
      : result.industryTags,
    headquarters,
    employeeRange,
    revenueRange,
    emailPattern,
    employees: updatedEmployees,
    departmentBreakdown,
    seniorityBreakdown,
  };
}

export function applyOverridesAndZeroCoinMaskToFilterExplorer(
  payload: FilterExplorerResponse,
  maskEmailsForZeroCoins: boolean,
  unlockedCompanies: string[]
): FilterExplorerResponse {
  const allOverrides = getAllCompanyManualOverrides();
  const blockedDomains = new Set(
    allOverrides.filter((o) => o.blocked).map((o) => o.domain.toLowerCase())
  );
  const blockedEmails = new Set(
    allOverrides.flatMap((o) => o.blockedEmails.map((e) => e.toLowerCase()))
  );

  const filteredCompanies = payload.companies.filter((c) => {
    const dom = (c.domain || '').toLowerCase();
    return !dom || !blockedDomains.has(dom);
  });

  const unlockedSet = new Set(unlockedCompanies.map((k) => k.toLowerCase()));

  const filteredEmployees = payload.employees
    .filter((e) => {
      const dom = (e.domain || '').toLowerCase();
      if (dom && blockedDomains.has(dom)) return false;
      if (blockedEmails.has(e.email.toLowerCase())) return false;
      return true;
    })
    .map((emp, idx) => {
      if (!maskEmailsForZeroCoins) {
        return { ...emp, rank: idx + 1 };
      }
      const domKey = (emp.domain || '').toLowerCase();
      if (domKey && unlockedSet.has(domKey)) {
        return { ...emp, rank: idx + 1 };
      }
      const [local, host] = emp.email.split('@');
      const maskedLocal =
        local && local.length > 2
          ? `${local.slice(0, 2)}${'*'.repeat(Math.min(6, local.length - 2))}`
          : '***';
      return {
        ...emp,
        rank: idx + 1,
        email: host ? `${maskedLocal}@${host}` : `${maskedLocal}@locked`,
      };
    });

  return {
    ...payload,
    companies: filteredCompanies,
    employees: filteredEmployees,
    emailsMaskedForZeroCoins: maskEmailsForZeroCoins,
  };
}
