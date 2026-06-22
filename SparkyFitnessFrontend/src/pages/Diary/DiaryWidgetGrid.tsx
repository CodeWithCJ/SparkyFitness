import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Eye, Minimize2, Pencil, RotateCcw } from 'lucide-react';
import WidgetFrame from './WidgetFrame';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useDashboardLayout } from '@/hooks/Diary/useDashboardLayout';
import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_MARGIN_Y,
  GRID_ROW_HEIGHT,
  applyAutoHeights,
  areLayoutsEqual,
  generateDefaultLayouts,
  isMealWidgetKey,
  mergePositions,
  pxToRows,
  reconcileLayouts,
  type DashboardLayouts,
} from '@/utils/dashboardLayout';

export interface DiaryWidget {
  key: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
}

interface DiaryWidgetGridProps {
  widgets: DiaryWidget[];
}

const PAGE_KEY = 'diary';

/**
 * Safety net: if the grid ever throws (e.g. a layout/measurement feedback loop
 * trips React's max update depth), we reset the saved layout to default and
 * fall back to a plain stacked view so the diary still works.
 */
class GridErrorBoundary extends Component<
  { onError: () => void; fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const DiaryWidgetGridInner = ({ widgets }: DiaryWidgetGridProps) => {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const { saved, save, reset } = useDashboardLayout(PAGE_KEY);
  const { width, containerRef, mounted } = useContainerWidth();

  // Layout editing is a personal action; when viewing someone else's profile
  // the layout is shown read-only (the server also rejects writes).
  const canEdit = !isActingOnBehalf;
  const [editMode, setEditMode] = useState(false);
  const [maximized, setMaximized] = useState<string | null>(null);

  // Never edit while viewing someone else's profile, even if edit mode was
  // toggled on before switching.
  const effectiveEditMode = editMode && canEdit;

  const widgetKeys = useMemo(() => widgets.map((w) => w.key), [widgets]);
  const mealKeys = useMemo(
    () => widgetKeys.filter(isMealWidgetKey),
    [widgetKeys]
  );
  const defaults = useMemo(() => generateDefaultLayouts(mealKeys), [mealKeys]);

  const hidden = useMemo(() => saved?.hidden ?? [], [saved]);

  const [layouts, setLayouts] = useState<DashboardLayouts>(() =>
    reconcileLayouts(saved?.layout, widgetKeys, defaults)
  );

  // Resync local layout when the widget set changes or the server layout
  // updates. Optimistic in-flight saves keep updated_at stable, so this does
  // not fight an in-progress drag.
  const syncSig = `${widgetKeys.join(',')}|${saved?.updated_at ?? ''}`;
  useEffect(() => {
    setLayouts(reconcileLayouts(saved?.layout, widgetKeys, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSig]);

  // Latest full (all-breakpoint) layout, kept in sync by onLayoutChange.
  const latestLayoutsRef = useRef<DashboardLayouts>(layouts);
  latestLayoutsRef.current = layouts;

  // Measured natural content height (in grid rows) per widget. Heights are
  // content-driven so tiles grow to fit and never show an inner scrollbar.
  const [measuredRows, setMeasuredRows] = useState<Record<string, number>>({});

  const handleMeasure = useCallback((key: string, px: number) => {
    const rows = pxToRows(px);
    setMeasuredRows((prev) => {
      if (prev[key] === rows) return prev;
      console.log(
        `[DiaryGrid] measure  ${key.padEnd(28)} px=${Math.round(px)
          .toString()
          .padStart(4)}  rows=${rows}  (was ${prev[key] ?? '—'})`
      );
      return { ...prev, [key]: rows };
    });
  }, []);

  // Apply measured heights over the base layout (which keeps the user-managed
  // x/y/w). Widgets sharing a row are equalized to the tallest so rows align.
  const displayLayouts = useMemo<DashboardLayouts>(
    () => applyAutoHeights(layouts, measuredRows),
    [layouts, measuredRows]
  );

  // TEMP DEBUG: log how the lg breakpoint groups into rows and the final
  // (equalized) height per widget, so we can see whether same-row widgets share
  // a `y` and end up the same height.
  useEffect(() => {
    const byRow = new Map<number, string[]>();
    for (const it of displayLayouts.lg) {
      const label = `${it.i.replace('meal:', 'm:').slice(0, 12)}(meas=${measuredRows[it.i] ?? '—'}→h=${it.h})`;
      byRow.set(it.y, [...(byRow.get(it.y) ?? []), label]);
    }
    const flat = [...byRow.entries()]
      .map(([y, items]) => `y=${y}: ${items.join('  ')}`)
      .join('\n');
    console.log('[DiaryGrid] lg layout:\n' + flat);
  }, [displayLayouts, measuredRows]);

  // react-grid-layout fires onDragStop/onResizeStop BEFORE the onLayoutChange
  // that carries the moved layout. So we flag a pending save on stop and let
  // the immediately-following onLayoutChange persist the fresh layout. A
  // programmatic resync (setLayouts) never sets the flag, so it cannot trigger
  // a save loop.
  const pendingSaveRef = useRef(false);

  const handleLayoutChange = useCallback(
    (_current: Layout, all: ResponsiveLayouts) => {
      // Only capture positions from a real user drag/resize (flagged by the
      // stop handler). react-grid-layout also fires this for its automatic
      // compaction whenever a tile auto-grows; capturing those would feed the
      // reflowed y positions back into the base layout and oscillate forever.
      if (!pendingSaveRef.current) return;
      pendingSaveRef.current = false;

      const incoming = all as unknown as DashboardLayouts;
      const merged = mergePositions(latestLayoutsRef.current, incoming);
      if (areLayoutsEqual(latestLayoutsRef.current, merged)) return;
      latestLayoutsRef.current = merged;
      setLayouts(merged);
      save({ layout: merged, hidden });
    },
    [save, hidden]
  );

  const markPendingSave = useCallback(() => {
    pendingSaveRef.current = true;
  }, []);

  const hideWidget = useCallback(
    (key: string) => {
      if (maximized === key) setMaximized(null);
      save({
        layout: latestLayoutsRef.current,
        hidden: [...hidden, key],
      });
    },
    [hidden, maximized, save]
  );

  const restoreWidget = useCallback(
    (key: string) => {
      save({
        layout: latestLayoutsRef.current,
        hidden: hidden.filter((k) => k !== key),
      });
    },
    [hidden, save]
  );

  const handleReset = useCallback(() => {
    setMaximized(null);
    setLayouts(generateDefaultLayouts(mealKeys));
    reset();
  }, [mealKeys, reset]);

  const visibleWidgets = useMemo(
    () => widgets.filter((w) => !hidden.includes(w.key)),
    [widgets, hidden]
  );

  const hiddenWidgets = useMemo(
    () => widgets.filter((w) => hidden.includes(w.key)),
    [widgets, hidden]
  );

  const maximizedWidget = maximized
    ? widgets.find((w) => w.key === maximized)
    : null;

  return (
    <div className="space-y-3">
      {/* Toolbar (hidden entirely when viewing another user's profile) */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {effectiveEditMode && hiddenWidgets.length > 0 && (
            <div className="mr-auto flex flex-wrap items-center gap-1">
              {hiddenWidgets.map((w) => (
                <Button
                  key={w.key}
                  variant="outline"
                  size="sm"
                  onClick={() => restoreWidget(w.key)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {w.title}
                </Button>
              ))}
            </div>
          )}
          {effectiveEditMode && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('diary.widgets.resetLayout', 'Reset layout')}
            </Button>
          )}
          <Button
            variant={effectiveEditMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {effectiveEditMode
              ? t('diary.widgets.done', 'Done')
              : t('diary.widgets.layout', 'Layout')}
          </Button>
        </div>
      )}

      <div ref={containerRef}>
        {mounted && (
          <Responsive
            className="layout"
            layouts={displayLayouts as unknown as ResponsiveLayouts}
            breakpoints={GRID_BREAKPOINTS}
            cols={GRID_COLS}
            width={width}
            rowHeight={GRID_ROW_HEIGHT}
            margin={[16, GRID_MARGIN_Y]}
            containerPadding={[0, 0]}
            dragConfig={{
              enabled: effectiveEditMode,
              handle: '.widget-drag-handle',
            }}
            // Width-only resize: height is content-driven (auto-grow), so we
            // expose just the east handle and never a vertical one.
            resizeConfig={{ enabled: effectiveEditMode, handles: ['e'] }}
            onLayoutChange={handleLayoutChange}
            onDragStop={markPendingSave}
            onResizeStop={markPendingSave}
          >
            {visibleWidgets.map((w) => (
              <div key={w.key}>
                <WidgetFrame
                  widgetKey={w.key}
                  title={w.title}
                  editMode={effectiveEditMode}
                  isMax={maximized === w.key}
                  onToggleMax={() =>
                    setMaximized((cur) => (cur === w.key ? null : w.key))
                  }
                  onHide={() => hideWidget(w.key)}
                  onMeasure={handleMeasure}
                >
                  {w.render()}
                </WidgetFrame>
              </div>
            ))}
          </Responsive>
        )}
      </div>

      {/* Maximize overlay */}
      {maximizedWidget && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <maximizedWidget.icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-lg font-semibold">
                {maximizedWidget.title}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMaximized(null)}
            >
              <Minimize2 className="mr-2 h-4 w-4" />
              {t('diary.widgets.restore', 'Restore')}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {maximizedWidget.render()}
          </div>
        </div>
      )}
    </div>
  );
};

const DiaryWidgetGrid = ({ widgets }: DiaryWidgetGridProps) => {
  const { reset } = useDashboardLayout(PAGE_KEY);
  const { t } = useTranslation();

  return (
    <GridErrorBoundary
      onError={reset}
      fallback={
        <div className="space-y-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
            {t(
              'diary.widgets.layoutResetNotice',
              'The customizable layout hit an error and was reset to default. Reload the page to use it again.'
            )}
          </div>
          {widgets.map((w) => (
            <div key={w.key}>{w.render()}</div>
          ))}
        </div>
      }
    >
      <DiaryWidgetGridInner widgets={widgets} />
    </GridErrorBoundary>
  );
};

export default DiaryWidgetGrid;
