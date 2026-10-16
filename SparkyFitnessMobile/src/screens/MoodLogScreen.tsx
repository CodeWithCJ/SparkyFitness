import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BUILT_IN_MOODS,
  moodByName,
  moodValueToTag,
  representativeMoodValue,
} from '@workspace/shared';
import type { RootStackParamList } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { FooterSaveBar } from '../components/FormScreenChrome';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import MoodLineChart from '../components/mood/MoodLineChart';
import { getBuiltInMoodLabels } from '../components/mood/moodLabels';
import { moodColorHex } from '../components/mood/moodColors';
import {
  useCustomMoods,
  useMoodEntries,
  useMoodEntryForDate,
  useSaveMood,
} from '../hooks/useMood';
import { getTodayDate } from '../utils/dateUtils';
import type { HealthTrendDateRange } from '../types/healthTrends';

type Props = NativeStackScreenProps<RootStackParamList, 'MoodLog'>;

const DEFAULT_MOOD_VALUE = 50;
const BANDED_MOODS = BUILT_IN_MOODS.filter((m) => m.band != null);
const TAG_FREQUENCY_LIMIT = 8;

export default function MoodLogScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const builtInLabels = useMemo(() => getBuiltInMoodLabels(t), [t]);
  const builtInLabel = (name: string, fallback: string) =>
    builtInLabels[name] ?? fallback;

  const targetDate = route.params?.date ?? getTodayDate();
  const {
    entry: existing,
    isLoading: entryLoading,
    isError: entryError,
  } = useMoodEntryForDate(targetDate);
  const customMoods = useCustomMoods();
  const saveMood = useSaveMood();

  // Edits are held as overrides on top of the saved entry so the form follows
  // it once it loads, without an effect copying server state into local state.
  const [moodOverride, setMoodOverride] = useState<number | null>(null);
  const [tagsOverride, setTagsOverride] = useState<string[] | null>(null);
  const [notesOverride, setNotesOverride] = useState<string | null>(null);
  const moodValue = moodOverride ?? existing?.mood_value ?? DEFAULT_MOOD_VALUE;
  const tags = tagsOverride ?? existing?.mood_tags ?? [];
  const notes = notesOverride ?? existing?.notes ?? '';

  const [range, setRange] = useState<HealthTrendDateRange>('30d');
  const { entries, points, isLoading, isError } = useMoodEntries(range);

  const currentBand = moodByName(moodValueToTag(moodValue));
  const isToday = targetDate === getTodayDate();

  const toggleTag = (name: string) =>
    setTagsOverride(
      tags.includes(name) ? tags.filter((tag) => tag !== name) : [...tags, name]
    );

  const entryReady = !entryLoading && !entryError;

  const handleSave = async () => {
    if (!entryReady || saveMood.isPending) return;
    await saveMood.mutateAsync({
      mood_value: moodValue,
      mood_tags: tags,
      notes,
      entry_date: targetDate,
    });
    navigation.goBack();
  };

  const header = useScreenHeader({
    title: t('mood.logTitle', { defaultValue: 'Mood' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: [
      {
        kind: 'primary',
        label: t('common.save', { defaultValue: 'Save' }),
        onPress: handleSave,
        busy: saveMood.isPending,
        disabled: !entryReady || saveMood.isPending,
        placement: 'native-only',
        identifier: 'mood-log-save',
      },
    ],
  });

  const rangeSegments: Segment<HealthTrendDateRange>[] = [
    { key: '7d', label: t('ranges.7d', { defaultValue: '7d' }) },
    { key: '30d', label: t('ranges.30d', { defaultValue: '30d' }) },
    { key: '90d', label: t('ranges.90d', { defaultValue: '90d' }) },
  ];

  // Most-logged moods in the range, like the web mood report.
  const tagFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const tag of entry.mood_tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TAG_FREQUENCY_LIMIT);
  }, [entries]);

  const tagLabel = (tag: string) => {
    const builtIn = moodByName(tag);
    if (builtIn) {
      return `${builtIn.emoji} ${builtInLabel(builtIn.name, builtIn.displayName)}`;
    }
    const custom = customMoods.find((m) => m.name === tag);
    return `${custom?.icon ? `${custom.icon} ` : ''}${custom?.display_name ?? tag}`;
  };

  const renderChip = (
    name: string,
    label: string,
    color: string | null | undefined
  ) => {
    const active = tags.includes(name);
    return (
      <TouchableOpacity
        key={name}
        onPress={() => toggleTag(name)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
          active
            ? 'bg-accent-primary/10 border-accent-primary'
            : 'bg-surface border-border'
        }`}
      >
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: moodColorHex(color) }}
        />
        <Text className="text-xs font-semibold text-text-primary">{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        {entryLoading && (
          <Text className="text-xs text-text-muted">
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        )}
        {entryError && (
          <Text className="text-xs text-text-muted">
            {t('mood.loadFailed', {
              defaultValue: "Could not load this day's mood",
            })}
          </Text>
        )}
        {!isToday && (
          <Text className="text-xs text-text-muted">
            {t('mood.loggingForDate', {
              defaultValue: 'Logging for {{date}}',
              date: targetDate,
            })}
          </Text>
        )}

        {/* Overall mood: nine faces on the shared 0-100 scale */}
        <View className="bg-surface border border-border p-3.5 rounded-2xl gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-text-primary">
              {t('mood.overall', { defaultValue: 'Overall mood' })}
            </Text>
            {currentBand && (
              <Text className="text-sm font-medium text-text-primary">
                {currentBand.emoji}{' '}
                {builtInLabel(currentBand.name, currentBand.displayName)}
              </Text>
            )}
          </View>
          <View className="flex-row justify-between">
            {BANDED_MOODS.map((mood) => {
              const active = currentBand?.name === mood.name;
              const label = builtInLabel(mood.name, mood.displayName);
              return (
                <TouchableOpacity
                  key={mood.name}
                  onPress={() =>
                    setMoodOverride(representativeMoodValue([mood.name]))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: active }}
                  className={`w-9 h-9 items-center justify-center rounded-full ${
                    active ? 'bg-accent-primary/15' : ''
                  }`}
                  style={{ opacity: active ? 1 : 0.45 }}
                >
                  <Text style={{ fontSize: active ? 26 : 20 }}>
                    {mood.emoji}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Tags */}
        <View className="gap-2">
          <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
            {t('mood.tags', { defaultValue: 'Moods' })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {BUILT_IN_MOODS.map((mood) =>
              renderChip(
                mood.name,
                `${mood.emoji} ${builtInLabel(mood.name, mood.displayName)}`,
                mood.color
              )
            )}
            {customMoods.map((mood) =>
              renderChip(
                mood.name,
                `${mood.icon ? `${mood.icon} ` : ''}${mood.display_name ?? mood.name}`,
                mood.color
              )
            )}
          </View>
        </View>

        {/* Notes */}
        <TextInput
          value={notes}
          onChangeText={setNotesOverride}
          placeholder={t('mood.notesPlaceholder', {
            defaultValue: 'Add a note (optional)',
          })}
          placeholderTextColor={textMuted}
          multiline
          textAlignVertical="top"
          className="bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary min-h-20"
        />

        {/* Mood chart */}
        <View className="bg-surface rounded-xl p-4 gap-3">
          <Text className="text-text-primary text-lg font-semibold">
            {t('mood.chartTitle', { defaultValue: 'Mood over time' })}
          </Text>
          <SegmentedControl
            segments={rangeSegments}
            activeKey={range}
            onSelect={setRange}
          />
          <MoodLineChart
            data={points}
            isLoading={isLoading}
            isError={isError}
            range={range}
          />
          {tagFrequency.length > 0 && (
            <View className="gap-1.5">
              <Text className="text-sm font-medium text-text-primary">
                {t('mood.mostCommon', { defaultValue: 'Most common moods' })}
              </Text>
              {tagFrequency.map(([tag, count]) => (
                <View key={tag} className="flex-row justify-between">
                  <Text className="text-sm text-text-secondary">
                    {tagLabel(tag)}
                  </Text>
                  <Text className="text-sm text-text-muted">{count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          busy={saveMood.isPending}
          disabled={!entryReady || saveMood.isPending}
        />
      )}
    </View>
  );
}
