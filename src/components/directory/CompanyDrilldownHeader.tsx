import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, ExternalLink } from 'lucide-react';
import type { GlobalCompanyItem, SearchResponse } from '../../types';
import { copyTextToClipboard } from '../../utils/offlineStorage';

interface CompanyDrilldownHeaderProps {
  company: GlobalCompanyItem;
  companyResult?: SearchResponse | null;
  onBackToCompaniesList?: () => void;
}

export const CompanyDrilldownHeader: React.FC<CompanyDrilldownHeaderProps> = ({
  company,
  companyResult = null,
  onBackToCompaniesList,
}) => {
  const [copiedField, setCopiedField] = useState<'name' | 'website' | null>(
    null
  );

  const displayName = companyResult?.companyName || company.name;
  const domain =
    companyResult?.domain ||
    company.domain ||
    (company.slug ? `${company.slug}.com` : '');
  const websiteUrl =
    company.websiteUrl || (domain ? `https://${domain}` : '');
  const headquarters = companyResult?.headquarters || company.location;
  const industry = companyResult?.industry || company.industry;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        {onBackToCompaniesList && (
          <button
            type="button"
            onClick={onBackToCompaniesList}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-slate-800 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Companies List
          </button>
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {displayName}
            </span>
            <button
              type="button"
              onClick={async () => {
                const ok = await copyTextToClipboard(displayName);
                if (ok) {
                  setCopiedField('name');
                  window.setTimeout(() => setCopiedField(null), 1800);
                }
              }}
              title={`Copy "${displayName}"`}
              aria-label={`Copy ${displayName}`}
              className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer shrink-0"
            >
              {copiedField === 'name' ? (
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>

            {domain && (
              <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyTextToClipboard(websiteUrl);
                    if (ok) {
                      setCopiedField('website');
                      window.setTimeout(() => setCopiedField(null), 1800);
                    }
                  }}
                  title={`Copy ${websiteUrl}`}
                  aria-label={`Copy ${websiteUrl}`}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer shrink-0"
                >
                  {copiedField === 'website' ? (
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline underline-offset-4"
                >
                  <span>{domain}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
          </div>

          {(headquarters || industry) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {headquarters}
              {headquarters && industry ? ' · ' : ''}
              {industry}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
