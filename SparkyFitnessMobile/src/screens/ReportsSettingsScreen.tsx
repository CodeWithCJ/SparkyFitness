import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import { getNutrientLabel } from '../constants/nutrients';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useServerConnection } from '../hooks/useServerConnection';
import {
  EXERCISE_SECTIONS,
  HYDRATION_SECTIONS,
  MEASUREMENTS_SECTIONS,
  MOOD_SECTIONS,
  NUTRITION_SECTIONS,
  REPORT_KEYS,
  REPORT_NUTRIENT_KEYS,
  SUBSTANCES_SECTIONS,
  REPORT_LABELS,
  SLEEP_SECTIONS,
  sleepMetricSection,
  type ReportSectionKey,
} from '../constants/reports';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveKeyOrder } from '../utils/reorderUtils';
import { SLEEP_ANALYTICS_METRICS } from '../utils/sleepAnalytics';
import { trendRangeSegments } from '../utils/trendRange';

type ReportsSettingsScreenProps = RootStackScreenProps<'ReportsSettings'>;

type Translator = ReturnType<typeof useTranslation>['t'];

/**
 * Section names as this screen lists them. Written out rather than derived from
 * the report screens' own headings because the i18n audit needs the literal
 * key at each call site; a total record so a section added to
 * `constants/reports.ts` without a name here is a compile error.
 */
const SECTION_LABELS: Record<
  Exclude<ReportSectionKey, `sleep.metric.${string}`>,
  (t: Translator) => string
