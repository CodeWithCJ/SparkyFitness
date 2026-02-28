import type { ChronotypeData as ChronotypeApiData } from '@/types/sleepScience';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Moon, Sun, Sunrise } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

interface ChronotypeCardProps {
  data: ChronotypeApiData;
}

const CHRONOTYPE_CONFIG = {
  early: {
    icon: Sunrise,
    color: '#f97316',
    labelKey: 'sleepScience.chronotypeEarly',
    labelDefault: 'Early Bird',
    descKey: 'sleepScience.chronotypeEarlyDesc',
    descDefault: 'You naturally wake early and perform best in the morning.',
  },
  intermediate: {
    icon: Sun,
    color: '#3b82f6',
    labelKey: 'sleepScience.chronotypeIntermediate',
    labelDefault: 'Intermediate',
    descKey: 'sleepScience.chronotypeIntermediateDesc',
    descDefault: 'Your rhythm is balanced between morning and evening.',
  },
  late: {
    icon: Moon,
    color: '#9b59b6',
    labelKey: 'sleepScience.chronotypeLate',
    labelDefault: 'Night Owl',
    descKey: 'sleepScience.chronotypeLateDesc',
    descDefault: 'You naturally stay up late and peak in the evening.',
  },
};

const ChronotypeCard: React.FC<ChronotypeCardProps> = ({ data }) => {
  const { t } = useTranslation();

  if (!data || !data.success || !data.chronotype) {
    return null;
  }

  const config = CHRONOTYPE_CONFIG[data.chronotype];
  const Icon = config.icon;

  const markers = [
    {
      label: t('sleepScience.avgWake', 'Avg Wake'),
      value: data.averageWakeTime,
    },
    {
      label: t('sleepScience.avgSleep', 'Avg Sleep'),
      value: data.averageSleepTime,
    },
    {
      label: t('sleepScience.nadir', 'Nadir'),
      value: data.circadianNadir,
    },
    {
      label: t('sleepScience.acrophase', 'Acrophase'),
      value: data.circadianAcrophase,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t('sleepScience.chronotype', 'Chronotype')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full"
            style={{ backgroundColor: config.color + '20' }}
          >
            <Icon size={24} style={{ color: config.color }} />
          </div>
          <div>
            <p
              className="font-semibold text-lg"
              style={{ color: config.color }}
            >
              {t(config.labelKey, config.labelDefault)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(config.descKey, config.descDefault)}
            </p>
          </div>
        </div>

        {/* Circadian markers */}
        <div className="grid grid-cols-2 gap-3">
          {markers.map(
            (marker) =>
              marker.value && (
                <div
                  key={marker.label}
                  className="text-center p-2 rounded-lg bg-muted/50"
                >
                  <p className="text-xs text-muted-foreground">
                    {marker.label}
                  </p>
                  <p className="font-mono font-medium text-sm">
                    {marker.value}
                  </p>
                </div>
              )
          )}
        </div>

        {/* Melatonin window */}
        {data.melatoninWindowStart && (
          <div className="mt-3 text-center p-2 rounded-lg bg-purple-500/10">
            <p className="text-xs text-muted-foreground">
              {t('sleepScience.melatoninWindow', 'Melatonin Window')}
            </p>
            <p className="font-mono font-medium text-sm text-purple-500">
              {data.melatoninWindowStart} – {data.melatoninWindowEnd}
            </p>
          </div>
        )}

        {/* Confidence badge */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('sleepScience.basedOn', 'Based on {{days}} days', {
              days: data.basedOnDays,
            })}
          </span>
          <span className="capitalize px-2 py-0.5 rounded bg-muted">
            {data.confidence}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChronotypeCard;
