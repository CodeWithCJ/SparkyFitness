import React from 'react';
import DateRangeBrush from '@/components/DateRangeBrush';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  dayStringToMs,
  lastDaysWindow,
  msToDayString,
  selectionMsToWindow,
  shiftWindow,
  windowToSelectionMs,
} from '@/utils/heartRateWindow';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HeartRateData } from './useHeartRateData';
import type { HeartRateWindow } from './useHeartRateWindow';

interface HeartRateWindowPresetsProps {
  heartRateWindow: HeartRateWindow;
}

export const HeartRateWindowPresets: React.FC<HeartRateWindowPresetsProps> = ({
  heartRateWindow,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const {
    range,
    dayWindow,
    setDayWindow,
    totalDays,
    zoomDays,
    isSingleDay,
    focusedDate,
  } = heartRateWindow;

  return (
    <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
      {/* Window presets: 24H, 3D, 7D, All (they just move the brush) */}
      <div className="inline-flex items-center rounded-lg bg-muted/70 p-0.5 border border-border">
        {[
          { label: '24H', days: 1 },
          { label: '3D', days: 3 },
          { label: '7D', days: 7 },
        ]
          .filter((preset) => preset.days === 1 || totalDays >= preset.days)
          .map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant={
                zoomDays === preset.days && dayWindow.end === range.end
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 text-xs px-2 font-medium shadow-none"
              onClick={() => setDayWindow(lastDaysWindow(range, preset.days))}
            >
              {preset.label}
            </Button>
          ))}
        <Button
          type="button"
          variant={zoomDays >= totalDays ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 text-xs px-2 font-medium shadow-none"
          onClick={() => setDayWindow(range)}
        >
          {t('heartRate.zoomAll', 'All')}
        </Button>
      </div>

      {/* Day Navigator (shown when zoomed to 1 day / 24H) */}
      {isSingleDay && (
        <div className="flex items-center gap-1 bg-muted/50 border border-border/80 px-1.5 py-0.5 rounded-lg">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setDayWindow(shiftWindow(dayWindow, -1, range))}
            disabled={dayWindow.start <= range.start}
            aria-label={t('common.previousDay', 'Previous Day')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-semibold px-1.5 min-w-[75px] text-center">
            {formatDateInUserTimezone(focusedDate, dateFormat)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setDayWindow(shiftWindow(dayWindow, 1, range))}
            disabled={dayWindow.end >= range.end}
            aria-label={t('common.nextDay', 'Next Day')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};

interface HeartRateWindowBrushProps {
  heartRateWindow: HeartRateWindow;
  overviewSeries: HeartRateData['overviewSeries'];
}

export const HeartRateWindowBrush: React.FC<HeartRateWindowBrushProps> = ({
  heartRateWindow,
  overviewSeries,
}) => {
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const { range, dayWindow, setDayWindow, totalDays } = heartRateWindow;

  return (
    <>
      {totalDays > 1 && (
        <DateRangeBrush
          rangeStartMs={dayStringToMs(range.start)}
          rangeEndMs={dayStringToMs(range.end) + 24 * 60 * 60 * 1000}
          selectionStartMs={windowToSelectionMs(dayWindow).startMs}
          selectionEndMs={windowToSelectionMs(dayWindow).endMs}
          minSelectionMs={24 * 60 * 60 * 1000}
          series={overviewSeries}
          onChange={(startMs, endMs) =>
            setDayWindow(selectionMsToWindow(startMs, endMs, range))
          }
          formatLabel={(ms) =>
            formatDateInUserTimezone(msToDayString(ms), dateFormat)
          }
        />
      )}
    </>
  );
};
