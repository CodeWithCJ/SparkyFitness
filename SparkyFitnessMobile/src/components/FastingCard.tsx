import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import FastingProtocolSheet, { type FastingProtocolSheetRef } from './FastingProtocolSheet';
import FastingHistorySheet, { type FastingHistorySheetRef } from './FastingHistorySheet';
import { useCurrentFast, useFastingHistory } from '../hooks/useFasting';
import { useFastingTimer } from '../hooks/useFastingTimer';
import { formatLastFast } from '../utils/fasting';
import {
  FASTING_PRESETS,
  DEFAULT_PRESET_ID,
  METABOLIC_STAGES,
  getMetabolicStageIndex,
} from '../constants/fasting';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { localizeFastingStage, localizeProtocolBadge } from '../utils/fastingLocalization';

type FastingCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface FastingCardProps {
  navigation: FastingCardNavigation;
}

function presetIdForType(type: string | null | undefined): string {
  if (!type) return DEFAULT_PRESET_ID;
  const match = FASTING_PRESETS.find((p) => p.name === type);
  return match?.id ?? DEFAULT_PRESET_ID;
}

const FastingCard: React.FC<FastingCardProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const protocolSheetRef = useRef<FastingProtocolSheetRef>(null);
  const historyRef = useRef<FastingHistorySheetRef>(null);

  // Read-only here — goal-notification reconciliation is owned by the
  // always-mounted `FastingGoalReconciler` so it keeps running when this card is
  // hidden via the dashboard visibility setting.
  const { data: currentFast, isLoading } = useCurrentFast();
  const { data: history } = useFastingHistory(1);

  const isActive = !!currentFast && currentFast.status === 'ACTIVE';
  const timer = useFastingTimer(
    currentFast?.start_time,
    currentFast?.target_end_time,
    isActive,
  );

  const [accentPrimary, trackColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-progress-track',
  ]) as [string, string];
  const stageColors = useCSSVariable(METABOLIC_STAGES.map((s) => s.colorVar)) as string[];
  const stageColor = stageColors[getMetabolicStageIndex(timer.stage)] ?? accentPrimary;

  const openProtocolSheet = () => {
    protocolSheetRef.current?.present(presetIdForType(history?.[0]?.fasting_type));
  };

  // Loading placeholder (current-fast query still resolving).
  if (isLoading && !currentFast) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-md font-bold text-text-secondary">{t('fastingCard.title', { defaultValue: 'Fasting' })}</Text>
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  // ----- Active state -----
  if (isActive && currentFast) {
    const badge = localizeProtocolBadge(t, currentFast.fasting_type);
    return (
      <>
        <Pressable
          className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
          onPress={() => navigation.navigate('FastingDetail')}
          accessibilityRole="button"
          accessibilityLabel={t('fastingCard.openDetails', { defaultValue: 'Open fasting details' })}
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-md font-bold text-text-secondary">{t('fastingCard.title', { defaultValue: 'Fasting' })}</Text>
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => historyRef.current?.present()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('fastingCard.viewHistory', { defaultValue: 'View fasting history' })}
                className="flex-row items-center mr-4"
              >
                <Text className="text-md text-accent-primary font-medium">{t('fastingCard.history', { defaultValue: 'History' })}</Text>
                <Icon
                  name="chevron-forward"
                  size={14}
                  color={accentPrimary}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
              <Text className="text-md text-accent-primary font-medium">{t('fastingCard.viewDetails', { defaultValue: 'View details' })}</Text>
              <Icon
                name="chevron-forward"
                size={14}
                color={accentPrimary}
                style={{ marginLeft: 2 }}
              />
            </View>
          </View>

          <View className="flex-row items-end justify-between">
            <Text
              className="text-4xl font-bold text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {timer.hhmmss}
            </Text>
            <Text className="text-base font-semibold mb-1" style={{ color: stageColor }}>
              {localizeFastingStage(t, timer.stage).name}
            </Text>
          </View>

          {timer.hasGoal && timer.goalHours != null ? (
            <>
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-sm text-text-secondary">
                  {timer.remainingMs != null && timer.remainingMs > 0
                    ? t('fastingCard.goalProgress', { defaultValue: '{{remaining}} to your {{goal}}h goal', remaining: timer.remainingLabel, goal: Math.round(timer.goalHours) })
                    : t('fastingCard.goalReached', { defaultValue: 'Goal reached · {{goal}}h', goal: Math.round(timer.goalHours) })}
                </Text>
                <Text className="text-sm font-semibold text-text-secondary">{badge}</Text>
              </View>

              {/* Linear progress bar */}
              <View
                className="h-2 rounded-full mt-3 overflow-hidden"
                style={{ backgroundColor: trackColor }}
              >
                <View
                  className="h-2 rounded-full"
                  style={{ width: `${timer.progress * 100}%`, backgroundColor: accentPrimary }}
                />
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-text-muted">0{t('time.hoursShort', { defaultValue: 'h' })}</Text>
                <Text className="text-xs text-text-muted">
                  {Math.round(timer.progress * 100)}%
                </Text>
                <Text className="text-xs text-text-muted">{Math.round(timer.goalHours)}{t('time.hoursShort', { defaultValue: 'h' })}</Text>
              </View>
            </>
          ) : (
            <View className="flex-row items-center justify-between mt-1">
              <Text className="text-sm text-text-secondary">{t('fastingCard.elapsed', { defaultValue: '{{elapsed}} elapsed', elapsed: timer.elapsedLabel })}</Text>
              <Text className="text-sm font-semibold text-text-secondary">{badge}</Text>
            </View>
          )}
        </Pressable>

        <FastingProtocolSheet ref={protocolSheetRef} />
        <FastingHistorySheet ref={historyRef} />
      </>
    );
  }

  // ----- Idle state -----
  const lastFastLine = formatLastFast(history?.[0], t);

  return (
    <>
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={openProtocolSheet}
        accessibilityRole="button"
        accessibilityLabel={t('fastingCard.startFast', { defaultValue: 'Start a fast' })}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{t('fastingCard.title', { defaultValue: 'Fasting' })}</Text>
          <TouchableOpacity
            onPress={() => historyRef.current?.present()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('fastingCard.viewHistory', { defaultValue: 'View fasting history' })}
            className="flex-row items-center"
          >
            <Text className="text-md text-accent-primary font-medium">{t('fastingCard.history', { defaultValue: 'History' })}</Text>
            <Icon
              name="chevron-forward"
              size={14}
              color={accentPrimary}
              style={{ marginLeft: 2 }}
            />
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-text-primary">{t('fastingCard.readyToStart', { defaultValue: 'Ready to start' })}</Text>
            {lastFastLine && (
              <Text className="text-sm text-text-muted mt-0.5">{lastFastLine}</Text>
            )}
          </View>
          <View className="flex-row items-center">
            <Text className="text-base text-accent-primary font-semibold">{t('fastingCard.startFastAction', { defaultValue: 'Start Fast' })}</Text>
            <Icon
              name="chevron-forward"
              size={16}
              color={accentPrimary}
              style={{ marginLeft: 2 }}
            />
          </View>
        </View>
      </Pressable>

      <FastingProtocolSheet ref={protocolSheetRef} />
      <FastingHistorySheet ref={historyRef} />
    </>
  );
};

export default FastingCard;
