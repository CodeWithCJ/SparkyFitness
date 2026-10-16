import { scaleMax } from '@workspace/shared';
import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import { getAppLocale } from '../localization';
import {
  useSymptomEntriesDetailed,
  useOngoingEpisodes,
  useSymptomDefinitions,
  useSymptomFreeDays,
  useSymptomActions,
} from '../hooks/useSymptoms';
import SymptomCalendar from '../components/symptoms/SymptomCalendar';
import { addDays, getTodayDate } from '../utils/dateUtils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SymptomHistory'>;

export default function SymptomHistoryScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const today = getTodayDate();
  const thirtyDaysAgo = addDays(today, -29);

  const [selectedSymptomFilter, setSelectedSymptomFilter] = useState<
    string | null
  >(null);

  const { definitions } = useSymptomDefinitions();
  // A symptom can be rated on 1-5 or 1-10; show each severity against its own
  // scale. A text-scale symptom has no numeric maximum, so it gets no badge.
  const maxFor = (symptomId: string | null | undefined) => {
    const max = scaleMax(
      definitions.find((d) => d.id === symptomId)?.scale_type ?? '1-10'
    );
    return max > 0 ? max : null;
  };
  const [now] = useState(() => Date.now());
  const { episodes: ongoing } = useOngoingEpisodes();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Insights always cover the last 30 days; the list narrows to a tapped day.
  const { entries } = useSymptomEntriesDetailed({
    fromDate: thirtyDaysAgo,
    toDate: today,
  });
  const { entries: listEntries, isLoading } = useSymptomEntriesDetailed({
    fromDate: selectedDate ?? thirtyDaysAgo,
    toDate: selectedDate ?? today,
  });
  const { freeDays } = useSymptomFreeDays({
    fromDate: thirtyDaysAgo,
    toDate: today,
  });
  const { markFree, unmarkFree } = useSymptomActions();
  const isTodaySymptomFree = freeDays.some((d) => d.entry_date === today);

  const insights = useMemo(() => {
    const totalDays = 30;
    const freeCount = freeDays.length;
    const freePercentage = Math.round((freeCount / totalDays) * 100);

    // Top Triggers
    const triggerCounts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.triggers) {
        for (const tr of entry.triggers) {
          triggerCounts[tr] = (triggerCounts[tr] || 0) + 1;
        }
      }
    }
    const topTriggers = Object.entries(triggerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Effective Relief
    const reliefCounts: Record<string, { helped: number; total: number }> = {};
    for (const entry of entries) {
      if (entry.treatments) {
        for (const tr of entry.treatments) {
          if (!reliefCounts[tr.name_snapshot]) {
            reliefCounts[tr.name_snapshot] = { helped: 0, total: 0 };
          }
          reliefCounts[tr.name_snapshot].total += 1;
          if (tr.effectiveness === 'full' || tr.effectiveness === 'partial') {
            reliefCounts[tr.name_snapshot].helped += 1;
          }
        }
      }
    }
    const topRelief = Object.entries(reliefCounts)
      .filter(([, stat]) => stat.total >= 1)
      .map(([name, stat]) => ({
        name,
        percent: Math.round((stat.helped / stat.total) * 100),
      }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 2);

    return {
      freeCount,
      freePercentage,
      topTriggers,
      topRelief,
      totalLogs: entries.length,
    };
  }, [entries, freeDays]);

  const filteredEntries = selectedSymptomFilter
    ? listEntries.filter(
        (e) => e.symptom_name_snapshot === selectedSymptomFilter
      )
    : listEntries;

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '';
    const endMs = end ? new Date(end).getTime() : now;
    const diffMs = Math.max(0, endMs - new Date(start).getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const header = useScreenHeader({
    title: t('symptoms.historyTitle', { defaultValue: 'Symptom History' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'gearshape',
      ionicon: 'settings-outline',
      onPress: () => navigation.navigate('ManageSymptoms'),
      accessibilityLabel: t('symptoms.manageTitle', {
        defaultValue: 'Manage Symptoms',
      }),
      identifier: 'symptom-history-manage',
    },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      {/* Filter Chips */}
      <View className="py-2.5 px-4 border-b border-border/40 bg-surface/40">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row space-x-1.5"
        >
          <TouchableOpacity
            onPress={() => setSelectedSymptomFilter(null)}
            className={`px-3 py-1.5 rounded-full border ${
              selectedSymptomFilter === null
                ? 'bg-accent-primary border-accent-primary'
                : 'bg-surface border-border'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                selectedSymptomFilter === null
                  ? 'text-white'
                  : 'text-text-primary'
              }`}
            >
              {t('common.all', { defaultValue: 'All' })}
            </Text>
          </TouchableOpacity>

          {definitions.map((d) => {
            const isSelected = selectedSymptomFilter === d.name;
            return (
              <TouchableOpacity
                key={d.id}
                onPress={() =>
                  setSelectedSymptomFilter(isSelected ? null : d.name)
                }
                className={`px-3 py-1.5 rounded-full border ${
                  isSelected
                    ? 'bg-accent-primary border-accent-primary'
                    : 'bg-surface border-border'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isSelected ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {d.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-4 py-3 space-y-3">
        {/* Symptom-free day banner/toggle */}
        <View className="flex-row items-center justify-between p-3.5 rounded-xl bg-surface border border-border mb-1">
          <View className="flex-row items-center space-x-2.5 flex-1 pr-2">
            <Icon
              name={isTodaySymptomFree ? 'checkmark-circle-filled' : 'wellness'}
              size={20}
              color={isTodaySymptomFree ? '#10b981' : '#6b7280'}
            />
            <Text className="text-sm font-medium text-text-primary">
              {isTodaySymptomFree
                ? t('symptoms.markedSymptomFreeToday', {
                    defaultValue: 'Marked symptom-free today',
                  })
                : t('symptoms.noSymptomsTodayPrompt', {
                    defaultValue: 'No symptoms today?',
                  })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (isTodaySymptomFree) {
                unmarkFree.mutate(today);
              } else {
                markFree.mutate(today);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20"
          >
            <Text className="text-xs font-semibold text-accent-primary">
              {isTodaySymptomFree
                ? t('common.undo', { defaultValue: 'Undo' })
                : t('symptoms.markFree', { defaultValue: 'Mark Free' })}
            </Text>
          </TouchableOpacity>
        </View>

        <SymptomCalendar
          selectedDate={selectedDate}
          initialDate={today}
          onSelectDate={setSelectedDate}
        />

        {/* 30-Day Insights Card */}
        <View className="p-3.5 rounded-xl bg-surface border border-border mb-1">
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center">
              <Icon name="sparkles" size={16} color="#8b5cf6" />
              <Text className="text-xs font-bold text-text-primary uppercase tracking-wider ml-1.5">
                {t('symptoms.insights30d', {
                  defaultValue: '30-Day Insights',
                })}
              </Text>
            </View>
            <Text className="text-xs font-medium text-text-muted">
              {insights.freeCount}/30{' '}
              {t('symptoms.freeDaysShort', { defaultValue: 'free days' })} (
              {insights.freePercentage}%)
            </Text>
          </View>

          {/* Metrics Split */}
          <View className="flex-row">
            <View className="flex-1 bg-raised rounded-lg p-2.5 mr-1.5">
              <Text className="text-[11px] font-semibold text-text-muted uppercase mb-1">
                {t('symptoms.topTriggers', { defaultValue: 'Top Triggers' })}
              </Text>
              {insights.topTriggers.length > 0 ? (
                insights.topTriggers.map(([tr, count]) => (
                  <Text
                    key={tr}
                    className="text-xs text-text-primary font-medium"
                    numberOfLines={1}
                  >
                    • {tr}{' '}
                    <Text className="text-text-muted">
                      {t('symptoms.countTimes', {
                        defaultValue: '({{times}}x)',
                        times: count,
                      })}
                    </Text>
                  </Text>
                ))
              ) : (
                <Text className="text-xs text-text-muted italic">
                  {t('symptoms.noneRecorded', {
                    defaultValue: 'None recorded',
                  })}
                </Text>
              )}
            </View>

            <View className="flex-1 bg-raised rounded-lg p-2.5 ml-1.5">
              <Text className="text-[11px] font-semibold text-text-muted uppercase mb-1">
                {t('symptoms.effectiveRelief', {
                  defaultValue: 'Effective Relief',
                })}
              </Text>
              {insights.topRelief.length > 0 ? (
                insights.topRelief.map((r) => (
                  <Text
                    key={r.name}
                    className="text-xs text-text-primary font-medium"
                    numberOfLines={1}
                  >
                    • {r.name}{' '}
                    <Text className="text-emerald-500 font-semibold">
                      ({r.percent}%)
                    </Text>
                  </Text>
                ))
              ) : (
                <Text className="text-xs text-text-muted italic">
                  {t('symptoms.noneRecorded', {
                    defaultValue: 'None recorded',
                  })}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Ongoing banner in history */}
        {ongoing.length > 0 && (
          <View className="space-y-2 mb-2">
            <Text className="text-xs font-bold text-amber-500 uppercase tracking-wider">
              {t('symptoms.activeOngoing', {
                defaultValue: 'Active Ongoing Episodes',
              })}
            </Text>
            {ongoing.map((ep) => (
              <TouchableOpacity
                key={ep.id}
                onPress={() =>
                  navigation.navigate('SymptomLog', {
                    entryId: ep.id,
                    date: ep.entry_date,
                    isOngoing: true,
                  })
                }
                className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex-row items-center justify-between"
              >
                <View className="flex-1 space-y-1">
                  <View className="flex-row items-center space-x-2">
                    <View className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <Text className="text-sm font-bold text-text-primary">
                      {ep.symptom_name_snapshot ||
                        t('symptoms.timing.episode', {
                          defaultValue: 'Episode',
                        })}
                    </Text>
                  </View>
                  <Text className="text-xs text-text-muted">
                    {t('symptoms.timing.started', { defaultValue: 'Started' })}{' '}
                    {ep.started_at
                      ? new Date(ep.started_at).toLocaleTimeString(
                          getAppLocale(),
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )
                      : ''}{' '}
                    · {formatDuration(ep.started_at, null)}
                  </Text>
                </View>
                {ep.severity != null && maxFor(ep.symptom_id) != null && (
                  <View className="bg-amber-500/20 px-2.5 py-1 rounded-md border border-amber-500/40">
                    <Text className="text-xs font-bold text-amber-500">
                      {ep.severity}/{maxFor(ep.symptom_id)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Entries List */}
        {isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : filteredEntries.length === 0 ? (
          <View className="py-16 items-center space-y-2">
            <Icon name="document-text" size={40} color="#64748b" />
            <Text className="text-base font-semibold text-text-muted">
              {t('symptoms.noHistory', {
                defaultValue: 'No symptom logs found',
              })}
            </Text>
            <Text className="text-xs text-text-muted text-center px-6">
              {selectedDate
                ? t('symptoms.noHistoryForDay', {
                    defaultValue: 'No symptoms were logged on this day.',
                  })
                : t('symptoms.noHistoryDesc', {
                    defaultValue:
                      'Logs and past episodes for the last 30 days will show here.',
                  })}
            </Text>
          </View>
        ) : (
          filteredEntries.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() =>
                navigation.navigate('SymptomEpisodeDetail', {
                  entryId: item.id,
                })
              }
              className="bg-surface border border-border rounded-2xl p-4 space-y-2 shadow-sm"
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-base font-bold text-text-primary">
                    {item.symptom_name_snapshot ||
                      t('symptoms.symptom', { defaultValue: 'Symptom' })}
                  </Text>
                  <Text className="text-xs text-text-muted">
                    {item.entry_date}
                    {item.started_at &&
                      ` · ${formatDuration(item.started_at, item.ended_at)}`}
                  </Text>
                </View>

                {item.severity != null && maxFor(item.symptom_id) != null && (
                  <View className="bg-accent-primary/10 px-2.5 py-1 rounded-lg border border-accent-primary/20">
                    <Text className="text-xs font-bold text-accent-primary">
                      {item.severity}/{maxFor(item.symptom_id)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Tags summary */}
              <View className="flex-row flex-wrap gap-1 pt-1">
                {item.body_locations?.map((loc) => (
                  <View key={loc} className="bg-raised px-2 py-0.5 rounded-md">
                    <Text className="text-[11px] text-text-muted">{loc}</Text>
                  </View>
                ))}
                {item.triggers?.map((tr) => (
                  <View
                    key={tr}
                    className="bg-amber-500/10 px-2 py-0.5 rounded-md"
                  >
                    <Text className="text-[11px] text-amber-500">{tr}</Text>
                  </View>
                ))}
                {item.treatments?.map((tr) => (
                  <View
                    key={tr.name_snapshot}
                    className="bg-emerald-500/10 px-2 py-0.5 rounded-md"
                  >
                    <Text className="text-[11px] text-emerald-500">
                      {tr.name_snapshot}
                      {tr.effectiveness === 'full' ? ' (✓)' : ''}
                    </Text>
                  </View>
                ))}
              </View>

              {item.context_text && (
                <Text
                  className="text-xs text-text-muted italic pt-1"
                  numberOfLines={2}
                >
                  {`"${item.context_text}"`}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}

        <View className="h-16" />
      </ScrollView>

      {/* FAB to log symptom */}
      <TouchableOpacity
        onPress={() => navigation.navigate('SymptomLog')}
        className="absolute bottom-6 right-6 bg-accent-primary w-14 h-14 rounded-full items-center justify-center shadow-lg border border-white/20"
      >
        <Icon name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}
