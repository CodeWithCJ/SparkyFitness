import React from 'react';
import { useTranslation } from 'react-i18next';
import { DailyHealthMetrics } from '@workspace/shared';
import {
  Activity,
  BatteryCharging,
  Heart,
  ShieldAlert,
  Zap,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DailyHealthMetricsCardProps {
  metrics?: DailyHealthMetrics;
  isLoading?: boolean;
}

export const DailyHealthMetricsCard: React.FC<DailyHealthMetricsCardProps> = ({
  metrics,
  isLoading,
}) => {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Card className="w-full animate-pulse p-6">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 bg-muted rounded-xl"></div>
          <div className="h-20 bg-muted rounded-xl"></div>
          <div className="h-20 bg-muted rounded-xl"></div>
          <div className="h-20 bg-muted rounded-xl"></div>
        </div>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  // `== null` rather than a falsy test: 0 is a real reading (a fully drained
  // body battery, a stress level of zero) and must not render as "no data".
  const getBodyBatteryColor = (level?: number | null) => {
    if (level == null) return 'bg-muted-foreground/40';
    if (level >= 75) return 'bg-emerald-500';
    if (level >= 40) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getStressColor = (stress?: number | null) => {
    if (stress == null) return 'text-muted-foreground';
    if (stress <= 25) return 'text-emerald-500';
    if (stress <= 50) return 'text-blue-500';
    if (stress <= 75) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-500 shrink-0" />
            <CardTitle className="text-base font-bold">
              {t('dailyHealthMetrics.title', 'Daily Wearable Health Summary')}
            </CardTitle>
          </div>
          {metrics.source_provider && (
            <Badge variant="secondary" className="capitalize shrink-0">
              {metrics.source_provider}
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Fixed 2-column layout: this card lives in a narrow sidebar slot (see
          DailyProgress.tsx), so it must not rely on viewport-width breakpoints
          (sm:/lg:) — those measure the page, not this container, and cause
          overlap/truncation here. */}
      <CardContent className="pt-0 grid grid-cols-2 gap-3">
        {/* Body Battery */}
        <div className="col-span-2 p-3.5 rounded-xl bg-muted/50 border flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BatteryCharging className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{t('dailyHealthMetrics.bodyBattery', 'Body Battery')}</span>
            </div>
            <span className="text-xs font-bold text-emerald-500 whitespace-nowrap">
              +{metrics.body_battery_charged ?? 0} / -
              {metrics.body_battery_drained ?? 0}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2 flex-wrap">
            <span className="text-2xl font-black">
              {metrics.body_battery_highest ?? '--'}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              {t('dailyHealthMetrics.peak', 'peak')}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              (
              {t('dailyHealthMetrics.low', 'low: {{val}}', {
                val: metrics.body_battery_lowest ?? '--',
              })}
              )
            </span>
          </div>
          {metrics.body_battery_highest != null && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${getBodyBatteryColor(metrics.body_battery_highest)}`}
                style={{
                  width: `${Math.min(100, Math.max(0, metrics.body_battery_highest))}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Stress Level */}
        <div className="p-3.5 rounded-xl bg-muted/50 border flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
            <span>{t('dailyHealthMetrics.avgStress', 'Avg Stress')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-black ${getStressColor(metrics.avg_stress_level)}`}
            >
              {metrics.avg_stress_level ?? '--'}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {t('dailyHealthMetrics.max', 'Max: {{val}}', {
              val: metrics.max_stress_level ?? '--',
            })}
          </span>
        </div>

        {/* Resting Heart Rate */}
        <div className="p-3.5 rounded-xl bg-muted/50 border flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <Heart className="h-4 w-4 text-rose-500 shrink-0" />
            <span>{t('dailyHealthMetrics.restingHr', 'Resting HR')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-500">
              {metrics.resting_heart_rate ?? '--'}
            </span>
            <span className="text-xs text-muted-foreground">bpm</span>
          </div>
          <span className="text-[11px] text-muted-foreground truncate">
            {t('dailyHealthMetrics.recovery', 'Recovery: {{val}}', {
              val: metrics.heart_rate_recovery_1min
                ? `${metrics.heart_rate_recovery_1min} bpm`
                : '--',
            })}
          </span>
        </div>

        {/* VO2 Max */}
        <div className="p-3.5 rounded-xl bg-muted/50 border flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-cyan-500 shrink-0" />
            <span>{t('dailyHealthMetrics.vo2Max', 'VO2 Max')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-cyan-500">
              {metrics.vo2_max ?? '--'}
            </span>
            <span className="text-xs text-muted-foreground">ml/kg/min</span>
          </div>
          <span className="text-[11px] text-muted-foreground truncate">
            {t('dailyHealthMetrics.fitnessAge', 'Fit Age: {{val}}', {
              val: metrics.fitness_age ?? '--',
            })}
          </span>
        </div>

        {/* Training Readiness / Recovery */}
        <div className="p-3.5 rounded-xl bg-muted/50 border flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
            <span>{t('dailyHealthMetrics.readiness', 'Readiness')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-yellow-500">
              {metrics.training_readiness_score ?? '--'}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono truncate">
            <RefreshCw className="inline h-3 w-3 mr-0.5 text-muted-foreground" />
            {t('dailyHealthMetrics.recHours', 'Rec: {{val}}', {
              val: metrics.recovery_time_hours
                ? `${metrics.recovery_time_hours}h`
                : '--',
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
