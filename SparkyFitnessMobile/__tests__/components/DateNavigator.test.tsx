import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DateNavigator from '../../src/components/DateNavigator';
import i18n, { initializeI18n } from '../../src/localization/i18n';

describe('DateNavigator action', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  test('renders an accessible 44 by 44 header action', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        }}
      >
        <DateNavigator
          title="Diary"
          selectedDate="2025-01-15"
          onPreviousDay={jest.fn()}
          onNextDay={jest.fn()}
          onToday={jest.fn()}
          action={{
            icon: 'people',
            accessibilityLabel: 'Open family diaries',
            onPress,
          }}
        />
      </SafeAreaProvider>
    );

    const action = getByRole('button', { name: 'Open family diaries' });
    expect(action.props.style).toEqual(
      expect.objectContaining({ width: 44, height: 44 })
    );
    fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('exposes every date control as a named 44 point button', () => {
    const onPreviousDay = jest.fn();
    const onNextDay = jest.fn();
    const onDatePress = jest.fn();
    const { getByRole } = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        }}
      >
        <DateNavigator
          title="Family diary"
          selectedDate="2025-01-15"
          onPreviousDay={onPreviousDay}
          onNextDay={onNextDay}
          onToday={jest.fn()}
          onDatePress={onDatePress}
        />
      </SafeAreaProvider>
    );

    const previous = getByRole('button', { name: 'Previous day' });
    const picker = getByRole('button', { name: 'Choose date' });
    const next = getByRole('button', { name: 'Next day' });

    for (const control of [previous, picker, next]) {
      expect(control.props.style).toEqual(
        expect.objectContaining({ minHeight: 44, minWidth: 44 })
      );
    }
    expect(previous.props.accessibilityHint).toBe('Shows the previous day');
    expect(picker.props.accessibilityHint).toBe('Opens the date picker');
    expect(next.props.accessibilityHint).toBe('Shows the next day');

    fireEvent.press(previous);
    fireEvent.press(picker);
    fireEvent.press(next);
    expect(onPreviousDay).toHaveBeenCalledTimes(1);
    expect(onDatePress).toHaveBeenCalledTimes(1);
    expect(onNextDay).toHaveBeenCalledTimes(1);
  });

  test('renders the global relative date and translated accessible controls', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 0, 15, 12));
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        }}
      >
        <DateNavigator
          title="Dziennik rodzinny"
          selectedDate="2025-01-15"
          onPreviousDay={jest.fn()}
          onNextDay={jest.fn()}
          onToday={jest.fn()}
          dateControls={{
            previousDayLabel: 'Poprzedni dzień',
            previousDayHint: 'Pokazuje poprzedni dzień',
            nextDayLabel: 'Następny dzień',
            nextDayHint: 'Pokazuje następny dzień',
            chooseDateLabel: 'Wybierz datę',
            chooseDateHint: 'Otwiera wybór daty',
            goToTodayLabel: 'Przejdź do dzisiaj',
            goToTodayHint: 'Wraca do dzisiaj',
          }}
        />
      </SafeAreaProvider>
    );

    expect(screen.getByText('Today')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Poprzedni dzień' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Następny dzień' })).toBeTruthy();
    jest.useRealTimers();
  });

  test('localizes default accessible controls for existing callers', async () => {
    await i18n.changeLanguage('pl');

    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        }}
      >
        <DateNavigator
          title="Dziennik"
          selectedDate="2025-01-15"
          onPreviousDay={jest.fn()}
          onNextDay={jest.fn()}
          onToday={jest.fn()}
          onDatePress={jest.fn()}
        />
      </SafeAreaProvider>
    );

    expect(
      screen.getByRole('button', { name: 'Poprzedni dzień' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wybierz datę' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Następny dzień' })).toBeTruthy();
  });
});
