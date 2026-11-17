import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dumbbell, Moon } from 'lucide-react';
import {
  CALORIE_CYCLING_MAX_OFFSET,
  type CalorieCyclingMode,
  type CycledDay,
} from '@workspace/shared';
import { cn } from '@/lib/utils';
import { changeColorClass, signedAmount } from '@/utils/calorieCycling';

/** Pointer movement before a press on a bar becomes a drag, in px. */
const DRAG_THRESHOLD_PX = 5;
/** Dragging the full chart height moves a day this many percentage points. */
const DRAG_RANGE_POINTS = CALORIE_CYCLING_MAX_OFFSET * 2;

interface CalorieCyclingChartProps {
  mode: CalorieCyclingMode;
  week: CycledDay[];
  offsets: number[];
  trainingDays: number[];
  /** Weekdays in display order (0 = Sunday). */
  weekOrder: number[];
  baseTarget: number;
  floor: number | null;
  selectedDay: number;
  todayWeekday: number;
  onSelectDay: (day: number) => void;
  onToggleTraining: (day: number) => void;
  onSetOffset: (day: number, value: number) => void;
  dayName: (day: number, width: 'long' | 'short') => string;
  shown: (kcal: number) => string;
}

const clampOffset = (value: number) =>
  Math.max(
    -CALORIE_CYCLING_MAX_OFFSET,
    Math.min(CALORIE_CYCLING_MAX_OFFSET, Math.round(value))
  );

/**
 * The week as bars around the daily target. Tapping a bar selects that day;
 * in Custom a bar changes only once it is actually dragged (relative to where
 * the drag started, so it never jumps), and arrow keys nudge the selected bar.
 * In Training vs rest the icon under a bar switches the day.
 */
