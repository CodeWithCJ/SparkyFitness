import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  PACE_BAND_FASTEST_SECONDS_PER_KM,
  PACE_BAND_MIN_WIDTH_SECONDS,
  PACE_BAND_SLOWEST_SECONDS_PER_KM,
} from '@workspace/shared';
import { formatClock } from '../../utils/gpsRecording';
import RangeStepperRow from './RangeStepperRow';
import RecordingSwitchRow from './RecordingSwitchRow';

/** A pace band in seconds per display unit (km or mile). */
export interface PaceBandChoice {
  fastest: number;
  slowest: number;
}

/** How far one tap moves an edge, in seconds. */
const STEP_SECONDS = 5;

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  band: PaceBandChoice;
  onBandChange: (band: PaceBandChoice) => void;
  unit: 'km' | 'miles';
  /** Wording and test ids for a second use (a plan's fast or easy stretch). */
  title?: string;
  description?: string;
  testIDPrefix?: string;
}

/**
 * Before Start: a pace to stay between. The phone buzzes, and speaks with
 * voice cues on, once the pace has been outside it for a few seconds.
 */
const PaceBandCard: React.FC<Props> = ({
  enabled,
  onEnabledChange,
  band,
  onBandChange,
  unit,
  title,
  description,
  testIDPrefix = 'pace',
}) => {
  const { t } = useTranslation();
  const unitLabel = unit === 'miles' ? '/mi' : '/km';
  // The shared limits are per kilometre; a mile takes 1.61 times as long.
  const perUnit = unit === 'miles' ? 1.609344 : 1;
  const floorSeconds = Math.round(PACE_BAND_FASTEST_SECONDS_PER_KM * perUnit);
  const ceilingSeconds = Math.round(PACE_BAND_SLOWEST_SECONDS_PER_KM * perUnit);

  const move = (edge: 'fastest' | 'slowest', delta: number) => {
    const next = { ...band, [edge]: band[edge] + delta };
    if (
      next.fastest < floorSeconds ||
      next.slowest > ceilingSeconds ||
      next.slowest - next.fastest < PACE_BAND_MIN_WIDTH_SECONDS * 1.61
    ) {
      return;
    }
    onBandChange(next);
  };

  const row = (edge: 'fastest' | 'slowest', label: string) => (
    <RangeStepperRow
      label={label}
      testIDPrefix={`${testIDPrefix}-${edge}`}
      valueText={`${formatClock(band[edge])}${unitLabel}`}
      decreaseLabel={t('recordActivity.paceBand.faster', {
        defaultValue: '{{edge}} 5 seconds faster',
        edge: label,
      })}
      increaseLabel={t('recordActivity.paceBand.slower', {
        defaultValue: '{{edge}} 5 seconds slower',
        edge: label,
      })}
      onDecrease={() => move(edge, -STEP_SECONDS)}
      onIncrease={() => move(edge, STEP_SECONDS)}
    />
  );

  return (
    <View>
      <RecordingSwitchRow
        testID={`${testIDPrefix}-alert-switch`}
        title={
          title ??
          t('recordActivity.paceBand.title', {
            defaultValue: 'Pace alert',
          })
        }
        description={
          description ??
          t('recordActivity.paceBand.description', {
            defaultValue:
              'Buzzes, and speaks with voice cues on, when you stay outside your pace range.',
          })
        }
        value={enabled}
        onValueChange={onEnabledChange}
      />
      {enabled ? (
        <View className="bg-surface rounded-xl p-4 mt-2">
          {row(
            'fastest',
            t('recordActivity.paceBand.fastest', { defaultValue: 'Fastest' })
          )}
          {row(
            'slowest',
            t('recordActivity.paceBand.slowest', { defaultValue: 'Slowest' })
          )}
        </View>
      ) : null}
    </View>
  );
};

export default PaceBandCard;
