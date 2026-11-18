import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoveHorizontal } from 'lucide-react';

interface SwipeableTableContainerProps {
  children: React.ReactNode;
  className?: string;
  compactHint?: string;
}

export const SwipeableTableContainer: React.FC<SwipeableTableContainerProps> = ({
  children,
  className = '',
  compactHint = 'Drag sideways, Shift+Scroll, or use arrows to swipe',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    dragging: boolean;
    startX: number;
    startScrollLeft: number;
  }>({
    active: false,
    dragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollBounds = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollBounds();

    const ro = new ResizeObserver(() => {
      updateScrollBounds();
    });
    ro.observe(el);
    if (el.firstElementChild) {
      ro.observe(el.firstElementChild);
    }

    el.addEventListener('scroll', updateScrollBounds, { passive: true });
    window.addEventListener('resize', updateScrollBounds);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateScrollBounds);
      window.removeEventListener('resize', updateScrollBounds);
    };
  }, [updateScrollBounds]);

  const scrollByStep = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(240, Math.round(el.clientWidth * 0.62));
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, input, select, textarea, [role="button"], label'
      )
    ) {
      return;
    }
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;

    dragStateRef.current = {
      active: true,
      dragging: false,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active) return;
    const dx = e.clientX - state.startX;
    if (!state.dragging && Math.abs(dx) > 6) {
      state.dragging = true;
      setIsDragging(true);
    }
    if (state.dragging && scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft = state.startScrollLeft - dx;
    }
  };

  const stopDragging = () => {
    if (!dragStateRef.current.active && !isDragging) return;
    dragStateRef.current.active = false;
    dragStateRef.current.dragging = false;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    if (e.shiftKey && Math.abs(e.deltaY) > 0 && e.deltaX === 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };

  const hasHorizontalOverflow = canScrollLeft || canScrollRight;

  return (
    <div
      className={`hidden md:block relative rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/65 dark:bg-slate-950/40 ${className}`}
    >
      {hasHorizontalOverflow && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/85 dark:bg-slate-900/70 rounded-t-xl text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 truncate">
            <MoveHorizontal className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>{compactHint}</span>
          </span>
          <div className="inline-flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!canScrollLeft}
              onClick={() => scrollByStep('left')}
              aria-label="Swipe table left"
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-500/50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Left</span>
            </button>
            <button
              type="button"
              disabled={!canScrollRight}
              onClick={() => scrollByStep('right')}
              aria-label="Swipe table right"
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-500/50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <span>Right</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        {canScrollLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-5 z-10 bg-gradient-to-r from-slate-950/10 dark:from-slate-950/45 to-transparent"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 z-10 bg-gradient-to-l from-slate-950/10 dark:from-slate-950/45 to-transparent"
          />
        )}

        <div
          ref={scrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          onWheel={handleWheel}
          className={`overflow-x-auto swipe-table-scroll ${
            hasHorizontalOverflow
              ? isDragging
                ? 'cursor-grabbing select-none'
                : 'cursor-grab'
              : ''
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
