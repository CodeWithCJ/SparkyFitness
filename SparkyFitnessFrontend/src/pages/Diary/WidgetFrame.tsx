import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { GripVertical, Maximize2, Minimize2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WidgetFrameProps {
  /** Stable widget identifier, reported back with measurements. */
  widgetKey: string;
  title: string;
  editMode: boolean;
  isMax: boolean;
  onToggleMax: () => void;
  onHide: () => void;
  /** Reports the widget's natural content height (px) so the grid can auto-size. */
  onMeasure?: (key: string, height: number) => void;
  children: ReactNode;
}

/**
 * The single visible card for a diary widget. The outer frame owns the border
 * and background and fills the (possibly row-equalized) grid tile; the child
 * widget's own Card chrome is flattened so only one border shows.
 *
 * IMPORTANT: we measure the *natural* height of an inner, non-stretched wrapper.
 * It must stay decoupled from the tile/equalized height -- if we measured a
 * stretched/filled element, the measured height would track the tile we set
 * from it, creating an infinite measure -> layout -> measure loop.
 */
const WidgetFrame = ({
  widgetKey,
  title,
  editMode,
  isMax,
  onToggleMax,
  onHide,
  onMeasure,
  children,
}: WidgetFrameProps) => {
  const { t } = useTranslation();
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = measureRef.current;
    if (!el || !onMeasure) return;
    const report = () =>
      onMeasure(widgetKey, el.getBoundingClientRect().height);
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report(); // initial measurement
    return () => ro.disconnect();
  }, [onMeasure, widgetKey]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border/60 bg-card">
      {/* Natural-height inner content. Child Card chrome is flattened so only
          the frame's border shows. Content is top-aligned; when the tile is
          taller (row-equalized), the extra space sits inside this one border. */}
      <div
        ref={measureRef}
        className="[&>*]:border-0 [&>*]:bg-transparent [&>*]:shadow-none"
      >
        {children}
      </div>

      {editMode && (
        <div
          className="widget-drag-handle absolute right-1.5 top-1.5 z-20 flex cursor-move items-center gap-0.5 rounded-md border border-border/60 bg-background/95 px-1 py-0.5 shadow-sm"
          title={title}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMax();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title={
              isMax
                ? t('diary.widgets.restore', 'Restore')
                : t('diary.widgets.maximize', 'Maximize')
            }
          >
            {isMax ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onHide();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title={t('diary.widgets.hide', 'Hide')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default WidgetFrame;
