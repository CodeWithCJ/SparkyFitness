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
    ['en', 'Copy meal: Breakfast', 'From Today', 'Target date', 'Target meal', 'Copy'],
    ['pl', 'Kopiuj posiłek: Śniadanie', 'Z dnia Dziś', 'Data docelowa', 'Posiłek docelowy', 'Kopiuj'],
  ] as const)('localizes meal copy controls in %s', (locale, title, from, targetDate, targetMeal, copy) => {
    setTestLocale(locale);
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={jest.fn()} />);
    act(() => ref.current?.present(getTodayDate(), 'Breakfast'));
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(from)).toBeTruthy();
    expect(view.getByText(targetDate)).toBeTruthy();
    expect(view.getByText(targetMeal)).toBeTruthy();
    expect(view.getByText('Brunch')).toBeTruthy();
    expect(view.getByText(copy)).toBeTruthy();
    expect(view.getByTestId('date-picker').props.locale).toBe(locale === 'pl' ? 'pl-PL' : 'en-US');
  });

  it('keeps custom meal types literal and preserves the copy payload and disabled same slot', () => {
    const onCopy = jest.fn();
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={onCopy} />);
    const sourceDate = addDays(getTodayDate(), -2);
    act(() => ref.current?.present(sourceDate, 'Brunch'));
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

  it('renders the localized pending label', () => {
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} isPending onCopy={jest.fn()} />);
    act(() => ref.current?.present(getTodayDate(), 'Breakfast'));
    expect(view.getByText('Copying...')).toBeTruthy();
  });
});
