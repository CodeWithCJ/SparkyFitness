import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { Timer, Activity } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { CombinedMeasurement } from '@/api/CheckIn/checkInService';

interface RecentActivityProps {
  convertMeasurement: (
    value: number,
    fromUnit: string,
    toUnit: string
  ) => number;
  convertWeight: (value: number, fromUnit: string, toUnit: string) => number;
  handleDeleteMeasurementClick: (
    measurement: CombinedMeasurement
  ) => Promise<void>;
  recentMeasurements: CombinedMeasurement[];
  shouldConvertCustomMeasurement: (unit: string) => boolean;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  convertMeasurement,
  convertWeight,
  handleDeleteMeasurementClick,
  recentMeasurements,
  shouldConvertCustomMeasurement,
}) => {
  const {
    weightUnit: defaultWeightUnit,
    measurementUnit: defaultMeasurementUnit,
  } = usePreferences();
  const { t } = useTranslation();

  return (
    <>
      <Card className="border-t shadow-sm">
        <CardHeader className="bg-muted/10">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            {t('checkIn.recentMeasurements', 'Recent Activity')}
          </CardTitle>
          <CardDescription>
            Your latest logs including measurements, completed fasts, and synced
            health data.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {recentMeasurements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No recent activity found.
              </div>
            ) : (
              recentMeasurements.map((measurement) => {
                let displayValue = measurement.value;
                let displayUnit = measurement.display_unit;
                let measurementName = measurement.display_name;

                if (
                  measurement.type === 'custom' &&
                  measurement.custom_categories
                ) {
                  const isConvertible = shouldConvertCustomMeasurement(
                    measurement.custom_categories.measurement_type
                  );
                  displayValue = isConvertible
                    ? typeof measurement.value === 'number'
                      ? convertMeasurement(
                          measurement.value,
                          'cm',
                          defaultMeasurementUnit
                        )
                      : measurement.value
                    : measurement.value;
                  displayUnit = isConvertible
                    ? defaultMeasurementUnit
                    : measurement.custom_categories.measurement_type;
                } else if (measurement.type === 'standard') {
                  // Apply unit conversion for standard measurements if applicable
                  if (measurement.display_name === 'Weight') {
                    displayValue =
                      typeof measurement.value === 'number'
                        ? convertWeight(
                            measurement.value,
                            'kg',
                            defaultWeightUnit
                          )
                        : measurement.value;
                    displayUnit = defaultWeightUnit;
                  } else if (
                    ['Neck', 'Waist', 'Hips'].includes(measurement.display_name)
                  ) {
                    displayValue =
                      typeof measurement.value === 'number'
                        ? convertMeasurement(
                            measurement.value,
                            'cm',
                            defaultMeasurementUnit
                          )
                        : measurement.value;
                    displayUnit = defaultMeasurementUnit;
                  } else if (measurement.display_name === 'Height') {
                    displayValue =
                      typeof measurement.value === 'number'
                        ? convertMeasurement(
                            measurement.value,
                            'cm',
                            defaultMeasurementUnit
                          )
                        : measurement.value;
                    displayUnit = defaultMeasurementUnit;
                  }
                } else if (measurement.type === 'stress') {
                  measurementName = t('checkIn.stressLevel', 'Stress Level');
                  displayUnit = t('checkIn.level', 'level');
                } else if (measurement.type === 'exercise') {
                  measurementName =
                    measurement.exercise_name ||
                    t('checkIn.exercise', 'Exercise');
                  displayValue = `${measurement.duration_minutes?.toFixed(0) || 0} min`;
                  displayUnit = `${measurement.calories_burned?.toFixed(0) || 0} kcal`;
                }
                // Format displayValue to one decimal place if it's a number
                const formattedDisplayValue =
                  typeof displayValue === 'number'
                    ? displayValue.toFixed(1)
                    : displayValue;

                return (
                  <div
                    key={measurement.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-full ${measurement.type === 'fasting' ? 'bg-orange-100 text-orange-600' : 'bg-primary/10 text-primary'}`}
                      >
                        {measurement.type === 'fasting' ? (
                          <Timer className="w-4 h-4" />
                        ) : (
                          <ClipboardList className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {measurement.type === 'fasting'
                            ? measurement.fasting_type
                            : measurementName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(
                            new Date(measurement.entry_timestamp),
                            'h:mm a'
                          )}{' '}
                          &middot;{' '}
                          {format(
                            new Date(measurement.entry_timestamp),
                            'MMM d'
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums text-right">
                      {measurement.type === 'fasting' ? (
                        <span className="text-orange-600">
                          {measurement.duration_minutes
                            ? `${Math.floor(measurement.duration_minutes / 60)}h ${measurement.duration_minutes % 60}m`
                            : '0h 0m'}
                        </span>
                      ) : (
                        <span>
                          {formattedDisplayValue?.toString()?.slice(0, 50)}{' '}
                          <span className="text-xs text-muted-foreground ml-0.5">
                            {displayUnit}
                          </span>
                        </span>
                      )}
                      {(measurement.type === 'custom' ||
                        measurement.type === 'standard' ||
                        measurement.type === 'stress' ||
                        measurement.type === 'exercise') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-2 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            handleDeleteMeasurementClick(measurement)
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
};
