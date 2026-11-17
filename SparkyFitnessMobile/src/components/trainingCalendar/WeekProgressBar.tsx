import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CalendarWeekTotals } from '@workspace/shared';
import { useTrainingCalendarColors } from '../../hooks/useTrainingCalendarColors';
import { weekProgress } from '../../utils/trainingCalendar';

/** Done, partly done and missed shares of a week's planned sessions; the rest is still to come. */
const WeekProgressBar: React.FC<{ week: CalendarWeekTotals }> = ({ week }) => {
  const { t } = useTranslation();
  const colors = useTrainingCalendarColors();
  const p = weekProgress(week);
  if (p.planned <= 0) return null;
  const segments = [
    { key: 'done', size: p.done, color: colors.status.done },
    { key: 'partial', size: p.partial, color: colors.status.partial },
    { key: 'missed', size: p.missed, color: colors.status.missed },
    { key: 'rest', size: p.rest, color: colors.status.upcoming },
  ].filter((segment) => segment.size > 0);
  return (
    <View
      testID={`week-progress-${week.start}`}
      accessible
      accessibilityLabel={t('trainingCalendar.progressA11y', {
        done: p.done,
        partial: p.partial,
        missed: p.missed,
        planned: p.planned,
        defaultValue:
          '{{done}} done, {{partial}} partly done, {{missed}} missed, of {{planned}} planned',
      })}
      className="flex-row rounded-full overflow-hidden my-1"
      style={{ height: 4, gap: 1 }}
    >
      {segments.map((segment) => (
        <View
          key={segment.key}
          testID={`week-progress-${segment.key}`}
          style={{ flex: segment.size, backgroundColor: segment.color }}
        />
      ))}
    </View>
  );
};

export default WeekProgressBar;
