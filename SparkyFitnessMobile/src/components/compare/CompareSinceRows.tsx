import React, { useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  COMPARE_METRICS,
  type CompareMetricKey,
  type CompareSinceResponse,
  sinceLineOptions,
  sinceStartBounds,
} from '@workspace/shared';

import BottomSheetPicker from '../BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import { compareValueText, metricName } from '../../utils/compareCopy';
import { formatDateWithYear } from '../../utils/dayLabel';

interface CompareSinceRowsProps {
  /** The latest answer for this habit and outcome, kept while a new start or line loads. */
  response: CompareSinceResponse | undefined;
  outcome: CompareMetricKey;
  today: string;
  /** The day the person picked; null until they pick one. */
  habitStart: string | null;
  /** The line the person picked, in the stored scale; null until they pick one. */
  line: number | null;
  onStartChange: (day: string) => void;
  onLineChange: (line: number) => void;
}

interface ChipProps {
  label: string;
  /** False while nothing is chosen, which shows the label muted. */
  filled: boolean;
  onPress: () => void;
  /** What the chip sets, read before its label. */
  title: string;
}

/** A tappable value in a row, styled like the sentence's chips. */
const Chip: React.FC<ChipProps> = ({ label, filled, onPress, title }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={`${title}: ${label}`}
    className="bg-raised rounded-lg px-2.5 py-1 mx-1 my-0.5"
  >
    <Text
      className={`text-base font-semibold ${
        filled ? 'text-accent-primary' : 'text-text-muted'
      }`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

/**
 * The two settings under a since question: "Since [date]" (the server's
 * suggestion, marked as such, until the person picks a day) and
 * "Line: [outcome] ≥ [value]" on the outcome's display scale.
 */
const CompareSinceRows: React.FC<CompareSinceRowsProps> = ({
  response,
  outcome,
  today,
  habitStart,
  line,
  onStartChange,
  onLineChange,
}) => {
  const { t } = useTranslation();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const bounds = sinceStartBounds(today);
  const result = response?.result;

  const suggested =
    habitStart === null ? (result?.suggestedStart ?? null) : null;
  const shownStart = habitStart ?? suggested;
  // A yes/no outcome has no line, and a start-less answer's is a placeholder.
  const shownLine =
    COMPARE_METRICS[outcome].kind === 'binary'
      ? null
      : (line ?? (result && result.start !== null ? result.line : null));

  const metric = metricName(outcome, t);
  const lineTitle = t('compareReport.since.lineTitle', {
    defaultValue: '{{metric}} at or above',
    metric,
  });

  return (
    <View testID="compare-since-rows">
      <View className="flex-row flex-wrap items-center">
        <Text className="text-base text-text-primary">
          {t('compareReport.since.startLabel', { defaultValue: 'Since' })}
        </Text>
        <Chip
          label={
            shownStart
              ? formatDateWithYear(shownStart)
              : t('compareReport.since.pickDate', {
                  defaultValue: 'Pick a date',
                })
          }
          filled={shownStart !== null}
          onPress={() => calendarRef.current?.present()}
          title={t('compareReport.since.startTitle', {
            defaultValue: 'Start date',
          })}
        />
        {suggested ? (
          <Text className="text-sm text-text-muted">
            {t('compareReport.since.suggested', {
              defaultValue: '(suggested)',
            })}
          </Text>
        ) : null}
      </View>
      {shownLine !== null ? (
        <View className="flex-row flex-wrap items-center mt-1">
          <Text className="text-base text-text-primary">
            {t('compareReport.since.lineLabel', {
              defaultValue: 'Line: {{metric}} ≥',
              metric,
            })}
          </Text>
          <BottomSheetPicker<number>
            value={shownLine}
            options={sinceLineOptions(
              outcome,
              shownLine,
              (v) => compareValueText(outcome, v),
              result
            )}
            title={lineTitle}
            onSelect={onLineChange}
            renderTrigger={({ onPress }) => (
              <Chip
                label={compareValueText(outcome, shownLine)}
                filled
                onPress={onPress}
                title={lineTitle}
              />
            )}
          />
        </View>
      ) : null}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={shownStart ?? bounds.max}
        minDate={bounds.min}
        maxDate={bounds.max}
        onSelectDate={onStartChange}
      />
    </View>
  );
};

export default CompareSinceRows;
