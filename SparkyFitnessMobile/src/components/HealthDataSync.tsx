import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, Platform, ActivityIndicator } from 'react-native';
import { HEALTH_METRICS, HealthMetric, CATEGORY_ORDER } from '../HealthMetrics';
import Button from './ui/Button';
import Switch from './ui/Switch';
import CollapsibleSection from './CollapsibleSection';
import { saveCollapsedCategories, loadCollapsedCategories } from '../services/storage';
import { NO_DATA_DISPLAY } from '../services/healthDataDisplay';
import { useTranslation } from 'react-i18next';

// Re-export HealthMetric for backwards compatibility
export type { HealthMetric };

export type HealthMetricStates = Record<string, boolean>;

interface HealthDataSyncProps {
  healthMetricStates: HealthMetricStates;
  handleToggleHealthMetric: (metric: HealthMetric, newValue: boolean) => void;
  isAllMetricsEnabled: boolean;
  handleToggleAllMetrics: () => void;
  healthData?: Record<string, string>;
  isLoadingHealthData?: boolean;
}

const groupMetricsByCategory = (metrics: HealthMetric[]): Record<string, HealthMetric[]> => {
  return metrics.reduce((acc, metric) => {
    const category = metric.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(metric);
    return acc;
  }, {} as Record<string, HealthMetric[]>);
};

const HEALTH_METRIC_LABEL_KEYS: Record<string, string> = {
  steps: 'healthDataSync.metrics.steps', calories: 'healthDataSync.metrics.calories', totalCalories: 'healthDataSync.metrics.totalCalories',
  heartRate: 'healthDataSync.metrics.heartRate', weight: 'healthDataSync.metrics.weight', bloodPressure: 'healthDataSync.metrics.bloodPressure',
  nutrition: 'healthDataSync.metrics.nutrition', sleepSession: 'healthDataSync.metrics.sleepSession', stress: 'healthDataSync.metrics.stress',
  basalBodyTemperature: 'healthDataSync.metrics.basalBodyTemperature', basalMetabolicRate: 'healthDataSync.metrics.basalMetabolicRate', bloodGlucose: 'healthDataSync.metrics.bloodGlucose',
  bodyFat: 'healthDataSync.metrics.bodyFat', bodyTemperature: 'healthDataSync.metrics.bodyTemperature', distance: 'healthDataSync.metrics.distance',
  exerciseSession: 'healthDataSync.metrics.exerciseSession', floorsClimbed: 'healthDataSync.metrics.floorsClimbed', height: 'healthDataSync.metrics.height',
  hydration: 'healthDataSync.metrics.hydration', leanBodyMass: 'healthDataSync.metrics.leanBodyMass', respiratoryRate: 'healthDataSync.metrics.respiratoryRate',
  restingHeartRate: 'healthDataSync.metrics.restingHeartRate', heartRateVariability: 'healthDataSync.metrics.heartRateVariability', vo2Max: 'healthDataSync.metrics.vo2Max',
  wheelchairPushes: 'healthDataSync.metrics.wheelchairPushes', speed: 'healthDataSync.metrics.speed', power: 'healthDataSync.metrics.power', elevationGained: 'healthDataSync.metrics.elevationGained',
  boneMass: 'healthDataSync.metrics.boneMass', cervicalMucus: 'healthDataSync.metrics.cervicalMucus', cyclingPedalingCadence: 'healthDataSync.metrics.cyclingPedalingCadence',
  intermenstrualBleeding: 'healthDataSync.metrics.intermenstrualBleeding', menstruationPeriod: 'healthDataSync.metrics.menstruationPeriod', ovulationTest: 'healthDataSync.metrics.ovulationTest',
  stepsCadence: 'healthDataSync.metrics.stepsCadence', bloodOxygenSaturation: 'healthDataSync.metrics.bloodOxygenSaturation', bloodAlcoholContent: 'healthDataSync.metrics.bloodAlcoholContent',
  menstruationFlow: 'healthDataSync.metrics.menstruationFlow', nutritionDietaryFatTotal: 'healthDataSync.metrics.nutritionDietaryFatTotal', nutritionDietaryProtein: 'healthDataSync.metrics.nutritionDietaryProtein',
  nutritionDietarySodium: 'healthDataSync.metrics.nutritionDietarySodium', walkingSpeed: 'healthDataSync.metrics.walkingSpeed', walkingStepLength: 'healthDataSync.metrics.walkingStepLength',
  walkingAsymmetryPercentage: 'healthDataSync.metrics.walkingAsymmetryPercentage', walkingDoubleSupportPercentage: 'healthDataSync.metrics.walkingDoubleSupportPercentage',
  runningGroundContactTime: 'healthDataSync.metrics.runningGroundContactTime', runningStrideLength: 'healthDataSync.metrics.runningStrideLength', runningPower: 'healthDataSync.metrics.runningPower',
  runningVerticalOscillation: 'healthDataSync.metrics.runningVerticalOscillation', runningSpeed: 'healthDataSync.metrics.runningSpeed', cyclingSpeed: 'healthDataSync.metrics.cyclingSpeed',
  cyclingPower: 'healthDataSync.metrics.cyclingPower', cyclingCadence: 'healthDataSync.metrics.cyclingCadence', cyclingFunctionalThresholdPower: 'healthDataSync.metrics.cyclingFunctionalThresholdPower',
  environmentalAudioExposure: 'healthDataSync.metrics.environmentalAudioExposure', headphoneAudioExposure: 'healthDataSync.metrics.headphoneAudioExposure',
  appleMoveTime: 'healthDataSync.metrics.appleMoveTime', appleExerciseTime: 'healthDataSync.metrics.appleExerciseTime', appleStandTime: 'healthDataSync.metrics.appleStandTime',
};

