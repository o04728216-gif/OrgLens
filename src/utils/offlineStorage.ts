import type { SearchResponse, SyncQueueItem, WidgetConfig } from '../types';
import {
  applyExcelEmailFormula,
  splitFullNameForExcel,
  type EmailFormulaId,
} from './emailFormulas';

const SNAPSHOTS_KEY = 'orglens_snapshots_v5';
const QUEUE_KEY = 'orglens_sync_queue_v4';
const WIDGETS_KEY = 'orglens_widgets_v3';
const THEME_KEY = 'orglens_theme_v1';

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: 'saved-domains',
    title: 'Cached Domain Snapshots',
    subtitle: 'Offline-ready company directories stored locally',
    visible: true,
  },
  {
    id: 'sync-queue',
    title: 'Offline Queue & Auto-Sync',
    subtitle: 'Pending domain lookups synchronized automatically on reconnect',
    visible: true,
  },
  {
    id: 'analytics-charts',
    title: 'Workforce Distribution Charts',
    subtitle: 'Department and seniority breakdown across organizations',
    visible: true,
  },
];

export function loadSnapshots(): Record<string, SearchResponse> {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SearchResponse>;
    const valid: Record<string, SearchResponse> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (
        val &&
        Array.isArray(val.employees) &&
        val.employees.length > 0 &&
        val.emailPattern
      ) {
        valid[key] = val;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

export function saveSnapshots(snapshots: Record<string, SearchResponse>): void {
  try {
    // Keep up to 8 snapshots in localStorage to respect browser 5MB quota on 3,000+ employee rosters
    const entries = Object.entries(snapshots).sort(
      ([, a], [, b]) =>
        new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime()
    );
    const trimmed = Object.fromEntries(entries.slice(0, 8));
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SyncQueueItem[];
  } catch {
    return [];
  }
}

export function saveSyncQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadWidgetConfigs(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(raw) as WidgetConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WIDGETS;
    const map = new Map(parsed.map((w) => [w.id, w]));
    const merged: WidgetConfig[] = [];
    for (const item of parsed) {
      const def = DEFAULT_WIDGETS.find((d) => d.id === item.id);
      if (def) {
        merged.push({ ...def, visible: item.visible });
      }
    }
    for (const def of DEFAULT_WIDGETS) {
      if (!map.has(def.id)) {
        merged.push(def);
      }
    }
    return merged;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

export function saveWidgetConfigs(widgets: WidgetConfig[]): void {
  try {
    localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedTheme(): 'dark' | 'light' {
  try {
    const val = localStorage.getItem(THEME_KEY);
    if (val === 'light' || val === 'dark') return val;
  } catch {
    // Default dark
  }
  return 'dark';
}

export function saveTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted iframe contexts
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function exportEmployeesToCsv(
  employees: SearchResponse['employees'],
  filenamePrefix = 'orglens-contacts',
  formulaOverride: EmailFormulaId | 'auto' = 'auto',
  detectedFormulaId?: EmailFormulaId
): void {
  const headers = [
    'Rank',
    'Full Name',
    'First Name',
    'Last Name',
    'Email Address',
    'Job Title',
    'Accuracy (%)',
    'Company',
    'Domain',
    'Industry',
    'Department',
    'Seniority',
    'Profile URL',
  ];
  const escapeCsv = (val: string | number) =>
    `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = employees.map((emp, index) => {
    const { firstName, lastName } = splitFullNameForExcel(emp.fullName);
    const resolvedEmail =
      formulaOverride === 'auto'
        ? emp.email
        : applyExcelEmailFormula(emp.fullName, emp.domain, formulaOverride);
    const resolvedAccuracy =
      formulaOverride === 'auto' ||
      (detectedFormulaId && formulaOverride === detectedFormulaId)
        ? emp.emailAccuracy
        : Math.max(62, emp.emailAccuracy - 6);

    return [
      emp.rank || index + 1,
      emp.fullName,
      firstName,
      lastName,
      resolvedEmail,
      emp.jobTitle,
      `${resolvedAccuracy}%`,
      emp.companyName || emp.domain,
      emp.domain,
      emp.industry,
      emp.department,
      emp.seniority,
      emp.profileUrl,
    ]
      .map(escapeCsv)
      .join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safePrefix = filenamePrefix
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  link.setAttribute('download', `${safePrefix || 'contacts'}-emails.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
