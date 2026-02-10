import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Moon, Heart, Activity, Battery, Wind, Waves } from 'lucide-react';
import type { SleepEntry } from '@/types';
import { usePreferences } from '@/contexts/PreferencesContext';

interface SleepSummaryCardProps {
  latestSleepEntry: SleepEntry | null;
}

const SleepSummaryCard: React.FC<SleepSummaryCardProps> = ({
  latestSleepEntry,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  if (!latestSleepEntry) {
    return null;
  }

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getBatteryColor = (change: number | null) => {
    if (change === null) return 'text-muted-foreground';
    if (change >= 50) return 'text-green-500';
    if (change >= 30) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const stats = [
    {
      icon: Moon,
      label: t('sleepSummary.duration', 'Duration'),
      value: formatDuration(latestSleepEntry.duration_in_seconds),
      color: 'text-blue-500',
    },
    {
      icon: Activity,
      label: t('sleepSummary.sleepScore', 'Sleep Score'),
      value: latestSleepEntry.sleep_score
        ? `${latestSleepEntry.sleep_score}`
        : '--',
      color: getScoreColor(latestSleepEntry.sleep_score),
    },
    {
      icon: Heart,
      label: t('sleepSummary.restingHR', 'Resting HR'),
      value: latestSleepEntry.resting_heart_rate
        ? `${latestSleepEntry.resting_heart_rate} bpm`
        : '--',
      color: 'text-red-500',
    },
    {
      icon: Battery,
      label: t('sleepSummary.batteryChange', 'Battery'),
      value:
        latestSleepEntry.body_battery_change !== null
          ? `${latestSleepEntry.body_battery_change > 0 ? '+' : ''}${latestSleepEntry.body_battery_change}`
          : '--',
      color: getBatteryColor(latestSleepEntry.body_battery_change),
    },
    {
      icon: Waves,
      label: t('sleepSummary.restless', 'Restless Moments'),
      value:
        latestSleepEntry.restless_moments_count !== null
          ? `${latestSleepEntry.restless_moments_count}`
          : '--',
      color: 'text-purple-500',
    },
    {
      icon: Wind,
      label: t('sleepSummary.avgSpO2', 'Avg SpO2'),
      value: latestSleepEntry.average_spo2_value
        ? `${latestSleepEntry.average_spo2_value}%`
        : '--',
      color: 'text-green-500',
    },
    {
      icon: Activity,
      label: t('sleepSummary.avgHRV', 'Avg HRV'),
      value: latestSleepEntry.avg_overnight_hrv
        ? `${Math.round(latestSleepEntry.avg_overnight_hrv)} ms`
        : '--',
      color: 'text-cyan-500',
    },
    {
      icon: Wind,
      label: t('sleepSummary.avgResp', 'Avg Resp'),
      value: latestSleepEntry.average_respiration_value
        ? `${latestSleepEntry.average_respiration_value} brpm`
        : '--',
      color: 'text-teal-500',
    },
  ];

  // Filter out stats with '--' value if you want to hide empty ones
  const visibleStats = stats.filter((stat) => stat.value !== '--');

  return (
    <Card className="w-full col-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center">
            <Moon className="w-5 h-5 mr-2" />
            {t('sleepSummary.lastNight', 'Last Night')}
          </div>
          <span className="text-sm font-normal text-muted-foreground">
            {formatDateInUserTimezone(
              latestSleepEntry.entry_date,
              'EEEE, MMM d'
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
          {visibleStats.map((stat, index) => (
            <div key={index} className="text-center">
              <stat.icon className={`w-5 h-5 mx-auto mb-1 ${stat.color}`} />
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default SleepSummaryCard;
