import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useDiscreetMode } from '../hooks/useDiscreetMode';
import { useCurrentPregnancy, usePregnancyOverview } from '../hooks/usePregnancy';
import { useCyclePredictionData } from '../hooks/useCyclePredictionData';
import { getPhaseDisplayName, getPhaseColor } from '../utils/cycleDisplayUtils';
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

export interface CycleRingContentInfo {
  day: number;
  phase: string;
  avgCycleLength: number;
  avgPeriodLength: number;
  fertileStartDay: number | null;
  fertileEndDay: number | null;
  ovulationDay: number | null;
  nextPeriodStart?: string;
  daysLate: number;
}

// Cycle-state card body (title, phase readout, ring, disclosure chevron) for
// the non-discreet cycle layout. Exported so DevTools can render a fake-data
// gallery of every phase.
export const CycleCardRingContent: React.FC<{
  title: string;
  info: CycleRingContentInfo;
}> = ({ title, info }) => {
  const tokens = useWellnessTokens();
  const [textAccent] = useCSSVariable(['--color-accent-primary']) as [string];
  const phaseName = getPhaseDisplayName(info.phase, false);
  const phaseColor = getPhaseColor(info.phase, tokens);

  return (
    <View className="flex-row items-center gap-3">
      {/* Details on Left: stretched to the ring's height so the title sits
          at the card top; the phase block centers in the space below it */}
      <View className="flex-1 self-stretch">
        <Text className="text-md font-bold text-text-secondary">{title}</Text>

        <View className="flex-1 justify-center">
          <Text className="text-base font-semibold" style={{ color: phaseColor }}>
            {phaseName}
          </Text>

          {info.daysLate > 0 ? (
            <Text className="text-sm font-semibold text-text-primary mt-0.5">
              Period {info.daysLate} {info.daysLate === 1 ? 'day' : 'days'} late
            </Text>
          ) : info.nextPeriodStart ? (
            <Text className="text-sm text-text-secondary mt-0.5">
              Next period est. {formatDate(info.nextPeriodStart)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Visual Cycle Ring Chart on Right */}
      <CycleRing
        cycleDay={info.day > 0 ? info.day : null}
        cycleLength={info.avgCycleLength}
        periodLength={info.avgPeriodLength}
        fertileStartDay={info.fertileStartDay}
        fertileEndDay={info.fertileEndDay}
        ovulationDay={info.ovulationDay}
        centerLabel=""
        centerValue={info.day > 0 ? `Day ${info.day}` : 'Active'}
        centerSub=""
        size={98}
        strokeWidth={7.5}
      />
      <Icon name="chevron-forward" size={18} color={textAccent} />
    </View>
  );
};

const CycleCard: React.FC<CycleCardProps> = ({ navigation }) => {
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
  const title = getModeTitle(settings.mode, discreetMode);
  // The cycle-ring state renders its own title so the ring can span the full
  // card height; every other state keeps the shared header row.
  const showsRingLayout = !discreetMode && !isPregnant && !!cycleInfo;

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
      return <CycleCardRingContent title={title} info={cycleInfo} />;
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
      {!showsRingLayout && (
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{title}</Text>

          <View className="flex-row items-center">
            <Text className="text-md text-accent-primary font-medium">Hub</Text>
            <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
          </View>
        </View>
      )}

      {renderCardContent()}
    </Pressable>
  );
};

export default CycleCard;
