import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  MailCheck,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import type { GlobalCompanyItem, SearchResponse } from '../../types.ts';
import { apiFetch } from '../../utils/authClient.ts';
import { copyTextToClipboard } from '../../utils/offlineStorage.ts';
import { truncateIndustry20 } from '../../utils/emailFormulas.ts';

export type QuickViewTarget = {
  kind: 'company';
  company: GlobalCompanyItem;
};

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
  const [companyPreview, setCompanyPreview] = useState<SearchResponse | null>(
    null
  );
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
    qs.set('source', 'filter');

    void apiFetch(`/api/search?${qs.toString()}`)
      .then(async (res: Response) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error || 'Could not load quick company preview.');
        }
        setCompanyPreview(data as SearchResponse);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCompanyError(
          err instanceof Error ? err.message : 'Unable to fetch contacts preview.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCompany(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, companyDomainKey, companySlugKey, allSnapshots]);

  if (!target) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Company quick view: ${target.company.name}`}
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg h-full bg-bone-50 dark:bg-petrol-950 border-l border-bone-300 dark:border-petrol-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Right-Side Drawer Header — Petrol Blue Anchor */}
        <div className="shrink-0 px-4 py-3.5 border-b border-petrol-600/80 flex items-start justify-between gap-2.5 bg-petrol-700 text-bone-50">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-lemon-300">
              <Building2 className="h-3.5 w-3.5" />
              <span>Company QuickView</span>
            </div>
            <h3 className="mt-0.5 text-base font-bold text-bone-50 truncate">
              {target.company.name}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-bone-200/85">
              {target.company.domain && (
                <a
                  href={
                    target.company.websiteUrl ||
                    `https://${target.company.domain}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-lemon-300 hover:underline inline-flex items-center gap-1"
                >
                  <Globe2 className="h-3 w-3" />
                  <span>{target.company.domain}</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {target.company.location && (
                <span className="inline-flex items-center gap-1 truncate max-w-[220px]">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{target.company.location}</span>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close QuickView"
            className="p-1.5 rounded-lg text-bone-200 hover:text-bone-50 hover:bg-petrol-600 cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scroll-Free Compact Drawer Body (Footer Pinned Always Visible Below) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg px-2.5 py-2 border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Headcount
              </div>
              <div className="mt-0.5 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                {target.company.employeeRange || '—'}
              </div>
            </div>
            <div className="rounded-lg px-2.5 py-2 border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Est. Revenue
              </div>
              <div className="mt-0.5 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                {target.company.revenueRange || '—'}
              </div>
            </div>
            <div className="rounded-lg px-2.5 py-2 border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Industry
              </div>
              <div
                className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white truncate"
                title={target.company.industry}
              >
                {truncateIndustry20(target.company.industry || 'Global B2B')}
              </div>
            </div>
          </div>

          {companyPreview?.companyDescription && (
            <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-900/40 px-2.5 py-2 rounded-lg border border-slate-200/70 dark:border-slate-800/70 line-clamp-2">
              {companyPreview.companyDescription}
            </p>
          )}

          {/* Leadership & Work Emails Snapshot */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Key Leadership &amp; Work Emails
              </h4>
              {companyPreview && (
                <span className="text-[11px] font-mono tabular-nums text-sky-600 dark:text-sky-400 font-semibold">
                  {companyPreview.employees.length.toLocaleString()} indexed
                </span>
              )}
            </div>

            {isLoadingCompany ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                <span>Scanning team roster &amp; live web emails...</span>
              </div>
            ) : companyError ? (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
                {companyError}
              </div>
            ) : companyPreview && companyPreview.employees.length > 0 ? (
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/45 overflow-hidden">
                {companyPreview.employees.slice(0, 6).map((emp) => {
                  const rowCopied = copiedId === `qv-emp:${emp.id}`;
                  return (
                    <div
                      key={emp.id}
                      className="px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                            {emp.fullName}
                          </span>
                          {emp.emailVerifiedOnWeb && (
                            <MailCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            · {emp.jobTitle}
                          </span>
                        </div>
                        {emp.email && (
                          <p className="font-mono text-[11px] text-sky-700 dark:text-sky-300 break-all">
                            {emp.email}
                          </p>
                        )}
                      </div>

                      {emp.email && (
                        <button
                          type="button"
                          onClick={() =>
                            void triggerCopy(`qv-emp:${emp.id}`, emp.email)
                          }
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                            rowCopied
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-500/50'
                          }`}
                        >
                          {rowCopied ? 'Copied' : `${emp.emailAccuracy}% Copy`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                Click &ldquo;Open Full Roster&rdquo; below to run a live web crawl for this organization.
              </div>
            )}
          </div>
        </div>

        {/* Pinned Always-Visible Right-Side Drawer Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/75 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              void triggerCopy(
                'qv-comp-web',
                target.company.websiteUrl ||
                  `https://${target.company.domain}`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            {copiedId === 'qv-comp-web' ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>
              {copiedId === 'qv-comp-web' ? 'Copied' : 'Copy Website'}
            </span>
          </button>

          {onOpenFullCompany && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullCompany(target.company);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-lemon-400 hover:bg-lemon-300 text-petrol-950 border border-lemon-500/40 shadow-xs transition-colors cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Open Full Roster</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
