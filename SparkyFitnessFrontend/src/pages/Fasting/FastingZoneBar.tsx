import type React from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

interface FastingZoneBarProps {
  hoursFasted: number;
}

const ZONES = [
  {
    key: 'starting',
    start: 0,
    end: 4,
    color: 'bg-blue-500',
  },
  {
    key: 'daily',
    start: 4,
    end: 16,
    color: 'bg-orange-500',
  },
  {
    key: 'extended',
    start: 16,
    end: 24,
    color: 'bg-red-500',
  },
  {
    key: 'long',
    start: 24,
    end: 72,
    color: 'bg-purple-500',
  },
  {
    key: 'veryLong',
    start: 72,
    end: Number.POSITIVE_INFINITY,
    color: 'bg-indigo-500',
  },
];

const FastingZoneBar: React.FC<FastingZoneBarProps> = ({ hoursFasted }) => {
  const { t } = useTranslation();
  // Determine current zone index
  const currentZoneIndex = ZONES.findIndex((z) => hoursFasted < z.end);
  const activeIndex =
    currentZoneIndex === -1 ? ZONES.length - 1 : currentZoneIndex;
  const activeZone = ZONES[activeIndex]!;
  const activeZoneName = t(
    `fasting.zones.${activeZone.key}.name`,
    activeZone.key
  );

  return (
    <div className="w-full space-y-2">
      <div className="mb-1 flex justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>{t('fasting.zonesLabel', 'Fasting timeline')}</span>
        <span>{activeZoneName}</span>
      </div>
      <div
        dir="ltr"
        className="flex h-4 w-full overflow-hidden rounded-full bg-secondary"
      >
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
          const zoneName = t(`fasting.zones.${zone.key}.name`, zone.key);
          const zoneDescription = t(
            `fasting.zones.${zone.key}.description`,
            ''
          );
          const zoneRange = Number.isFinite(zone.end)
            ? t('fasting.zoneRange', '{{start}}–{{end}} hr', {
                start: zone.start,
                end: zone.end,
              })
            : t('fasting.zoneRangeOpen', '{{start}}+ hr', {
                start: zone.start,
              });
          const zoneAccessibleLabel = `${zoneName}: ${zoneRange}. ${zoneDescription}`;

          return (
            <TooltipProvider key={zone.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    role="img"
                    tabIndex={0}
                    aria-label={zoneAccessibleLabel}
                    className={cn(
                      'h-full transition-all duration-500 cursor-help',
                      zone.color,
                      opacity
                    )}
                    style={{ width }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="font-bold">{zoneName}</div>
                  <div className="text-xs">{zoneRange}</div>
                  <div className="text-xs text-muted-foreground">
                    {zoneDescription}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      <div dir="ltr" className="mt-1 flex justify-between text-xs font-medium">
        <span>{t('fasting.hourMarker', '{{hours}} hr', { hours: 0 })}</span>
        <span>{t('fasting.hourMarker', '{{hours}} hr', { hours: 16 })}</span>
        <span>{t('fasting.hourMarker', '{{hours}} hr', { hours: 24 })}</span>
        <span>
          {t('fasting.zoneRangeOpen', '{{start}}+ hr', { start: 72 })}
        </span>
      </div>
    </div>
  );
};

export default FastingZoneBar;
