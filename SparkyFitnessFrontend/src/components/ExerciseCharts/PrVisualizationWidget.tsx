import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWeight } from '@/utils/numberFormatting';
import { WeightUnit } from '@/contexts/PreferencesContext';

interface PrVisualizationWidgetProps {
  data: {
    oneRM: number;
    weight: number;
    reps: number;
    date: string;
  };
  exerciseName: string;
  weightUnit: WeightUnit;
  convertWeight: (
    value: number,
    fromUnit: WeightUnit,
    toUnit: WeightUnit
  ) => number;
  formatDate: (dateString: string, formatStr: string) => string;
}

export const PrVisualizationWidget = ({
  data,
  exerciseName,
  weightUnit,
  convertWeight,
  formatDate,
}: PrVisualizationWidgetProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.personalRecords',
            `Personal Records (PRs) - ${exerciseName}`,
            { exerciseName }
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
            <span className="text-xl font-bold">
              {formatWeight(data.oneRM, weightUnit)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('exerciseReportsDashboard.estimated1RM', 'Estimated 1RM')}
            </span>
            <span className="text-xs text-muted-foreground">
              ({data.reps} {t('exerciseReportsDashboard.repsAt', 'reps @')}{' '}
              {formatWeight(
                convertWeight(data.weight, 'kg', weightUnit),
                weightUnit
              )}{' '}
              {t('exerciseReportsDashboard.on', 'on')}{' '}
              {formatDate(data.date, 'MMM dd, yyyy')})
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
            <span className="text-xl font-bold">
              {formatWeight(data.weight, weightUnit)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('exerciseReportsDashboard.maxWeight', 'Max Weight')}
            </span>
            <span className="text-xs text-muted-foreground">
              ({data.reps} {t('exerciseReportsDashboard.repsShort', 'reps')}{' '}
              {t('exerciseReportsDashboard.on', 'on')}{' '}
              {formatDate(data.date, 'MMM dd, yyyy')})
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
            <span className="text-xl font-bold">
              {data.reps} {t('exerciseReportsDashboard.repsShort', 'reps')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('exerciseReportsDashboard.maxReps', 'Max Reps')}
            </span>
            <span className="text-xs text-muted-foreground">
              (
              {formatWeight(
                convertWeight(data.weight, 'kg', weightUnit),
                weightUnit
              )}{' '}
              {t('exerciseReportsDashboard.on', 'on')}{' '}
              {formatDate(data.date, 'MMM dd, yyyy')})
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
