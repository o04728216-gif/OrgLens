import type {
  DepartmentCategory,
  DepartmentStat,
  EmployeeRecord,
  SeniorityLevel,
  SeniorityStat,
} from '../../src/types.ts';

export function computeImportanceScore(
  jobTitle: string,
  orgDepth = 4,
  reportCount = 0
): number {
  const t = jobTitle.toLowerCase();
  const isIcPartner =
    /\b(hr|people|talent|recruiting|client|channel|solutions|technology|strategic|alliance|community|mobility)\s+(mobility\s+)?(business\s+)?partner\b/i.test(
      t
    );

  let base = 84;

  if (/\b(intern|internship|trainee|apprentice)\b/.test(t)) {
    base = 95;
  } else if (
    /\b(executive assistant|personal assistant|administrative assistant|assistant to|ea to|pa to|assistant|coordinator|receptionist)\b/.test(
      t
    )
  ) {
    base = 90;
  } else if (
    /\b(office of the|chief of staff|advisor to|counsel to|liaison to|special advisor)\b/.test(
      t
    )
  ) {
    base = 46;
  } else if (
    /\b(ceo|chief executive|co-ceo|founder\s*&\s*ceo|started\s*&\s*runs|chairman\s*&\s*ceo|managing partner)\b/.test(
      t
    )
  ) {
    base = 8;
  } else if (
    /\b(co-founder|cofounder|founder|president|executive chairman|chairperson|chair of the board)\b/.test(
      t
    ) &&
    !/\bvice president\b/.test(t)
  ) {
    base = 13;
  } else if (
    /\b(coo|cfo|cto|chief operating|chief financial|chief technology)\b/.test(t)
  ) {
    base = 17;
  } else if (
    /\b(cmo|cpo|cro|ciso|chro|clo|cao|cdo|chief\s+[a-z\s]+\s+officer|general counsel|board member|member of the board)\b/.test(
      t
    )
  ) {
    base = 21;
  } else if (/\b(evp|executive vice president)\b/.test(t)) {
    base = 29;
  } else if (
    /\b(svp|senior vice president|managing director|general manager)\b/.test(
      t
    ) ||
    (!isIcPartner &&
      /\b(general partner|senior partner|founding partner)\b/.test(t))
  ) {
    base = 33;
  } else if (
    /\b(vp|vice president)\b/.test(t) &&
    !/\b(avp|assistant vice president|associate vice president)\b/.test(t)
  ) {
    base = 38;
  } else if (!isIcPartner && /\bpartner\b/.test(t)) {
    base = 41;
  } else if (/\b(global head|head of)\b/.test(t)) {
    base = 44;
  } else if (
    /\b(senior director|sr\.?\s*director|executive director|avp|associate vice president)\b/.test(
      t
    )
  ) {
    base = 48;
  } else if (
    /\bdirector\b/.test(t) &&
    !/\b(associate director|assistant director|deputy director)\b/.test(t)
  ) {
    base = 52;
  } else if (
    /\b(associate director|deputy director|assistant director)\b/.test(t)
  ) {
    base = 56;
  } else if (/\b(distinguished|fellow)\b/.test(t) && !/\bintern\b/.test(t)) {
    base = 59;
  } else if (/\b(principal|staff)\b/.test(t) && !/\bchief of staff\b/.test(t)) {
    base = 63;
  } else if (
    /\b(senior manager|sr\.?\s*manager|group product manager|group manager|engineering manager|senior engineering manager)\b/.test(
      t
    )
  ) {
    base = 67;
  } else if (/\b(manager|team lead|tech lead|technical lead|lead)\b/.test(t)) {
    base = 72;
  } else if (/\b(senior|sr\.?)\b/.test(t)) {
    base = 78;
  } else if (/\b(junior|jr\.?|sdr|bdr|representative)\b/.test(t)) {
    base = 91;
  } else if (/\bassociate\b/.test(t)) {
    base = 88;
  } else if (t === 'team member' || t.startsWith('member of ')) {
    base = 96;
  }

  const reportBonus = Math.min(3.5, Math.log2(reportCount + 1) * 0.65);
  const depthPenalty = Math.min(2.5, Math.max(0, orgDepth) * 0.35);

  return Number((base - reportBonus + depthPenalty).toFixed(3));
}

