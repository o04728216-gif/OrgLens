import type {
  EmployeeRecord,
  SeniorityLevel,
  SeniorityStat,
} from '../types';

export const ORDERED_SENIORITY_TIERS: SeniorityLevel[] = [
  'Executive',
  'Director / VP',
  'Lead / Senior',
  'Individual Contributor',
];

/**
 * Computes exact counts and Largest-Remainder percentages across the 4 authority tiers
 * so percentages strictly sum to 100% and non-zero tiers always display at least 1%.
 */
export function computeExactSeniorityStats(
  employees: EmployeeRecord[]
): SeniorityStat[] {
  const countsMap = new Map<SeniorityLevel, number>(
    ORDERED_SENIORITY_TIERS.map((tier) => [tier, 0])
  );
  for (const emp of employees) {
    countsMap.set(emp.seniority, (countsMap.get(emp.seniority) || 0) + 1);
  }

  const counts = ORDERED_SENIORITY_TIERS.map(
    (tier) => countsMap.get(tier) || 0
  );
  const total = counts.reduce((acc, c) => acc + c, 0);

  if (total <= 0) {
    return ORDERED_SENIORITY_TIERS.map((seniority) => ({
      seniority,
      count: 0,
      percentage: 0,
    }));
  }

  const exactQuotas = counts.map((c) => (c / total) * 100);
  const floors = exactQuotas.map((q) => Math.floor(q));
  let remainderUnits = 100 - floors.reduce((acc, f) => acc + f, 0);

  const rankedIndices = exactQuotas
    .map((q, idx) => ({
      idx,
      rem: q - floors[idx],
      count: counts[idx],
    }))
    .sort((a, b) => {
      if (b.rem !== a.rem) return b.rem - a.rem;
      return b.count - a.count;
    });

  for (let i = 0; i < rankedIndices.length && remainderUnits > 0; i++) {
    if (rankedIndices[i].count > 0) {
      floors[rankedIndices[i].idx] += 1;
      remainderUnits -= 1;
    }
  }

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0 && floors[i] === 0) {
      let donorIdx = -1;
      for (let j = 0; j < floors.length; j++) {
        if (floors[j] > 1 && (donorIdx === -1 || floors[j] > floors[donorIdx])) {
          donorIdx = j;
        }
      }
      if (donorIdx !== -1) {
        floors[donorIdx] -= 1;
        floors[i] = 1;
      }
    }
  }

  return ORDERED_SENIORITY_TIERS.map((seniority, idx) => ({
    seniority,
    count: counts[idx],
    percentage: floors[idx],
  }));
}
