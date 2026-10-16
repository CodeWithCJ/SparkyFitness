import type React from 'react';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FastingZoneBarProps {
  hoursFasted: number;
  startTime?: Date | string | null;
  targetEndTime?: Date | string | null;
}

const ZONES = [
  {
    name: 'Anabolic',
    start: 0,
    end: 4,
    color: 'bg-blue-500',
    desc: 'Rising blood sugar.',
  },
  {
    name: 'Catabolic',
    start: 4,
    end: 16,
    color: 'bg-orange-500',
    desc: 'Blood sugar falls.',
  },
  {
    name: 'Fat Burning',
    start: 16,
    end: 24,
    color: 'bg-red-500',
    desc: 'Ramping up fat burn.',
  },
  {
    name: 'Ketosis',
    start: 24,
    end: 72,
    color: 'bg-purple-500',
    desc: 'Running on ketones.',
  },
  {
    name: 'Deep Ketosis',
    start: 72,
    end: 1000,
    color: 'bg-indigo-500',
    desc: 'Autophagy peaks.',
  },
];

const FastingZoneBar: React.FC<FastingZoneBarProps> = ({
  hoursFasted,
  startTime,
  targetEndTime,
}) => {
  const { t } = useTranslation();
  // Determine current zone index
  const currentZoneIndex = ZONES.findIndex((z) => hoursFasted < z.end);
  const activeIndex =
    currentZoneIndex === -1 ? ZONES.length - 1 : currentZoneIndex;

  return (
    <div className="w-full space-y-2">
      {(startTime || targetEndTime) && (
        <div className="flex justify-between items-center text-xs text-muted-foreground font-medium mb-1">
          {startTime ? (
            <span>
              {t('fasting.startedAt', 'Started {{time}}', {
                time: format(
                  typeof startTime === 'string'
                    ? parseISO(startTime)
                    : startTime,
                  'h:mm a'
                ),
              })}
            </span>
          ) : (
            <span />
          )}
          {targetEndTime ? (
            <span>
              {t('fasting.targetAt', 'Target {{time}}', {
                time: format(
                  typeof targetEndTime === 'string'
                    ? parseISO(targetEndTime)
                    : targetEndTime,
                  'h:mm a'
                ),
              })}
            </span>
          ) : (
            <span />
          )}
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider mb-1">
        <span>
          {t('fasting.fastingZoneBar.metabolicState', 'Metabolic State')}
        </span>
        {/* <span>{ZONES[activeIndex].name}</span> */}
      </div>
      <div className="w-full h-4 bg-secondary rounded-full overflow-hidden flex">
        {ZONES.map((zone, index) => {
          const isPassed = index < activeIndex;
          const isActive = index === activeIndex;

          // Simplified visual width distribution for demo
          // In reality, 0-4 is small compared to 24-72, but we want equal visual steps or proportional?
          // Let's use equal width for readability of stages.
          const width = `${100 / ZONES.length}%`;

          // Calculate opacity: Passed = 100%, Active = Pulse?, Future = 30%
          let opacity = isPassed
            ? 'opacity-100'
            : isActive
              ? 'opacity-100 animate-pulse'
              : 'opacity-20';
          if (isActive) opacity = 'opacity-100 ring-2 ring-white ring-inset';

          return (
            <TooltipProvider key={zone.name}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'h-full transition-all duration-500 cursor-help',
                      zone.color,
                      opacity
                    )}
                    style={{ width }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="font-bold">{zone.name}</div>
                  <div className="text-xs">
                    {t(
                      'fasting.fastingZoneBar.hours',
                      '{{start}}-{{end}} hours',
                      { start: zone.start, end: zone.end }
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {zone.desc}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      <div className="flex justify-between text-xs font-medium mt-1">
        <span>0h</span>
        <span>16h</span>
        <span>24h</span>
        <span>72h+</span>
      </div>
    </div>
  );
};

export default FastingZoneBar;
