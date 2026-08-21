import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  getCalendarMonthNames,
  getCalendarWeekdayShortNames,
  useCalendarPresentation,
} from '../../src/utils/calendarLocalization';
import { queryProviderForPreferences } from '../screens/helpers/preferencesQueryTestUtil';

/**
 * Minimal mounted counterpart of CalendarSheet's custom Intl presentation.
 * It intentionally retains a visible month in React state, while all labels
 * derive from the one reactive appLocale returned by useCalendarPresentation.
 */
function CalendarPresentationProbe() {
  const { appLocale, presentation } = useCalendarPresentation();
  const [visible] = useState({ year: 2026, month: 7 }); // August; must persist.
  const months = getCalendarMonthNames(appLocale);
  const weekdays = getCalendarWeekdayShortNames(appLocale);
  const orderedWeekdays = Array.from(
    { length: 7 },
    (_, index) => weekdays[(presentation.firstDayOfWeek + index) % 7],
  );

  return (
    <View>
      <Text testID="locale">{appLocale}</Text>
      <Text testID="caption">{`${months[visible.month]} ${visible.year}`}</Text>
      <Text testID="weekdays">{orderedWeekdays.join('|')}</Text>
      <Text testID="first-day">{String(presentation.firstDayOfWeek)}</Text>
      <Text testID="visible-month">{String(visible.month)}</Text>
    </View>
  );
}

describe('mounted calendar presentation language subscription', () => {
  beforeAll(async () => {
    await initializeI18n('pl');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('updates an already-mounted Monday-first calendar PL -> EN -> PL without resetting the viewed month', async () => {
    const { Wrapper } = queryProviderForPreferences({ first_day_of_week: 1 });

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    const screen = render(<CalendarPresentationProbe />, { wrapper: Wrapper });

    expect(screen.getByTestId('locale').props.children).toBe('pl-PL');
    expect(screen.getByTestId('caption').props.children).toMatch(/^sierpień 2026$/i);
    expect(screen.getByTestId('weekdays').props.children.split('|')[0]).toMatch(/^pon/i);
    expect(screen.getByTestId('first-day').props.children).toBe('1');
    expect(screen.getByTestId('visible-month').props.children).toBe('7');

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await waitFor(() => {
      expect(screen.getByTestId('locale').props.children).toBe('en-US');
      expect(screen.getByTestId('caption').props.children).toBe('August 2026');
      expect(screen.getByTestId('weekdays').props.children.split('|')[0]).toBe('Mon');
    });
    // Locale changes labels only: account week-start and user-viewed month stay.
    expect(screen.getByTestId('first-day').props.children).toBe('1');
    expect(screen.getByTestId('visible-month').props.children).toBe('7');

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    await waitFor(() => {
      expect(screen.getByTestId('locale').props.children).toBe('pl-PL');
      expect(screen.getByTestId('caption').props.children).toMatch(/^sierpień 2026$/i);
      expect(screen.getByTestId('weekdays').props.children.split('|')[0]).toMatch(/^pon/i);
    });
    expect(screen.getByTestId('first-day').props.children).toBe('1');
    expect(screen.getByTestId('visible-month').props.children).toBe('7');
  });
});
