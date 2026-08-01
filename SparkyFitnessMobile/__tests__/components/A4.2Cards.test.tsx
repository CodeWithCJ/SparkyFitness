import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';
import FoodSummary from '../../src/components/FoodSummary';
import ExerciseSummary from '../../src/components/ExerciseSummary';
import CalorieRingCard from '../../src/components/CalorieRingCard';
import MacroCard from '../../src/components/MacroCard';
import HydrationGauge from '../../src/components/HydrationGauge';
import FoodLibraryRow from '../../src/components/FoodLibraryRow';
import MealLibraryRow from '../../src/components/MealLibraryRow';
import EmptyDayIllustration from '../../src/components/EmptyDayIllustration';
import MeasurementsSummary from '../../src/components/MeasurementsSummary';
import DiaryCalorieMacroSummary from '../../src/components/DiaryCalorieMacroSummary';
import { useAppPreferencesStore, __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';

const enResource = require('../../src/localization/locales/en/translation.json');
const plResource = require('../../src/localization/locales/pl/translation.json');
(globalThis as any).__I18N_EN = enResource;
(globalThis as any).__I18N_PL = plResource;
(globalThis as any).__I18N_LANG = 'en';

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const resources = (globalThis.__I18N_LANG === 'pl' ? globalThis.__I18N_PL : globalThis.__I18N_EN) ?? {};
        let value = key.split('.').reduce((result: unknown, part: string) => {
          if (result && typeof result === 'object' && part in result) return (result as Record<string, unknown>)[part];
          return undefined;
        }, resources);
        if (typeof value !== 'string' && typeof options?.count === 'number') {
          const count = options.count;
          const suffix = globalThis.__I18N_LANG === 'pl'
            ? (count === 1 ? '_one' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? '_few' : '_many')
            : (count === 1 ? '_one' : '_other');
          const pluralKey = `${key}${suffix}`;
          value = pluralKey.split('.').reduce((result: unknown, part: string) => {
            if (result && typeof result === 'object' && part in result) return (result as Record<string, unknown>)[part];
            return undefined;
          }, resources);
        }
        if (typeof value !== 'string') return key;
        return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? `{{${name}}}`));
      },
      i18n: null,
      ready: true,
    }),
  };
});

jest.mock('../../src/localization', () => ({
  formatLocalizedNumber: (value: number, options?: Intl.NumberFormatOptions) =>
    value.toLocaleString(globalThis.__I18N_LANG === 'pl' ? 'pl-PL' : 'en-US', options),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (names: string | string[]) => Array.isArray(names) ? names.map(() => '#999999') : '#999999',
}));

jest.mock('../../src/components/Icon', () => {
  const ReactModule = require('react');
  const ReactNative = require('react-native');
  return {
    __esModule: true,
    default: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
      accessibilityLabel ? ReactModule.createElement(ReactNative.View, { accessibilityLabel }) : null,
  };
});
jest.mock('../../src/components/ProgressRing', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/SwipeableFoodRow', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../src/components/SwipeableExerciseRow', () => ({
  __esModule: true,
  default: ({ session }: { session: { name?: string } }) => {
    const ReactNative = require('react-native');
    const ReactModule = require('react');
    return ReactModule.createElement(ReactNative.Text, null, session.name ?? 'Exercise session');
  },
}));
jest.mock('../../src/components/ShareStatusBadge', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/VerifiedBadge', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/icons/measurements', () => ({
  MeasurementIcons: {
    weight: () => null,
    body_fat_percentage: () => null,
    height: () => null,
    neck: () => null,
    waist: () => null,
    hips: () => null,
    steps: () => null,
  },
}));
jest.mock('../../src/hooks', () => ({
  useProfile: jest.fn(() => ({ profile: undefined })),
}));
jest.mock('../../src/utils/shareStatus', () => ({ deriveShareStatus: jest.fn(() => 'private') }));
jest.mock('../../src/utils/foodDetails', () => ({ formatServingUnit: (unit: string) => unit }));
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));
jest.mock('@shopify/react-native-skia', () => {
  const ReactModule = require('react');
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    Group: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    Path: () => null,
    Rect: () => null,
    Skia: { PathBuilder: { Make: () => ({ moveTo: () => undefined, lineTo: () => undefined, cubicTo: () => undefined, close: () => undefined, build: () => ({}) }) }, Path: { Rect: () => ({}) }, XYWHRect: () => ({}) },
  };
});

function setLanguage(language: 'en' | 'pl') {
  (globalThis as any).__I18N_LANG = language;
}

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

const mealTypes = [
  { id: 'breakfast', name: 'Breakfast', user_id: null, sort_order: 1 },
  { id: 'custom', name: 'Drugie śniadanie', user_id: 'user-1', sort_order: 2 },
] as never;

