import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useCycleMode } from '../hooks/useCycleMode';
import { useCurrentPregnancy, usePregnancyOverview } from '../hooks/usePregnancy';
import {
  useCyclePredictionData,
  getPhaseDisplayName,
  getPhaseColor,
} from '../utils/cycleDisplayUtils';
import { formatDate } from '../utils/dateUtils';
import { babyWeek } from '@workspace/shared';
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

function getModeTitle(mode?: string, discreetMode?: boolean): string {
  if (discreetMode) return 'Wellness';
  switch (mode) {
    case 'pregnant':
      return 'Pregnancy Tracking';
    case 'ttc':
      return 'Fertility Tracking';
    case 'postpartum':
      return 'Postpartum Recovery';
    case 'menopause':
      return 'Menopause Tracking';
    case 'standard':
      return 'Cycle Tracking';
    default:
      return 'Cycle & Pregnancy';
  }
}

const CycleCard: React.FC<CycleCardProps> = ({ navigation }) => {
  const { settings } = useCycleSettings();
  const { discreetMode } = useCycleMode();
  const tokens = useWellnessTokens();
  const [accentPrimary] = useCSSVariable([
    '--color-accent-primary',
  ]) as [string];

  const isSetup = !!settings?.onboarded_at && !!settings?.enabled;
  const isPregnant = settings?.mode === 'pregnant';

  // Pregnancy details (unconditional hook calls)
  const { pregnancy } = useCurrentPregnancy();
  const hasActivePregnancy = isPregnant && !!pregnancy && pregnancy.status === 'active';
  const { overview } = usePregnancyOverview(undefined, hasActivePregnancy);

  // Extracted cycle statistics & predictions (unconditional hook call)
  const cycleInfo = useCyclePredictionData();

  if (settings?.enabled === false) {
    return null;
  }

  const title = getModeTitle(settings?.mode, discreetMode);

  if (!isSetup) {
    return (
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={() => navigation.navigate('CycleOnboarding')}
        accessibilityRole="button"
        accessibilityLabel="Set up cycle and pregnancy tracking"
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{title}</Text>
          <View className="flex-row items-center">
            <Text className="text-md text-accent-primary font-medium">Set Up</Text>
            <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
          </View>
        </View>

        <Text className="text-sm text-text-secondary mt-1">
          {discreetMode
            ? 'Track your wellness parameters and predictions.'
            : 'Track cycle phases, predictions, symptoms, and pregnancy milestones.'}
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
            {activeDay ? `Day ${activeDay}` : 'Wellness Tracking Active'}
          </Text>
          <Text className="text-sm text-text-secondary">Tap to view details</Text>
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
                Week {ga.week}, Day {ga.day}
              </Text>
              {baby && (
                <Text className="text-sm font-semibold mt-0.5" style={{ color: tokens.phasePregnant }}>
                  Size of {baby.comparison}
                </Text>
              )}
              <View className="flex-row items-center gap-3 mt-1.5">
                {baby?.lengthCm != null && (
                  <Text className="text-xs text-text-secondary">
                    <Text className="font-medium text-text-primary">{baby.lengthCm} cm</Text>
                  </Text>
                )}
                {baby?.weightG != null && (
                  <Text className="text-xs text-text-secondary">
                    <Text className="font-medium text-text-primary">{baby.weightG} g</Text>
                  </Text>
                )}
                <Text className="text-xs text-text-secondary">
                  {ga.daysRemaining > 0 ? `${ga.daysRemaining}d to due date` : 'Due now'}
                </Text>
              </View>
            </View>
          </View>
        );
      }
      return (
        <View className="mt-1">
          <Text className="text-base font-semibold text-text-primary">
            Pregnancy Tracking Active
          </Text>
          <Text className="text-sm text-text-secondary mt-0.5">
            Tap to view gestational progress.
          </Text>
        </View>
      );
    }

    if (cycleInfo) {
      const phaseName = getPhaseDisplayName(cycleInfo.phase, discreetMode);
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
                  Period {cycleInfo.daysLate} {cycleInfo.daysLate === 1 ? 'day' : 'days'} late
                </Text>
              </View>
            ) : cycleInfo.nextPeriodStart ? (
              <Text className="text-sm text-text-secondary mt-1">
                Next period expected {formatDate(cycleInfo.nextPeriodStart)}
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
            centerValue={cycleInfo.day > 0 ? `Day ${cycleInfo.day}` : 'Active'}
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
          {settings.mode} mode
        </Text>
        <Text className="text-sm text-text-secondary mt-0.5">
          Tap to view cycle tracking hub.
        </Text>
      </View>
    );
  };

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('CycleHub')}
      accessibilityRole="button"
      accessibilityLabel="Open cycle and pregnancy tracking hub"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-md font-bold text-text-secondary">{title}</Text>

        <View className="flex-row items-center">
          <Text className="text-md text-accent-primary font-medium">Hub</Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
        </View>
      </View>

      {renderCardContent()}
    </Pressable>
  );
};

export default CycleCard;
