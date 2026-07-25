import React, { useMemo } from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useCycleMode } from '../hooks/useCycleMode';
import { useCurrentPregnancy, usePregnancyOverview } from '../hooks/usePregnancy';
import { useCycleHistory } from '../hooks/useCycleHistory';
import { predictNextCycles, phaseForDay, babyWeek, daysBetween, type DerivedCycle } from '@workspace/shared';
import { getTodayDate, formatDate } from '../utils/dateUtils';
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

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  menstrual: 'Menstrual Phase',
  follicular: 'Follicular Phase',
  fertile: 'Fertile Window',
  ovulation: 'Ovulation Day',
  luteal: 'Luteal Phase',
  unknown: 'Cycle Active',
};

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
  const [accentPrimary, catPink] = useCSSVariable(['--color-accent-primary', '--color-cat-pink']) as [string, string];

  const title = getModeTitle(settings?.mode, discreetMode);
  const isSetup = !!settings?.onboarded_at && !!settings?.enabled;
  const isPregnant = settings?.mode === 'pregnant';

  // Pregnancy details
  const { pregnancy } = useCurrentPregnancy();
  const hasActivePregnancy = isPregnant && !!pregnancy && pregnancy.status === 'active';
  const { overview } = usePregnancyOverview(undefined, hasActivePregnancy);

  // Cycle details
  const { cycles } = useCycleHistory();
  const today = getTodayDate();

  const cycleInfo = useMemo(() => {
    if (isPregnant || !settings || cycles.length === 0) return null;

    const completed = cycles.filter((c) => c.cycle_length && c.period_length);
    const cycleLengths = completed.map((c) => c.cycle_length!);
    const periodLengths = completed.map((c) => c.period_length!);

    const avgCycleLength = settings.avg_cycle_length_override ?? (cycleLengths.length
      ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
      : 28);
    const avgPeriodLength = settings.avg_period_length_override ?? (periodLengths.length
      ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
      : 5);

    const stats = {
      avgCycleLength,
      avgPeriodLength,
      regularity: 'regular' as const,
      sampleSize: cycleLengths.length,
      medianCycleLength: 28,
      cycleLengthSd: 0,
    };

    const lastCycle = cycles[0];
    if (!lastCycle || !lastCycle.start_date) return null;

    const prediction = predictNextCycles(stats, lastCycle.start_date, settings);
    const dayStats = phaseForDay(today, cycles as DerivedCycle[], prediction);
    const dayNumber = dayStats.cycleDay ?? 0;

    const next = prediction.cycles[0];
    const toDay = (d: string | null | undefined): number | null =>
      d && lastCycle.start_date ? daysBetween(lastCycle.start_date, d) + 1 : null;

    const nextPeriodStart = next?.periodStart;
    const daysLate = nextPeriodStart && today > nextPeriodStart ? daysBetween(nextPeriodStart, today) : 0;

    return {
      day: dayNumber,
      phase: dayStats.phase,
      avgCycleLength,
      avgPeriodLength,
      fertileStartDay: toDay(next?.fertileStart),
      fertileEndDay: toDay(next?.fertileEnd),
      ovulationDay: toDay(next?.ovulation),
      nextPeriodStart,
      daysLate,
    };
  }, [isPregnant, settings, cycles, today]);

  if (!isSetup) {
    return (
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm border border-border-subtle"
        onPress={() => navigation.navigate('CycleOnboarding')}
        accessibilityRole="button"
        accessibilityLabel="Set up cycle and pregnancy tracking"
      >
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <Icon name="wellness" size={18} color={catPink || tokens.phaseMenstrual} />
            <Text className="text-md font-bold text-text-primary ml-2">{title}</Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-sm text-accent-primary font-semibold">Set Up</Text>
            <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
          </View>
        </View>

        <Text className="text-sm text-text-secondary mt-1">
          Track cycle phases, predictions, symptoms, and pregnancy milestones.
        </Text>
      </Pressable>
    );
  }

  // Render Rich Content
  const renderCardContent = () => {
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
            Tap to view gestational progress & baby growth.
          </Text>
        </View>
      );
    }

    if (cycleInfo) {
      const phaseName = PHASE_DISPLAY_NAMES[cycleInfo.phase] ?? 'Cycle Active';
      const phaseColor =
        cycleInfo.phase === 'menstrual'
          ? tokens.phaseMenstrual
          : cycleInfo.phase === 'follicular'
          ? tokens.phaseFollicular
          : cycleInfo.phase === 'fertile' || cycleInfo.phase === 'ovulation'
          ? tokens.phaseOvulation
          : tokens.phaseLuteal;

      return (
        <View className="flex-row items-center gap-4 mt-2">
          {/* Visual Cycle Ring Chart */}
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
            size={92}
            strokeWidth={8}
          />

          <View className="flex-1 justify-center">
            <View className="flex-row items-center flex-wrap gap-2 mb-1">
              <View
                className="px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${phaseColor}25` }}
              >
                <Text className="text-xs font-bold" style={{ color: phaseColor }}>
                  {phaseName}
                </Text>
              </View>
            </View>

            {cycleInfo.daysLate > 0 ? (
              <View className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1">
                <Text className="text-xs font-semibold text-red-500">
                  Period is expected & is {cycleInfo.daysLate} {cycleInfo.daysLate === 1 ? 'day' : 'days'} late
                </Text>
              </View>
            ) : cycleInfo.nextPeriodStart ? (
              <Text className="text-sm text-text-secondary mt-1">
                Next period expected {formatDate(cycleInfo.nextPeriodStart)}
              </Text>
            ) : null}
          </View>
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
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm border border-border-subtle"
      onPress={() => navigation.navigate('CycleHub')}
      accessibilityRole="button"
      accessibilityLabel="Open cycle and pregnancy tracking hub"
    >
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center">
          <Icon name="wellness" size={18} color={catPink || tokens.phaseMenstrual} />
          <Text className="text-md font-bold text-text-primary ml-2">{title}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('CycleHub')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="flex-row items-center"
        >
          <Text className="text-sm text-accent-primary font-medium">Hub</Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
      </View>

      {renderCardContent()}
    </Pressable>
  );
};

export default CycleCard;
