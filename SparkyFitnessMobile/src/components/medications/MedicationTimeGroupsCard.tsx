import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { useLogDose } from '../../hooks/useMedications';
import { usePreferences } from '../../hooks/usePreferences';
import { formatLocalizedTimeOfDay } from '../../utils/medicationScheduleLocalization';
import { doseSlotStatus, type DueDose } from '../../utils/medications';

interface MedicationTimeGroupsCardProps {
  /** Scheduled dose slots for the selected day (already subtype-filtered). */
  dueDoses: DueDose[];
  dose: ReturnType<typeof useLogDose>;
}

interface TimeGroup {
  time: string;
  pending: DueDose[];
}

/**
 * One-tap batch logging for times of day that carry several pending
 * doses: each row marks every pending dose at that time as taken in a
 * single action. Times with fewer than two pending doses render nothing,
 * because the individual dose rows already provide that affordance.
 */
const MedicationTimeGroupsCard: React.FC<MedicationTimeGroupsCardProps> = ({
  dueDoses,
  dose,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const [busyTime, setBusyTime] = useState<string | null>(null);

  const groups = useMemo<TimeGroup[]>(() => {
    const byTime = new Map<string, DueDose[]>();
    for (const due of dueDoses) {
      const time = due.schedule.time_of_day;
      if (time == null || time === '') continue;
      const list = byTime.get(time) ?? [];
      list.push(due);
      byTime.set(time, list);
    }
    return [...byTime.entries()]
      .map(([time, dues]) => ({
        time,
        pending: dues.filter(
          (d) => doseSlotStatus(dose.entryForDue(d)) === 'pending'
        ),
      }))
      .filter((group) => group.pending.length >= 2)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [dueDoses, dose]);

  const markAll = useCallback(
    async (group: TimeGroup) => {
      setBusyTime(group.time);
      try {
        await dose.logDosesBatch(group.pending, 'taken');
      } finally {
        setBusyTime(null);
      }
    },
    [dose]
  );

  if (groups.length === 0) return null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary">
        {t('medications.timeGroups.title', {
          defaultValue: 'Take at once',
        })}
      </Text>
      <Text className="text-sm text-text-secondary mt-1">
        {t('medications.timeGroups.description', {
          defaultValue: 'Mark every pending dose at a time with one tap.',
        })}
      </Text>
      {groups.map((group) => {
        const timeLabel = formatLocalizedTimeOfDay(
          group.time,
          undefined,
          preferences?.time_format
        );
        return (
          <View key={group.time} className="flex-row items-center mt-3">
            <View className="flex-1">
              <Text
                className="text-base font-medium text-text-primary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {timeLabel}
              </Text>
              <Text className="text-xs text-text-muted mt-0.5">
                {t('medications.timeGroups.pendingCount', {
                  defaultValue: '{{count}} doses pending',
                  count: group.pending.length,
                })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => void markAll(group)}
              disabled={busyTime !== null}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('medications.timeGroups.markAllA11y', {
                defaultValue: 'Mark all {{count}} doses at {{time}} as taken',
                count: group.pending.length,
                time: timeLabel,
              })}
              className="rounded-full px-3 py-1 bg-raised"
              testID={`time-group-mark-all-${group.time}`}
            >
              {busyTime === group.time ? (
                <ActivityIndicator size="small" color={accentPrimary} />
              ) : (
                <Text
                  className="text-sm font-semibold"
                  style={{ color: accentPrimary }}
                >
                  {t('medications.timeGroups.markAll', {
                    defaultValue: 'Mark all as taken',
                  })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

export default MedicationTimeGroupsCard;
