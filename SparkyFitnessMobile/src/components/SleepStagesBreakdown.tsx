import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { TFunction } from 'i18next';

import type { SleepEntry } from '../types/sleep';
import { formatSleepDuration } from '../utils/sleepDay';
import { localizeSleepStage } from '../utils/sleepLocalization';

interface StageDefinition {
  key: 'deep' | 'light' | 'rem' | 'awake';
  field: keyof Pick<
    SleepEntry,
    | 'deep_sleep_seconds'
    | 'light_sleep_seconds'
    | 'rem_sleep_seconds'
    | 'awake_sleep_seconds'
  >;
  colorVariable: string;
}

/** Ordered deepest-first, which is how the stage breakdown is conventionally read. */
const STAGES: StageDefinition[] = [
  {
    key: 'deep',
    field: 'deep_sleep_seconds',
    colorVariable: '--color-cat-teal',
  },
  {
    key: 'light',
    field: 'light_sleep_seconds',
    colorVariable: '--color-cat-blue',
  },
  {
    key: 'rem',
    field: 'rem_sleep_seconds',
    colorVariable: '--color-cat-violet',
  },
  {
    key: 'awake',
    field: 'awake_sleep_seconds',
    colorVariable: '--color-cat-orange',
  },
];

interface StageShare {
  definition: StageDefinition;
  seconds: number;
  percent: number;
}

/**
 * Distributes 100% across the present stages using the largest-remainder method.
 *
 * Rounding each share independently lets the column read 33% / 33% / 33% — visibly wrong
 * next to a total. Largest-remainder hands the leftover points to whichever stages were
 * rounded down hardest, so the displayed percentages always sum to exactly 100.
 *
 * Percentages are computed over the *present* stages only. A source that reports no REM
 * should not have its deep and light shares deflated by a phantom zero.
 */
export const buildStageShares = (entry: SleepEntry): StageShare[] => {
  const presentStages = STAGES.map((definition) => ({
    definition,
    seconds: entry[definition.field],
  })).filter(
    (stage): stage is { definition: StageDefinition; seconds: number } =>
      stage.seconds != null
  );

  if (presentStages.length === 0) return [];

  const totalSeconds = presentStages.reduce(
    (sum, stage) => sum + stage.seconds,
    0
  );

  // An all-zero day is real (a session recorded with stage columns but no time in any of
  // them). Report 0% rather than dividing by zero into NaN.
  if (totalSeconds <= 0) {
    return presentStages.map((stage) => ({ ...stage, percent: 0 }));
  }

  const exactShares = presentStages.map((stage) => ({
    ...stage,
    exactPercent: (stage.seconds / totalSeconds) * 100,
  }));

  const shares = exactShares.map((stage) => ({
    definition: stage.definition,
    seconds: stage.seconds,
    percent: Math.floor(stage.exactPercent),
  }));

  const remainderOrder = exactShares
    .map((stage, index) => ({ index, remainder: stage.exactPercent % 1 }))
    .sort((first, second) => second.remainder - first.remainder);

  let pointsToDistribute =
    100 - shares.reduce((sum, stage) => sum + stage.percent, 0);
  for (const { index } of remainderOrder) {
    if (pointsToDistribute <= 0) break;
    shares[index].percent += 1;
    pointsToDistribute -= 1;
  }

  return shares;
};

const formatPercent = (percent: number, t: TFunction): string =>
  t('sleep.percentValue', { defaultValue: '{{percent}}%', percent });

interface SleepStagesBreakdownProps {
  entry: SleepEntry;
}

/**
 * Deep / light / REM / awake totals for one session, with each stage's share of the whole.
 */
const SleepStagesBreakdown: React.FC<SleepStagesBreakdownProps> = ({
  entry,
}) => {
  const { t } = useTranslation();
  const stageColors = useCSSVariable(
    STAGES.map((stage) => stage.colorVariable)
  ) as string[];

  const shares = buildStageShares(entry);
  if (shares.length === 0) return null;

  return (
    <View
      testID="sleep-stages-breakdown"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <Text className="text-base font-semibold text-text-primary mb-2">
        {t('sleep.stageBreakdown', { defaultValue: 'Stage Breakdown' })}
      </Text>

      {shares.map((share) => (
        <View
          key={share.definition.key}
          testID={`sleep-stage-${share.definition.key}`}
          className="flex-row items-center justify-between py-1.5"
        >
          <View className="flex-row items-center">
            <View
              className="w-2.5 h-2.5 rounded-full mr-2"
              style={{
                backgroundColor:
                  stageColors[
                    STAGES.findIndex(
                      (stage) => stage.key === share.definition.key
                    )
                  ],
              }}
            />
            <Text className="text-base text-text-primary">
              {localizeSleepStage(t, share.definition.key)}
            </Text>
          </View>

          <View className="flex-row items-center">
            <Text className="text-base text-text-secondary mr-3">
              {formatSleepDuration(share.seconds, t)}
            </Text>
            <Text className="text-base font-semibold text-text-primary w-12 text-right">
              {formatPercent(share.percent, t)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};

export default SleepStagesBreakdown;
