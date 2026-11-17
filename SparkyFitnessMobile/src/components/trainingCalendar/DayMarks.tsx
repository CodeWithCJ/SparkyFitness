import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon';
import { useTrainingCalendarColors } from '../../hooks/useTrainingCalendarColors';
import {
  MAX_DAY_MARKS,
  SPORT_ICONS,
  type DayMark,
} from '../../utils/trainingCalendar';
import { markA11yLabel } from '../../utils/trainingCalendarLabels';
import type { LoadSportGroup } from '@workspace/shared';

/** One sport icon in the colour of its status; extra work is faded. */
export const SportMark: React.FC<{
  sport: LoadSportGroup;
  status: DayMark['status'];
  size?: number;
  testID?: string;
}> = ({ sport, status, size = 13, testID }) => {
  const { t } = useTranslation();
  const colors = useTrainingCalendarColors();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={markA11yLabel(t, sport, status)}
      style={{ opacity: status === 'extra' ? 0.5 : 1 }}
    >
      <Icon
        name={SPORT_ICONS[sport]}
        size={size}
        color={status === 'extra' ? colors.extra : colors.status[status]}
      />
    </View>
  );
};

/** The icons on a day of the grid, at most `MAX_DAY_MARKS`, then "+N". */
const DayMarks: React.FC<{ marks: DayMark[] }> = ({ marks }) => {
  const { t } = useTranslation();
  const shown = marks.slice(0, MAX_DAY_MARKS);
  const more = marks.length - shown.length;
  return (
    <View
      className="flex-row flex-wrap justify-center items-center"
      style={{ gap: 2, minHeight: 14 }}
    >
      {shown.map((mark) => (
        <SportMark
          key={mark.key}
          sport={mark.sport}
          status={mark.status}
          testID={`day-mark-${mark.status}`}
        />
      ))}
      {more > 0 ? (
        <Text
          testID="day-mark-more"
          className="text-text-muted"
          style={{ fontSize: 10 }}
          accessibilityLabel={t('trainingCalendar.moreA11y', {
            count: more,
            defaultValue: '{{count}} more sessions',
          })}
        >
          {t('trainingCalendar.more', {
            count: more,
            defaultValue: '+{{count}}',
          })}
        </Text>
      ) : null}
    </View>
  );
};

export default DayMarks;
