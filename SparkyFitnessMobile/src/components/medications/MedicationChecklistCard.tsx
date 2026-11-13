import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ChecklistProgress } from '@workspace/shared';

interface MedicationChecklistCardProps {
  progress: ChecklistProgress;
  isToday: boolean;
}

/** "N of M doses logged" with a progress bar for the selected day. */
const MedicationChecklistCard: React.FC<MedicationChecklistCardProps> = ({
  progress,
  isToday,
}) => {
  const { t } = useTranslation();
  const [accentPrimary, track] = useCSSVariable([
    '--color-accent-primary',
    '--color-progress-track',
  ]) as [string, string];

  const title = isToday
    ? t('medications.checklist.titleToday', {
        defaultValue: "Today's Checklist",
      })
    : t('medications.checklist.title', {
        defaultValue: 'Medication Checklist',
      });

  const description =
    progress.total === 0
      ? isToday
        ? t('medications.checklist.noneToday', {
            defaultValue: 'No scheduled doses for today.',
          })
        : t('medications.checklist.noneDay', {
            defaultValue: 'No scheduled doses for this day.',
          })
      : isToday
        ? t('medications.checklist.loggedToday', {
            defaultValue: '{{completed}} of {{count}} doses logged today.',
            completed: progress.completed,
            count: progress.total,
          })
        : t('medications.checklist.loggedDay', {
            defaultValue:
              '{{completed}} of {{count}} doses logged for this day.',
            completed: progress.completed,
            count: progress.total,
          });

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary">{title}</Text>
      <Text className="text-sm text-text-secondary mt-1">{description}</Text>
      {progress.total > 0 && (
        <View className="flex-row items-center mt-3">
          <View
            className="flex-1 h-2.5 rounded-full overflow-hidden"
            style={{ backgroundColor: track }}
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: progress.pct }}
          >
            <View
              testID="checklist-progress-fill"
              className="h-2.5 rounded-full"
              style={{
                width: `${progress.pct}%`,
                backgroundColor: accentPrimary,
              }}
            />
          </View>
          <Text
            className="text-sm font-semibold text-text-primary ml-3"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {progress.pct}%
          </Text>
        </View>
      )}
    </View>
  );
};

export default MedicationChecklistCard;