export const CalorieCyclingChart = ({
  mode,
  week,
  offsets,
  trainingDays,
  weekOrder,
  baseTarget,
  floor,
  selectedDay,
  todayWeekday,
  onSelectDay,
  onToggleTraining,
  onSetOffset,
  dayName,
  shown,
}: CalorieCyclingChartProps) => {
  const { t } = useTranslation();
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    day: number;
    startY: number;
    startOffset: number;
    dragging: boolean;
  } | null>(null);

  // Scale to the numbers on screen, so any target fits.
  const values = [
    baseTarget,
    ...week.map((day) => day.target),
    ...(floor !== null ? [floor] : []),
  ];
  const high = Math.max(...values) * 1.08;
  const low = Math.max(0, Math.min(...values) * 0.8);
  const heightOf = (value: number) =>
    Math.max(6, ((value - low) / (high - low || 1)) * 100);
  const floorShown = floor !== null && floor > low && floor < high;

  const startDrag = (event: React.PointerEvent, day: number) => {
    if (mode !== 'custom') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      day,
      startY: event.clientY,
      startOffset: offsets[day] ?? 0,
      dragging: false,
    };
  };
  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const height = plotRef.current?.getBoundingClientRect().height ?? 0;
    if (!drag || height <= 0) return;
    const dy = drag.startY - event.clientY;
    if (!drag.dragging && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.dragging) {
      drag.dragging = true;
      onSelectDay(drag.day);
    }
    const next = clampOffset(
      drag.startOffset + (dy / height) * DRAG_RANGE_POINTS
    );
    if (next !== offsets[drag.day]) onSetOffset(drag.day, next);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const nudge = (event: React.KeyboardEvent, day: number) => {
    if (mode !== 'custom') return;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onSelectDay(day);
      onSetOffset(
        day,
        clampOffset(
          (offsets[day] ?? 0) + (event.key === 'ArrowUp' ? step : -step)
        )
      );
    }
  };

  return (
    <div data-testid="calorie-cycling-chart">
      <div ref={plotRef} className="relative mt-6 h-56">
        <div
          className="absolute inset-x-0 border-t-2 border-dashed border-muted-foreground/40"
          style={{ bottom: `${heightOf(baseTarget)}%` }}
        >
          <span className="absolute -top-5 right-0 text-[10px] tabular-nums text-muted-foreground">
            {t(
              'settings.calorieCycling.chartTarget',
              'Daily target {{value}}',
              {
                value: shown(baseTarget),
              }
            )}
          </span>
        </div>
        {floorShown && floor !== null && (
          <div
            className="absolute inset-x-0 border-t border-dotted border-destructive/50"
            style={{ bottom: `${heightOf(floor)}%` }}
          >
            <span className="absolute left-0 top-0.5 text-[10px] tabular-nums text-destructive/80">
              {t(
                'settings.calorieCycling.chartFloor',
                'Safety floor {{value}}',
                {
                  value: shown(floor),
                }
              )}
            </span>
          </div>
        )}
        <div className="absolute inset-0 grid grid-cols-7 items-end gap-1.5 sm:gap-3">
          {weekOrder.map((day) => {
            const cycled = week[day];
            if (!cycled) return <div key={day} />;
            const selected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(day)}
                onPointerDown={(event) => startDrag(event, day)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => nudge(event, day)}
                aria-pressed={selected}
                aria-label={t(
                  'settings.calorieCycling.chartBarLabel',
                  '{{day}}: {{target}}, {{change}}',
                  {
                    day: dayName(day, 'long'),
                    target: shown(cycled.target),
                    change: signedAmount(
                      cycled.delta,
                      shown(Math.abs(cycled.delta))
                    ),
                  }
                )}
                data-testid={`calorie-cycling-bar-${day}`}
                className={cn(
                  'relative flex h-full flex-col justify-end rounded-t-xl focus-visible:outline-none',
                  mode === 'custom'
                    ? 'cursor-ns-resize touch-none'
                    : 'cursor-pointer'
                )}
              >
                <span
                  className={cn(
                    'mb-1 text-center text-[10px] font-semibold tabular-nums sm:text-xs',
                    changeColorClass(cycled.delta)
                  )}
                >
                  {signedAmount(cycled.delta, shown(Math.abs(cycled.delta)))}
                </span>
                <span
                  className={cn(
                    'relative block w-full rounded-t-xl transition-[height,background-color] duration-200',
                    cycled.delta > 0
                      ? 'bg-green-500/70 dark:bg-green-500/50'
                      : cycled.delta < 0
                        ? 'bg-amber-400/50 dark:bg-amber-400/35'
                        : 'bg-muted',
                    selected &&
                      'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  )}
                  style={{ height: `${heightOf(cycled.target)}%` }}
                >
                  {mode === 'custom' && (
                    <span className="absolute inset-x-2 top-1.5 h-1 rounded-full bg-foreground/25" />
                  )}
                  <span className="absolute inset-x-0 bottom-1.5 flex flex-col items-center text-[10px] font-semibold tabular-nums text-foreground sm:text-xs">
                    {shown(cycled.target)}
                    {cycled.clampedToFloor && (
                      <span className="text-[9px] font-medium text-destructive">
                        {t('settings.calorieCycling.atFloorShort', 'floor')}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-3">
        {weekOrder.map((day) => {
          const cycled = week[day];
          const training =
            mode === 'training_rest'
              ? trainingDays.includes(day)
              : (cycled?.delta ?? 0) > 0;
          const Icon = training ? Dumbbell : Moon;
          const label = (
            <>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dayName(day, 'short')}</span>
              {day === todayWeekday && (
                <span
                  className="h-1 w-1 rounded-full bg-primary"
                  aria-label={t('settings.calorieCycling.today', 'Today')}
                />
              )}
            </>
          );
          const classes = cn(
            'flex flex-col items-center gap-1 rounded-md py-1 text-xs font-semibold',
            day === selectedDay ? 'text-foreground' : 'text-muted-foreground'
          );
          return mode === 'training_rest' ? (
            <button
              key={day}
              type="button"
              onClick={() => {
                onSelectDay(day);
                onToggleTraining(day);
              }}
              aria-pressed={training}
              aria-label={
                training
                  ? t(
                      'settings.calorieCycling.markRest',
                      'Make {{day}} a rest day',
                      { day: dayName(day, 'long') }
                    )
                  : t(
                      'settings.calorieCycling.markTraining',
                      'Make {{day}} a training day',
                      { day: dayName(day, 'long') }
                    )
              }
              data-testid={`calorie-cycling-toggle-${day}`}
              className={cn(classes, 'hover:bg-muted')}
            >
              {label}
            </button>
          ) : (
            <div key={day} className={classes}>
              {label}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {mode === 'training_rest'
          ? t(
              'settings.calorieCycling.chartHintTraining',
              'Tap a bar to see that day. Tap the icon under a day to switch it between training and rest.'
            )
          : t(
              'settings.calorieCycling.chartHintCustom',
              'Tap a bar to see that day, or drag it up or down. Fine-tune the selected day below.'
            )}
      </p>
    </div>
  );
};
