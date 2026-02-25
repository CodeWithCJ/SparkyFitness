import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  useCalculateBaselineMutation,
  useChronotypeQuery,
  useDailyNeedQuery,
  useDataSufficiencyQuery,
  useEnergyCurveQuery,
  useSleepDebtQuery,
} from '@/hooks/SleepScience/useSleepScience';
import { AlertTriangle, Brain, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import ChronotypeCard from './ChronotypeCard';
import EnergySchedule from './EnergySchedule';
import SleepDebtBreakdown from './SleepDebtBreakdown';
import SleepDebtHistory from './SleepDebtHistory';
import SleepDebtRing from './SleepDebtRing';
import SleepNeedBreakdown from './SleepNeedBreakdown';

interface SleepScienceSectionProps {
  targetUserId?: string;
}

const SleepScienceSection: React.FC<SleepScienceSectionProps> = ({
  targetUserId,
}) => {
  const { t } = useTranslation();

  const { data: sufficiency, isLoading: suffLoading } =
    useDataSufficiencyQuery(targetUserId);
  const { data: sleepDebt, isLoading: debtLoading } =
    useSleepDebtQuery(targetUserId);
  const { data: energyCurve, isLoading: energyLoading } =
    useEnergyCurveQuery(targetUserId);
  const { data: chronotype, isLoading: chronoLoading } =
    useChronotypeQuery(targetUserId);
  const { data: dailyNeed, isLoading: needLoading } = useDailyNeedQuery(
    undefined,
    targetUserId
  );

  const baselineMutation = useCalculateBaselineMutation();

  const isLoading =
    suffLoading || debtLoading || energyLoading || chronoLoading || needLoading;

  // Check if there's at least some data
  const hasData = sufficiency && sufficiency.totalDays > 0;
  const hasSufficientData = sufficiency?.sufficient;

  return (
    <div className="space-y-4 mt-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {t('sleepScience.title', 'Sleep Science')}
          </h3>
        </div>
        {hasData && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => baselineMutation.mutate(90)}
            disabled={baselineMutation.isPending}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1 ${baselineMutation.isPending ? 'animate-spin' : ''}`}
            />
            {t('sleepScience.recalculate', 'Recalculate')}
          </Button>
        )}
      </div>

      {/* Data Sufficiency Warning */}
      {!isLoading && sufficiency && !hasSufficientData && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">
                  {t(
                    'sleepScience.insufficientData',
                    'More data needed for full analysis'
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sufficiency.recommendation}
                </p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>
                    {t('sleepScience.workdays', 'Workdays')}:{' '}
                    {sufficiency.workdaysAvailable}/{sufficiency.workdaysNeeded}
                  </span>
                  <span>
                    {t('sleepScience.freedays', 'Free days')}:{' '}
                    {sufficiency.freedaysAvailable}/{sufficiency.freedaysNeeded}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {!isLoading && !hasData && (
        <Card>
          <CardContent className="py-8 text-center">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">
              {t('sleepScience.noData', 'No sleep data available')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                'sleepScience.noDataDesc',
                'Start tracking your sleep to unlock advanced insights.'
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sleep Debt Ring */}
          {sleepDebt && (
            <Card>
              <CardContent className="pt-6 flex justify-center">
                <SleepDebtRing data={sleepDebt} />
              </CardContent>
            </Card>
          )}

          {/* Chronotype */}
          {chronotype && chronotype.success && (
            <ChronotypeCard data={chronotype} />
          )}

          {/* Energy Curve - Full Width */}
          {energyCurve && energyCurve.success && (
            <div className="md:col-span-2">
              <EnergySchedule data={energyCurve} />
            </div>
          )}

          {/* Sleep Need Breakdown */}
          {dailyNeed && <SleepNeedBreakdown data={dailyNeed} />}

          {/* Sleep Debt History */}
          {sleepDebt && sleepDebt.last14Days.length > 0 && (
            <SleepDebtHistory data={sleepDebt} />
          )}

          {/* Sleep Debt Daily Breakdown */}
          {sleepDebt && sleepDebt.last14Days.length > 0 && (
            <div className="md:col-span-2">
              <SleepDebtBreakdown data={sleepDebt} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SleepScienceSection;
