import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Building2,
  Check,
  Copy,
  DollarSign,
  ExternalLink,
  Globe2,
  Loader2,
  Mail,
  MailCheck,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { GlobalCompanyItem, SearchResponse } from '../../types.ts';
import { apiFetch, safeReadJson } from '../../utils/authClient.ts';
import { copyTextToClipboard } from '../../utils/offlineStorage.ts';
import { truncateIndustry20 } from '../../utils/emailFormulas.ts';
import { CompanyLogoAvatar } from './CompanyLogoAvatar.tsx';

export type QuickViewTarget = {
  kind: 'company';
  company: GlobalCompanyItem;
};

const VALID_SINGLE_REVENUE_RE =
  /^(?:<\s*)?[\$€£]\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:trillion|billion|million|thousand|bn|mn|T|B|M|K)\b\+?$/i;

function sanitizeQuickViewRevenue(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 40) return null;
  if (/[,;]\s*$/.test(trimmed)) return null;

  const rangeParts = trimmed.split(/\s*(?:-|–|—)\s*/);
  if (rangeParts.length === 2) {
    if (
      VALID_SINGLE_REVENUE_RE.test(rangeParts[0].trim()) &&
      VALID_SINGLE_REVENUE_RE.test(rangeParts[1].trim())
    ) {
      return `${rangeParts[0].trim()} - ${rangeParts[1].trim()}`;
    }
    return null;
  }

  const currencySymbols = trimmed.match(/[\$€£]/g) || [];
  if (currencySymbols.length !== 1) return null;
  if (!VALID_SINGLE_REVENUE_RE.test(trimmed)) return null;
  return trimmed;
}

