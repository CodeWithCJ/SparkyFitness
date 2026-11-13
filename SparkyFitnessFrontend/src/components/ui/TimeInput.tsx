import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, type LucideIcon } from 'lucide-react';
import {
  DateField,
  DateInput,
  DateSegment,
  FieldError,
  TimeField,
  type TimeFieldProps,
} from 'react-aria-components';
import {
  parseDateTime,
  parseTime,
  toCalendarDate,
  type CalendarDateTime,
  type Time,
} from '@internationalized/date';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';

// Native <input type="time"> and <input type="datetime-local"> render 12h or
// 24h from the browser language, which ignores the user's time-format
// preference. These fields keep the native string formats ('HH:mm' and
// 'YYYY-MM-DDTHH:mm') as their value contract but render the hour cycle the
// user picked. The picker button still opens the browser's own picker, through
// a hidden native input that shares the value. An empty required field blocks
// submission through react-aria's validation input, which suppresses the
// browser's bubble, so its message is shown under the field instead.

interface FieldProps {
  /**
   * Controlled value: 'HH:mm' for TimeInput, 'YYYY-MM-DDTHH:mm' for
   * DateTimeInput, '' when empty.
   */
  value?: string;
  /** Uncontrolled initial value, same format as `value`. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /**
   * Called with the current value when focus leaves the whole field. Opening
   * the browser picker does not count as leaving.
   */
  onBlur?: (value: string) => void;
  onKeyDown?: TimeFieldProps<Time>['onKeyDown'];
  id?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const FIELD_CLASS =
  'relative flex h-10 w-full items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 group-data-[invalid]/field:focus-within:ring-destructive';

const ERROR_CLASS = 'mt-1.5 block text-sm font-medium text-destructive';

const SEGMENT_CLASS =
  'rounded-sm px-0.5 tabular-nums caret-transparent outline-none data-[type=literal]:px-0 data-[placeholder]:text-muted-foreground data-[focused]:bg-accent data-[focused]:text-accent-foreground';

const pad2 = (n: number) => String(n).padStart(2, '0');

const toTimeString = (time: { hour: number; minute: number }) =>
  `${pad2(time.hour)}:${pad2(time.minute)}`;

const toDateTimeString = (dateTime: CalendarDateTime) =>
  `${toCalendarDate(dateTime).toString()}T${toTimeString(dateTime)}`;

const parseOrNull = <T,>(value: string, parse: (v: string) => T): T | null => {
  if (!value) return null;
  try {
    return parse(value);
  } catch {
    return null;
  }
};

/**
 * One string value shared by the segmented field and the native picker input,
 * controlled or not.
 */
function useFieldValue({
  value,
  defaultValue,
  onChange,
}: Pick<FieldProps, 'value' | 'defaultValue' | 'onChange'>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? ''
  );
  const current = value ?? uncontrolledValue;
  // A blur can land before the re-render that follows the last edit.
  const latest = React.useRef(current);
  React.useEffect(() => {
    latest.current = current;
  }, [current]);

  const setCurrent = (next: string) => {
    latest.current = next;
    if (value === undefined) setUncontrolledValue(next);
    onChange?.(next);
  };
  return { current, setCurrent, latest };
}

function useHourCycleProps() {
  const { timeFormat } = usePreferences();
  const hourCycle = timeFormat === 'HH:mm' ? 24 : 12;
  return {
    hourCycle,
    shouldForceLeadingZeros: hourCycle === 24,
    lowercaseDayPeriod: timeFormat === 'h:mm a',
  } as const;
}

const Segments: React.FC<{ lowercaseDayPeriod: boolean }> = ({
  lowercaseDayPeriod,
}) => (
  <DateInput className="flex min-w-0 flex-1 items-center">
    {(segment) => (
      <DateSegment
        segment={segment}
        className={cn(
          SEGMENT_CLASS,
          lowercaseDayPeriod && 'data-[type=dayPeriod]:lowercase'
        )}
      />
    )}
  </DateInput>
);

