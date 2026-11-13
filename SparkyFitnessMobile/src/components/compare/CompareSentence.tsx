import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareTimingChoice,
  isCompareMetricKey,
  questionForMode,
  timingOf,
} from '@workspace/shared';

import BottomSheetPicker, { type PickerSection } from '../BottomSheetPicker';
import { compareMetricSections } from '../../constants/compareMetrics';
import { questionParts } from '../../utils/compareCopy';

interface CompareSentenceProps {
  question: Partial<CompareQuestion>;
  onChange: (question: Partial<CompareQuestion>) => void;
}

type MetricValue = CompareMetricKey | '';
type Slot = 'a' | 'b';

const CompareSentence: React.FC<CompareSentenceProps> = ({
  question,
  onChange,
}) => {
  const { t } = useTranslation();
  const mode: CompareMode = question.choice
    ? timingOf(question.choice).mode
    : 'day';

  const something = t('compareReport.sentence.something', {
    defaultValue: 'something',
  });
  // The chips read exactly as sentenceText does once every part is chosen.
  const parts = questionParts(question, t);

  const chooseMetric = (slot: Slot, key: CompareMetricKey) => {
    const other: Slot = slot === 'a' ? 'b' : 'a';
    // Picking the other side's metric swaps the two rather than blocking.
    if (question[other] === key) {
      onChange({ ...question, [slot]: key, [other]: question[slot] });
    } else {
      onChange({ ...question, [slot]: key });
    }
  };

  const chooseTiming = (choice: CompareTimingChoice) => {
    onChange(questionForMode({ ...question, choice }, timingOf(choice).mode));
  };

  const timingSections: PickerSection<CompareTimingChoice>[] = [
    {
      title: t('compareReport.sentence.dayByDay', {
        defaultValue: 'Day by day',
      }),
      options: [
        {
          value: 'sameDay',
          label: t('compareReport.sentence.sameDay', {
            defaultValue: 'The same day',
          }),
        },
        {
          value: 'nextDay',
          label: t('compareReport.sentence.nextDay', {
            defaultValue: 'The next day',
          }),
        },
        {
          value: 'dayBefore',
          label: t('compareReport.sentence.dayBefore', {
            defaultValue: 'The day before',
          }),
        },
      ],
    },
    {
      title: t('compareReport.sentence.weekByWeek', {
        defaultValue: 'Week by week',
      }),
      options: [
        {
          value: 'sameWeek',
          label: t('compareReport.sentence.sameWeek', {
            defaultValue: 'The same week',
          }),
        },
        {
          value: 'nextWeek',
          label: t('compareReport.sentence.nextWeek', {
            defaultValue: 'The next week',
          }),
        },
      ],
    },
    {
      title: t('compareReport.sentence.sinceHabit', {
        defaultValue: 'Since a habit started',
      }),
      options: [
        {
          value: 'sinceHabit',
          label: t('compareReport.sentence.beforeVsSince', {
            defaultValue: 'Before vs. since',
          }),
        },
      ],
    },
  ];

  const trigger = (
    label: string,
    filled: boolean,
    onPress: () => void,
    accessibilityLabel: string
  ) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${label}`}
      className="bg-raised rounded-lg px-2.5 py-1 mx-1 my-0.5"
    >
      <Text
        className={`text-lg font-semibold ${
          filled ? 'text-accent-primary' : 'text-text-muted'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const metricPicker = (slot: Slot) => {
    const key = question[slot];
    const title =
      slot === 'a'
        ? t('compareReport.sentence.firstTitle', {
            defaultValue: 'First thing',
          })
        : t('compareReport.sentence.secondTitle', {
            defaultValue: 'Second thing',
          });
    return (
      <BottomSheetPicker<MetricValue>
        value={key ?? ''}
        sections={compareMetricSections(t, mode)}
        title={title}
        onSelect={(value) => {
          if (isCompareMetricKey(value)) chooseMetric(slot, value);
        }}
        renderTrigger={({ onPress }) =>
          trigger(parts[slot] ?? something, !!key, onPress, title)
        }
      />
    );
  };

  const timingTitle = t('compareReport.sentence.timingTitle', {
    defaultValue: 'When',
  });
  const choice = question.choice;
  const timingLabel =
    parts.timing ??
    t('compareReport.sentence.sometime', { defaultValue: 'some time' });
  const timingPicker = (
    <BottomSheetPicker<CompareTimingChoice>
      value={choice ?? 'sameDay'}
      sections={timingSections}
      title={timingTitle}
      onSelect={chooseTiming}
      renderTrigger={({ onPress }) =>
        trigger(timingLabel, !!choice, onPress, timingTitle)
      }
    />
  );
  const words = (text: string) => (
    <Text className="text-lg text-text-primary">{text}</Text>
  );

  // "Since I started [X] regularly, has [Y] changed?" The "Since" is the
  // timing chip, so the person can switch back to day or week.
  if (mode === 'since') {
    return (
      <View className="flex-row flex-wrap items-center">
        {timingPicker}
        {words(
          t('compareReport.sentence.iStarted', { defaultValue: 'I started' })
        )}
        {metricPicker('a')}
        {words(
          t('compareReport.sentence.regularlyHas', {
            defaultValue: 'regularly, has',
          })
        )}
        {metricPicker('b')}
        {words(
          t('compareReport.sentence.changed', { defaultValue: 'changed?' })
        )}
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center">
      {words(t('compareReport.sentence.does', { defaultValue: 'Does' }))}
      {metricPicker('a')}
      {words(t('compareReport.sentence.goWith', { defaultValue: 'go with' }))}
      {metricPicker('b')}
      {timingPicker}
      {words(t('compareReport.sentence.questionMark', { defaultValue: '?' }))}
    </View>
  );
};

export default CompareSentence;
