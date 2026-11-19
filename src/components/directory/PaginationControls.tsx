import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  targetPage: number;
  perPageLabel?: string;
  loadingLabel?: string;
  onSelectPage: (page: number) => void;
  onPrefetchPage?: (page: number) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  isLoading,
  targetPage,
  perPageLabel = '500/page',
  loadingLabel,
  onSelectPage,
  onPrefetchPage,
}) => {
  const visiblePageNumbers = useMemo(() => {
    const maxButtons = 9;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, currentPage - 4);
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, currentPage]);

  if (totalPages <= 1) return null;

  const activeLoadingText =
    loadingLabel || `Loading page ${targetPage.toLocaleString()}...`;

  return (
    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
        <span>
          Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()} ·{' '}
          {perPageLabel}
        </span>
        {isLoading && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/30 font-sans font-semibold text-[11px] text-sky-700 dark:text-sky-300"
          >
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>{activeLoadingText}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-center sm:justify-end gap-1.5 sm:gap-1 flex-wrap">
        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onMouseEnter={() => {
            if (currentPage > 1) onPrefetchPage?.(currentPage - 1);
          }}
          onTouchStart={() => {
            if (currentPage > 1) onPrefetchPage?.(currentPage - 1);
          }}
          onClick={() => onSelectPage(currentPage - 1)}
          aria-label="Previous page"
          className="inline-flex items-center justify-center min-h-[42px] min-w-[42px] sm:min-h-9 sm:min-w-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </button>

        {visiblePageNumbers.map((pg) => {
          const isTargetLoading = isLoading && pg === targetPage;
          const active = pg === currentPage && !isLoading;
          return (
            <button
              key={pg}
              type="button"
              disabled={isLoading && pg !== targetPage}
              onMouseEnter={() => {
                if (pg !== currentPage) onPrefetchPage?.(pg);
              }}
              onTouchStart={() => {
                if (pg !== currentPage) onPrefetchPage?.(pg);
              }}
              onClick={() => onSelectPage(pg)}
              className={`inline-flex items-center justify-center gap-1.5 min-w-[42px] min-h-[42px] sm:min-w-9 sm:min-h-9 px-2.5 rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer ${
                active || isTargetLoading
                  ? 'bg-sky-600 text-white shadow-xs border border-sky-600'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60'
              }`}
            >
              {isTargetLoading && (
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              )}
              <span>{pg}</span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={currentPage >= totalPages || isLoading}
          onMouseEnter={() => {
            if (currentPage < totalPages) onPrefetchPage?.(currentPage + 1);
          }}
          onTouchStart={() => {
            if (currentPage < totalPages) onPrefetchPage?.(currentPage + 1);
          }}
          onClick={() => onSelectPage(currentPage + 1)}
          aria-label="Next page"
          className="inline-flex items-center justify-center min-h-[42px] min-w-[42px] sm:min-h-9 sm:min-w-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </button>
      </div>
    </div>
  );
};

export const PaginationLoadingBanner: React.FC<{
  message: string;
  rightMeta?: string;
}> = ({ message, rightMeta }) => (
  <div
    role="status"
    aria-live="polite"
    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-sky-500/40 bg-sky-500/10 dark:bg-sky-500/15 text-xs font-semibold text-sky-800 dark:text-sky-200"
  >
    <span className="inline-flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
      <span>{message}</span>
    </span>
    {rightMeta ? (
      <span className="font-mono tabular-nums text-[11px] text-sky-700/85 dark:text-sky-300/85">
        {rightMeta}
      </span>
    ) : null}
  </div>
);