const foodEntry = {
  id: 'entry-1',
  meal_type_id: 'breakfast',
  quantity: 1,
  serving_size: 1,
  calories: 1234,
  protein: 10,
  carbs: 20,
  fat: 5,
} as never;

describe('FoodSummary A4.2 localization', () => {
  beforeEach(() => setLanguage('en'));

  it('localizes empty state and add callback in EN and PL', () => {
    const onAddFood = jest.fn();
    const screen = render(<FoodSummary foodEntries={[]} mealTypes={[]} onAddFood={onAddFood} />);
    expect(screen.getByText('Tap to add food')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tap to add food' })).toBeTruthy();
    fireEvent.press(screen.getByText('Tap to add food'));
    expect(onAddFood).toHaveBeenCalledTimes(1);
    screen.rerender(<FoodSummary foodEntries={[]} mealTypes={[]} onAddFood={onAddFood} />);
    setLanguage('pl');
    screen.rerender(<FoodSummary foodEntries={[]} mealTypes={[]} onAddFood={onAddFood} />);
    expect(screen.getByText('Dotknij, aby dodać jedzenie')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dotknij, aby dodać jedzenie' })).toBeTruthy();
  });

  it('keeps custom labels and text/boolean values literal in both locales', () => {
    const customMeasurements = [
      { id: 'text-en', category_id: 'text', value: 'Morning note', entry_date: '2026-01-01', custom_categories: { name: 'Mood', display_name: 'Mood', measurement_type: 'note', data_type: 'text' } },
      { id: 'bool-en', category_id: 'bool', value: 'true', entry_date: '2026-01-01', custom_categories: { name: 'Fasted', display_name: 'Fasted', measurement_type: '', data_type: 'boolean' } },
    ] as never;
    const screen = render(<MeasurementsSummary measurements={{}} customMeasurements={customMeasurements} />);
    expect(screen.getByText('Mood')).toBeTruthy();
    expect(screen.getByText('Morning note note')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();

    setLanguage('pl');
    screen.rerender(<MeasurementsSummary measurements={{}} customMeasurements={customMeasurements} />);
    expect(screen.getByText('Mood')).toBeTruthy();
    expect(screen.getByText('Morning note note')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
  });

  it('translates system meal types and keeps a custom meal type literal', () => {
    const screen = render(<FoodSummary foodEntries={[foodEntry]} mealTypes={mealTypes} onPressMealType={jest.fn()} />);
    expect(screen.getByText('Breakfast')).toBeTruthy();
    setLanguage('pl');
    screen.rerender(<FoodSummary foodEntries={[foodEntry]} mealTypes={mealTypes} onPressMealType={jest.fn()} />);
    expect(screen.getByText('Śniadanie')).toBeTruthy();

    const customEntry = { ...foodEntry, id: 'entry-2', meal_type_id: 'custom' } as never;
    screen.rerender(<FoodSummary foodEntries={[customEntry]} mealTypes={mealTypes} onPressMealType={jest.fn()} />);
    expect(screen.getByText('Drugie śniadanie')).toBeTruthy();
  });
});

describe('ExerciseSummary A4.2 localization', () => {
  it('localizes empty accessibility label and preserves exercise names', () => {
    setLanguage('pl');
    const onAddExercise = jest.fn();
    const screen = render(<ExerciseSummary exerciseEntries={[]} entryDate="2026-01-01" onAddExercise={onAddExercise} />);
    expect(screen.getByText('Dotknij, aby dodać ćwiczenie')).toBeTruthy();
    expect(screen.getByLabelText('Dodaj ćwiczenie')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Dodaj ćwiczenie'));
    expect(onAddExercise).toHaveBeenCalledTimes(1);

    screen.rerender(<ExerciseSummary exerciseEntries={[{ id: 'ex-1', name: 'Bench Press' } as never]} entryDate="2026-01-01" />);
    expect(screen.getByText('Ćwiczenie')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });
});

describe('Calorie and macro cards A4.2 localization', () => {
  it('localizes calorie labels and formats large numbers', () => {
    setLanguage('en');
    const screen = render(<CalorieRingCard caloriesConsumed={12345} caloriesBurned={6789} calorieGoal={20000} remainingCalories={7655} progressPercent={0.6} />);
    expect(screen.getByText('Consumed')).toBeTruthy();
    expect(screen.getByText('Burned')).toBeTruthy();
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('of 20,000 kcal')).toBeTruthy();
    setLanguage('pl');
    screen.rerender(<CalorieRingCard caloriesConsumed={12345} caloriesBurned={6789} calorieGoal={20000} remainingCalories={7655} progressPercent={0.6} />);
    expect(screen.getByText('Spożyte')).toBeTruthy();
    expect(screen.getByText('z 20 000 kcal')).toBeTruthy();
  });

  it('localizes macro left, over, and met states', () => {
    setLanguage('pl');
    const screen = render(<MacroCard label="Białko" consumed={50} goal={100} color="#0f0" overfillColor="#f00" />);
    const layoutView = screen.UNSAFE_getAllByType(View).find((node) => typeof node.props.onLayout === 'function');
    fireEvent(layoutView!, 'layout', { nativeEvent: { layout: { width: 100 } } });
    expect(screen.getByText(/pozostało 50g/)).toBeTruthy();
    screen.rerender(<MacroCard label="Białko" consumed={120} goal={100} color="#0f0" overfillColor="#f00" />);
    expect(screen.getByText(/przekroczono o 20g/)).toBeTruthy();
    screen.rerender(<MacroCard label="Białko" consumed={100} goal={100} color="#0f0" overfillColor="#f00" />);
    expect(screen.getByText(/cel osiągnięty/)).toBeTruthy();
  });
});

describe('HydrationGauge and library rows A4.2 localization', () => {
  it('localizes hydration labels, accessibility, and keeps container names literal', () => {
    setLanguage('pl');
    const onIncrement = jest.fn();
    const onDecrement = jest.fn();
    const screen = render(<HydrationGauge consumed={1234} goal={2500} unit="ml" containerVolume={500} onIncrement={onIncrement} onDecrement={onDecrement} containers={[{ id: 1, name: 'My Bottle' }, { id: 2, name: 'Other Bottle' }]} />);
    expect(screen.getByText('Nawodnienie')).toBeTruthy();
    expect(screen.getByText('z 2500 ml')).toBeTruthy();
    expect(screen.getByLabelText('Dodaj porcję wody')).toBeTruthy();
    expect(screen.getByLabelText('Odejmij porcję wody')).toBeTruthy();
    expect(screen.getByText('My Bottle')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Dodaj porcję wody'));
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('localizes the missing-container message and per-bottle text', () => {
    setLanguage('en');
    const screen = render(<HydrationGauge consumed={0} goal={2000} containerVolume={500} onIncrement={jest.fn()} />);
    expect(screen.getByText('500 ml per bottle')).toBeTruthy();
    screen.rerender(<HydrationGauge consumed={0} goal={2000} containerVolume={undefined} onIncrement={jest.fn()} />);
    expect(screen.getByText('Configure water container on server to enable quick add/remove buttons')).toBeTruthy();
    setLanguage('pl');
    screen.rerender(<HydrationGauge consumed={0} goal={2000} containerVolume={500} onIncrement={jest.fn()} />);
    expect(screen.getByText('500 ml na butelkę')).toBeTruthy();
    screen.rerender(<HydrationGauge consumed={0} goal={2000} containerVolume={undefined} onIncrement={jest.fn()} />);
    expect(screen.getByText('Skonfiguruj pojemnik na wodę na serwerze, aby włączyć szybkie dodawanie i odejmowanie')).toBeTruthy();
  });

  it('localizes FoodLibraryRow and MealLibraryRow while preserving API data', () => {
    setLanguage('pl');
    const food = { name: 'Apple', brand: 'Acme', user_id: 'u', shared_with_public: false, default_variant: { calories: 1234, serving_size: 1, serving_unit: 'serving' } } as never;
    const meal = { id: 'm1', name: 'Breakfast Bowl', description: 'My description', user_id: 'u', is_public: false, foods: [{ id: 'f1' }], serving_size: 1, serving_unit: 'serving' } as never;
    const screen = render(<View><FoodLibraryRow food={food} isFavorite /><MealLibraryRow meal={meal} showBadge isFavorite /></View>);
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Posiłek')).toBeTruthy();
    expect(screen.getByText('Breakfast Bowl')).toBeTruthy();
    expect(screen.getByText('My description')).toBeTruthy();
    expect(screen.getAllByLabelText('W ulubionych')).toHaveLength(2);
    expect(screen.getByText('1 składnik')).toBeTruthy();
    expect(screen.getByText('1 serving')).toBeTruthy();
  });

  it('uses English and Polish meal plural forms for 1, 2, and 5 items', () => {
    const createMeal = (count: number) => ({
      id: `m-${count}`,
      name: `Meal ${count}`,
      description: null,
      user_id: 'u',
      is_public: false,
      foods: Array.from({ length: count }, (_, index) => ({ id: `f-${count}-${index}` })),
      serving_size: 1,
      serving_unit: 'serving',
    }) as never;
    setLanguage('en');
    const screen = render(
      <View>
        <MealLibraryRow meal={createMeal(1)} />
        <MealLibraryRow meal={createMeal(2)} />
        <MealLibraryRow meal={createMeal(5)} />
      </View>,
    );
    expect(screen.getByText('1 item')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('5 items')).toBeTruthy();
    setLanguage('pl');
    screen.rerender(
      <View>
        <MealLibraryRow meal={createMeal(1)} />
        <MealLibraryRow meal={createMeal(2)} />
        <MealLibraryRow meal={createMeal(5)} />
      </View>,
    );
    expect(screen.getByText('1 składnik')).toBeTruthy();
    expect(screen.getByText('2 składniki')).toBeTruthy();
    expect(screen.getByText('5 składników')).toBeTruthy();
  });
});

describe('EmptyDayIllustration A4.2 localization', () => {
  it('localizes the empty day text', () => {
    setLanguage('en');
    const screen = render(<EmptyDayIllustration />);
    expect(screen.getByText('No entries recorded for this day')).toBeTruthy();
    setLanguage('pl');
    screen.rerender(<EmptyDayIllustration />);
    expect(screen.getByText('Brak wpisów w tym dniu')).toBeTruthy();
  });
});

describe('MeasurementsSummary A4.2 localization', () => {
  it('localizes all built-in labels, fallback, and accessibility while preserving custom data', () => {
    const measurements = {
      weight: 75,
      body_fat_percentage: 20,
      height: 180,
      neck: 40,
      waist: 80,
      hips: 95,
      steps: 1234,
    } as never;
    const customMeasurements = [{ id: 'c1', category_id: 'cat', value: '120', entry_date: '2026-01-01', custom_categories: { id: 'cat', measurement_type: 'mmHg' } }] as never;

    setLanguage('en');
    const screen = render(<MeasurementsSummary measurements={measurements} customMeasurements={customMeasurements} onPress={jest.fn()} />);
    for (const label of ['Weight', 'Body fat', 'Height', 'Neck', 'Waist', 'Hips', 'Steps', 'Measurements', 'Measurement']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('120 mmHg')).toBeTruthy();
    expect(screen.getByLabelText('Edit measurements')).toBeTruthy();

    setLanguage('pl');
    screen.rerender(<MeasurementsSummary measurements={measurements} customMeasurements={customMeasurements} onPress={jest.fn()} />);
    for (const label of ['Waga', 'Tkanka tłuszczowa', 'Wzrost', 'Szyja', 'Talia', 'Biodra', 'Kroki', 'Pomiary', 'Pomiar']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText('Edytuj pomiary')).toBeTruthy();
    expect(screen.getByText('120 mmHg')).toBeTruthy();
  });

  it('formats custom numeric values in EN and PL, including five digits', () => {
    const customMeasurements = [{
      id: 'numeric',
      category_id: 'cat',
      value: '12345.6',
      entry_date: '2026-01-01',
      custom_categories: { name: 'Distance', display_name: null, measurement_type: 'm', data_type: 'numeric' },
    }] as never;
    setLanguage('en');
    const screen = render(<MeasurementsSummary measurements={{}} customMeasurements={customMeasurements} />);
    expect(screen.getByText('12,345.6 m')).toBeTruthy();
    setLanguage('pl');
    screen.rerender(<MeasurementsSummary measurements={{}} customMeasurements={customMeasurements} />);
    expect(screen.getByText('12 345,6 m')).toBeTruthy();
  });
});

describe('DiaryCalorieMacroSummary A4.2 localization', () => {
  const summary = {
    calorieBalance: { eaten: 500, goal: 2000, remaining: 1500, progress: 25 },
    protein: { consumed: 50, goal: 100 },
    carbs: { consumed: 80, goal: 200 },
    fiber: { consumed: 10, goal: 30 },
    fat: { consumed: 20, goal: 60 },
    customNutrientTotals: { 'Omega-3': 12 },
    customNutrientGoals: { 'Omega-3': 20 },
  } as never;

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: false });
    setLanguage('en');
  });

  it('localizes expand/collapse hints and preserves custom nutrient names', () => {
    const screen = render(
      <DiaryCalorieMacroSummary
        summary={summary}
        showNetCarbs={false}
        customNutrientKeys={['Omega-3']}
        customNutrients={[{ id: 'n1', name: 'Omega-3', unit: 'mg' }]}
      />,
    );
    const toggle = screen.getByRole('button');
    expect(toggle.props.accessibilityHint).toBe('Expand this section');
    fireEvent.press(toggle);
    expect(screen.getByText('Omega-3')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Collapse this section');

    setLanguage('pl');
    screen.rerender(
      <DiaryCalorieMacroSummary
        summary={summary}
        showNetCarbs={false}
        customNutrientKeys={['Omega-3']}
        customNutrients={[{ id: 'n1', name: 'Omega-3', unit: 'mg' }]}
      />,
    );
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Zwiń tę sekcję');
    expect(screen.getByText('Omega-3')).toBeTruthy();
  });
});
