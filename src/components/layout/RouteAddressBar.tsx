import React, { useState } from 'react';
import { Check, ChevronRight, Link2 } from 'lucide-react';
import type { BreadcrumbSegment } from '../../utils/urlRouter';
import { copyTextToClipboard } from '../../utils/offlineStorage';

interface RouteAddressBarProps {
  breadcrumbs: BreadcrumbSegment[];
  currentRoutePath: string;
}

export const RouteAddressBar: React.FC<RouteAddressBarProps> = ({
  breadcrumbs,
  currentRoutePath,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyCurrentUrl = async () => {
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${currentRoutePath}`
        : currentRoutePath;
    const ok = await copyTextToClipboard(fullUrl);
    if (ok) {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <nav
      aria-label="Current page location and shareable URL"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 rounded-xl backdrop-blur-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-xs"
    >
      {/* Breadcrumb Trail */}
      <ol className="flex flex-wrap items-center gap-1.5 min-w-0 text-slate-500 dark:text-slate-400">
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${idx}`}
              className="inline-flex items-center gap-1.5 min-w-0"
            >
              {idx > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3 w-3 text-slate-400 dark:text-slate-600 shrink-0"
                />
              )}
              {crumb.onClick && !isLast ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors truncate max-w-44 cursor-pointer"
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  className={`truncate max-w-56 ${
                    isLast
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : ''
                  }`}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Live Translated URL Path + Copy Link */}
      <div className="flex items-center justify-between sm:justify-end gap-2 min-w-0 shrink-0">
        <span
          title={currentRoutePath}
          className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-64 sm:max-w-80 lg:max-w-md"
        >
          {currentRoutePath}
        </span>
        <button
          type="button"
          onClick={() => void handleCopyCurrentUrl()}
          title="Copy direct URL to this exact view"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            copiedUrl
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-950/70 text-slate-700 dark:text-slate-200 hover:border-sky-500/40 hover:text-sky-600 dark:hover:text-sky-400'
          }`}
        >
          {copiedUrl ? (
            <>
              <Check className="h-3 w-3" />
              Copied URL
            </>
          ) : (
            <>
              <Link2 className="h-3 w-3" />
              Copy Link
            </>
          )}
        </button>
      </div>
    </nav>
  );
};