> = {
  'nutrition.insights': (t) =>
    t('reportsSettings.sections.insights', { defaultValue: 'What stood out' }),
  'nutrition.overview': (t) =>
    t('reportsSettings.sections.overview', { defaultValue: 'Key figures' }),
  'nutrition.chart': (t) =>
    t('reportsSettings.sections.nutritionChart', {
      defaultValue: 'Calorie chart',
    }),
  'nutrition.averages': (t) =>
    t('reportsSettings.sections.nutritionAverages', {
      defaultValue: 'Daily averages',
    }),
  'nutrition.macroSplit': (t) =>
    t('reportsSettings.sections.macroSplit', { defaultValue: 'Macro split' }),
  'nutrition.goal': (t) =>
    t('reportsSettings.sections.calorieGoal', { defaultValue: 'Calorie goal' }),
  'nutrition.highlights': (t) =>
    t('reportsSettings.sections.highestLowest', {
      defaultValue: 'Highest and lowest days',
    }),
  'nutrition.macroGoals': (t) =>
    t('reportsSettings.sections.macroGoals', { defaultValue: 'Macro goals' }),
  'nutrition.weekdays': (t) =>
    t('reportsSettings.sections.nutritionWeekdays', {
      defaultValue: 'Calories by weekday',
    }),
  'nutrition.consistency': (t) =>
    t('reportsSettings.sections.loggingConsistency', {
      defaultValue: 'Logging consistency',
    }),
  'exercise.overview': (t) =>
    t('reportsSettings.sections.exerciseOverview', {
      defaultValue: 'Workouts, volume and reps',
    }),
  'exercise.setsPerMuscle': (t) =>
    t('reportsSettings.sections.setsPerMuscle', {
      defaultValue: 'Sets per muscle',
    }),
  'exercise.heatMap': (t) =>
    t('reportsSettings.sections.heatMap', { defaultValue: 'Muscle heat map' }),
  'exercise.consistency': (t) =>
    t('reportsSettings.sections.trainingConsistency', {
      defaultValue: 'Training consistency',
    }),
  'exercise.load': (t) =>
    t('reportsSettings.sections.trainingLoad', {
      defaultValue: 'Training load',
    }),
  'exercise.analysis': (t) =>
    t('reportsSettings.sections.moreAnalysis', {
      defaultValue: 'More analysis',
    }),
  'substances.insights': (t) =>
    t('reportsSettings.sections.insights', { defaultValue: 'What stood out' }),
  'substances.overview': (t) =>
    t('reportsSettings.sections.overview', { defaultValue: 'Key figures' }),
  'substances.caffeineChart': (t) =>
    t('reportsSettings.sections.caffeineChart', {
      defaultValue: 'Caffeine chart',
    }),
  'substances.caffeine': (t) =>
    t('reportsSettings.sections.caffeineSummary', {
      defaultValue: 'Caffeine summary',
    }),
  'substances.alcoholChart': (t) =>
    t('reportsSettings.sections.alcoholChart', {
      defaultValue: 'Alcohol chart',
    }),
  'substances.alcohol': (t) =>
    t('reportsSettings.sections.alcoholSummary', {
      defaultValue: 'Alcohol summary',
    }),
  'substances.weekly': (t) =>
    t('reportsSettings.sections.substancesWeekly', {
      defaultValue: 'Week by week',
    }),
  'hydration.insights': (t) =>
    t('reportsSettings.sections.insights', { defaultValue: 'What stood out' }),
  'hydration.overview': (t) =>
    t('reportsSettings.sections.overview', { defaultValue: 'Key figures' }),
  'hydration.chart': (t) =>
    t('reportsSettings.sections.hydrationChart', {
      defaultValue: 'Hydration chart',
    }),
  'hydration.goal': (t) =>
    t('reportsSettings.sections.waterGoal', { defaultValue: 'Water goal' }),
  'hydration.highlights': (t) =>
    t('reportsSettings.sections.hydrationHighlights', {
      defaultValue: 'Best and lowest days',
    }),
  'hydration.weekdays': (t) =>
    t('reportsSettings.sections.hydrationWeekdays', {
      defaultValue: 'Average by weekday',
    }),
  'measurements.insights': (t) =>
    t('reportsSettings.sections.insights', { defaultValue: 'What stood out' }),
  'measurements.overview': (t) =>
    t('reportsSettings.sections.overview', { defaultValue: 'Key figures' }),
  'measurements.weightChart': (t) =>
    t('reportsSettings.sections.weightChart', { defaultValue: 'Weight chart' }),
  'measurements.weight': (t) =>
    t('reportsSettings.sections.weightSummary', {
      defaultValue: 'Weight summary',
    }),
  'measurements.bodyComposition': (t) =>
    t('reportsSettings.sections.bodyComposition', {
      defaultValue: 'Body composition',
    }),
  'measurements.tape': (t) =>
    t('reportsSettings.sections.tape', { defaultValue: 'Body measurements' }),
  'measurements.stepsChart': (t) =>
    t('reportsSettings.sections.stepsChart', { defaultValue: 'Steps chart' }),
  'sleep.weekendVsWeekday': (t) =>
    t('reportsSettings.sections.sleepWeekend', {
      defaultValue: 'Weekdays vs weekends',
    }),
  'sleep.nights': (t) =>
    t('reportsSettings.sections.sleepNights', { defaultValue: 'Nights' }),
  'nutrition.fats': (t) =>
    t('reportsSettings.sections.fatBreakdown', {
      defaultValue: 'Fat breakdown',
    }),
  'nutrition.micros': (t) =>
    t('reportsSettings.sections.micronutrients', {
      defaultValue: 'Vitamins and minerals',
    }),
  'nutrition.otherNutrients': (t) =>
    t('reportsSettings.sections.otherNutrients', {
      defaultValue: 'Your nutrients',
    }),
  'nutrition.trends': (t) =>
    t('reportsSettings.sections.nutrientTrends', {
      defaultValue: 'Trend by nutrient',
    }),
  'sleep.insights': (t) =>
    t('reportsSettings.sections.insights', { defaultValue: 'What stood out' }),
  'sleep.overview': (t) =>
    t('reportsSettings.sections.overview', { defaultValue: 'Key figures' }),
  'sleep.stages': (t) =>
    t('reportsSettings.sections.sleepStages', {
      defaultValue: 'Average night',
    }),
  'sleep.routine': (t) =>
    t('reportsSettings.sections.sleepRoutine', { defaultValue: 'Routine' }),
  'sleep.averages': (t) =>
    t('reportsSettings.sections.sleepAverages', {
      defaultValue: 'Period averages',
    }),
  'mood.insights': (t) =>
    t('reportsSettings.sections.insights', { defaultValue: 'What stood out' }),
  'mood.overview': (t) =>
    t('reportsSettings.sections.overview', { defaultValue: 'Key figures' }),
  'mood.chart': (t) =>
    t('reportsSettings.sections.moodChart', {
      defaultValue: 'Daily mood chart',
    }),
  'mood.summary': (t) =>
    t('reportsSettings.sections.moodSummary', { defaultValue: 'Summary' }),
  'mood.highlights': (t) =>
    t('reportsSettings.sections.moodHighlights', {
      defaultValue: 'Best and lowest days',
    }),
  'mood.byWeekday': (t) =>
    t('reportsSettings.sections.moodByWeekday', {
      defaultValue: 'Average by weekday',
    }),
  'mood.topMoods': (t) =>
    t('reportsSettings.sections.moodTopMoods', { defaultValue: 'Most logged' }),
};

