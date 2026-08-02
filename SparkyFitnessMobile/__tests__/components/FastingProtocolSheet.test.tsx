import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import FastingProtocolSheet, { type FastingProtocolSheetRef } from '../../src/components/FastingProtocolSheet';

const mockStartFast = jest.fn();
let mockPending = false;

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & { __setTestLocale: (value: 'en' | 'pl') => void }).__setTestLocale(locale);
}

jest.mock('../../src/hooks/useFasting', () => ({
  useStartFast: () => ({ mutate: mockStartFast, isPending: mockPending }),
}));
jest.mock('../../src/localization', () => ({
  ...jest.requireActual('../../src/localization'),
  getAppLocale: () => (globalThis.__activeWorkoutTestLocale === 'pl' ? 'pl-PL' : 'en-US'),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/Icon', () => () => null);

describe('FastingProtocolSheet', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockPending = false;
    mockStartFast.mockReset();
    (Toast.show as jest.Mock).mockClear();
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['en', ['16:8 Leangains', '18:6 Warrior', '20:4 Warrior', 'Circadian Rhythm', 'Custom Fast'], ['Skip breakfast and eat during an 8-hour window.']],
    ['pl', ['16:8 Leangains', '18:6 Warrior', '20:4 Warrior', 'Rytm dobowy', 'Własny post'], ['Pomiń śniadanie i jedz w 8-godzinnym oknie.']],
  ] as const)('renders localized protocols and descriptions in %s', (locale, names, descriptions) => {
    setTestLocale(locale);
    const view = render(<FastingProtocolSheet ref={createRef()} />);
    for (const name of names) expect(view.getByText(name)).toBeTruthy();
    for (const description of descriptions) expect(view.getByText(description)).toBeTruthy();
    expect(view.getAllByText(locale === 'en' ? 'Start a fast' : 'Rozpocznij post').length).toBeGreaterThan(0);
  });

  it.each([
    ['en', 'Start time', 'Starting...', 'Start fasting', 'Fasting duration in hours', 'hours'],
    ['pl', 'Czas rozpoczęcia', 'Rozpoczynanie...', 'Rozpocznij post', 'Czas postu w godzinach', 'godz.'],
  ] as const)('localizes controls and custom input in %s', (locale, startTime, starting, startButton, inputLabel, hours) => {
    setTestLocale(locale);
    const ref = createRef<FastingProtocolSheetRef>();
    const view = render(<FastingProtocolSheet ref={ref} />);
    act(() => ref.current?.present('custom'));
    expect(view.getByText(startTime)).toBeTruthy();
    expect(view.getByLabelText(inputLabel)).toBeTruthy();
    expect(view.getByText(hours)).toBeTruthy();
    expect(view.getAllByText(startButton).length).toBeGreaterThan(0);
    mockPending = true;
    view.rerender(<FastingProtocolSheet ref={ref} />);
    expect(view.getByText(starting)).toBeTruthy();
  });

  it('passes raw preset name and exact ISO payload for a standard protocol', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));
    const ref = createRef<FastingProtocolSheetRef>();
    const view = render(<FastingProtocolSheet ref={ref} />);
    act(() => ref.current?.present('16-8'));
    fireEvent.press(view.getByText('Start fasting'));
    expect(mockStartFast).toHaveBeenCalledTimes(1);
    const [payload] = mockStartFast.mock.calls[0] as [{ startTime: string; targetEndTime: string; fastingType: string }];
    expect(payload.startTime).toBe(new Date('2026-01-15T10:30:00.000Z').toISOString());
    expect(payload.targetEndTime).toBe(new Date('2026-01-16T02:30:00.000Z').toISOString());
    expect(payload.fastingType).toBe('16:8 Leangains');
  });

  it('supports custom duration validation, payload, and success/error toasts', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));
    const ref = createRef<FastingProtocolSheetRef>();
    const view = render(<FastingProtocolSheet ref={ref} />);
    act(() => ref.current?.present('custom'));
    fireEvent.changeText(view.getByDisplayValue('12'), '72');
    fireEvent.press(view.getByText('Start fasting'));
    const [payload, options] = mockStartFast.mock.calls[0] as [{ startTime: string; targetEndTime: string; fastingType: string }, { onSuccess: () => void; onError: (error: Error) => void }];
    expect(payload.targetEndTime).toBe(new Date('2026-01-18T10:30:00.000Z').toISOString());
    expect(payload.fastingType).toBe('Custom Fast');
    act(() => options.onSuccess());
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Fast started' });

    mockStartFast.mockReset();
    fireEvent.changeText(view.getByDisplayValue('72'), '0');
    fireEvent.press(view.getAllByText('Start fasting')[0]);
    expect(mockStartFast).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByDisplayValue('0'), '12');
    fireEvent.press(view.getAllByText('Start fasting')[0]);
    const errorOptions = mockStartFast.mock.calls[0][1] as { onError: (error: Error) => void };
    act(() => errorOptions.onError(new Error('boom')));
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Failed to start fast', text2: 'Please try again.' });
  });

  it.each([
    ['en-US', 'en'], ['pl-PL', 'pl'],
  ] as const)('passes locale to date picker and localized start label: %s', (pickerLocale, locale) => {
    setTestLocale(locale);
    const ref = createRef<FastingProtocolSheetRef>();
    const view = render(<FastingProtocolSheet ref={ref} />);
    act(() => ref.current?.present());
    fireEvent.press(view.getByText(locale === 'en' ? 'Start time' : 'Czas rozpoczęcia'));
    expect(view.getByTestId('date-picker').props.locale).toBe(pickerLocale);
    expect(view.getByTestId('date-picker')).toBeTruthy();
  });
});