interface FieldShellProps {
  nativeType: 'time' | 'datetime-local';
  pickerLabel: string;
  icon: LucideIcon;
  value: string;
  onPick: (value: string) => void;
  onLeave: () => void;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/** The bordered box: segmented field, browser picker button, blur boundary. */
const FieldShell: React.FC<FieldShellProps> = ({
  nativeType,
  pickerLabel,
  icon: Icon,
  value,
  onPick,
  onLeave,
  className,
  disabled,
  children,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const nativeRef = React.useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) {
      root.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
    }
    try {
      nativeRef.current?.showPicker();
    } catch {
      // No picker for this input type in this browser (or no showPicker at
      // all): the field is focused, so the user can type the value instead.
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        FIELD_CLASS,
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node && rootRef.current?.contains(next))) {
          onLeave();
        }
      }}
    >
      {children}
      {/* Anchors the browser picker to this box; never shown or tabbed to. */}
      <input
        ref={nativeRef}
        type={nativeType}
        value={value}
        onChange={(e) => onPick(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
      <button
        type="button"
        aria-label={pickerLabel}
        disabled={disabled}
        // Keep focus in the field: on macOS, Safari and Firefox do not focus
        // a clicked button, so focus would otherwise drop to <body> and count
        // as leaving the field.
        onMouseDown={(e) => e.preventDefault()}
        onClick={openPicker}
        className="ml-auto shrink-0 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
};

export const TimeInput: React.FC<FieldProps> = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  className,
  required,
  disabled,
  ...fieldProps
}) => {
  const { t } = useTranslation();
  const { current, setCurrent, latest } = useFieldValue({
    value,
    defaultValue,
    onChange,
  });
  const { lowercaseDayPeriod, ...hourCycleProps } = useHourCycleProps();
  return (
    <TimeField
      {...fieldProps}
      {...hourCycleProps}
      className="group/field"
      value={parseOrNull<Time>(current, parseTime)}
      onChange={(time) => setCurrent(time ? toTimeString(time) : '')}
      isRequired={required}
      isDisabled={disabled}
    >
      <FieldShell
        nativeType="time"
        pickerLabel={t('common.pickTime', 'Pick a time')}
        icon={Clock}
        value={current}
        onPick={setCurrent}
        onLeave={() => onBlur?.(latest.current)}
        className={className}
        disabled={disabled}
      >
        <Segments lowercaseDayPeriod={lowercaseDayPeriod} />
      </FieldShell>
      <FieldError className={ERROR_CLASS} />
    </TimeField>
  );
};

export const DateTimeInput: React.FC<FieldProps> = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  className,
  required,
  disabled,
  ...fieldProps
}) => {
  const { t } = useTranslation();
  const { current, setCurrent, latest } = useFieldValue({
    value,
    defaultValue,
    onChange,
  });
  const { lowercaseDayPeriod, ...hourCycleProps } = useHourCycleProps();
  return (
    <DateField
      {...fieldProps}
      {...hourCycleProps}
      className="group/field"
      value={parseOrNull<CalendarDateTime>(current, parseDateTime)}
      onChange={(dateTime) =>
        setCurrent(dateTime ? toDateTimeString(dateTime) : '')
      }
      granularity="minute"
      isRequired={required}
      isDisabled={disabled}
    >
      <FieldShell
        nativeType="datetime-local"
        pickerLabel={t('common.pickDateTime', 'Pick a date and time')}
        icon={CalendarDays}
        value={current}
        onPick={setCurrent}
        onLeave={() => onBlur?.(latest.current)}
        className={className}
        disabled={disabled}
      >
        <Segments lowercaseDayPeriod={lowercaseDayPeriod} />
      </FieldShell>
      <FieldError className={ERROR_CLASS} />
    </DateField>
  );
};
