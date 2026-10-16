import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  HEART_RATE_BAND_HIGHEST_BPM,
  HEART_RATE_BAND_LOWEST_BPM,
  HEART_RATE_BAND_MIN_WIDTH_BPM,
  type HeartRateBand,
} from '@workspace/shared';
import RangeStepperRow from './RangeStepperRow';
import RecordingSwitchRow from './RecordingSwitchRow';

/** How far one tap moves an edge, in beats per minute. */
const STEP_BPM = 5;

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  band: HeartRateBand;
  onBandChange: (band: HeartRateBand) => void;
  /** Wording and test ids for a second use (a plan's fast or easy stretch). */
  title?: string;
  description?: string;
  testIDPrefix?: string;
}

/**
 * A heart-rate range to stay between. It is read from the Apple Watch, so the
 * phone or the watch buzzes, and speaks with voice cues on, once the reading
 * has been outside the range for a while.
 */
const HeartRateBandCard: React.FC<Props> = ({
  enabled,
  onEnabledChange,
  band,
  onBandChange,
  title,
  description,
  testIDPrefix = 'hr',
}) => {
  const { t } = useTranslation();

  const move = (edge: keyof HeartRateBand, delta: number) => {
    const next = { ...band, [edge]: band[edge] + delta };
    if (
      next.minBpm < HEART_RATE_BAND_LOWEST_BPM ||
      next.maxBpm > HEART_RATE_BAND_HIGHEST_BPM ||
      next.maxBpm - next.minBpm < HEART_RATE_BAND_MIN_WIDTH_BPM
    ) {
      return;
    }
    onBandChange(next);
  };

  const row = (edge: keyof HeartRateBand, label: string) => (
    <RangeStepperRow
      label={label}
      testIDPrefix={`${testIDPrefix}-${edge === 'minBpm' ? 'min' : 'max'}`}
      valueText={t('recordActivity.heartRateBand.value', {
        value: band[edge],
        defaultValue: '{{value}} bpm',
      })}
      decreaseLabel={t('recordActivity.heartRateBand.lower', {
        defaultValue: '{{edge}} 5 bpm lower',
        edge: label,
      })}
      increaseLabel={t('recordActivity.heartRateBand.higher', {
        defaultValue: '{{edge}} 5 bpm higher',
        edge: label,
      })}
      onDecrease={() => move(edge, -STEP_BPM)}
      onIncrease={() => move(edge, STEP_BPM)}
    />
  );

  return (
    <View>
      <RecordingSwitchRow
        testID={`${testIDPrefix}-alert-switch`}
        title={
          title ??
          t('recordActivity.heartRateBand.title', {
            defaultValue: 'Heart rate alert',
          })
        }
        description={
          description ??
          t('recordActivity.heartRateBand.description', {
            defaultValue:
              'Needs your Apple Watch. Buzzes, and speaks with voice cues on, when your heart rate stays outside this range.',
          })
        }
        value={enabled}
        onValueChange={onEnabledChange}
      />
      {enabled ? (
        <View className="bg-surface rounded-xl p-4 mt-2">
          {row(
            'minBpm',
            t('recordActivity.heartRateBand.lowest', { defaultValue: 'Lowest' })
          )}
          {row(
            'maxBpm',
            t('recordActivity.heartRateBand.highest', {
              defaultValue: 'Highest',
            })
          )}
        </View>
      ) : null}
    </View>
  );
};

export default HeartRateBandCard;
