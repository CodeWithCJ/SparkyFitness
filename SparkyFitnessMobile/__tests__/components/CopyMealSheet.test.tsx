import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CopyMealSheet, { type CopyMealSheetRef } from '../../src/components/CopyMealSheet';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';

jest.mock('../../src/localization', () => ({
  getAppLocale: () =>
    (globalThis as typeof globalThis & { __activeWorkoutTestLocale?: string })
      .__activeWorkoutTestLocale === 'pl'
      ? 'pl-PL'
      : 'en-US',
}));

jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(() => ({
    mealTypes: [
      { id: 'breakfast-id', name: 'Breakfast' },
      { id: 'brunch-id', name: 'Brunch' },
    ],
  })),
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

describe('CopyMealSheet', () => {
  it.each([
    ['en', 'Copy meal: Breakfast', 'Source date: Today', 'Target date', 'Target meal', 'Copy'],
    ['pl', 'Kopiuj posiłek: Śniadanie', 'Data źródłowa: Dziś', 'Data docelowa', 'Posiłek docelowy', 'Kopiuj'],
  ] as const)('localizes meal copy controls in %s', (locale, title, from, targetDate, targetMeal, copy) => {
    setTestLocale(locale);
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={jest.fn()} />);
    act(() => ref.current?.present(getTodayDate(), 'breakfast-id', 'Breakfast'));
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(from)).toBeTruthy();
    expect(view.getByText(targetDate)).toBeTruthy();
    expect(view.getByText(targetMeal)).toBeTruthy();
    expect(view.getByText('Brunch')).toBeTruthy();
    expect(view.getByText(copy)).toBeTruthy();
    expect(view.getByTestId('date-picker').props.locale).toBe(locale === 'pl' ? 'pl-PL' : 'en-US');
  });

  it.each([
    ['en', 'Source date: Yesterday', 'en-US'],
    ['pl', 'Data źródłowa: Wczoraj', 'pl-PL'],
  ] as const)('localizes yesterday source dates in %s', (locale, expected, appLocale) => {
    setTestLocale(locale);
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={jest.fn()} />);
    act(() => ref.current?.present(addDays(getTodayDate(), -1), 'breakfast-id', 'Breakfast'));
    expect(view.getByText(expected)).toBeTruthy();
    expect(view.getByTestId('date-picker').props.locale).toBe(appLocale);
  });

  it.each([
    ['en', 'en-US'],
    ['pl', 'pl-PL'],
  ] as const)('formats ordinary source dates with the app locale in %s', (locale, appLocale) => {
    setTestLocale(locale);
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={jest.fn()} />);
    act(() => ref.current?.present('2026-01-02', 'breakfast-id', 'Breakfast'));
    const formatted = new Date(2026, 0, 2).toLocaleDateString(appLocale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    expect(view.getByText(`${locale === 'pl' ? 'Data źródłowa' : 'Source date'}: ${formatted}`)).toBeTruthy();
  });

  it('keeps custom meal types literal and preserves the copy payload and disabled same slot', () => {
    const onCopy = jest.fn();
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={onCopy} />);
    const sourceDate = addDays(getTodayDate(), -2);
    act(() => ref.current?.present(sourceDate, 'brunch-id', 'Brunch'));
    expect(view.getByText('Brunch')).toBeTruthy();
    const copyButton = view.getByLabelText('Copy');
    fireEvent.press(copyButton);
    expect(onCopy).not.toHaveBeenCalled();
    fireEvent.press(view.getByText('Breakfast'));
    fireEvent.press(view.getByLabelText('Copy'));
    expect(onCopy).toHaveBeenCalledWith({
      sourceDate,
      sourceMealType: 'Brunch',
      targetDate: sourceDate,
      targetMealType: 'Breakfast',
    });
  });

  it.each([
    ['en', 'Copying...'],
    ['pl', 'Kopiowanie...'],
  ] as const)('renders the localized pending label in %s', (locale, pending) => {
    setTestLocale(locale);
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} isPending onCopy={jest.fn()} />);
    act(() => ref.current?.present(getTodayDate(), 'breakfast-id', 'Breakfast'));
    expect(view.getByText(pending)).toBeTruthy();
  });
});
