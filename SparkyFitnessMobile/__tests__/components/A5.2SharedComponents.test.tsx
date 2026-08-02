import React, { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AnchoredMenu from '../../src/components/AnchoredMenu';
import BottomSheetPicker from '../../src/components/BottomSheetPicker';
import TypingIndicator from '../../src/components/chat/TypingIndicator';
import ConnectionStatus from '../../src/components/ConnectionStatus';
import DateRangeSheet, { type DateRangeSheetRef } from '../../src/components/DateRangeSheet';

jest.mock('../../src/localization', () => ({
  getAppLocale: () =>
    (globalThis as typeof globalThis & { __activeWorkoutTestLocale?: string })
      .__activeWorkoutTestLocale === 'pl'
      ? 'pl-PL'
      : 'en-US',
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

describe('A5.2 shared components', () => {
  it.each([
    ['en', 'Dismiss menu'],
    ['pl', 'Zamknij menu'],
  ] as const)('AnchoredMenu localizes dismissal and preserves dynamic item labels in %s', (locale, dismiss) => {
    setTestLocale(locale);
    const onClose = jest.fn();
    const onPress = jest.fn();
    const view = render(
      <AnchoredMenu
        visible
        anchor={{ x: 10, y: 10, width: 20, height: 20 }}
        onClose={onClose}
        items={[{ key: 'custom', label: 'Dynamic owner label', onPress }]}
      />,
    );
    fireEvent.press(view.getByLabelText(dismiss));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByLabelText('Dynamic owner label'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['en', 'Select an option', 'Opens selection menu'],
    ['pl', 'Wybierz opcję', 'Otwiera menu wyboru'],
  ] as const)('BottomSheetPicker localizes the default trigger in %s', (locale, placeholder, hint) => {
    setTestLocale(locale);
    const onSelect = jest.fn();
    const view = render(
      <BottomSheetPicker value="none" options={[{ label: 'Owner option', value: 'owner' }]} onSelect={onSelect} />,
    );
    const trigger = view.getByLabelText(placeholder);
    expect(trigger.props.accessibilityHint).toBe(hint);
    fireEvent.press(view.getByText('Owner option'));
    expect(onSelect).toHaveBeenCalledWith('owner');
  });

  it('BottomSheetPicker preserves explicit and dynamic owner labels', () => {
    const onSelect = jest.fn();
    const view = render(
      <BottomSheetPicker
        value="none"
        placeholder="Owner placeholder"
        title="Owner title"
        sections={[{ title: 'Owner section', options: [{ label: 'Owner option', value: 'one' }] }]}
        onSelect={onSelect}
      />,
    );
    expect(view.getByText('Owner placeholder')).toBeTruthy();
    expect(view.getByText('Owner title')).toBeTruthy();
    expect(view.getByText('Owner section')).toBeTruthy();
    expect(view.getByText('Owner option')).toBeTruthy();
  });

  it.each([
    ['en', 'Sparky is typing'],
    ['pl', 'Sparky pisze'],
  ] as const)('TypingIndicator localizes accessibility only in %s', (locale, label) => {
    setTestLocale(locale);
    const view = render(<TypingIndicator />);
    expect(view.getByLabelText(label).children).toHaveLength(3);
  });

  it.each([
    ['en', 'Server connected', 'Connected', 'Connection failed', 'Configuration required', 'Connected to server. Tap to refresh.', 'Connection failed. Tap to retry.', 'Server configuration required.'],
    ['pl', 'Połączono z serwerem', 'Połączono', 'Połączenie nieudane', 'Wymagana konfiguracja', 'Połączono z serwerem. Dotknij, aby odświeżyć.', 'Połączenie nieudane. Dotknij, aby spróbować ponownie.', 'Wymagana konfiguracja serwera.'],
  ] as const)('ConnectionStatus covers all states in %s', (locale, header, connected, failed, unconfigured, connectedA11y, failedA11y, unconfiguredA11y) => {
    setTestLocale(locale);
    expect(render(<ConnectionStatus isConnected={true} variant="header" />).getByText(header)).toBeTruthy();
    expect(render(<ConnectionStatus isConnected={false} variant="header" />).toJSON()).toBeNull();
    const refresh = jest.fn();
    expect(render(<ConnectionStatus isConnected={true} onRefresh={refresh} />).getByText(connected)).toBeTruthy();
    const connectedView = render(<ConnectionStatus isConnected onRefresh={refresh} />);
    expect(connectedView.getByLabelText(connectedA11y)).toBeTruthy();
    fireEvent.press(connectedView.getByLabelText(connectedA11y));
    expect(refresh).toHaveBeenCalledTimes(1);
    const failedView = render(<ConnectionStatus isConnected={false} onRefresh={refresh} />);
    expect(failedView.getByText(failed)).toBeTruthy();
    expect(failedView.getByLabelText(failedA11y)).toBeTruthy();
    fireEvent.press(failedView.getByLabelText(failedA11y));
    expect(refresh).toHaveBeenCalledTimes(2);
    const unconfiguredView = render(<ConnectionStatus isConnected={false} hasConfig={false} onRefresh={refresh} />);
    expect(unconfiguredView.getByText(unconfigured)).toBeTruthy();
    expect(unconfiguredView.queryByLabelText(unconfiguredA11y)).toBeNull();
  });

  it.each([
    ['en', 'Select a date range to remove', 'Remove selected range', 'en-US'],
    ['pl', 'Wybierz zakres dat do usunięcia', 'Usuń wybrany zakres', 'pl-PL'],
  ] as const)('DateRangeSheet localizes the range controls in %s', (locale, title, remove, pickerLocale) => {
    setTestLocale(locale);
    const ref = createRef<DateRangeSheetRef>();
    const onConfirm = jest.fn();
    const view = render(<DateRangeSheet ref={ref} onConfirm={onConfirm} />);
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(remove)).toBeTruthy();
    expect(view.getByTestId('date-picker').props.locale).toBe(pickerLocale);
    expect(() => fireEvent.press(view.getByLabelText(remove))).not.toThrow();
    expect(onConfirm).not.toHaveBeenCalled();
    ref.current?.present();
  });

  it('DateRangeSheet confirms inclusive local dates after both bounds are selected', () => {
    const onConfirm = jest.fn();
    const ref = createRef<DateRangeSheetRef>();
    const view = render(<DateRangeSheet ref={ref} onConfirm={onConfirm} />);
    const picker = view.getByTestId('date-picker');
    fireEvent(picker, 'change', {
      startDate: new Date(2026, 0, 2),
      endDate: new Date(2026, 0, 5),
    });
    fireEvent.press(view.getByLabelText('Remove selected range'));
    expect(onConfirm).toHaveBeenCalledWith('2026-01-02', '2026-01-05');
  });
});
