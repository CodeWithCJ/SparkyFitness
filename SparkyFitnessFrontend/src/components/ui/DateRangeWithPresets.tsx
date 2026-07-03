import * as React from 'react';
import { addDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

interface Props {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export const DateRangePickerWithPresets = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: Props) => {
  const { formatDate, formatDateInUserTimezone } = usePreferences();
  const [open, setOpen] = React.useState(false);
  const [activePreset, setActivePreset] = React.useState<number | null>(null);
  const [range, setRange] = React.useState<DateRange | undefined>({
    from: new Date(`${startDate}T00:00:00`),
    to: new Date(`${endDate}T00:00:00`),
  });
  const [currentMonth, setCurrentMonth] = React.useState<Date>(
    new Date(`${startDate}T00:00:00`)
  );

  const handleSelect = (newRange: DateRange | undefined) => {
    setRange(newRange);
    setActivePreset(null);
    if (newRange?.from)
      onStartDateChange(formatDateInUserTimezone(newRange.from, 'yyyy-MM-dd'));
    if (newRange?.to && newRange?.from && newRange.to > newRange.from) {
      onEndDateChange(formatDateInUserTimezone(newRange.to, 'yyyy-MM-dd'));
      setOpen(false);
    }
  };

  const handlePreset = (days: number) => {
    const end = new Date();
    const start = addDays(new Date(), -days);
    const newRange = { from: start, to: end };
    setRange(newRange);
    setActivePreset(days);
    setCurrentMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    onStartDateChange(formatDateInUserTimezone(start, 'yyyy-MM-dd'));
    onEndDateChange(formatDateInUserTimezone(end, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 font-normal rounded-md px-4 text-sm h-9 border-border/60 hover:border-border transition-colors"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {formatDate(startDate)}
            <span className="mx-1.5 text-muted-foreground">–</span>
            {formatDate(endDate)}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 rounded-md shadow-lg border-border/60 overflow-hidden"
        align="end"
        sideOffset={8}
      >
        <div className="flex">
          {/* Presets sidebar */}
          <div className="flex flex-col gap-0.5 p-2 border-r border-border/40 bg-muted/30 min-w-[130px]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 pt-1 pb-2">
              Quick select
            </p>
            {PRESETS.map(({ label, days }) => (
              <button
                key={days}
                onClick={() => handlePreset(days)}
                className={`
                  text-left text-sm px-2.5 py-1.5 rounded-lg transition-colors w-full
                  ${
                    activePreset === days
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="">
            <Calendar
              mode="range"
              selected={range}
              captionLayout="dropdown"
              numberOfMonths={1}
              onSelect={handleSelect}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              fixedWeeks
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
