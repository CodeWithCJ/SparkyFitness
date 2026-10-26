import { CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  COMPARE_METRICS,
  compareDays,
  type CompareMetricKey,
  type CompareSinceResponse,
  dayToPickerDate,
  localDateToDay,
  sinceLineOptions,
  sinceStartBounds,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { compareValueText, metricName } from './compareCopy';

interface CompareSinceControlsProps {
  /** The latest answer for this habit and outcome, kept while a new start or line loads. */
  response: CompareSinceResponse | undefined;
  outcome: CompareMetricKey;
  today: string;
  /** The day the person picked; null until they pick one. */
  habitStart: string | null;
  /** The line the person picked, in the stored scale; null until they pick one. */
  line: number | null;
  onStartChange: (day: string) => void;
  onLineChange: (line: number) => void;
}

/**
 * The two settings under a since question: "Since [date]" (the server's
 * suggestion, marked as such, until the person picks a day) and
 * "Line: [outcome] ≥ [value]" on the outcome's display scale.
 */
export function CompareSinceControls({
  response,
  outcome,
  today,
  habitStart,
  line,
  onStartChange,
  onLineChange,
}: CompareSinceControlsProps) {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, timeFormat } = usePreferences();
  const bounds = sinceStartBounds(today);
  const result = response?.result;

  const suggested =
    habitStart === null ? (result?.suggestedStart ?? null) : null;
  const shownStart = habitStart ?? suggested;
  // A yes/no outcome has no line, and a start-less answer's is a placeholder.
  const shownLine =
    COMPARE_METRICS[outcome].kind === 'binary'
      ? null
      : (line ?? (result && result.start !== null ? result.line : null));

  const metric = metricName(outcome, t);
  const startTitle = t('compareReport.since.startTitle', 'Start date');
  const startLabel = shownStart
    ? formatDateInUserTimezone(shownStart, 'PP')
    : t('compareReport.since.pickDate', 'Pick a date');
  const lineTitle = t('compareReport.since.lineTitle', {
    defaultValue: '{{metric}} at or above',
    metric,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base text-foreground">
          {t('compareReport.since.startLabel', 'Since')}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={`${startTitle}: ${startLabel}`}
              className={`justify-start font-normal ${
                shownStart ? '' : 'text-muted-foreground'
              }`}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={shownStart ? dayToPickerDate(shownStart) : undefined}
              defaultMonth={dayToPickerDate(shownStart ?? bounds.max)}
              onSelect={(date) => {
                if (date) onStartChange(localDateToDay(date));
              }}
              disabled={(date) => {
                const d = localDateToDay(date);
                return (
                  compareDays(d, bounds.min) < 0 ||
                  compareDays(d, bounds.max) > 0
                );
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {suggested && (
          <span className="text-sm text-muted-foreground">
            {t('compareReport.since.suggested', '(suggested)')}
          </span>
        )}
      </div>
      {shownLine !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base text-foreground">
            {t('compareReport.since.lineLabel', {
              defaultValue: 'Line: {{metric}} ≥',
              metric,
            })}
          </span>
          <Select
            value={String(shownLine)}
            onValueChange={(value) => onLineChange(Number(value))}
          >
            <SelectTrigger
              aria-label={`${lineTitle}: ${compareValueText(outcome, shownLine, timeFormat)}`}
              className="h-8 w-auto gap-2 font-semibold text-primary"
            >
              <SelectValue>
                {compareValueText(outcome, shownLine, timeFormat)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sinceLineOptions(
                outcome,
                shownLine,
                (v) => compareValueText(outcome, v, timeFormat),
                result
              ).map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
