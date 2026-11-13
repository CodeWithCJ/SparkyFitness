import type React from 'react';
import { parseISO, differenceInMinutes } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatTimeWithPreference } from '@/utils/timeFormatters';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface EatingWindowBarProps {
  startTime: Date | string;
  targetEndTime: Date | string | null;
  remainingMinutes?: number | null;
  className?: string;
}

const EATING_WINDOW_BANDS = [
  {
    key: 'open',
    name: 'Window Open',
    range: '0–25%',
    color: 'bg-emerald-500',
    colorHex: '#10B981',
    desc: 'Nutrient absorption and insulin response.',
  },
  {
    key: 'fuel',
    name: 'Optimal Fuel',
    range: '25–50%',
    color: 'bg-teal-500',
    colorHex: '#14B8A6',
    desc: 'Peak nutrition and sustained daytime energy.',
  },
  {
    key: 'sustain',
    name: 'Mid Window',
    range: '50–75%',
    color: 'bg-cyan-500',
    colorHex: '#06B6D4',
    desc: 'Balanced hydration and intermediate nourishment.',
  },
  {
    key: 'closing',
    name: 'Window Closing',
    range: '75–100%',
    color: 'bg-amber-500',
    colorHex: '#F59E0B',
    desc: 'Final meal before your next fast begins.',
  },
];

const EatingWindowBar: React.FC<EatingWindowBarProps> = ({
  startTime,
  targetEndTime,
  remainingMinutes: _remainingMinutes,
  className,
}) => {
  const { t } = useTranslation();
  const { timeFormat } = usePreferences();

  const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  const end = targetEndTime
    ? typeof targetEndTime === 'string'
      ? parseISO(targetEndTime)
      : targetEndTime
    : new Date();

  const now = new Date();
  const totalMinutes = Math.max(1, differenceInMinutes(end, start));
  const elapsedMinutes = Math.max(0, differenceInMinutes(now, start));
  const progressRatio = Math.min(1, Math.max(0, elapsedMinutes / totalMinutes));
  const totalHours = totalMinutes / 60;

  // Determine which band is active (0, 1, 2, or 3)
  const activeIndex = Math.min(
    EATING_WINDOW_BANDS.length - 1,
    Math.max(0, Math.floor(progressRatio * EATING_WINDOW_BANDS.length))
  );
  const fallbackBand =
    EATING_WINDOW_BANDS[0] as (typeof EATING_WINDOW_BANDS)[number];
  const activeBand = EATING_WINDOW_BANDS[activeIndex] ?? fallbackBand;

  const quarterHours = Math.round(totalHours * 0.25 * 10) / 10;
  const halfHours = Math.round(totalHours * 0.5 * 10) / 10;
  const threeQuarterHours = Math.round(totalHours * 0.75 * 10) / 10;
  const roundedTotalHours = Math.round(totalHours * 10) / 10;

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground font-medium">
          {t('fasting.startedAt', 'Started {{time}}', {
            time: formatTimeWithPreference(start, timeFormat),
          })}
        </span>
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: `${activeBand.colorHex}20`,
            color: activeBand.colorHex,
          }}
        >
          {t(`fasting.stages.${activeBand.key}.name`, activeBand.name)}
        </span>
        <span className="text-muted-foreground font-medium">
          {t('fasting.closesAt', 'Closes {{time}}', {
            time: formatTimeWithPreference(end, timeFormat),
          })}
        </span>
      </div>

      <div className="w-full h-3.5 bg-secondary/80 rounded-full overflow-hidden flex p-0.5 gap-1">
        {EATING_WINDOW_BANDS.map((band, index) => {
          const isPassed = index < activeIndex;
          const isActive = index === activeIndex;

          const opacity = isPassed
            ? 'opacity-100'
            : isActive
              ? 'opacity-100 ring-2 ring-white dark:ring-slate-900 ring-inset shadow-xs'
              : 'opacity-25';

          const bandName = t(`fasting.stages.${band.key}.name`, band.name);
          const bandDesc = t(`fasting.stages.${band.key}.desc`, band.desc);

          return (
            <TooltipProvider key={band.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${bandName} (${band.range})`}
                    className={cn(
                      'h-full flex-1 rounded-sm transition-all duration-300 cursor-help border-0 p-0',
                      band.color,
                      opacity
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="font-bold">
                    {bandName} ({band.range})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {bandDesc}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      <div className="flex justify-between text-xs font-medium text-muted-foreground mt-1 px-0.5">
        <span>{t('fasting.hoursShort', { count: 0 })}</span>
        <span>{t('fasting.hoursShort', { count: quarterHours })}</span>
        <span>{t('fasting.hoursShort', { count: halfHours })}</span>
        <span>{t('fasting.hoursShort', { count: threeQuarterHours })}</span>
        <span>{t('fasting.hoursShort', { count: roundedTotalHours })}</span>
      </div>
    </div>
  );
};

export default EatingWindowBar;
