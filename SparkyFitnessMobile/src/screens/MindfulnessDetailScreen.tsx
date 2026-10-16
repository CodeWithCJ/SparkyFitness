import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';

import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import SegmentedControl from '../components/SegmentedControl';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import {
  useMindfulnessDay,
  useMindfulnessMutations,
} from '../hooks/useMindfulness';
import { BreathworkModal } from '../components/mindfulness/BreathworkModal';
import { MeditationTimerModal } from '../components/mindfulness/MeditationTimerModal';
import { toLocalDateString } from '../utils/dateUtils';
import {
  mindfulnessSessionTypeEmoji,
  mindfulnessSessionTypeLabel,
} from '../utils/mindfulnessSessionTypes';
import type { RootStackScreenProps } from '../types/navigation';
import type { MindfulnessSessionResponse } from '@workspace/shared';

type Props = RootStackScreenProps<'MindfulnessDetail'>;

type TabKey = 'practice' | 'history';

const MindfulnessDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { backColor } = useHeaderActionColors();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const selectedDate =
    route.params?.selectedDate || toLocalDateString(new Date());

  const [activeTab, setActiveTab] = useState<TabKey>('practice');

  // Modals state
  const [breathworkVisible, setBreathworkVisible] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);

  // Data queries & mutations
  const { sessions, totalMindfulMinutes, isLoading } =
    useMindfulnessDay(selectedDate);
  const { saveSession, deleteSession } = useMindfulnessMutations(selectedDate);

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

  const formatSessionTime = (startTimeStr: string | null) => {
    if (!startTimeStr) return null;
    const date = new Date(startTimeStr);
    return date.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleBreathworkSave = async (durationSecs: number, sType: string) => {
    await saveSession({
      entry_date: selectedDate,
      duration_seconds: durationSecs,
      session_type: sType,
      provider: 'manual',
    });
    setBreathworkVisible(false);
    Toast.show({
      type: 'success',
      text1: t('mindfulness.detail.sessionSaved', {
        defaultValue: 'Session saved successfully',
      }),
    });
  };

  const handleTimerSave = async (durationSecs: number, sType: string) => {
    await saveSession({
      entry_date: selectedDate,
      duration_seconds: durationSecs,
      session_type: sType,
      provider: 'manual',
    });
    setTimerVisible(false);
    Toast.show({
      type: 'success',
      text1: t('mindfulness.detail.sessionSaved', {
        defaultValue: 'Session saved successfully',
      }),
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      t('mindfulness.detail.deletePrompt', {
        defaultValue: 'Delete Mindful Session',
      }),
      t('mindfulness.detail.deleteConfirm', {
        defaultValue: 'Are you sure you want to delete this session?',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(sessionId);
              Toast.show({
                type: 'success',
                text1: t('mindfulness.detail.sessionDeleted', {
                  defaultValue: 'Session deleted',
                }),
              });
            } catch {
              Toast.show({
                type: 'error',
                text1: t('common.tryAgain', {
                  defaultValue: 'Please try again.',
                }),
              });
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Navigation bar */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="py-0 px-0"
        >
          <Icon name="chevron-back" size={22} color={backColor} />
        </Button>
        <Text className="flex-1 text-center text-lg font-semibold text-text-primary">
          {t('mindfulness.detail.title', { defaultValue: 'Mindfulness' })}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tabs */}
      <View className="px-4 py-3">
        <SegmentedControl
          segments={[
            {
              key: 'practice',
              label: t('mindfulness.detail.practiceTab', {
                defaultValue: 'Practice & Log',
              }),
            },
            {
              key: 'history',
              label: t('mindfulness.detail.historyTab', {
                defaultValue: 'History',
              }),
            },
          ]}
          activeKey={activeTab}
          onSelect={setActiveTab}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'practice' ? (
          <View>
            {/* Today Insight Summary Card */}
            <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-xs mb-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-text-secondary text-xs uppercase font-semibold">
                    {t('mindfulness.card.todayTotal', {
                      defaultValue: 'today',
                    })}
                  </Text>
                  <View className="flex-row items-baseline gap-1 mt-1">
                    <Text
                      className="text-3xl font-extrabold text-text-primary"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {totalMindfulMinutes}
                    </Text>
                    <Text className="text-text-secondary text-sm font-medium">
                      {t('mindfulness.card.minuteUnit', {
                        defaultValue: 'min',
                      })}
                    </Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-text-muted text-xs">
                    {t('mindfulness.card.sessionCount', {
                      count: sessions.length,
                      defaultValue: '{{count}} sessions',
                    })}
                  </Text>
                  <Text className="text-text-muted text-[10px] mt-1">
                    {selectedDate}
                  </Text>
                </View>
              </View>
            </View>

            {/* Interactive Tools Section */}
            <View className="mb-4">
              <Text className="text-text-secondary text-xs font-semibold mb-2 uppercase">
                {t('mindfulness.tools.title', {
                  defaultValue: 'Interactive Practice',
                })}
              </Text>

              <View className="flex-row gap-3">
                {/* Paced Breathing Card */}
                <TouchableOpacity
                  onPress={() => setBreathworkVisible(true)}
                  className="flex-1 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 justify-between"
                  accessibilityRole="button"
                >
                  <View>
                    <Text className="text-3xl mb-2">🌊</Text>
                    <Text className="text-blue-600 dark:text-blue-400 font-bold text-base">
                      {t('mindfulness.tools.breatheTitle', {
                        defaultValue: 'Paced Breathing',
                      })}
                    </Text>
                    <Text className="text-text-secondary text-xs mt-1">
                      {t('mindfulness.tools.breatheSubtitle', {
                        defaultValue: 'Box, 4-7-8, Coherence protocols',
                      })}
                    </Text>
                  </View>
                  <View className="mt-3 py-1.5 px-3 rounded-xl bg-blue-500/20 items-center">
                    <Text className="text-blue-600 dark:text-blue-300 font-semibold text-xs">
                      {t('mindfulness.tools.startAction', {
                        defaultValue: 'Launch',
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Meditation Timer Card */}
                <TouchableOpacity
                  onPress={() => setTimerVisible(true)}
                  className="flex-1 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25 justify-between"
                  accessibilityRole="button"
                >
                  <View>
                    <Text className="text-3xl mb-2">⏱️</Text>
                    <Text className="text-purple-600 dark:text-purple-400 font-bold text-base">
                      {t('mindfulness.tools.timerTitle', {
                        defaultValue: 'Meditation Timer',
                      })}
                    </Text>
                    <Text className="text-text-secondary text-xs mt-1">
                      {t('mindfulness.tools.timerSubtitle', {
                        defaultValue: 'Timed countdown & open stopwatch',
                      })}
                    </Text>
                  </View>
                  <View className="mt-3 py-1.5 px-3 rounded-xl bg-purple-500/20 items-center">
                    <Text className="text-purple-600 dark:text-purple-300 font-semibold text-xs">
                      {t('mindfulness.tools.startAction', {
                        defaultValue: 'Launch',
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Logging by hand opens the same form as Add (+) -> Mindfulness */}
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('MindfulnessLog', { date: selectedDate })
              }
              className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-xs flex-row items-center"
              accessibilityRole="button"
            >
              <View className="w-9 h-9 rounded-xl bg-accent-primary/15 items-center justify-center mr-3">
                <Icon name="pencil" size={16} color={accentPrimary} />
              </View>
              <Text className="flex-1 text-text-primary text-base font-bold">
                {t('mindfulness.detail.logTitle', {
                  defaultValue: 'Log Mindful Session',
                })}
              </Text>
              <Icon name="chevron-forward" size={18} color={textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          /* History Tab */
          <View className="pt-1">
            <Text className="text-center text-text-muted text-xs mb-3">
              {t('mindfulness.detail.historyHint', {
                defaultValue: 'Tap edit or delete to manage your sessions',
              })}
            </Text>

            {isLoading && sessions.length === 0 ? (
              <View className="items-center py-12">
                <ActivityIndicator size="small" color={accentPrimary} />
              </View>
            ) : sessions.length === 0 ? (
              <View className="items-center py-12 bg-surface rounded-2xl border border-border-subtle px-6">
                <Text className="text-4xl mb-3">🧘</Text>
                <Text className="text-base font-semibold text-text-primary text-center">
                  {t('mindfulness.detail.noHistory', {
                    defaultValue: 'No mindfulness sessions yet',
                  })}
                </Text>
                <Text className="text-xs text-text-muted text-center mt-1">
                  {t('mindfulness.detail.noHistorySubtitle', {
                    defaultValue:
                      'Complete a breathing or meditation session to start tracking',
                  })}
                </Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {sessions.map((session: MindfulnessSessionResponse) => {
                  const timeStr = formatSessionTime(session.start_time);
                  return (
                    <View
                      key={session.id}
                      className="p-3.5 rounded-2xl bg-surface border border-border-subtle flex-row justify-between items-center shadow-xs"
                    >
                      <View className="flex-1 mr-3">
                        <View className="flex-row items-center gap-2">
                          <View className="w-8 h-8 rounded-xl bg-surface-elevated items-center justify-center">
                            <Text className="text-base">
                              {mindfulnessSessionTypeEmoji(
                                session.session_type
                              )}
                            </Text>
                          </View>
                          <Text className="text-text-primary text-sm font-semibold capitalize">
                            {mindfulnessSessionTypeLabel(
                              session.session_type,
                              t
                            )}
                          </Text>
                          {session.provider &&
                            session.provider !== 'manual' && (
                              <View className="bg-surface-elevated border border-border-subtle px-1.5 py-0.5 rounded-md">
                                <Text className="text-[10px] text-text-muted capitalize">
                                  {session.provider.replace('_', ' ')}
                                </Text>
                              </View>
                            )}
                        </View>

                        <View className="flex-row items-center gap-2 mt-1">
                          {timeStr && (
                            <Text className="text-text-muted text-xs">
                              {timeStr}
                            </Text>
                          )}
                          {session.heart_rate_avg != null && (
                            <Text className="text-rose-500 dark:text-rose-400 text-xs font-medium">
                              ♥ {session.heart_rate_avg}{' '}
                              {t('mindfulness.card.bpmUnit', {
                                defaultValue: 'bpm',
                              })}
                            </Text>
                          )}
                          {session.hrv_rmssd != null && (
                            <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                              HRV {session.hrv_rmssd}{' '}
                              {t('mindfulness.card.msUnit', {
                                defaultValue: 'ms',
                              })}
                            </Text>
                          )}
                        </View>

                        {session.notes && (
                          <Text
                            className="text-text-secondary text-xs italic mt-1"
                            numberOfLines={2}
                          >
                            {session.notes}
                          </Text>
                        )}
                      </View>

                      <View className="flex-row items-center gap-2">
                        <Text className="text-text-primary text-base font-bold">
                          {formatDurationDisplay(session.duration_seconds)}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            navigation.navigate('MindfulnessLog', {
                              date: selectedDate,
                              session,
                            })
                          }
                          hitSlop={8}
                          className="p-1.5 rounded-lg bg-surface-elevated border border-border-subtle"
                          accessibilityRole="button"
                          accessibilityLabel={t('common.edit', {
                            defaultValue: 'Edit',
                          })}
                        >
                          <Icon name="pencil" size={14} color="#9CA3AF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteSession(session.id)}
                          hitSlop={8}
                          className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
                          accessibilityRole="button"
                          accessibilityLabel={t('common.delete', {
                            defaultValue: 'Delete',
                          })}
                        >
                          <Icon name="trash" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

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

export default MindfulnessDetailScreen;