export function classifyDepartment(
  roleText: string,
  teamHint = ''
): DepartmentCategory {
  const text = `${teamHint} ${roleText}`.toLowerCase();
  if (
    /\b(ceo|chief executive|founder|co-founder|president|chairman|managing director|general manager|board member|executive leadership)\b/.test(
      text
    ) &&
    !/\bvice president\b/.test(text)
  ) {
    return 'Leadership';
  }
  if (
    /\b(data scien|machine learning|ai |artificial intelligence|research|analytics|biostat|quant|economist|nlp|computer vision)\b/.test(
      text
    )
  ) {
    return 'Research & Data';
  }
  if (
    /\b(engineer|engineering|developer|software|cto|sre|devops|architect|infrastructure|security|ciso|backend|frontend|fullstack|full-stack|ios|android|platform|systems|qa|quality assurance|technical|firmware|hardware|cloud)\b/.test(
      text
    )
  ) {
    return 'Engineering';
  }
  if (
    /\b(product|design|designer|ux|ui|creative|brand|cpo|user experience)\b/.test(
      text
    )
  ) {
    return 'Product & Design';
  }
  if (
    /\b(sales|account executive|marketing|cmo|growth|partnership|business development|gtm|go-to-market|customer|client|commercial|revenue|cro|communications|public relations|community|demand)\b/.test(
      text
    )
  ) {
    return 'Sales & GTM';
  }
  if (
    /\b(operations|coo|finance|cfo|legal|counsel|recruiter|recruiting|talent|people|hr|human resources|compliance|accounting|controller|treasury|strategy|chief of staff|policy|procurement|supply chain|workplace|admin)\b/.test(
      text
    )
  ) {
    return 'Operations & Finance';
  }
  return 'General';
}

export function classifySeniority(roleText: string): SeniorityLevel {
  const text = roleText.toLowerCase();
  if (
    /\b(ceo|cto|cfo|coo|cmo|cpo|cro|ciso|chief|founder|co-founder|president|chairman|managing partner)\b/.test(
      text
    ) &&
    !/\bvice president\b/.test(text) &&
    !/\b(assistant|coordinator|advisor to|chief of staff|office of the|liaison to)\b/.test(
      text
    )
  ) {
    return 'Executive';
  }
  if (
    /\b(vp|vice president|svp|evp|director|head of|general manager|chief of staff)\b/.test(
      text
    ) &&
    !/\b(assistant|coordinator)\b/.test(text)
  ) {
    return 'Director / VP';
  }
  if (
    /\b(lead|principal|staff|distinguished|fellow|senior|sr\.?|manager|architect|advisor)\b/.test(
      text
    )
  ) {
    return 'Lead / Senior';
  }
  return 'Individual Contributor';
}

