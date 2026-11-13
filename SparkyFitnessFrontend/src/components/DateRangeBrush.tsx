import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface BrushSeriesPoint {
  ms: number;
  value: number;
}

interface DateRangeBrushProps {
  /** Full range start timestamp (ms) */
  rangeStartMs: number;
  /** Full range end timestamp (ms), exclusive */
  rangeEndMs: number;
  /** Current selection start timestamp (ms) */
  selectionStartMs: number;
  /** Current selection end timestamp (ms), exclusive */
  selectionEndMs: number;
  /** Called with the new selection while the user drags or resizes */
  onChange: (startMs: number, endMs: number) => void;
  /** Minimum selection width in ms (default: 1 day) */
  minSelectionMs?: number;
  /** Format a timestamp to a short label */
  formatLabel?: (ms: number) => string;
  /** Color of the selection and the overview line */
  accentColor?: string;
  /** Overview of the whole range drawn behind the selection */
  series?: BrushSeriesPoint[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type DragMode = 'pan' | 'left' | 'right';

interface DragState {
  mode: DragMode;
  startX: number;
  origStartMs: number;
  origEndMs: number;
}

/**
 * Navigator strip for a date range: a mini chart of the whole range with a
 * selection window on top. Drag the window to pan it, drag either edge to
 * resize it, or click the strip to move the window there.
 */
const DateRangeBrush: React.FC<DateRangeBrushProps> = ({
  rangeStartMs,
  rangeEndMs,
  selectionStartMs,
  selectionEndMs,
  onChange,
  minSelectionMs = ONE_DAY_MS,
  formatLabel,
  accentColor = '#f43f5e',
  series = [],
}) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // While dragging, the window follows the pointer exactly; the parent may
  // snap its own copy to whole days.
  const [live, setLive] = useState<{ start: number; end: number } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  const totalMs = Math.max(rangeEndMs - rangeStartMs, ONE_DAY_MS);
  const startMs = live?.start ?? selectionStartMs;
  const endMs = live?.end ?? selectionEndMs;
  const pctLeft = ((startMs - rangeStartMs) / totalMs) * 100;
  const pctWidth = ((endMs - startMs) / totalMs) * 100;

  const fmtLabel = useMemo(
    () =>
      formatLabel ??
      ((ms: number) =>
        new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(ms))),
    [formatLabel]
  );

  const selectionDays = (selectionEndMs - selectionStartMs) / ONE_DAY_MS;
  const durationLabel =
    selectionDays < 1.05
      ? t('heartRate.brushDuration24h', '24 hours')
      : selectionDays % 1 < 0.05
        ? t('heartRate.brushDurationDays', '{{count}} days', {
            count: Math.round(selectionDays),
          })
        : t('heartRate.brushDurationDaysDecimal', '{{val}} days', {
            val: selectionDays.toFixed(1),
          });

  // Overview line and area, drawn in a 100 x 100 box stretched to the strip
  const overview = useMemo(() => {
    if (series.length < 2) return null;
    const values = series.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coords = series.map((p) => {
      const x = ((p.ms - rangeStartMs) / totalMs) * 100;
      const y = 88 - ((p.value - min) / span) * 70;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const first = coords[0]?.split(',')[0] ?? '0';
    const last = coords[coords.length - 1]?.split(',')[0] ?? '100';
    return {
      line: `M${coords.join(' L')}`,
      area: `M${first},100 L${coords.join(' L')} L${last},100 Z`,
    };
  }, [series, rangeStartMs, totalMs]);

  const clampWindow = useCallback(
    (start: number, width: number) => {
      const s = Math.min(Math.max(start, rangeStartMs), rangeEndMs - width);
      return { start: s, end: s + width };
    },
    [rangeStartMs, rangeEndMs]
  );

  const startDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (!trackRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      origStartMs: selectionStartMs,
      origEndMs: selectionEndMs,
    };
    setDragMode(mode);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const deltaMs = ((e.clientX - drag.startX) / rect.width) * totalMs;
    let next: { start: number; end: number };
    if (drag.mode === 'pan') {
      next = clampWindow(
        drag.origStartMs + deltaMs,
        drag.origEndMs - drag.origStartMs
      );
    } else if (drag.mode === 'left') {
      next = {
        start: Math.min(
          Math.max(drag.origStartMs + deltaMs, rangeStartMs),
          drag.origEndMs - minSelectionMs
        ),
        end: drag.origEndMs,
      };
    } else {
      next = {
        start: drag.origStartMs,
        end: Math.max(
          Math.min(drag.origEndMs + deltaMs, rangeEndMs),
          drag.origStartMs + minSelectionMs
        ),
      };
    }
    setLive(next);
    onChange(Math.round(next.start), Math.round(next.end));
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragMode(null);
    setLive(null);
  };

  // Pressing the strip outside the window moves the window there, and the
  // same press keeps dragging it.
  const onTrackPointerDown = (e: React.PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pressMs =
      rangeStartMs +
      Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * totalMs;
    const width = selectionEndMs - selectionStartMs;
    const centered = clampWindow(pressMs - width / 2, width);
    onChange(Math.round(centered.start), Math.round(centered.end));
    setLive(centered);
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      origStartMs: centered.start,
      origEndMs: centered.end,
    };
    setDragMode('pan');
  };

