import React from 'react';
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

interface DailyHealthMetricsCardProps {
  metrics?: DailyHealthMetrics;
  isLoading?: boolean;
}

export const DailyHealthMetricsCard: React.FC<DailyHealthMetricsCardProps> = ({
  metrics,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Card className="w-full bg-slate-900/60 border-slate-800 animate-pulse p-6">
        <div className="h-6 bg-slate-800 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="h-20 bg-slate-800/80 rounded-xl"></div>
          <div className="h-20 bg-slate-800/80 rounded-xl"></div>
          <div className="h-20 bg-slate-800/80 rounded-xl"></div>
          <div className="h-20 bg-slate-800/80 rounded-xl"></div>
        </div>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  const getBodyBatteryColor = (level?: number | null) => {
    if (!level) return 'from-slate-600 to-slate-700';
    if (level >= 75) return 'from-emerald-500 to-teal-600';
    if (level >= 40) return 'from-amber-500 to-yellow-600';
    return 'from-rose-500 to-red-600';
  };

  const getStressColor = (stress?: number | null) => {
    if (!stress) return 'text-slate-400';
    if (stress <= 25) return 'text-emerald-400';
    if (stress <= 50) return 'text-blue-400';
    if (stress <= 75) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <Card className="w-full bg-slate-900/90 border-slate-800 shadow-xl backdrop-blur-md overflow-hidden">
      <CardHeader className="border-b border-slate-800/60 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-400" />
            <CardTitle className="text-lg font-bold text-slate-100">
              Daily Wearable Health Summary
            </CardTitle>
          </div>
          {metrics.source_provider && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/20 capitalize">
              {metrics.source_provider}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Body Battery */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-2 p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <BatteryCharging className="h-4 w-4 text-emerald-400" />
              <span>Body Battery</span>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              +{metrics.body_battery_charged ?? 0} / -
              {metrics.body_battery_drained ?? 0}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-black text-slate-100">
              {metrics.body_battery_highest ?? '--'}
            </span>
            <span className="text-xs text-slate-400 font-medium">peak</span>
            <span className="text-xs text-slate-500 font-mono">
              (low: {metrics.body_battery_lowest ?? '--'})
            </span>
          </div>
          {metrics.body_battery_highest != null && (
            <div className="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${getBodyBatteryColor(metrics.body_battery_highest)}`}
                style={{
                  width: `${Math.min(100, Math.max(0, metrics.body_battery_highest))}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Stress Level */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <span>Avg Stress</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-black ${getStressColor(metrics.avg_stress_level)}`}
            >
              {metrics.avg_stress_level ?? '--'}
            </span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Max: {metrics.max_stress_level ?? '--'}
          </span>
        </div>

        {/* Resting Heart Rate */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <Heart className="h-4 w-4 text-rose-400" />
            <span>Resting HR</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-400">
              {metrics.resting_heart_rate ?? '--'}
            </span>
            <span className="text-xs text-slate-400">bpm</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Recovery:{' '}
            {metrics.heart_rate_recovery_1min
              ? `${metrics.heart_rate_recovery_1min} bpm`
              : '--'}
          </span>
        </div>

        {/* VO2 Max */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <TrendingUp className="h-4 w-4 text-cyan-400" />
            <span>VO2 Max</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-cyan-400">
              {metrics.vo2_max ?? '--'}
            </span>
            <span className="text-xs text-slate-400">ml/kg/min</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Fit Age: {metrics.fitness_age ?? '--'}
          </span>
        </div>

        {/* Training Readiness / Recovery */}
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span>Readiness</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-yellow-400">
              {metrics.training_readiness_score ?? '--'}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            <RefreshCw className="inline h-3 w-3 mr-0.5 text-slate-400" />
            Rec:{' '}
            {metrics.recovery_time_hours
              ? `${metrics.recovery_time_hours}h`
              : '--'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