interface QuickViewModalProps {
  target: QuickViewTarget | null;
  allSnapshots?: Record<string, SearchResponse>;
  onClose: () => void;
  onOpenFullCompany?: (company: GlobalCompanyItem) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  target,
  allSnapshots = {},
  onClose,
  onOpenFullCompany,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [companyPreview, setCompanyPreview] = useState<
    (SearchResponse & { totalEmployeesCount?: number }) | null
  >(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const triggerCopy = async (id: string, text: string) => {
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1800);
    }
  };

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  const companyDomainKey = target?.company.domain || '';
  const companySlugKey = target?.company.slug || '';

  useEffect(() => {
    if (!target) {
      setCompanyPreview(null);
      setCompanyError(null);
      setIsLoadingCompany(false);
      return;
    }

    const cached =
      (companyDomainKey && allSnapshots[companyDomainKey]) ||
      Object.values(allSnapshots).find(
        (snap) =>
          (companySlugKey && snap.companySlug === companySlugKey) ||
          (companyDomainKey && snap.domain === companyDomainKey)
      ) ||
      null;

    if (cached && cached.employees.length > 0) {
      setCompanyPreview(cached);
      setCompanyError(null);
      setIsLoadingCompany(false);
      return;
    }

    let cancelled = false;
    setCompanyPreview(null);
    setCompanyError(null);
    setIsLoadingCompany(true);

    const qs = new URLSearchParams();
    if (companyDomainKey) qs.set('domain', companyDomainKey);
    if (companySlugKey) qs.set('companySlug', companySlugKey);

    void apiFetch(`/api/quickview?${qs.toString()}`)
      .then(async (res: Response) => {
        const data = await safeReadJson<
          SearchResponse & { totalEmployeesCount?: number; error?: string }
        >(res, 'Could not load company QuickView. Please try again.');
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error || 'Could not load company QuickView.');
        }
        setCompanyPreview(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCompanyError(
          err instanceof Error ? err.message : 'Unable to fetch company profile.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCompany(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, companyDomainKey, companySlugKey, allSnapshots]);

  if (!target || typeof document === 'undefined') return null;

  const comp = target.company;
  const effectiveDomain = companyPreview?.domain || comp.domain || '';
  const effectiveWebsite =
    comp.websiteUrl || (effectiveDomain ? `https://${effectiveDomain}` : '');
  const effectiveLocation =
    (companyPreview?.headquarters && companyPreview.headquarters !== 'Global'
      ? companyPreview.headquarters
      : '') ||
    companyPreview?.zoomInfoIntel?.headquarters ||
    comp.location ||
    'Global';
  const effectiveIndustry =
    companyPreview?.industry ||
    companyPreview?.zoomInfoIntel?.industry ||
    comp.industry ||
    'Business Services';
  const effectiveHeadcount =
    companyPreview?.zoomInfoIntel?.headcount ||
    companyPreview?.employeeRange ||
    comp.employeeRange ||
    '—';
  const effectiveRevenue =
    sanitizeQuickViewRevenue(companyPreview?.zoomInfoIntel?.revenue) ||
    companyPreview?.revenueRange ||
    comp.revenueRange ||
    '—';
  const effectivePattern =
    companyPreview?.emailPattern?.formulaLabel ||
    comp.detectedFormulaLabel ||
    'Auto-detecting...';
  const effectivePatternConf =
    companyPreview?.emailPattern?.patternConfidence ?? comp.patternConfidence;
  const effectiveMxProvider = companyPreview?.emailPattern?.mxProvider || '';
  const confirmedCount =
    companyPreview?.confirmedEmailsCount ?? comp.confirmedEmailCount ?? 0;
  const zoomInfo = companyPreview?.zoomInfoIntel;
  const previewEmployees = companyPreview?.employees || [];
  const indexedRosterCount =
    companyPreview?.totalEmployeesCount ?? previewEmployees.length;

  const sidebarContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Company QuickView sidebar: ${comp.name}`}
      className="fixed inset-0 z-[70] flex justify-end bg-petrol-950/50 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <aside
        className="relative w-full max-w-[460px] h-full bg-bone-50 dark:bg-petrol-950 border-l border-petrol-700/25 dark:border-petrol-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Petrol Blue Anchor Header */}
        <div className="shrink-0 px-4 py-3.5 border-b border-petrol-600/80 bg-petrol-800 text-bone-50">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 shrink-0 rounded-lg bg-bone-50 p-0.5 shadow-xs">
                <CompanyLogoAvatar name={comp.name} logoUrl={comp.logoUrl} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-lemon-300">
                    <Building2 className="h-3 w-3" />
                    <span>Company QuickView</span>
                  </span>
                  {zoomInfo?.profileUrl && (
                    <a
                      href={zoomInfo.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-petrol-700 hover:bg-petrol-600 text-[10px] font-semibold text-lemon-300 border border-lemon-400/30 transition-colors"
                    >
                      <span>ZoomInfo</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>

                <h3 className="mt-0.5 text-base font-bold text-bone-50 leading-snug truncate">
                  {companyPreview?.companyName || comp.name}
                </h3>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-bone-200/90">
                  {effectiveDomain && (
                    <span className="inline-flex items-center gap-1">
                      <a
                        href={effectiveWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-lemon-300 hover:underline inline-flex items-center gap-1"
                      >
                        <Globe2 className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[165px]">
                          {effectiveDomain}
                        </span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          void triggerCopy('qv-domain', effectiveDomain)
                        }
                        aria-label="Copy domain"
                        className="p-0.5 rounded hover:bg-petrol-700 text-bone-200 hover:text-lemon-300 cursor-pointer"
                      >
                        {copiedId === 'qv-domain' ? (
                          <Check className="h-3 w-3 text-emerald-300" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 truncate max-w-[205px]">
                    <MapPin className="h-3 w-3 shrink-0 text-bone-300" />
                    <span className="truncate" title={effectiveLocation}>
                      {effectiveLocation}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Sidebar QuickView"
              className="p-1.5 rounded-lg text-bone-200 hover:text-bone-50 hover:bg-petrol-700 cursor-pointer shrink-0 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* All-at-One-Glance Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-3.5">
          {/* 2x2 Key Firmographics & Email Intel Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl px-3 py-2.5 border border-bone-300/90 dark:border-petrol-800 bg-white dark:bg-petrol-900/60">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-bone-400">
                <Users className="h-3 w-3 text-petrol-700 dark:text-lemon-400" />
                <span>Headcount</span>
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-petrol-950 dark:text-bone-50 truncate">
                {effectiveHeadcount}
              </div>
              <div
                className="mt-0.5 text-[10px] text-slate-500 dark:text-bone-400 truncate"
                title={effectiveIndustry}
              >
                {truncateIndustry20(effectiveIndustry)}
              </div>
            </div>

            <div className="rounded-xl px-3 py-2.5 border border-bone-300/90 dark:border-petrol-800 bg-white dark:bg-petrol-900/60">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-bone-400">
                <DollarSign className="h-3 w-3 text-petrol-700 dark:text-lemon-400" />
                <span>Est. Revenue</span>
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-petrol-950 dark:text-bone-50 truncate">
                {effectiveRevenue}
              </div>
              {zoomInfo?.phone ? (
                <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono text-petrol-700 dark:text-lemon-300 truncate max-w-full">
                  <Phone className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{zoomInfo.phone}</span>
                </div>
              ) : (
                <div className="mt-0.5 text-[10px] text-slate-500 dark:text-bone-400 truncate">
                  {comp.sourceRegistry || 'Verified Directory'}
                </div>
              )}
            </div>

            <div className="rounded-xl px-3 py-2.5 border border-bone-300/90 dark:border-petrol-800 bg-white dark:bg-petrol-900/60">
              <div className="flex items-center justify-between gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-bone-400">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Mail className="h-3 w-3 text-petrol-700 dark:text-lemon-400 shrink-0" />
                  <span>Email Pattern</span>
                </span>
                {typeof effectivePatternConf === 'number' && (
                  <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                    {effectivePatternConf}%
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs font-bold font-mono leading-snug text-petrol-950 dark:text-bone-50 whitespace-normal break-words">
                {effectivePattern}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500 dark:text-bone-400 truncate">
                {effectiveMxProvider || 'DNS MX Ready'}
              </div>
            </div>

            <div className="rounded-xl px-3 py-2.5 border border-bone-300/90 dark:border-petrol-800 bg-white dark:bg-petrol-900/60">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-bone-400">
                <ShieldCheck className="h-3 w-3 text-petrol-700 dark:text-lemon-400" />
                <span>Indexed Roster</span>
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-petrol-950 dark:text-bone-50 truncate">
                {isLoadingCompany
                  ? 'Scanning...'
                  : `${indexedRosterCount.toLocaleString()} contacts`}
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
                {confirmedCount > 0
                  ? `${confirmedCount.toLocaleString()} web-confirmed emails`
                  : 'Pattern-calibrated work emails'}
              </div>
            </div>
          </div>

          {/* Company Description / ZoomInfo Summary */}
          {(companyPreview?.companyDescription || zoomInfo?.summary) && (
            <p className="text-[11px] leading-relaxed text-slate-700 dark:text-bone-200 bg-white/90 dark:bg-petrol-900/50 px-3 py-2.5 rounded-xl border border-bone-300/80 dark:border-petrol-800 line-clamp-3">
              {companyPreview?.companyDescription || zoomInfo?.summary}
            </p>
          )}

          {/* Department Breakdown At-a-Glance */}
          {companyPreview && companyPreview.departmentBreakdown.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-bone-400">
                Department Breakdown
              </div>
              <div className="flex flex-wrap gap-1.5">
                {companyPreview.departmentBreakdown.slice(0, 6).map((dept) => (
                  <span
                    key={dept.department}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-petrol-900 border border-bone-300/90 dark:border-petrol-700 text-petrol-900 dark:text-bone-200"
                  >
                    <span>{dept.department}</span>
                    <span className="font-mono tabular-nums text-[10px] font-bold text-petrol-700 dark:text-lemon-400">
                      {dept.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top Leadership Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-bone-400">
                Top Decision-Makers Preview
              </h4>
            </div>

            {isLoadingCompany ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 rounded-xl border border-bone-300/90 dark:border-petrol-800 bg-white/80 dark:bg-petrol-900/40 text-xs text-slate-600 dark:text-bone-300">
                <Loader2 className="h-5 w-5 animate-spin text-petrol-700 dark:text-lemon-400" />
                <span className="font-medium">
                  Extracting Org Chart, ZoomInfo &amp; live web emails...
                </span>
              </div>
            ) : companyError ? (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
                {companyError}
              </div>
            ) : previewEmployees.length > 0 ? (
              <div className="divide-y divide-bone-200 dark:divide-petrol-800 rounded-xl border border-bone-300/90 dark:border-petrol-800 bg-white dark:bg-petrol-900/55 overflow-hidden">
                {previewEmployees.slice(0, 8).map((emp) => (
                  <div
                    key={emp.id}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-bone-100/70 dark:hover:bg-petrol-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-petrol-950 dark:text-bone-50 truncate">
                          {emp.fullName}
                        </span>
                        {emp.emailVerifiedOnWeb && (
                          <MailCheck
                            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                            aria-label="Verified on public web"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-bone-300 truncate">
                        {emp.jobTitle}
                      </p>
                      {emp.email && (
                        <p className="mt-0.5 font-mono text-[11px] text-petrol-700 dark:text-lemon-300 break-all select-none">
                          {emp.email}
                        </p>
                      )}
                    </div>

                    {emp.email && (
                      <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold font-mono border border-bone-300 dark:border-petrol-700 bg-bone-50 dark:bg-petrol-950 text-petrol-900 dark:text-bone-100 shrink-0 select-none">
                        {emp.emailAccuracy}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-bone-300/90 dark:border-petrol-800 bg-white/80 dark:bg-petrol-900/40 text-xs text-slate-600 dark:text-bone-300">
                Click &ldquo;Open Full Roster&rdquo; below to run a deep multi-source crawl for this organization.
              </div>
            )}
          </div>
        </div>

        {/* Pinned Always-Visible Sidebar Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-bone-300 dark:border-petrol-800 bg-bone-100/95 dark:bg-petrol-900/90 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                void triggerCopy('qv-comp-web', effectiveWebsite)
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-bone-300 dark:border-petrol-700 bg-white dark:bg-petrol-950 text-petrol-900 dark:text-bone-100 hover:bg-bone-50 dark:hover:bg-petrol-800 cursor-pointer transition-colors"
            >
              {copiedId === 'qv-comp-web' ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedId === 'qv-comp-web' ? 'Copied' : 'Website'}</span>
            </button>
          </div>

          {onOpenFullCompany && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullCompany(comp);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-lemon-400 hover:bg-lemon-300 text-petrol-950 border border-lemon-500/50 shadow-xs transition-colors cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Open Full Roster</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </aside>
    </div>
  );

  return createPortal(sidebarContent, document.body);
};
