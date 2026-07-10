import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, ClipboardList, Timer, Trash2 } from 'lucide-react';
import {
  MeasurementUnit,
  usePreferences,
  WeightUnit,
} from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { CombinedMeasurement } from '@/types/checkin';
import { formatWeight, formatHeight } from '@/utils/numberFormatting';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

const SYSTEM_MEASUREMENT_KEYS: Readonly<Record<string, string>> = {
  Weight: 'checkIn.weight',
  Neck: 'checkIn.neck',
  Waist: 'checkIn.waist',
  Hips: 'checkIn.hips',
  Height: 'checkIn.height',
  Steps: 'checkIn.steps',
  'Body Fat %': 'checkIn.bodyFatPercentage',
  BMI: 'checkIn.measurements.bmi',
  'Body Water Percentage': 'checkIn.measurements.bodyWaterPercentage',
  'Bone Mass': 'checkIn.measurements.boneMass',
  'Muscle Mass': 'checkIn.measurements.muscleMass',
  'Resting Heart Rate': 'checkIn.measurements.restingHeartRate',
  'Sleep Duration': 'checkIn.measurements.sleepDuration',
  'Stress Level': 'checkIn.measurements.stressLevel',
  'Average Respiration Rate': 'checkIn.measurements.averageRespirationRate',
  'Sleep Respiration Avg': 'checkIn.measurements.sleepRespirationAverage',
  'Awake Respiration Avg': 'checkIn.measurements.awakeRespirationAverage',
  'Average SpO2': 'checkIn.measurements.averageSpO2',
  'Total Intensity Minutes': 'checkIn.measurements.totalIntensityMinutes',
  'Training Readiness Score': 'checkIn.measurements.trainingReadinessScore',
  'Training Status': 'checkIn.measurements.trainingStatus',
  'VO2 Max': 'checkIn.measurements.vo2Max',
  'Average Overnight HRV': 'checkIn.measurements.averageOvernightHrv',
  'HRV Status': 'checkIn.measurements.hrvStatus',
  'HRV Weekly Average': 'checkIn.measurements.hrvWeeklyAverage',
  'HRV Baseline Low': 'checkIn.measurements.hrvBaselineLow',
  'HRV Baseline High': 'checkIn.measurements.hrvBaselineHigh',
  'HRV Last Night Average': 'checkIn.measurements.hrvLastNightAverage',
  'HRV Last Night 5min High': 'checkIn.measurements.hrvLastNightFiveMinuteHigh',
  'HRV Baseline Balanced Low': 'checkIn.measurements.hrvBalancedLow',
  'HRV Baseline Balanced Upper': 'checkIn.measurements.hrvBalancedUpper',
  'Lactate Threshold HR': 'checkIn.measurements.lactateThresholdHeartRate',
  'Endurance Score': 'checkIn.measurements.enduranceScore',
  'Hill Score': 'checkIn.measurements.hillScore',
  '5K Race Prediction': 'checkIn.measurements.fiveKPrediction',
  'Blood Pressure': 'checkIn.measurements.bloodPressure',
  'Body Battery Highest': 'checkIn.measurements.bodyBatteryHighest',
  'Body Battery Lowest': 'checkIn.measurements.bodyBatteryLowest',
  'Body Battery At Wake': 'checkIn.measurements.bodyBatteryAtWake',
  'Body Battery Charged': 'checkIn.measurements.bodyBatteryCharged',
  'Body Battery Drained': 'checkIn.measurements.bodyBatteryDrained',
  'Body Battery Current': 'checkIn.measurements.bodyBatteryCurrent',
  'Total Distance': 'checkIn.measurements.totalDistance',
  'Highly Active Minutes': 'checkIn.measurements.highlyActiveMinutes',
  'Active Minutes': 'checkIn.measurements.activeMinutes',
  'Sedentary Minutes': 'checkIn.measurements.sedentaryMinutes',
  'Floors Ascended': 'checkIn.measurements.floorsAscended',
  'Floors Descended': 'checkIn.measurements.floorsDescended',
  'Stress Duration Total': 'checkIn.measurements.stressDurationTotal',
  'Stress Duration Rest': 'checkIn.measurements.stressDurationRest',
  'Stress Duration Activity': 'checkIn.measurements.stressDurationActivity',
  'Stress Duration Uncategorized':
    'checkIn.measurements.stressDurationUncategorized',
  'Stress Duration Low': 'checkIn.measurements.stressDurationLow',
  'Stress Duration Medium': 'checkIn.measurements.stressDurationMedium',
  'Stress Duration High': 'checkIn.measurements.stressDurationHigh',
  'Stress Percentage Low': 'checkIn.measurements.stressPercentageLow',
  'Stress Percentage Medium': 'checkIn.measurements.stressPercentageMedium',
  'Stress Percentage High': 'checkIn.measurements.stressPercentageHigh',
  'Visceral Fat Level': 'checkIn.measurements.visceralFatLevel',
  'Fitness Age': 'checkIn.measurements.fitnessAge',
  'Recovery Time': 'checkIn.measurements.recoveryTime',
  'Training Load': 'checkIn.measurements.trainingLoad',
  'Acute Training Load': 'checkIn.measurements.acuteTrainingLoad',
  'Chronic Training Load': 'checkIn.measurements.chronicTrainingLoad',
  'Training Load Balance': 'checkIn.measurements.trainingLoadBalance',
  '10K Race Prediction': 'checkIn.measurements.tenKPrediction',
  'Half Marathon Race Prediction':
    'checkIn.measurements.halfMarathonPrediction',
  'Marathon Race Prediction': 'checkIn.measurements.marathonPrediction',
};