export function inferIndustryFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  const rules: Array<[string, RegExp]> = [
    [
      'Financial Technology & Banking Services',
      /\b(fintech|payment|banking|financial|stripe|billing|treasury|lending|credit|card|remittance|neobank|wealth|payroll)\b/,
    ],
    [
      'Software Development Tools & Cloud Infrastructure',
      /\b(developer|devops|cloud|api|kubernetes|serverless|hosting|deployment|observability|monitoring|sdk|open-source|git|infrastructure)\b/,
    ],
    [
      'Electronic Commerce & Retail Trade',
      /\b(ecommerce|e-commerce|retail|storefront|shopping|merchants|marketplace|apparel|fashion|consumer goods|checkout|supermarket)\b/,
    ],
    [
      'Artificial Intelligence & Data Analytics',
      /\b(artificial intelligence|machine learning|llm|generative ai|data platform|data warehouse|analytics|neural)\b/,
    ],
    [
      'Cybersecurity & Enterprise Identity Protection',
      /\b(cybersecurity|security|zero trust|authentication|identity|threat|encryption|compliance|firewall)\b/,
    ],
    [
      'Healthcare Services, Pharmaceuticals & Life Sciences',
      /\b(healthcare|medical|clinical|biotech|pharma|patient|telehealth|diagnostics|hospital|therapeutics)\b/,
    ],
    [
      'Food Production, Consumer Packaged Goods & Beverages',
      /\b(food|beverage|yogurt|dairy|brewery|restaurant|grocery|nutrition|culinary|organic)\b/,
    ],
    [
      'Education, Universities & Learning Platforms',
      /\b(education|learning|university|school|curriculum|student|edtech|courses|training)\b/,
    ],
    [
      'Media, Broadcasting & Digital Entertainment',
      /\b(streaming|media|entertainment|music|gaming|publishing|video|podcast|studio|news)\b/,
    ],
    [
      'Transportation, Logistics & Supply Chain Management',
      /\b(logistics|freight|shipping|supply chain|fleet|delivery|mobility|transportation|aviation|automotive)\b/,
    ],
    [
      'Commercial & Residential Real Estate',
      /\b(real estate|property|proptech|mortgage|housing|architecture|construction)\b/,
    ],
    [
      'Energy, Utilities & Clean Technology',
      /\b(solar|renewable|energy|climate|sustainability|carbon|battery|grid|clean energy|oil|gas)\b/,
    ],
    [
      'Hospitality, Hotels, Travel & Tourism',
      /\b(travel|hospitality|hotel|booking|airline|vacation|accommodation|tourism)\b/,
    ],
    [
      'Advertising, Marketing & Brand Communications',
      /\b(marketing|advertising|agency|branding|design tool|creative|social media|crm)\b/,
    ],
    [
      'Enterprise Cloud Software & Applications',
      /\b(software|saas|workflow|collaboration|project management|productivity|platform|workspace|automation)\b/,
    ],
  ];

  for (const [label, regex] of rules) {
    if (regex.test(lower)) matched.push(label);
    if (matched.length >= 2) break;
  }

  return matched.length > 0
    ? matched
    : ['Information Technology & Business Services'];
}

export function allocateLargestRemainderPercentages(counts: number[]): number[] {
  const total = counts.reduce((acc, c) => acc + c, 0);
  if (total <= 0) return counts.map(() => 0);

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

  const nonZeroCount = counts.filter((c) => c > 0).length;
  if (nonZeroCount <= 100) {
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0 && floors[i] === 0) {
        let donorIdx = -1;
        for (let j = 0; j < floors.length; j++) {
          if (
            floors[j] > 1 &&
            (donorIdx === -1 || floors[j] > floors[donorIdx])
          ) {
            donorIdx = j;
          }
        }
        if (donorIdx !== -1) {
          floors[donorIdx] -= 1;
          floors[i] = 1;
        }
      }
    }
  }

  return floors;
}

export function computeBreakdowns(employees: EmployeeRecord[]): {
  departmentBreakdown: DepartmentStat[];
  seniorityBreakdown: SeniorityStat[];
} {
  const deptCounts = new Map<DepartmentCategory, number>();
  const seniorityCounts = new Map<SeniorityLevel, number>();

  for (const emp of employees) {
    deptCounts.set(emp.department, (deptCounts.get(emp.department) || 0) + 1);
    seniorityCounts.set(
      emp.seniority,
      (seniorityCounts.get(emp.seniority) || 0) + 1
    );
  }

  const sortedDeptEntries = Array.from(deptCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const deptPct = allocateLargestRemainderPercentages(
    sortedDeptEntries.map(([, c]) => c)
  );
  const departmentBreakdown: DepartmentStat[] = sortedDeptEntries.map(
    ([department, count], idx) => ({
      department,
      count,
      percentage: deptPct[idx] ?? 0,
    })
  );

  const seniorityOrder: SeniorityLevel[] = [
    'Executive',
    'Director / VP',
    'Lead / Senior',
    'Individual Contributor',
  ];

  const senCountsArr = seniorityOrder.map(
    (level) => seniorityCounts.get(level) || 0
  );
  const senPct = allocateLargestRemainderPercentages(senCountsArr);

  const seniorityBreakdown: SeniorityStat[] = seniorityOrder.map(
    (seniority, idx) => ({
      seniority,
      count: senCountsArr[idx],
      percentage: senPct[idx] ?? 0,
    })
  );

  return { departmentBreakdown, seniorityBreakdown };
}