const SLEEP_METRIC_LABELS: Record<
  (typeof SLEEP_ANALYTICS_METRICS)[number],
  (t: Translator) => string
> = {
  duration: (t) =>
    t('sleepAnalytics.metrics.duration', { defaultValue: 'Time asleep' }),
  sleepScore: (t) =>
    t('sleepAnalytics.metrics.sleepScore', { defaultValue: 'Sleep score' }),
  hrv: (t) =>
    t('sleepAnalytics.metrics.hrv', { defaultValue: 'Overnight HRV' }),
  restingHeartRate: (t) =>
    t('sleepAnalytics.metrics.restingHeartRate', {
      defaultValue: 'Resting heart rate',
    }),
  spo2: (t) =>
    t('sleepAnalytics.metrics.spo2', { defaultValue: 'Blood oxygen (SpO2)' }),
  respiration: (t) =>
    t('sleepAnalytics.metrics.respiration', { defaultValue: 'Respiration' }),
  stress: (t) =>
    t('sleepAnalytics.metrics.stress', { defaultValue: 'Sleep stress' }),
  bodyBattery: (t) =>
    t('sleepAnalytics.metrics.bodyBattery', {
      defaultValue: 'Body battery gained',
    }),
};

/**
 * Reports → Customize: which reports the hub lists and in what order, the
 * window a report opens on, and which sections each report shows. Stored on the
 * phone only (`appPreferencesStore`), like the Health Trends and Apple Watch
 * layouts.
 */
