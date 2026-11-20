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
                  ? 'bg-lemon-400 text-petrol-950 font-bold shadow-xs border border-lemon-500/50'
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
    className="sticky top-[68px] z-20 overflow-hidden rounded-xl border border-petrol-700 bg-petrol-900 text-bone-50 shadow-lg shadow-petrol-950/20"
  >
    <div className="h-1 w-full bg-petrol-800 overflow-hidden">
      <div className="h-full w-1/2 bg-lemon-400 animate-[pulse_0.9s_ease-in-out_infinite] rounded-r-full" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold">
      <span className="inline-flex items-center gap-2.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-lemon-400/15 text-lemon-400 shrink-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
        <span className="tracking-tight">{message}</span>
      </span>
      {rightMeta ? (
        <span className="font-mono tabular-nums text-[11px] text-lemon-300">
          {rightMeta}
        </span>
      ) : null}
    </div>
  </div>
);

export const FilterUpdatingBanner: React.FC<{
  label?: string;
  filterSummary?: string;
}> = ({ label = 'Updating filtered results...', filterSummary }) => (
  <div
    role="status"
    aria-live="polite"
    className="sticky top-[68px] z-20 overflow-hidden rounded-xl border border-petrol-700 dark:border-lemon-400/40 bg-petrol-900 text-bone-50 shadow-lg shadow-petrol-950/25"
  >
    <div className="relative h-1 w-full bg-petrol-800 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-lemon-300 via-lemon-400 to-lemon-300 animate-[bounce_0.85s_linear_infinite]" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-lemon-400 text-petrol-950 shrink-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
        <span className="text-xs sm:text-sm font-bold tracking-tight text-bone-50">
          {label}
        </span>
      </div>
      {filterSummary ? (
        <span className="text-[11px] font-mono text-lemon-300 truncate max-w-full sm:max-w-[380px]">
          {filterSummary}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-lemon-300">
          <span className="h-2 w-2 rounded-full bg-lemon-400 animate-ping" />
          Syncing exact matches
        </span>
      )}
    </div>
  </div>
);