const HEALTH_CATEGORY_LABEL_KEYS: Record<string, string> = {
  Common: 'healthDataSync.categories.Common', Activity: 'healthDataSync.categories.Activity', Vitals: 'healthDataSync.categories.Vitals',
  'Body Measurements': 'healthDataSync.categories.Body Measurements', Nutrition: 'healthDataSync.categories.Nutrition', Reproductive: 'healthDataSync.categories.Reproductive',
  Mobility: 'healthDataSync.categories.Mobility', Running: 'healthDataSync.categories.Running', Cycling: 'healthDataSync.categories.Cycling',
  Environment: 'healthDataSync.categories.Environment', Apple: 'healthDataSync.categories.Apple',
};

const HealthDataSync: React.FC<HealthDataSyncProps> = ({
  healthMetricStates,
  handleToggleHealthMetric,
  isAllMetricsEnabled,
  handleToggleAllMetrics,
  healthData,
  isLoadingHealthData,
}) => {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [learnMoreExpanded, setLearnMoreExpanded] = useState(false);
  const { t } = useTranslation();
  const translate = t;

  const isIOS = Platform.OS === 'ios';
  const platformSubtitle = isIOS ? t('healthDataSync.appleHealth') : t('healthDataSync.healthConnect');
  const platformSummary = isIOS
    ? t('healthDataSync.appleHealthSummary')
    : t('healthDataSync.healthConnectSummary');
  const platformDetail = isIOS
    ? t('healthDataSync.appleHealthDetail')
    : t('healthDataSync.healthConnectDetail');

  const handleLearnMoreToggle = useCallback(() => {
    setLearnMoreExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    loadCollapsedCategories()
      .then((categories) => {
        setCollapsedCategories(new Set(categories));
        setIsLoaded(true);
      })
      .catch(() => {
        // Default: all categories except Common are collapsed
        setCollapsedCategories(new Set(CATEGORY_ORDER.filter(c => c !== 'Common')));
        setIsLoaded(true);
      });
  }, []);

  const handleCategoryToggle = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      saveCollapsedCategories(Array.from(newSet));
      return newSet;
    });
  }, []);

  const groupedMetrics = groupMetricsByCategory(HEALTH_METRICS);

  const renderMetricItem = (metric: HealthMetric) => {
    const value = healthData?.[metric.id];
    const showLoading = isLoadingHealthData && !value;

    return (
      <View key={metric.id} className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Image source={metric.icon} className="w-6 h-6" />
          <Text
            className="ml-2 text-base text-text-primary flex-shrink"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {HEALTH_METRIC_LABEL_KEYS[metric.id]
              ? translate(HEALTH_METRIC_LABEL_KEYS[metric.id])
              : metric.label}
          </Text>
        </View>
        {showLoading && (
          <ActivityIndicator size="small" className="mr-2" />
        )}
        {value && (
          <Text
            className={`text-sm mr-2 flex-shrink-0 ${value === NO_DATA_DISPLAY ? 'text-text-muted italic' : 'text-text-muted'}`}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
        <Switch
          onValueChange={(newValue) => handleToggleHealthMetric(metric, newValue)}
          value={healthMetricStates[metric.stateKey]}
        />
      </View>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">{t('healthDataSync.title')}</Text>
      <View className="mb-3">
        <Text className="text-sm font-semibold text-text-secondary mb-1">{platformSubtitle}</Text>
        <Text className="text-sm text-text-secondary">{platformSummary}</Text>
        {learnMoreExpanded && (
          <>
            <Text className="text-sm text-text-secondary mt-2">{platformDetail}</Text>
            <Text className="text-sm text-text-secondary mt-1">
              <Text className="font-semibold">{t('healthDataSync.notMedicalAdvice')}</Text> {t('healthDataSync.medicalAdviceDetail')}
            </Text>
          </>
        )}
        <Button
          variant="ghost"
          onPress={handleLearnMoreToggle}
          className="self-start py-0 px-0 mt-1"
          textClassName="text-sm"
        >
          {learnMoreExpanded ? t('healthDataSync.showLess') : t('healthDataSync.learnMore')}
        </Button>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Text
            className="font-bold text-base text-text-primary flex-1"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {t('healthDataSync.enableAll')}
          </Text>
        </View>
        <Switch
          onValueChange={handleToggleAllMetrics}
          value={isAllMetricsEnabled}
        />
      </View>
      <Text className="text-xs text-text-muted mb-3">
        {t('healthDataSync.batteryNotice')}
      </Text>
      {isLoaded && CATEGORY_ORDER.map((category) => {
        const metricsInCategory = groupedMetrics[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={HEALTH_CATEGORY_LABEL_KEYS[category]
              ? translate(HEALTH_CATEGORY_LABEL_KEYS[category])
              : category}
            expanded={!collapsedCategories.has(category)}
            onToggle={() => handleCategoryToggle(category)}
            itemCount={metricsInCategory.length}
          >
            {metricsInCategory.map(renderMetricItem)}
          </CollapsibleSection>
        );
      })}
    </View>
  );
};

export default HealthDataSync;
