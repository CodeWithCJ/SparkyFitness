import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import ExerciseProgressCard from '../../src/components/ExerciseProgressCard';

let mockFocused = true;

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));
jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#calories', '#track'],
}));
jest.mock('../../src/localization', () => ({
  ...jest.requireActual('../../src/localization'),
  getAppLocale: () => (globalThis.__activeWorkoutTestLocale === 'pl' ? 'pl-PL' : 'en-US'),
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & { __setTestLocale: (value: 'en' | 'pl') => void }).__setTestLocale(locale);
}

function renderCard(overrides?: Partial<React.ComponentProps<typeof ExerciseProgressCard>>) {
  return render(
    <ExerciseProgressCard
      exerciseMinutes={overrides?.exerciseMinutes ?? 0}
      exerciseMinutesGoal={overrides?.exerciseMinutesGoal ?? 0}
      exerciseCalories={overrides?.exerciseCalories ?? 0}
      exerciseCaloriesGoal={overrides?.exerciseCaloriesGoal ?? 0}
    />,
  );
}

function countProgressTracks(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((count, child) => count + countProgressTracks(child), 0);
  if (value == null || typeof value !== 'object') return 0;
  const node = value as { props?: { onLayout?: unknown }; children?: unknown };
  return (node.props?.onLayout ? 1 : 0) + countProgressTracks(node.children);
}

describe('ExerciseProgressCard', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockFocused = true;
  });

  it.each([
    ['en', 'Exercise', 'Minutes', 'Calories', 'No exercise entries yet'],
    ['pl', 'Ćwiczenia', 'Minuty', 'Kalorie', 'Brak zapisanych ćwiczeń'],
  ] as const)('localizes title, labels, and empty state in %s', (locale, title, minutes, calories, empty) => {
    setTestLocale(locale);
    const view = renderCard();
    expect(view.getByText(title)).toBeTruthy();
    expect(view.queryByText(minutes)).toBeNull();
    expect(view.queryByText(calories)).toBeNull();
    expect(view.getByText(empty)).toBeTruthy();
    expect(view.UNSAFE_getAllByType(View).length).toBeGreaterThan(0);
  });

  it.each([
    ['en', '1 / 2 min', '3 / 4 Cal'],
    ['pl', '1 / 2 min', '3 / 4 Cal'],
  ] as const)('renders rounded values with goals in %s', (locale, minuteValue, calorieValue) => {
    setTestLocale(locale);
    const view = renderCard({ exerciseMinutes: 1.4, exerciseMinutesGoal: 2.4, exerciseCalories: 3.4, exerciseCaloriesGoal: 4.4 });
    expect(view.getByText(minuteValue)).toBeTruthy();
    expect(view.getByText(calorieValue)).toBeTruthy();
    expect(view.getByText(locale === 'en' ? 'Minutes' : 'Minuty')).toBeTruthy();
  });

  it('renders values without goals and locale-aware four-digit numbers', () => {
    setTestLocale('en');
    const view = renderCard({ exerciseMinutes: 1234.4, exerciseCalories: 5678.6 });
    const formattedMinutes = new Intl.NumberFormat('en-US').format(1234);
    const formattedCalories = new Intl.NumberFormat('en-US').format(5679);
    expect(view.getByText(`${formattedMinutes} min`)).toBeTruthy();
    expect(view.getByText(`${formattedCalories} Cal`)).toBeTruthy();
  });

  it.each([
    [{ exerciseMinutes: 0, exerciseCalories: 0 }, 0],
    [{ exerciseMinutes: 10, exerciseCalories: 0 }, 1],
    [{ exerciseMinutes: 0, exerciseCalories: 10 }, 1],
  ])('keeps progress-bar visibility based on current and goal values', (values, expectedTracks) => {
    const view = renderCard(values);
    expect(countProgressTracks(view.toJSON())).toBe(expectedTracks);
  });

  it('shows progress tracks for zero current values when goals exist and preserves overflow behavior', () => {
    const view = renderCard({ exerciseMinutesGoal: 30, exerciseCaloriesGoal: 500 });
    expect(countProgressTracks(view.toJSON())).toBe(0);

    const overflow = renderCard({ exerciseMinutes: 60, exerciseMinutesGoal: 30, exerciseCalories: 1000, exerciseCaloriesGoal: 500 });
    expect(overflow.getByText('60 / 30 min')).toBeTruthy();
    expect(overflow.getByText('1,000 / 500 Cal')).toBeTruthy();
  });

  it('renders safely while unfocused and after focus returns', () => {
    mockFocused = false;
    const view = renderCard({ exerciseMinutes: 15, exerciseMinutesGoal: 30 });
    expect(view.getByText('15 / 30 min')).toBeTruthy();
    mockFocused = true;
    expect(() => view.rerender(<ExerciseProgressCard exerciseMinutes={15} exerciseMinutesGoal={30} exerciseCalories={0} exerciseCaloriesGoal={0} />)).not.toThrow();
  });
});
