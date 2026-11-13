import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  adherenceBar,
  adherenceTier,
  type AdherenceBarLevel,
  type AdherenceSummary,
} from '@workspace/shared';
import Icon, { type IconName } from '../Icon';
import ProgressRing from '../ProgressRing';
import {
  useMedicationStatusColors,
  type MedicationStatusColors,
} from './useMedicationStatusColors';

interface AdherenceOverviewCardProps {
  summary: AdherenceSummary;
  /** Scheduled doses logged on the selected day, and how many were due. */
  dosesCompleted: number;
  dosesTotal: number;
  isToday: boolean;
}

const RING_SIZE = 88;

const barColor = (
  level: AdherenceBarLevel,
  colors: MedicationStatusColors
): string => {
  switch (level) {
    case 'full':
      return colors.success;
    case 'partial':
      return colors.warning;
    case 'low':
      return colors.orange;
    case 'missed':
      return colors.danger;
    case 'idle':
      return colors.track;
  }
};

const Tile: React.FC<{
  icon: IconName;
  color: string;
  value: string;
  label: string;
}> = ({ icon, color, value, label }) => (
  <View
    className="flex-1 bg-raised rounded-xl p-3"
    accessible
    accessibilityLabel={`${label}: ${value}`}
  >
    <Icon name={icon} size={18} color={color} />
    <Text
      className="text-2xl font-bold text-text-primary mt-1.5"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {value}
    </Text>
    <Text className="text-xs text-text-secondary mt-0.5" numberOfLines={2}>
      {label}
    </Text>
  </View>
);

/**
 * The rolling adherence overview: today's doses, the window's adherence and perfect days,
 * a ring for the adherence percentage and one bar per day with the current streak.
 */
const AdherenceOverviewCard: React.FC<AdherenceOverviewCardProps> = ({
  summary,
  dosesCompleted,
  dosesTotal,
  isToday,
}) => {
  const { t } = useTranslation();
  const colors = useMedicationStatusColors();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];

  const tier = adherenceTier(summary.pct);
  const ringColor =
    tier === 'good'
      ? colors.success
      : tier === 'fair'
        ? colors.warning
        : colors.danger;
  const windowDays = summary.days.length;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary mb-3">
        {t('medications.adherence.title', {
          defaultValue: 'Adherence overview',
        })}
      </Text>

      <View className="flex-row items-center gap-3">
        <View className="flex-1 flex-row gap-2">
          <Tile
            icon="medication"
            color={colors.success}
            value={`${dosesCompleted}/${dosesTotal}`}
            label={
              isToday
                ? t('medications.adherence.dosesToday', {
                    defaultValue: 'Doses today',
                  })
                : t('medications.adherence.doses', { defaultValue: 'Doses' })
            }
          />
          <Tile
            icon="checkmark-circle"
            color={accentPrimary}
            value={`${summary.pct}%`}
            label={t('medications.adherence.windowAdherence', {
              defaultValue: '{{count}}-day adherence',
              count: windowDays,
            })}
          />
          <Tile
            icon="trophy"
            color={colors.warning}
            value={String(summary.perfectDays)}
            label={t('medications.adherence.perfectDays', {
              defaultValue: 'Perfect days ({{count}}d)',
              count: windowDays,
            })}
          />
        </View>
      </View>

      <View className="flex-row items-center mt-4">
        <View
          style={{ width: RING_SIZE, height: RING_SIZE }}
          accessible
          accessibilityLabel={t('medications.adherence.ringA11y', {
            defaultValue: '{{pct}} percent adherence over {{count}} days',
            pct: summary.pct,
            count: windowDays,
          })}
        >
          <ProgressRing
            progress={summary.pct / 100}
            size={RING_SIZE}
            strokeWidth={8}
            color={ringColor}
            backgroundColor={colors.track}
          />
          <View
            className="absolute inset-0 items-center justify-center"
            pointerEvents="none"
          >
            <Text
              className="text-lg font-bold"
              style={{ color: ringColor, fontVariant: ['tabular-nums'] }}
            >
              {summary.pct}%
            </Text>
            <Text className="text-[10px] text-text-muted">
              {t('medications.adherence.ringLabel', {
                defaultValue: '{{count}}-day',
                count: windowDays,
              })}
            </Text>
          </View>
        </View>

        <View className="flex-1 ml-4">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs text-text-muted">
              {t('medications.adherence.lastDays', {
                defaultValue: 'Last {{count}} days',
                count: windowDays,
              })}
            </Text>
            {summary.streak > 0 && (
              <View className="flex-row items-center">
                <Icon name="flame" size={14} color={colors.orange} />
                <Text
                  className="text-xs font-semibold ml-1"
                  style={{ color: colors.orange }}
                >
                  {t('medications.adherence.streak', {
                    defaultValue: '{{count}}-day streak',
                    count: summary.streak,
                  })}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row items-end gap-1" style={{ height: 40 }}>
            {summary.days.map((day) => {
              const { level, heightPct } = adherenceBar(day);
              const label =
                day.due === 0
                  ? day.prnTaken > 0
                    ? t('medications.adherence.barPrn', {
                        defaultValue: '{{date}}: {{count}} as-needed doses',
                        date: day.date,
                        count: day.prnTaken,
                      })
                    : t('medications.adherence.barNone', {
                        defaultValue: '{{date}}: no doses',
                        date: day.date,
                      })
                  : t('medications.adherence.barTaken', {
                      defaultValue: '{{date}}: {{taken}} of {{due}} taken',
                      date: day.date,
                      taken: day.taken,
                      due: day.due,
                    });
              return (
                <View
                  key={day.date}
                  testID={`adherence-bar-${day.date}-${level}`}
                  accessible
                  accessibilityLabel={label}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: barColor(level, colors),
                    opacity: level === 'idle' ? 0.6 : 1,
                  }}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
};

export default AdherenceOverviewCard;
