import React from 'react';
import { Minus, Plus } from 'lucide-react';
import type { AccordionSectionId } from './sidebarConstants';

interface SidebarAccordionCardProps {
  id: AccordionSectionId;
  label: string;
  selectedCount: number;
  totalOptions?: number;
  opened: boolean;
  onToggle: (id: AccordionSectionId) => void;
  children: React.ReactNode;
}

export const SidebarAccordionCard: React.FC<SidebarAccordionCardProps> = ({
  id,
  label,
  selectedCount,
  totalOptions,
  opened,
  onToggle,
  children,
}) => {
  const effectiveTotal =
    typeof totalOptions === 'number' && totalOptions > 0
      ? Math.max(totalOptions, selectedCount)
      : undefined;

  const cardClass =
    selectedCount > 0
      ? 'rounded-xl border border-sky-500/35 dark:border-sky-500/30 bg-sky-500/[0.04] dark:bg-sky-500/[0.06]'
      : 'rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/40';

  return (
    <div className={cardClass}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={opened}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
      >
        <span className="truncate min-w-0">{label}</span>

        <span className="flex items-center gap-2 shrink-0">
          {effectiveTotal !== undefined ? (
            <span
              className={`font-mono tabular-nums text-[11px] ${
                selectedCount > 0
                  ? 'font-semibold text-sky-600 dark:text-sky-400'
                  : 'font-normal text-slate-400 dark:text-slate-500'
              }`}
            >
              {selectedCount > 0
                ? `${selectedCount}/${effectiveTotal}`
                : effectiveTotal}
            </span>
          ) : (
            selectedCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                {selectedCount}
              </span>
            )
          )}
          {opened ? (
            <Minus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          ) : (
            <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          )}
        </span>
      </button>

      {opened && children}
    </div>
  );
};