const ReportsSettingsScreen: React.FC<ReportsSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });
  const reportNutrientOrder = useAppPreferencesStore(
    (s) => s.reportNutrientOrder
  );
  const shownReportNutrients = useAppPreferencesStore(
    (s) => s.shownReportNutrients
  );
  const setReportNutrientOrder = useAppPreferencesStore(
    (s) => s.setReportNutrientOrder
  );
  const setReportNutrientShown = useAppPreferencesStore(
    (s) => s.setReportNutrientShown
  );
  const reportOrder = useAppPreferencesStore((s) => s.reportOrder);
  const hiddenReports = useAppPreferencesStore((s) => s.hiddenReports);
  const reportDefaultRange = useAppPreferencesStore(
    (s) => s.reportDefaultRange
  );
  const hiddenReportSections = useAppPreferencesStore(
    (s) => s.hiddenReportSections
  );
  const setReportOrder = useAppPreferencesStore((s) => s.setReportOrder);
  const setReportHidden = useAppPreferencesStore((s) => s.setReportHidden);
  const setReportDefaultRange = useAppPreferencesStore(
    (s) => s.setReportDefaultRange
  );
  const setReportSectionHidden = useAppPreferencesStore(
    (s) => s.setReportSectionHidden
  );
  const resetReportCustomization = useAppPreferencesStore(
    (s) => s.resetReportCustomization
  );

  const reportItems = useMemo(
    () =>
      resolveKeyOrder(reportOrder, REPORT_KEYS).map((key) => ({
        key,
        label: REPORT_LABELS[key](t),
      })),
    [reportOrder, t]
  );
  // Standard nutrients, then the account's custom ones, in the saved order.
  const nutrientItems = useMemo(() => {
    const customNames = customNutrients.map((def) => def.name);
    return resolveKeyOrder(reportNutrientOrder, [
      ...REPORT_NUTRIENT_KEYS,
      ...customNames,
    ]).map((key) => ({
      key,
      label: customNames.includes(key) ? key : getNutrientLabel(t, key),
    }));
  }, [reportNutrientOrder, customNutrients, t]);
  const shownReportCount = reportItems.filter(
    ({ key }) => !hiddenReports.includes(key)
  ).length;

  const header = useScreenHeader({
    title: t('screens.reportsSettings', { defaultValue: 'Customize Reports' }),
    left: { kind: 'back' },
    right: {
      kind: 'text',
      label: t('reportsSettings.reset', { defaultValue: 'Reset' }),
      accessibilityLabel: t('reportsSettings.resetA11y', {
        defaultValue: 'Reset reports to their defaults',
      }),
      onPress: resetReportCustomization,
    },
  });

  const renderSections = (
    title: string,
    prefix: string,
    keys: readonly ReportSectionKey[],
    labelFor: (key: ReportSectionKey) => string
  ) => (
    <View>
      <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
        {title}
      </Text>
      {keys.map((key) => (
        <SettingsRow
          key={key}
          title={labelFor(key)}
          rightAccessory={
            <Switch
              testID={`${prefix}-${key}`}
              value={!hiddenReportSections.includes(key)}
              onValueChange={(enabled) => setReportSectionHidden(key, !enabled)}
            />
          }
        />
      ))}
    </View>
  );

  const sectionLabel = (key: ReportSectionKey): string =>
    key.startsWith('sleep.metric.')
      ? SLEEP_METRIC_LABELS[
          key.slice('sleep.metric.'.length) as keyof typeof SLEEP_METRIC_LABELS
        ](t)
      : SECTION_LABELS[key as keyof typeof SECTION_LABELS](t);

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('reportsSettings.reportsTitle', { defaultValue: 'Reports' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('reportsSettings.reportsDescription', {
            defaultValue:
              'Drag a report by its handle to change the order on the Reports page. Toggle one off to hide it.',
          })}
        </Text>
        <ReorderSwitchList
          items={reportItems}
          testIDPrefix="reports-report"
          isEnabled={(key) => !hiddenReports.includes(key)}
          isSwitchDisabled={(key) =>
            !hiddenReports.includes(key) && shownReportCount <= 1
          }
          onToggle={(key, enabled) => setReportHidden(key, !enabled)}
          onReorder={setReportOrder}
          reorderA11yLabel={(name) =>
            t('reportsSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('reportsSettings.reorderHint', {
            defaultValue: 'Changes where this report sits on the Reports page',
          })}
        />

        <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
          {t('reportsSettings.rangeTitle', { defaultValue: 'Default range' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('reportsSettings.rangeDescription', {
            defaultValue:
              'The window a report opens on. You can still switch it while viewing a report.',
          })}
        </Text>
        <SegmentedControl
          segments={trendRangeSegments(t)}
          activeKey={reportDefaultRange}
          onSelect={setReportDefaultRange}
        />

        {renderSections(
          t('reportsSettings.nutritionSections', {
            defaultValue: 'Nutrition report',
          }),
          'reports-section',
          NUTRITION_SECTIONS,
          sectionLabel
        )}
        <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
          {t('reportsSettings.nutrientsTitle', {
            defaultValue: 'Nutrition report nutrients',
          })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('reportsSettings.nutrientsDescription', {
            defaultValue:
              'Pick the vitamins, minerals and other nutrients the Nutrition report averages under Your nutrients, and drag to set their order. Custom nutrients are included.',
          })}
        </Text>
        <ReorderSwitchList
          items={nutrientItems}
          testIDPrefix="reports-nutrient"
          isEnabled={(key) => shownReportNutrients.includes(key)}
          onToggle={(key, enabled) => setReportNutrientShown(key, enabled)}
          onReorder={setReportNutrientOrder}
          reorderA11yLabel={(name) =>
            t('reportsSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('reportsSettings.nutrientReorderHint', {
            defaultValue: 'Changes where this nutrient sits in the report',
          })}
        />

        {renderSections(
          t('reportsSettings.hydrationSections', {
            defaultValue: 'Hydration report',
          }),
          'reports-section',
          HYDRATION_SECTIONS,
          sectionLabel
        )}
        {renderSections(
          t('reportsSettings.substancesSections', {
            defaultValue: 'Caffeine and alcohol report',
          }),
          'reports-section',
          SUBSTANCES_SECTIONS,
          sectionLabel
        )}
        {renderSections(
          t('reportsSettings.sleepSections', {
            defaultValue: 'Sleep analytics report',
          }),
          'reports-section',
          [
            ...SLEEP_SECTIONS,
            ...SLEEP_ANALYTICS_METRICS.map(sleepMetricSection),
          ],
          sectionLabel
        )}
        {renderSections(
          t('reportsSettings.exerciseSections', {
            defaultValue: 'Exercise report',
          }),
          'reports-section',
          EXERCISE_SECTIONS,
          sectionLabel
        )}
        {renderSections(
          t('reportsSettings.measurementsSections', {
            defaultValue: 'Measurements report',
          }),
          'reports-section',
          MEASUREMENTS_SECTIONS,
          sectionLabel
        )}
        {renderSections(
          t('reportsSettings.moodSections', { defaultValue: 'Mood report' }),
          'reports-section',
          MOOD_SECTIONS,
          sectionLabel
        )}
      </ScrollView>
    </View>
  );
};

export default ReportsSettingsScreen;
