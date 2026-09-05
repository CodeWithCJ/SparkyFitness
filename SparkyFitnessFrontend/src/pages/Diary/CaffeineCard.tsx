import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Coffee, Moon, Clock, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveCaffeineQuery } from '@/hooks/Diary/useCaffeineKinetics';
import { activeCaffeineAt } from '@workspace/shared';

interface CaffeineCardProps {
  date: string;
  userId?: string | null;
}

export const CaffeineCard = ({ date, userId }: CaffeineCardProps) => {
  const { t } = useTranslation();
  const { data, isLoading } = useActiveCaffeineQuery(date, userId);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Ticking timer: re-evaluate active caffeine continuous decay without refetching
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.doses.length === 0) {
    return null;
  }

  const {
    half_life_hours,
    target_bedtime,
    doses,
    at_bedtime_mg,
    latest_safe_dose_time,
    has_estimated_times,
  } = data;

  const currentActiveMg = activeCaffeineAt(doses, nowMs, half_life_hours);

  const getBedtimeBadge = (bedtimeMg: number) => {
    if (bedtimeMg < 25) {
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {t('diary.caffeine.sleepImpactMinimal', 'Minimal sleep impact')}
        </Badge>
      );
    }
    if (bedtimeMg < 50) {
      return (
        <Badge
          variant="secondary"
          className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {t('diary.caffeine.sleepImpactLow', 'Low sleep impact')}
        </Badge>
      );
    }
    if (bedtimeMg < 100) {
      return (
        <Badge
          variant="secondary"
          className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t('diary.caffeine.sleepImpactModerate', 'Moderate sleep impact')}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        {t('diary.caffeine.sleepImpactHigh', 'High sleep impact')}
      </Badge>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center space-x-2">
          <Coffee className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-base font-medium">
            {t('diary.caffeine.activeCaffeine', 'Active Caffeine')}
          </CardTitle>
        </div>
        {has_estimated_times && (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {t('diary.caffeine.estimatedTimes', 'Estimated times')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Active Now */}
          <div className="flex flex-col p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40">
            <span className="text-xs text-muted-foreground">
              {t('diary.caffeine.activeNow', 'Active Now')}
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {Math.round(currentActiveMg)}
              </span>
              <span className="text-xs text-muted-foreground">mg</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {t('diary.caffeine.halfLifeLabel', '{{hours}}h half-life', {
                hours: half_life_hours,
              })}
            </span>
          </div>

          {/* At Bedtime */}
          <div className="flex flex-col p-3 rounded-lg bg-muted/40 border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Moon className="w-3 h-3 text-indigo-500" />
                {t('diary.caffeine.atBedtime', 'At Bedtime')} ({target_bedtime})
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">
                {Math.round(at_bedtime_mg)}
              </span>
              <span className="text-xs text-muted-foreground">mg</span>
            </div>
            <div className="mt-1">{getBedtimeBadge(at_bedtime_mg)}</div>
          </div>

          {/* Bedtime Cutoff */}
          <div className="flex flex-col p-3 rounded-lg bg-muted/40 border col-span-2 sm:col-span-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-500" />
              {t('diary.caffeine.bedtimeCutoff', 'Last Coffee By')}
            </span>
            <div className="mt-1">
              {latest_safe_dose_time ? (
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {latest_safe_dose_time}
                </span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  {t('diary.caffeine.anytimeSafe', 'Any time')}
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {t('diary.caffeine.cutoffDesc', 'For ~200mg coffee dose')}
            </span>
          </div>
        </div>

        {/* Dose list strip */}
        <div className="space-y-1.5 pt-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t('diary.caffeine.contributingDoses', 'Recent Doses (48h)')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {doses.map((dose, idx) => (
              <div
                key={`${dose.at}-${idx}`}
                className="text-xs px-2 py-1 rounded bg-muted flex items-center gap-1.5"
              >
                <span className="font-medium">{dose.name || 'Dose'}:</span>
                <span>{dose.mg}mg</span>
                <span className="text-[10px] text-muted-foreground">
                  (
                  {new Date(dose.at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  )
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CaffeineCard;
