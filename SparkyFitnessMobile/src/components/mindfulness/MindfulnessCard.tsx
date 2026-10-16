import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';
import {
  mindfulnessSessionTypeEmoji,
  mindfulnessSessionTypeLabel,
} from '../../utils/mindfulnessSessionTypes';
import { BreathworkModal } from './BreathworkModal';
import { MeditationTimerModal } from './MeditationTimerModal';
import type {
  MindfulnessSessionResponse,
  CreateMindfulnessSessionBody,
} from '@workspace/shared';

interface MindfulnessCardProps {
  sessions: MindfulnessSessionResponse[];
  totalMindfulMinutes: number;
  selectedDate: string;
  onSaveSession: (data: CreateMindfulnessSessionBody) => Promise<unknown>;
  /** Opens the log form for a new session; without it the card shows no Log. */
  onLogSession?: () => void;
  /** Opens the log form on `session`; without it the card shows no Edit. */
  onEditSession?: (session: MindfulnessSessionResponse) => void;
  onDeleteSession?: (sessionId: string) => Promise<unknown>;
  compact?: boolean;
  onPressDetails?: () => void;
}

export const MindfulnessCard: React.FC<MindfulnessCardProps> = ({
  sessions,
  totalMindfulMinutes,
  selectedDate,
  onSaveSession,
  onLogSession,
  onEditSession,
  onDeleteSession,
  compact = false,
  onPressDetails,
}) => {
  const { t, i18n } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const [breathworkVisible, setBreathworkVisible] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);

  const handleBreathworkSave = async (
    durationSeconds: number,
    sessionType: string
  ) => {
    await onSaveSession({
      entry_date: selectedDate,
      duration_seconds: durationSeconds,
      session_type: sessionType,
      provider: 'manual',
    });
  };

  const handleTimerSave = async (
    durationSeconds: number,
    sessionType: string
  ) => {
    await onSaveSession({
      entry_date: selectedDate,
      duration_seconds: durationSeconds,
      session_type: sessionType,
      provider: 'manual',
    });
  };

  const formatSessionTime = (startTimeStr: string | null) => {
    if (!startTimeStr) return null;
    const date = new Date(startTimeStr);
    return date.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDurationDisplay = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > 0 && secs > 0) {
      return `${mins}m ${secs}s`;
    }
    if (mins > 0) {
      return `${mins} min`;
    }
    return `${secs}s`;
  };

  const sessionsWithHr = sessions.filter((s) => s.heart_rate_avg != null);
  const avgHeartRate =
    sessionsWithHr.length > 0
      ? Math.round(
          sessionsWithHr.reduce((acc, s) => acc + (s.heart_rate_avg ?? 0), 0) /
            sessionsWithHr.length
        )
      : null;

  const sessionsWithHrv = sessions.filter((s) => s.hrv_rmssd != null);
  const avgHrv =
    sessionsWithHrv.length > 0
      ? Math.round(
          sessionsWithHrv.reduce((acc, s) => acc + (s.hrv_rmssd ?? 0), 0) /
            sessionsWithHrv.length
        )
      : null;

  const sortedSessions = [...sessions].sort((a, b) => {
    const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
    const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
    return timeB - timeA;
  });
  const latestSession = sortedSessions[0];
  const latestTimeStr = formatSessionTime(latestSession?.start_time);

  // When used on the Dashboard with onPressDetails, render an insights-only card
  // (Interactive practice and logging are housed inside MindfulnessDetailScreen).
  if (onPressDetails) {
    return (
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={onPressDetails}
        accessibilityRole="button"
        accessibilityLabel={t('mindfulness.card.openDetails', {
          defaultValue: 'Open mindfulness details',
        })}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <Text className="text-base mr-1.5">🧘</Text>
            <Text className="text-md font-bold text-text-secondary">
              {t('mindfulness.card.title', { defaultValue: 'Mindfulness' })}
            </Text>
          </View>

          <View className="flex-row items-center">
            <Text className="text-md text-accent-primary font-medium">
              {t('mindfulness.card.details', { defaultValue: 'Details' })}
            </Text>
            <Icon
              name="chevron-forward"
              size={14}
              color={accentPrimary}
              style={{ marginLeft: 2 }}
            />
          </View>
        </View>

        {/* Primary Metric & Badge Row */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-baseline gap-1.5">
            <Text
              className="text-3xl font-extrabold text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {totalMindfulMinutes}
            </Text>
            <Text className="text-text-secondary text-sm font-medium">
              {t('mindfulness.card.minuteUnit', { defaultValue: 'min' })}
            </Text>
          </View>

          {sessions.length > 0 ? (
            <View className="flex-row items-center px-2.5 py-1 rounded-full bg-teal-500/10">
              <Text className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                {t('mindfulness.card.sessionCount', {
                  count: sessions.length,
                  defaultValue: '{{count}} sessions',
                  defaultValue_one: '{{count}} session',
                  defaultValue_other: '{{count}} sessions',
                })}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center px-2.5 py-1 rounded-full bg-accent-primary/10">
              <Text className="text-xs font-semibold text-accent-primary">
                {t('mindfulness.card.readyPrompt', {
                  defaultValue: 'Ready to practice',
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Insights Body */}
        {sessions.length > 0 ? (
          <>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-text-secondary">
                {latestTimeStr
                  ? `${t('mindfulness.card.latestAt', { defaultValue: 'Latest at' })} ${latestTimeStr}`
                  : t('mindfulness.card.todayTotal', {
                      defaultValue: 'today',
                    })}
              </Text>
              {latestSession?.provider &&
                latestSession.provider !== 'manual' && (
                  <View className="bg-surface-elevated px-2 py-0.5 rounded-md">
                    <Text className="text-[11px] text-text-muted capitalize">
                      {latestSession.provider.replace('_', ' ')}
                    </Text>
                  </View>
                )}
            </View>

            {(avgHeartRate != null || avgHrv != null) && (
              <View className="flex-row items-center gap-2 mb-2">
                {avgHeartRate != null && (
                  <View className="px-2 py-0.5 rounded-full bg-rose-500/10 flex-row items-center gap-1">
                    <Text className="text-rose-500 text-xs">♥</Text>
                    <Text className="text-rose-600 dark:text-rose-400 text-xs font-semibold">
                      {avgHeartRate}{' '}
                      {t('mindfulness.card.bpmUnit', { defaultValue: 'bpm' })}
                    </Text>
                  </View>
                )}
                {avgHrv != null && (
                  <View className="px-2 py-0.5 rounded-full bg-indigo-500/10 flex-row items-center gap-1">
                    <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                      HRV {avgHrv}{' '}
                      {t('mindfulness.card.msUnit', { defaultValue: 'ms' })}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View className="flex-row flex-wrap gap-2 pt-3 mt-1 border-t border-border-subtle">
              {sessions.slice(0, 4).map((s) => (
                <View
                  key={s.id}
                  className="px-3 py-1.5 rounded-xl bg-surface-elevated flex-row items-center gap-1.5 shadow-xs"
                >
                  <Text className="text-base">
                    {mindfulnessSessionTypeEmoji(s.session_type)}
                  </Text>
                  <Text className="text-sm text-text-primary font-bold">
                    {formatDurationDisplay(s.duration_seconds)}
                  </Text>
                </View>
              ))}
              {sessions.length > 4 && (
                <View className="px-2.5 py-1.5 rounded-xl bg-surface-elevated justify-center">
                  <Text className="text-xs text-text-muted font-medium">
                    +{sessions.length - 4}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View className="mt-1">
            <Text className="text-sm text-text-secondary">
              {t('mindfulness.card.tapToPractice', {
                defaultValue:
                  'Take a mindful break · Breathing & timer in Details',
              })}
            </Text>
            <View className="flex-row items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
              <View className="px-2.5 py-1 rounded-lg bg-blue-500/10 flex-row items-center gap-1">
                <Text className="text-xs">🌊</Text>
                <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {t('mindfulness.actions.breathe', {
                    defaultValue: 'Breathe',
                  })}
                </Text>
              </View>
              <View className="px-2.5 py-1 rounded-lg bg-purple-500/10 flex-row items-center gap-1">
                <Text className="text-xs">⏱️</Text>
                <Text className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  {t('mindfulness.actions.timer', { defaultValue: 'Timer' })}
                </Text>
              </View>
              <View className="px-2.5 py-1 rounded-lg bg-surface-elevated flex-row items-center gap-1">
                <Text className="text-xs">📝</Text>
                <Text className="text-xs font-semibold text-text-secondary">
                  {t('mindfulness.actions.log', { defaultValue: 'Log' })}
                </Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-xl">🧘</Text>
          <Text className="text-text-primary text-base font-bold">
            {t('mindfulness.card.title', { defaultValue: 'Mindfulness' })}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-accent-primary text-lg font-bold">
            {totalMindfulMinutes}{' '}
            {t('mindfulness.card.minuteUnit', { defaultValue: 'min' })}
          </Text>
          <Text className="text-text-muted text-[10px]">
            {t('mindfulness.card.todayTotal', { defaultValue: 'today' })}
          </Text>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View className="flex-row gap-2 mb-3">
        <TouchableOpacity
          onPress={() => setBreathworkVisible(true)}
          className="flex-1 py-2 px-3 rounded-xl bg-blue-500/15 border border-blue-500/30 flex-row items-center justify-center gap-1.5"
          accessibilityRole="button"
        >
          <Text className="text-sm">🌊</Text>
          <Text className="text-blue-500 dark:text-blue-400 text-xs font-semibold">
            {t('mindfulness.actions.breathe', { defaultValue: 'Breathe' })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTimerVisible(true)}
          className="flex-1 py-2 px-3 rounded-xl bg-purple-500/15 border border-purple-500/30 flex-row items-center justify-center gap-1.5"
          accessibilityRole="button"
        >
          <Text className="text-sm">⏱️</Text>
          <Text className="text-purple-500 dark:text-purple-400 text-xs font-semibold">
            {t('mindfulness.actions.timer', { defaultValue: 'Timer' })}
          </Text>
        </TouchableOpacity>

        {onLogSession && (
          <TouchableOpacity
            onPress={onLogSession}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-elevated border border-border-subtle flex-row items-center justify-center gap-1.5"
            accessibilityRole="button"
          >
            <Icon name="add" size={14} color="#9CA3AF" />
            <Text className="text-text-secondary text-xs font-semibold">
              {t('mindfulness.actions.log', { defaultValue: 'Log' })}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Session List (only when not in summary details mode) */}
      {!onPressDetails && sessions.length > 0 ? (
        <View className="gap-2 pt-1 border-t border-border-subtle/50">
          {sessions.map((session) => {
            const timeStr = formatSessionTime(session.start_time);
            return (
              <View
                key={session.id}
                className="flex-row justify-between items-center py-2 px-3 rounded-xl bg-surface-elevated/60"
              >
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-text-primary text-sm font-semibold capitalize">
                      {mindfulnessSessionTypeLabel(session.session_type, t)}
                    </Text>
                    {session.provider && session.provider !== 'manual' && (
                      <View className="bg-white/10 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[10px] text-text-muted capitalize">
                          {session.provider.replace('_', ' ')}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View className="flex-row items-center gap-2 mt-0.5">
                    {timeStr && (
                      <Text className="text-text-muted text-xs">{timeStr}</Text>
                    )}
                    {session.heart_rate_avg != null && (
                      <Text className="text-rose-400 text-xs">
                        ♥ {session.heart_rate_avg}{' '}
                        {t('mindfulness.card.bpmUnit', { defaultValue: 'bpm' })}
                      </Text>
                    )}
                    {session.hrv_rmssd != null && (
                      <Text className="text-indigo-400 text-xs">
                        HRV {session.hrv_rmssd}{' '}
                        {t('mindfulness.card.msUnit', { defaultValue: 'ms' })}
                      </Text>
                    )}
                  </View>

                  {session.notes && !compact && (
                    <Text
                      className="text-text-secondary text-xs italic mt-0.5"
                      numberOfLines={1}
                    >
                      {session.notes}
                    </Text>
                  )}
                </View>

                <View className="flex-row items-center gap-2">
                  <Text className="text-text-primary text-sm font-bold">
                    {formatDurationDisplay(session.duration_seconds)}
                  </Text>
                  {onEditSession && (
                    <TouchableOpacity
                      onPress={() => onEditSession(session)}
                      hitSlop={8}
                      className="p-1"
                      accessibilityRole="button"
                      accessibilityLabel={t('common.edit', {
                        defaultValue: 'Edit',
                      })}
                    >
                      <Icon name="pencil" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                  {onDeleteSession && (
                    <TouchableOpacity
                      onPress={() => onDeleteSession(session.id)}
                      hitSlop={8}
                      className="p-1"
                      accessibilityRole="button"
                      accessibilityLabel={t('common.delete', {
                        defaultValue: 'Delete',
                      })}
                    >
                      <Icon name="trash" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Modals */}
      <BreathworkModal
        visible={breathworkVisible}
        onClose={() => setBreathworkVisible(false)}
        onSave={handleBreathworkSave}
      />

      <MeditationTimerModal
        visible={timerVisible}
        onClose={() => setTimerVisible(false)}
        onSave={handleTimerSave}
      />
    </View>
  );
};
