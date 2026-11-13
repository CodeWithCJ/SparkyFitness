import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { moodByName } from '@workspace/shared';
import SegmentedControl, { type Segment } from '../SegmentedControl';
import MoodLineChart from './MoodLineChart';
import { getBuiltInMoodLabels } from './moodLabels';
import { useMoodEntries } from '../../hooks/useMood';
import type { CustomMood } from '../../services/api/moodApi';
import type { HealthTrendDateRange } from '../../types/healthTrends';

const TAG_FREQUENCY_LIMIT = 8;

interface MoodHistoryCardProps {
  customMoods: CustomMood[];
}

/** Mood over time, with the most-logged moods in the range under it. */
export default function MoodHistoryCard({ customMoods }: MoodHistoryCardProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => getBuiltInMoodLabels(t), [t]);
  const [range, setRange] = useState<HealthTrendDateRange>('30d');
  const { entries, points, isLoading, isError } = useMoodEntries(range);

  const rangeSegments: Segment<HealthTrendDateRange>[] = [
    { key: '7d', label: t('ranges.7d', { defaultValue: '7d' }) },
    { key: '30d', label: t('ranges.30d', { defaultValue: '30d' }) },
    { key: '90d', label: t('ranges.90d', { defaultValue: '90d' }) },
  ];

  // Most-logged moods in the range, like the web mood report.
  const tagFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.source !== 'manual') continue;
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
      return `${builtIn.emoji} ${labels[builtIn.name] ?? builtIn.displayName}`;
    }
    const custom = customMoods.find((m) => m.name === tag);
    return `${custom?.icon ? `${custom.icon} ` : ''}${custom?.display_name ?? tag}`;
  };

  return (
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
  );
}
