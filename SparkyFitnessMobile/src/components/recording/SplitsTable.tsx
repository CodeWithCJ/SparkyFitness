import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../../localization';
import {
  formatPace,
  paceSecondsPerUnit,
  splitBars,
  type RecordedSplit,
} from '../../utils/gpsRecording';

const FEET_PER_METER = 3.28084;
/** Share of the row the slowest split's bar still fills. */
const MIN_BAR = 0.3;
const TABULAR = { fontVariant: ['tabular-nums' as const] };

interface Props {
  splits: readonly RecordedSplit[];
  /** Metres in one km or mile, the unit the rows are cut in. */
  unitMeters: number;
  unit: 'km' | 'miles';
}

/**
 * Per-km or per-mile splits as a table: the split, its pace with a bar that is
 * longer the faster it was, the height change and the average heart rate. The
 * elevation and heart-rate columns appear only when some split has a value.
 */
const SplitsTable: React.FC<Props> = ({ splits, unitMeters, unit }) => {
  const { t } = useTranslation();
  const bars = splitBars(splits, unitMeters);
  const paces = splits.map((split) =>
    paceSecondsPerUnit(split.distanceMeters, split.durationSeconds, unitMeters)
  );
  // Bars are stretched between the fastest and slowest full split, so a few
  // seconds of difference is visible; the slowest still gets a short bar.
  const full = paces.filter(
    (pace, i): pace is number =>
      pace !== null && Number.isFinite(pace) && !splits[i].partial
  );
  const fastestPace = full.length > 0 ? Math.min(...full) : 0;
  const slowestPace = full.length > 0 ? Math.max(...full) : 0;
  const barWidth = (pace: number | null): number => {
    if (pace === null || !Number.isFinite(pace)) return MIN_BAR;
    if (slowestPace <= fastestPace) return 1;
    const share = (slowestPace - pace) / (slowestPace - fastestPace);
    return Math.min(1, Math.max(MIN_BAR, MIN_BAR + (1 - MIN_BAR) * share));
  };
  const showElevation = splits.some(
    (split) => split.elevationChangeMeters != null
  );
  const showHeartRate = splits.some((split) => split.avgHeartRate != null);
  const miles = unit === 'miles';

  const elevationText = (meters: number | null | undefined): string => {
    if (meters == null) return '–';
    // Rounded first so a tiny drop reads 0, not -0.
    const rounded = Math.round(miles ? meters * FEET_PER_METER : meters);
    return formatLocalizedNumber(rounded === 0 ? 0 : rounded);
  };

  return (
    <View testID="splits-table">
      <View className="flex-row items-center pb-2 border-b border-border-subtle">
        <Text className="w-12 text-text-muted text-xs">
          {miles
            ? t('recordActivity.splitsTable.mi', { defaultValue: 'Mi' })
            : t('recordActivity.splitsTable.km', { defaultValue: 'Km' })}
        </Text>
        <Text className="w-14 text-text-muted text-xs">
          {t('recordActivity.splitsTable.pace', { defaultValue: 'Pace' })}
        </Text>
        <View className="flex-1" />
        {showElevation ? (
          <Text className="w-12 text-right text-text-muted text-xs">
            {t('recordActivity.splitsTable.elev', { defaultValue: 'Elev' })}
          </Text>
        ) : null}
        {showHeartRate ? (
          <Text className="w-12 text-right text-text-muted text-xs">
            {t('recordActivity.splitsTable.hr', { defaultValue: 'HR' })}
          </Text>
        ) : null}
      </View>
      {splits.map((split, i) => {
        const pace = paces[i];
        const bar = bars[i];
        return (
          <View
            key={split.index}
            testID={`split-row-${split.index}`}
            className="flex-row items-center py-1.5"
          >
            <Text className="w-12 text-text-primary text-sm" style={TABULAR}>
              {split.partial
                ? formatLocalizedNumber(split.distanceMeters / unitMeters, {
                    maximumFractionDigits: 2,
                  })
                : String(split.index)}
            </Text>
            <Text
              className={`w-14 text-sm ${
                bar.fastest
                  ? 'text-accent-primary font-semibold'
                  : 'text-text-primary'
              }`}
              style={TABULAR}
            >
              {formatPace(pace)}
            </Text>
            <View className="flex-1 mr-3">
              <View
                className="h-5 rounded-md bg-accent-primary"
                style={{
                  width: `${Math.round(barWidth(pace) * 100)}%`,
                }}
              />
            </View>
            {showElevation ? (
              <Text
                className="w-12 text-right text-text-primary text-sm"
                style={TABULAR}
              >
                {elevationText(split.elevationChangeMeters)}
              </Text>
            ) : null}
            {showHeartRate ? (
              <Text
                className="w-12 text-right text-text-primary text-sm"
                style={TABULAR}
              >
                {split.avgHeartRate != null
                  ? formatLocalizedNumber(split.avgHeartRate)
                  : '–'}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

export default SplitsTable;
