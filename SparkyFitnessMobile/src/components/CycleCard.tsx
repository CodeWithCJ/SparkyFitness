import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useDiscreetMode } from '../hooks/useDiscreetMode';
import { useCurrentPregnancy, usePregnancyOverview } from '../hooks/usePregnancy';
import { useCyclePredictionData } from '../hooks/useCyclePredictionData';
import { getPhaseColor } from '../utils/cycleDisplayUtils';
import { formatDate } from '../utils/dateUtils';
import { babyWeek } from '@workspace/shared';
import {
  getBabyComparisonLabel,
  getCycleCardModeTitle,
  getCycleCardPhaseLabel,
} from '../utils/cycleCardLocalization';
import WombScene from './wellness/pregnancy/WombScene';
import CycleRing from './wellness/CycleRing';
import { useWellnessTokens } from './wellness/theme/wellnessTokens';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type CycleCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface CycleCardProps {
  navigation: CycleCardNavigation;
}

const CycleCard: React.FC<CycleCardProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { settings, isLoading: isSettingsLoading } = useCycleSettings();
  const { discreetMode } = useDiscreetMode();
  const tokens = useWellnessTokens();
  const [accentPrimary] = useCSSVariable([
    '--color-accent-primary',
  ]) as [string];

  // Pregnancy details (unconditional hook calls)
  const isPregnant = settings?.mode === 'pregnant';
  const { pregnancy } = useCurrentPregnancy();
  const hasActivePregnancy = isPregnant && !!pregnancy && pregnancy.status === 'active';
  const { overview } = usePregnancyOverview(undefined, hasActivePregnancy);

  // Extracted cycle statistics & predictions (unconditional hook call)
  const cycleInfo = useCyclePredictionData();

  // Hide while settings are loading to prevent layout flash (Issue 3)
  if (isSettingsLoading) {
    return null;
  }

  // Hide card if settings are null (un-opted user) or explicitly disabled (Issue 2)
  if (!settings || settings.enabled === false) {
    return null;
  }

  const isSetup = !!settings.onboarded_at && !!settings.enabled;
  const title = getCycleCardModeTitle(t, settings.mode, discreetMode);

  if (!isSetup) {
    return (
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={() => navigation.navigate('CycleOnboarding')}
        accessibilityRole="button"
        accessibilityLabel={t('cycleCard.setup.accessibility')}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{title}</Text>
          <View className="flex-row items-center">
            <Text className="text-md text-accent-primary font-medium">{t('cycleCard.setup.action')}</Text>
            <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
          </View>
        </View>

        <Text className="text-sm text-text-secondary mt-1">
          {discreetMode
            ? t('cycleCard.setup.discreetDescription')
            : t('cycleCard.setup.description')}
        </Text>
      </Pressable>
    );
  }

  // Render Rich Content
  const renderCardContent = () => {
    if (discreetMode) {
      const activeDay = cycleInfo?.day && cycleInfo.day > 0 ? cycleInfo.day : null;
      return (
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-text-primary">
            {activeDay ? t('cycleCard.discreet.day', { day: activeDay }) : t('cycleCard.discreet.active')}
          </Text>
          <Text className="text-sm text-text-secondary">{t('cycleCard.discreet.details')}</Text>
        </View>
      );
    }

    if (isPregnant) {
      const ga = overview?.gestation;
      const baby = ga ? babyWeek(ga.week) : null;
      if (ga) {
        return (
          <View className="flex-row items-center gap-3 mt-2">
            {baby && <WombScene scene={baby.wombScene} size={72} />}
            <View className="flex-1">
              <Text className="text-base font-bold text-text-primary">
                {t('cycleCard.pregnancy.weekDay', { week: ga.week, day: ga.day })}
              </Text>
              {baby && (
                <Text className="text-sm font-semibold mt-0.5" style={{ color: tokens.phasePregnant }}>
                  {t('cycleCard.pregnancy.comparison', {
                    comparison: getBabyComparisonLabel(t, baby.comparison),
                  })}
                </Text>
              )}
              <View className="flex-row items-center gap-3 mt-1.5">
                {baby?.lengthCm != null && (
                  <Text className="text-xs text-text-secondary">
                    <Text className="font-medium text-text-primary">
                      {t('cycleCard.pregnancy.length', { value: baby.lengthCm })}
                    </Text>
                  </Text>
                )}
                {baby?.weightG != null && (
                  <Text className="text-xs text-text-secondary">
                    <Text className="font-medium text-text-primary">
                      {t('cycleCard.pregnancy.weight', { value: baby.weightG })}
                    </Text>
                  </Text>
                )}
                <Text className="text-xs text-text-secondary">
                  {ga.daysRemaining > 0
                    ? t('cycleCard.pregnancy.daysToDue', { count: ga.daysRemaining })
                    : t('cycleCard.pregnancy.dueToday')}
                </Text>
              </View>
            </View>
          </View>
        );
      }
      return (
        <View className="mt-1">
          <Text className="text-base font-semibold text-text-primary">
            {t('cycleCard.pregnancy.active')}
          </Text>
          <Text className="text-sm text-text-secondary mt-0.5">
            {t('cycleCard.pregnancy.details')}
          </Text>
        </View>
      );
    }

    if (cycleInfo) {
      const phaseName = getCycleCardPhaseLabel(t, cycleInfo.phase);
      const phaseColor = getPhaseColor(cycleInfo.phase, tokens);

      return (
        <View className="flex-row items-center justify-between gap-4 mt-2">
          {/* Details on Left */}
          <View className="flex-1 justify-center">
            <View className="flex-row items-center flex-wrap gap-2 mb-1">
              <View
                className="px-2.5 py-0.5 rounded-full self-start"
                style={{ backgroundColor: `${phaseColor}25` }}
              >
                <Text className="text-xs font-bold" style={{ color: phaseColor }}>
                  {phaseName}
                </Text>
              </View>
            </View>

            {cycleInfo.daysLate > 0 ? (
              <View className="bg-surface border border-border-subtle rounded-lg px-2.5 py-1.5 mt-1.5 self-start">
                <Text className="text-xs font-semibold text-text-primary">
                  {t('cycleCard.cycle.periodLate', { count: cycleInfo.daysLate })}
                </Text>
              </View>
            ) : cycleInfo.nextPeriodStart ? (
              <Text className="text-sm text-text-secondary mt-1">
                {t('cycleCard.cycle.nextPeriod', { date: formatDate(cycleInfo.nextPeriodStart) })}
              </Text>
            ) : null}
          </View>

          {/* Visual Cycle Ring Chart on Right */}
          <CycleRing
            cycleDay={cycleInfo.day > 0 ? cycleInfo.day : null}
            cycleLength={cycleInfo.avgCycleLength}
            periodLength={cycleInfo.avgPeriodLength}
            fertileStartDay={cycleInfo.fertileStartDay}
            fertileEndDay={cycleInfo.fertileEndDay}
            ovulationDay={cycleInfo.ovulationDay}
            centerLabel=""
            centerValue={
              cycleInfo.day > 0
                ? t('cycleCard.cycle.day', { day: cycleInfo.day })
                : t('cycleCard.cycle.active')
            }
            centerSub=""
            size={88}
            strokeWidth={7.5}
          />
        </View>
      );
    }

    return (
      <View className="mt-1">
        <Text className="text-base font-semibold text-text-primary capitalize">
           {t('cycleCard.cycle.fallbackActive')}
        </Text>
        <Text className="text-sm text-text-secondary mt-0.5">
           {t('cycleCard.cycle.fallbackDetails')}
        </Text>
      </View>
    );
  };

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('CycleHub')}
      accessibilityRole="button"
      accessibilityLabel={t('cycleCard.actions.openHub')}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-md font-bold text-text-secondary">{title}</Text>

        <View className="flex-row items-center">
          <Text className="text-md text-accent-primary font-medium">{t('cycleCard.actions.hub')}</Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
        </View>
      </View>

      {renderCardContent()}
    </Pressable>
  );
};

export default CycleCard;