interface RecentActivityProps {
  convertMeasurement: (
    value: number,
    fromUnit: MeasurementUnit,
    toUnit: MeasurementUnit
  ) => number;
  convertWeight: (
    value: number,
    fromUnit: WeightUnit,
    toUnit: WeightUnit
  ) => number;
  handleDeleteMeasurementClick: (
    measurement: CombinedMeasurement
  ) => Promise<void>;
  recentMeasurements: CombinedMeasurement[];
  shouldConvertCustomMeasurement: (unit: string) => boolean;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  handleDeleteMeasurementClick,
  recentMeasurements,
  shouldConvertCustomMeasurement,
}) => {
  const {
    weightUnit: defaultWeightUnit,
    measurementUnit: defaultMeasurementUnit,
    measurementDecimalPlaces,
    formatDateInUserTimezone,
  } = usePreferences();
  const { t } = useTranslation();
  const localizeMeasurementName = (name: string) => {
    const key = SYSTEM_MEASUREMENT_KEYS[name];
    return key ? t(key, name) : name;
  };
  const localizeConvertedValue = (value: string) =>
    value.replace(
      /(-?\d+(?:\.\d+)?)\s*(st|lbs|kg|cm|in)\b/gi,
      (_match, amount: string, unit: string) =>
        `${amount} ${getLocalizedUnitLabel(unit, t)}`
    );

  return (
    <>
      <Card className="border-t shadow-sm">
        <CardHeader className="bg-muted/10">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('checkIn.recentMeasurements', 'Recent Activity')}
          </CardTitle>
          <CardDescription>
            {t(
              'checkIn.recentActivityDescription',
              'Your latest logs including measurements, completed fasts, and synced health data.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {recentMeasurements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t('checkIn.noRecentActivity', 'No recent activity found.')}
              </div>
            ) : (
              recentMeasurements.map((measurement) => {
                let displayString: string;
                let measurementName = localizeMeasurementName(
                  measurement.display_name
                );

                if (
                  measurement.type === 'custom' &&
                  measurement.custom_categories
                ) {
                  const isConvertible = shouldConvertCustomMeasurement(
                    measurement.custom_categories.measurement_type
                  );
                  if (isConvertible) {
                    const isWeight =
                      measurement.custom_categories.measurement_type === 'kg' ||
                      measurement.custom_categories.measurement_type ===
                        'lbs' ||
                      measurement.custom_categories.measurement_type ===
                        'st_lbs';
                    displayString = localizeConvertedValue(
                      isWeight
                        ? formatWeight(
                            Number(measurement.value),
                            defaultWeightUnit
                          )
                        : formatHeight(
                            Number(measurement.value),
                            defaultMeasurementUnit
                          )
                    );
                  } else {
                    const unit =
                      measurement.custom_categories.measurement_type === 'N/A'
                        ? ''
                        : measurement.custom_categories.measurement_type;
                    const num = Number(measurement.value);
                    const val =
                      measurement.value === '' || isNaN(num)
                        ? measurement.value
                        : Number(num.toFixed(measurementDecimalPlaces));
                    displayString =
                      `${val} ${getLocalizedUnitLabel(unit, t)}`.trim();
                  }
                } else if (measurement.type === 'standard') {
                  if (measurement.display_name === 'Weight') {
                    displayString = localizeConvertedValue(
                      formatWeight(Number(measurement.value), defaultWeightUnit)
                    );
                  } else if (
                    ['Neck', 'Waist', 'Hips', 'Height'].includes(
                      measurement.display_name
                    )
                  ) {
                    displayString = localizeConvertedValue(
                      formatHeight(
                        Number(measurement.value),
                        defaultMeasurementUnit
                      )
                    );
                  } else {
                    const unit =
                      measurement.display_unit === 'N/A'
                        ? ''
                        : measurement.display_unit || '';
                    const num = Number(measurement.value);
                    const val =
                      measurement.value === '' || isNaN(num)
                        ? measurement.value
                        : Number(num.toFixed(measurementDecimalPlaces));
                    displayString =
                      `${val} ${getLocalizedUnitLabel(unit, t)}`.trim();
                  }
                } else if (measurement.type === 'stress') {
                  measurementName = t('checkIn.stressLevel', 'Stress Level');
                  displayString = t('checkIn.levelValue', 'Level {{value}}', {
                    value: measurement.value,
                  });
                } else if (measurement.type === 'exercise') {
                  measurementName =
                    measurement.exercise_name ||
                    t('checkIn.exercise', 'Exercise');
                  displayString = t(
                    'checkIn.exerciseSummary',
                    '{{duration}} min / {{calories}} kcal',
                    {
                      duration: measurement.duration_minutes?.toFixed(0) || '0',
                      calories: measurement.calories_burned?.toFixed(0) || '0',
                    }
                  );
                } else if (measurement.type === 'fasting') {
                  displayString = measurement.duration_minutes
                    ? t('units.hourMinuteValue', {
                        hours: Math.floor(measurement.duration_minutes / 60),
                        minutes: measurement.duration_minutes % 60,
                      })
                    : t('units.hourMinuteValue', { hours: 0, minutes: 0 });
                } else {
                  const unit =
                    measurement.display_unit === 'N/A'
                      ? ''
                      : measurement.display_unit || '';
                  const num = Number(measurement.value);
                  const val =
                    measurement.value === '' || isNaN(num)
                      ? measurement.value
                      : Math.round(num);
                  displayString =
                    `${val} ${getLocalizedUnitLabel(unit, t)}`.trim();
                }

                return (
                  <div
                    key={measurement.id}
                    className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-full ${measurement.type === 'fasting' ? 'bg-orange-100 text-orange-600' : 'bg-primary/10 text-primary'}`}
                      >
                        {measurement.type === 'fasting' ? (
                          <Timer className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ClipboardList
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {measurement.type === 'fasting'
                            ? measurement.fasting_type
                            : measurementName}
                        </p>
                        <time
                          dateTime={measurement.entry_timestamp}
                          className="text-xs text-muted-foreground"
                        >
                          {formatDateInUserTimezone(
                            measurement.entry_timestamp,
                            'h:mm a'
                          )}{' '}
                          &middot;{' '}
                          {formatDateInUserTimezone(
                            measurement.entry_timestamp,
                            'd MMM'
                          )}
                        </time>
                      </div>
                    </div>
                    <div className="text-end font-semibold tabular-nums">
                      {measurement.type === 'fasting' ? (
                        <span className="text-orange-600">{displayString}</span>
                      ) : (
                        <span>{displayString}</span>
                      )}
                      {(measurement.type === 'custom' ||
                        measurement.type === 'standard' ||
                        measurement.type === 'stress' ||
                        measurement.type === 'exercise') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ms-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                          aria-label={t(
                            'checkIn.deleteMeasurement',
                            'Delete {{measurement}}',
                            { measurement: measurementName }
                          )}
                          onClick={() =>
                            handleDeleteMeasurementClick(measurement)
                          }
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
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