  const nudge = (mode: DragMode, direction: -1 | 1) => {
    const step = direction * ONE_DAY_MS;
    if (mode === 'pan') {
      const next = clampWindow(
        selectionStartMs + step,
        selectionEndMs - selectionStartMs
      );
      onChange(next.start, next.end);
    } else if (mode === 'left') {
      onChange(
        Math.min(
          Math.max(selectionStartMs + step, rangeStartMs),
          selectionEndMs - minSelectionMs
        ),
        selectionEndMs
      );
    } else {
      onChange(
        selectionStartMs,
        Math.max(
          Math.min(selectionEndMs + step, rangeEndMs),
          selectionStartMs + minSelectionMs
        )
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, mode: DragMode) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    nudge(mode, e.key === 'ArrowLeft' ? -1 : 1);
  };

  const selectionText = `${fmtLabel(selectionStartMs)} – ${fmtLabel(selectionEndMs - 1)}`;

  return (
    <div className="space-y-1.5 select-none pt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">
          {t('heartRate.brushLabel', 'Date range')}
        </span>
        <span className="font-medium text-muted-foreground">
          {selectionText} · {durationLabel}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-20 cursor-pointer overflow-hidden rounded-lg border border-border bg-muted/30"
        style={{ touchAction: 'none' }}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {overview && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={overview.area} fill={accentColor} fillOpacity={0.18} />
            <path
              d={overview.line}
              fill="none"
              stroke={accentColor}
              strokeWidth={1.5}
              strokeOpacity={0.85}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {/* Dim everything outside the window */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-background/60"
          style={{ width: `${pctLeft}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-background/60"
          style={{ width: `${100 - pctLeft - pctWidth}%` }}
        />

        {/* Window: drag to pan */}
        <div
          className="absolute inset-y-0 border-y-2"
          style={{
            left: `${pctLeft}%`,
            width: `${pctWidth}%`,
            borderColor: accentColor,
            backgroundColor: `${accentColor}1f`,
            cursor: dragMode === 'pan' ? 'grabbing' : 'grab',
          }}
          role="slider"
          tabIndex={0}
          aria-label={t('heartRate.brushWindow', 'Selected date window')}
          aria-valuemin={rangeStartMs}
          aria-valuemax={rangeEndMs}
          aria-valuenow={selectionStartMs}
          aria-valuetext={selectionText}
          onPointerDown={(e) => startDrag(e, 'pan')}
          onKeyDown={(e) => onKeyDown(e, 'pan')}
        />

        {/* Edge grips: drag to resize */}
        {(['left', 'right'] as const).map((side) => {
          const edge = side === 'left' ? pctLeft : pctLeft + pctWidth;
          return (
            <div
              key={side}
              className="absolute inset-y-0 z-10 flex w-5 -translate-x-1/2 items-center justify-center"
              style={{ left: `${edge}%`, cursor: 'ew-resize' }}
              role="slider"
              tabIndex={0}
              aria-label={
                side === 'left'
                  ? t('heartRate.brushStart', 'Window start')
                  : t('heartRate.brushEnd', 'Window end')
              }
              aria-valuemin={
                side === 'left'
                  ? rangeStartMs
                  : selectionStartMs + minSelectionMs
              }
              aria-valuemax={
                side === 'left' ? selectionEndMs - minSelectionMs : rangeEndMs
              }
              aria-valuenow={
                side === 'left' ? selectionStartMs : selectionEndMs
              }
              aria-valuetext={
                side === 'left'
                  ? fmtLabel(selectionStartMs)
                  : fmtLabel(selectionEndMs - 1)
              }
              onPointerDown={(e) => startDrag(e, side)}
              onKeyDown={(e) => onKeyDown(e, side)}
            >
              <div
                className="h-8 w-2 rounded-full border border-background shadow-sm"
                style={{
                  backgroundColor: accentColor,
                  transform: dragMode === side ? 'scaleX(1.3)' : undefined,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{fmtLabel(rangeStartMs)}</span>
        <span>{fmtLabel(rangeEndMs - 1)}</span>
      </div>
    </div>
  );
};

export default DateRangeBrush;
