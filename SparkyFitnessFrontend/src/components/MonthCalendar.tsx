import { useMemo, type ReactNode } from 'react';
import { buildMonthGrid, compareDays, todayInZone } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DayCellRender {
  /** Cell background color (any valid CSS color, including alpha hex like `#C9524E40`). */
  fill?: string;
  /** Text color for the day number. */
  textColor?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed';
  borderWidth?: string;
  /** Extra content rendered under the day number (badges, dots, counts). */
  content?: ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Native hover tooltip (HTML `title` attribute) for a day's detail breakdown. */
  title?: string;
}

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

export interface MonthCalendarDayMeta {
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

export interface MonthCalendarProps {
  /** Currently displayed month, `YYYY-MM`. */
  month: string;
  onMonthChange: (month: string) => void;
  /** Seven weekday labels, already reordered to start at the user's `firstDayOfWeek`. */
  weekdayLabels: string[];
  selectedDate?: string;
  onDayClick?: (day: string) => void;
  /** Domain-specific coloring/content for a given day cell. */
  renderDay: (
    day: string,
    meta: MonthCalendarDayMeta
  ) => DayCellRender | undefined;
  legend?: LegendItem[];
  /** Disables month prev/next navigation (e.g. while a parent is in an edit/paint mode). */
  navDisabled?: boolean;
  /** Rendered on the right side of the month-nav bar (e.g. an "Edit" action). */
  headerRight?: ReactNode;
  /** Rendered above the weekday header, inside the grid card (e.g. a selector). */
  topContent?: ReactNode;
  monthLabelLocale?: string;
}

/**
 * Generic, presentational month-grid calendar. Owns month navigation, the weekday
 * header row, today/selected rings, and the legend row; delegates all domain-specific
 * day coloring and content to `renderDay`.
 *
 * Domains that need custom click routing (e.g. a paint/edit mode) should handle it in
 * `onDayClick` themselves — this component never mutates data, it only reports clicks.
 */
export default function MonthCalendar({
  month,
  onMonthChange,
  weekdayLabels,
  selectedDate,
  onDayClick,
  renderDay,
  legend,
  navDisabled,
  headerRight,
  topContent,
  monthLabelLocale = 'en-US',
}: MonthCalendarProps) {
  const { timezone, firstDayOfWeek } = usePreferences();
  const today = useMemo(() => todayInZone(timezone), [timezone]);

  const { year, monthVal } = useMemo(() => {
    const parts = month.split('-').map(Number);
    return { year: parts[0] ?? 2026, monthVal: parts[1] ?? 1 };
  }, [month]);

  const { days: gridDates } = useMemo(
    () => buildMonthGrid(year, monthVal, firstDayOfWeek),
    [year, monthVal, firstDayOfWeek]
  );

  const monthLabel = useMemo(() => {
    if (!year || !monthVal) return '';
    const date = new Date(Date.UTC(year, monthVal - 1, 1));
    return date.toLocaleDateString(monthLabelLocale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [year, monthVal, monthLabelLocale]);

  const handlePrevMonth = () => {
    onMonthChange(
      monthVal === 1
        ? `${year - 1}-12`
        : `${year}-${String(monthVal - 1).padStart(2, '0')}`
    );
  };

  const handleNextMonth = () => {
    onMonthChange(
      monthVal === 12
        ? `${year + 1}-01`
        : `${year}-${String(monthVal + 1).padStart(2, '0')}`
    );
  };

  return (
    <div className="space-y-4">
      {/* Month Picker Header */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevMonth}
              disabled={navDisabled}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-bold text-sm select-none min-w-[120px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextMonth}
              disabled={navDisabled}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {headerRight && (
            <div className="flex items-center gap-2">{headerRight}</div>
          )}
        </CardContent>
      </Card>

      {/* Calendar Grid Card */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {topContent}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground select-none">
            {weekdayLabels.map((label, idx) => (
              <div key={`${label}-${idx}`} className="py-1">
                {label}
              </div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-y-2 gap-x-1">
            {gridDates.map((dateStr) => {
              const dayParts = dateStr.split('-');
              const dayNum = Number(dayParts[2]);
              const inMonth = Number(dayParts[1]) === monthVal;
              const isSelected =
                !!selectedDate && compareDays(dateStr, selectedDate) === 0;
              const isToday = compareDays(dateStr, today) === 0;

              const cell =
                renderDay(dateStr, { inMonth, isToday, isSelected }) ?? {};

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => onDayClick?.(dateStr)}
                  aria-label={cell.ariaLabel}
                  title={cell.title}
                  className={cn(
                    'relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium transition duration-150 outline-none',
                    inMonth
                      ? 'text-foreground hover:bg-muted/50'
                      : 'text-muted-foreground/40 hover:bg-muted/20',
                    isSelected &&
                      'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    isToday && 'border-2 border-foreground',
                    cell.className
                  )}
                  style={{
                    backgroundColor: cell.fill,
                    color: cell.textColor,
                    borderStyle: cell.borderStyle,
                    borderWidth: cell.borderWidth,
                    borderColor: cell.borderColor,
                  }}
                >
                  <span>{dayNum}</span>
                  {cell.content}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          {legend && legend.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t text-[11px] text-muted-foreground select-none">
              {legend.map((item) => (
                <LegendRow
                  key={item.label}
                  color={item.color}
                  label={item.label}
                  dashed={item.dashed}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LegendRow({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3.5 w-3.5 rounded-full"
        style={{
          backgroundColor: dashed ? undefined : color,
          border: dashed ? `2px dashed ${color}` : undefined,
        }}
      />
      {label}
    </span>
  );
}
