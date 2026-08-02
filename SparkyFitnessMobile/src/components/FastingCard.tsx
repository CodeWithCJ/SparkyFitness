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
import { formatLocalizedNumber } from '../localization';
import {
  formatLocalizedFastingDuration,
  formatLocalizedLastFast,
  getFastingStageName,
  getLocalizedProtocolBadge,
} from '../utils/fastingLocalization';
import {
  FASTING_PRESETS,
  DEFAULT_PRESET_ID,
  METABOLIC_STAGES,
  getMetabolicStageIndex,
} from '../constants/fasting';
import type { RootStackParamList, TabParamList } from '../types/navigation';

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
          <Text className="text-md font-bold text-text-secondary">{t('fasting.common.title')}</Text>
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  // ----- Active state -----
  if (isActive && currentFast) {
    const badge = getLocalizedProtocolBadge(t, currentFast.fasting_type);
    return (
      <>
        <Pressable
          className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
          onPress={() => navigation.navigate('FastingDetail')}
          accessibilityRole="button"
          accessibilityLabel={t('fasting.card.openDetails')}
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-md font-bold text-text-secondary">{t('fasting.common.title')}</Text>
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => historyRef.current?.present()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('fasting.card.viewHistory')}
                className="flex-row items-center mr-4"
              >
                <Text className="text-md text-accent-primary font-medium">{t('fasting.common.history')}</Text>
                <Icon
                  name="chevron-forward"
                  size={14}
                  color={accentPrimary}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
              <Text className="text-md text-accent-primary font-medium">{t('fasting.card.viewDetails')}</Text>
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
              {getFastingStageName(t, timer.stage)}
            </Text>
          </View>

          {timer.hasGoal && timer.goalHours != null ? (
            <>
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-sm text-text-secondary">
                  {timer.remainingMs != null && timer.remainingMs > 0
                    ? t('fasting.card.goalRemaining', {
                        remaining: formatLocalizedFastingDuration(t, timer.remainingMs ?? 0),
                        hours: formatLocalizedNumber(Math.round(timer.goalHours)),
                      })
                    : t('fasting.card.goalReached', {
                        hours: formatLocalizedNumber(Math.round(timer.goalHours)),
                      })}
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
                <Text className="text-xs text-text-muted">{t('fasting.card.progressHours', { hours: 0 })}</Text>
                <Text className="text-xs text-text-muted">
                  {t('fasting.card.progressPercent', { percent: Math.round(timer.progress * 100) })}
                </Text>
                <Text className="text-xs text-text-muted">
                  {t('fasting.card.progressHours', { hours: Math.round(timer.goalHours) })}
                </Text>
              </View>
            </>
          ) : (
            <View className="flex-row items-center justify-between mt-1">
              <Text className="text-sm text-text-secondary">
                {t('fasting.card.elapsed', { duration: formatLocalizedFastingDuration(t, timer.elapsedMs) })}
              </Text>
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
  const lastFastLine = formatLocalizedLastFast(t, history?.[0]);

  return (
    <>
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={openProtocolSheet}
        accessibilityRole="button"
        accessibilityLabel={t('fasting.card.startAccessibility')}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{t('fasting.common.title')}</Text>
          <TouchableOpacity
            onPress={() => historyRef.current?.present()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('fasting.card.viewHistory')}
            className="flex-row items-center"
          >
            <Text className="text-md text-accent-primary font-medium">{t('fasting.common.history')}</Text>
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
            <Text className="text-base font-semibold text-text-primary">{t('fasting.card.ready')}</Text>
            {lastFastLine && (
              <Text className="text-sm text-text-muted mt-0.5">{lastFastLine}</Text>
            )}
          </View>
          <View className="flex-row items-center">
            <Text className="text-base text-accent-primary font-semibold">{t('fasting.card.startFast')}</Text>
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
