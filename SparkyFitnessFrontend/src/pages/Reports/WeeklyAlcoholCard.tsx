import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Wine, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlcoholWeekReport } from '@/hooks/Reports/useReports';
import { Skeleton } from '@/components/ui/skeleton';
import type { AlcoholDayTotal } from '@workspace/shared';

interface WeeklyAlcoholCardProps {
  date: string;
  userId?: string | null;
}

export const WeeklyAlcoholCard = ({ date, userId }: WeeklyAlcoholCardProps) => {
  const { t } = useTranslation();
  const { data, isLoading } = useAlcoholWeekReport(date, userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const {
    week_start,
    week_end,
    standard_drinks,
    total_g,
    limit_standard_drinks,
    limit_g,
    over_limit,
    days,
  } = data;

  const percentage =
    limit_standard_drinks && limit_standard_drinks > 0
      ? Math.min(
          100,
          Math.round((standard_drinks / limit_standard_drinks) * 100)
        )
      : 0;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center space-x-2">
          <Wine className="w-5 h-5 text-indigo-500" />
          <CardTitle className="text-base font-medium">
            {t('reports.alcohol.weeklyAlcohol', 'Weekly Alcohol Intake')}
          </CardTitle>
        </div>
        <div className="text-xs text-muted-foreground">
          {week_start} – {week_end}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold">{standard_drinks}</span>
            <span className="text-sm text-muted-foreground ml-1">
              {t('reports.alcohol.standardDrinks', 'std drinks')} ({total_g}g)
            </span>
          </div>
          {limit_standard_drinks !== null ? (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {t('reports.alcohol.limit', 'Limit')}: {limit_standard_drinks} (
                {limit_g}g)
              </span>
              {over_limit ? (
                <Badge
                  variant="destructive"
                  className="flex items-center gap-1 text-xs"
                >
                  <AlertCircle className="w-3 h-3" />
                  {t('reports.alcohol.overLimit', 'Over limit')}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                >
                  <CheckCircle className="w-3 h-3" />
                  {t('reports.alcohol.onTrack', 'Under limit')}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              {t('reports.alcohol.noLimit', 'No weekly limit set')}
            </span>
          )}
        </div>

        {limit_standard_drinks !== null && (
          <div className="space-y-1">
            <Progress
              value={percentage}
              className={`h-2 ${over_limit ? '[&>div]:bg-red-500' : '[&>div]:bg-indigo-500'}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{percentage}%</span>
              <span>
                {Math.max(
                  0,
                  Number((limit_standard_drinks - standard_drinks).toFixed(1))
                )}{' '}
                {t('reports.alcohol.drinksRemaining', 'drinks remaining')}
              </span>
            </div>
          </div>
        )}

        {/* 7-day strip */}
        <div className="grid grid-cols-7 gap-1 pt-1">
          {days.map((d: AlcoholDayTotal) => {
            const dayNum = d.date.slice(8);
            const hasIntake = d.alcohol_g > 0;
            return (
              <div
                key={d.date}
                className={`flex flex-col items-center p-1.5 rounded text-xs border ${
                  hasIntake
                    ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                    : 'bg-muted/20 border-transparent'
                }`}
              >
                <span className="text-muted-foreground text-[10px]">
                  {dayNum}
                </span>
                <span
                  className={`font-semibold ${hasIntake ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}
                >
                  {d.standard_drinks > 0 ? d.standard_drinks : '-'}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
