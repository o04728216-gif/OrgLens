import React from 'react';
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import type {
  DepartmentCategory,
  SearchResponse,
  SeniorityLevel,
  SyncQueueItem,
  WidgetConfig,
  WidgetId,
} from '../../types';
import { DEFAULT_WIDGETS } from '../../utils/offlineStorage';
import { SavedDomainsWidget } from '../SavedDomainsWidget';
import { OfflineSyncWidget } from '../OfflineSyncWidget';
import { AnalyticsWidget } from '../AnalyticsWidget';

interface DraggableWidgetCardProps {
  widget: WidgetConfig;
  index: number;
  totalVisible: number;
  onMove: (id: WidgetId, direction: 'up' | 'down') => void;
  children: React.ReactNode;
}

const DraggableWidgetCard: React.FC<DraggableWidgetCardProps> = ({
  widget,
  index,
  totalVisible,
  onMove,
  children,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={widget}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl backdrop-blur-xl bg-white/75 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 shadow-xs"
    >
      <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label={`Drag to reorder ${widget.title}`}
            title="Drag to reorder widget"
            onPointerDown={(e) => dragControls.start(e)}
            className="p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing touch-none transition-colors"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white truncate">
              {widget.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {widget.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(widget.id, 'up')}
            aria-label={`Move ${widget.title} up`}
            title="Move widget up"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={index === totalVisible - 1}
            onClick={() => onMove(widget.id, 'down')}
            aria-label={`Move ${widget.title} down`}
            title="Move widget down"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6">{children}</div>
    </Reorder.Item>
  );
};

interface WidgetsDrawerBoardProps {
  showWidgetsDrawer: boolean;
  widgets: WidgetConfig[];
  onResetWidgets: () => void;
  onToggleWidgetVisibility: (id: WidgetId) => void;
  onReorderVisible: (newOrder: WidgetConfig[]) => void;
  onMoveWidgetByStep: (id: WidgetId, direction: 'up' | 'down') => void;
  snapshots: Record<string, SearchResponse>;
  activeDomain: string | null;
  effectiveOffline: boolean;
  onSelectSavedSnapshot: (domain: string) => void;
  onRefreshSnapshot: (domain: string) => void;
  onDeleteSnapshot: (domain: string) => void;
  syncQueue: SyncQueueItem[];
  simulateOffline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  onToggleSimulateOffline: () => void;
  onTriggerSyncNow: () => void;
  onRemoveQueueItem: (id: string) => void;
  onClearSynced: () => void;
  activeAnalyticsResult: SearchResponse | null;
  activeSelectedDepartment: DepartmentCategory | 'All';
  activeSelectedSeniority: SeniorityLevel | 'All';
  onSelectActiveDepartment: (dept: DepartmentCategory | 'All') => void;
  onSelectActiveSeniority: (sen: SeniorityLevel | 'All') => void;
  onSelectDomainFromAnalytics: (domain: string) => void;
}

export const WidgetsDrawerBoard: React.FC<WidgetsDrawerBoardProps> = ({
  showWidgetsDrawer,
  widgets,
  onResetWidgets,
  onToggleWidgetVisibility,
  onReorderVisible,
  onMoveWidgetByStep,
  snapshots,
  activeDomain,
  effectiveOffline,
  onSelectSavedSnapshot,
  onRefreshSnapshot,
  onDeleteSnapshot,
  syncQueue,
  simulateOffline,
  isSyncing,
  lastSyncedAt,
  onToggleSimulateOffline,
  onTriggerSyncNow,
  onRemoveQueueItem,
  onClearSynced,
  activeAnalyticsResult,
  activeSelectedDepartment,
  activeSelectedSeniority,
  onSelectActiveDepartment,
  onSelectActiveSeniority,
  onSelectDomainFromAnalytics,
}) => {
  const visibleWidgets = widgets.filter((w) => w.visible);

  return (
    <AnimatePresence>
      {showWidgetsDrawer && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="space-y-6 pt-2"
        >
          <div className="rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-slate-900/65 border border-slate-200/85 dark:border-slate-800/85 p-5 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Customizable Dashboard Widgets &amp; Offline Sync
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Drag any widget&apos;s grip handle to reorder, or toggle
                  visibility below.
                </p>
              </div>
              <button
                type="button"
                onClick={onResetWidgets}
                title={`Restore ${DEFAULT_WIDGETS.length} default widgets`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Layout
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {widgets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onToggleWidgetVisibility(w.id)}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer ${
                    w.visible
                      ? 'border-sky-500/40 bg-sky-500/10 text-slate-900 dark:text-white'
                      : 'border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-75 hover:opacity-100'
                  }`}
                >
                  <span className="truncate">{w.title}</span>
                  {w.visible ? (
                    <Eye className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <Reorder.Group
            axis="y"
            values={visibleWidgets}
            onReorder={onReorderVisible}
            className="space-y-6"
          >
            {visibleWidgets.map((widget, index) => (
              <DraggableWidgetCard
                key={widget.id}
                widget={widget}
                index={index}
                totalVisible={visibleWidgets.length}
                onMove={onMoveWidgetByStep}
              >
                {widget.id === 'saved-domains' && (
                  <SavedDomainsWidget
                    snapshots={snapshots}
                    activeDomain={activeDomain}
                    isOffline={effectiveOffline}
                    onSelectSnapshot={onSelectSavedSnapshot}
                    onRefreshSnapshot={onRefreshSnapshot}
                    onDeleteSnapshot={onDeleteSnapshot}
                  />
                )}

                {widget.id === 'sync-queue' && (
                  <OfflineSyncWidget
                    queue={syncQueue}
                    isOffline={effectiveOffline}
                    simulateOffline={simulateOffline}
                    isSyncing={isSyncing}
                    lastSyncedAt={lastSyncedAt}
                    onToggleSimulateOffline={onToggleSimulateOffline}
                    onTriggerSyncNow={onTriggerSyncNow}
                    onRemoveQueueItem={onRemoveQueueItem}
                    onClearSynced={onClearSynced}
                  />
                )}

                {widget.id === 'analytics-charts' && (
                  <AnalyticsWidget
                    currentResult={activeAnalyticsResult}
                    allSnapshots={snapshots}
                    selectedDepartment={activeSelectedDepartment}
                    selectedSeniority={activeSelectedSeniority}
                    onSelectDepartment={onSelectActiveDepartment}
                    onSelectSeniority={onSelectActiveSeniority}
                    onSelectDomain={onSelectDomainFromAnalytics}
                  />
                )}
              </DraggableWidgetCard>
            ))}
          </Reorder.Group>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
