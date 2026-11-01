import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import CalorieSettingsScreen from '../../src/screens/CalorieSettingsScreen';

const mockMutate = jest.fn();
let mockPreferences: Record<string, unknown> = {};
let mockBmr: number | undefined = 1750;

jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: () => ({
    summary:
      mockBmr === undefined ? undefined : { calorieBalance: { bmr: mockBmr } },
  }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
  useMutation: () => ({ mutate: mockMutate }),
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const ReactModule = require('react');
  const { Pressable: MockPressable, Text: MockText } = require('react-native');
  return {
    __esModule: true,
    default: ({
      options,
      onSelect,
    }: {
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
    }) =>
      ReactModule.createElement(
        ReactModule.Fragment,
        null,
        ...options.map((option: { label: string; value: string }) =>
          ReactModule.createElement(
            MockPressable,
            { key: option.value, onPress: () => onSelect(option.value) },
            ReactModule.createElement(MockText, null, option.label)
          )
        )
      ),
  };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/components/HealthSourceLabel', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#22c55e'],
}));

const navigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
const route = { params: {} } as never;

describe('CalorieSettingsScreen', () => {
  it.each([false, true])(
    'shows and updates the exercise macro preference from %s',
    (enabled) => {
      mockPreferences.adjust_macros_with_exercise = enabled;
      const screen = render(
        <CalorieSettingsScreen navigation={navigation} route={route} />
      );
      const toggle = screen.getByLabelText(
        'Adjust percentage macro goals with exercise calories'
      );
      expect(toggle.props.value).toBe(enabled);
      fireEvent(toggle, 'valueChange', !enabled);
      expect(mockMutate).toHaveBeenCalledWith({
        adjust_macros_with_exercise: !enabled,
      });
    }
  );

  beforeEach(async () => {
    await act(async () => {
      await initializeI18n('en');
      await i18n.changeLanguage('en');
    });
    jest.clearAllMocks();
    mockBmr = 1750;
    mockPreferences = {
      calorie_goal_adjustment_mode: 'adaptive',
      goal_mode: 'maintain',
      goal_mode_custom_percentage: 0,
      calorie_safety_floor_mode: 'standard',
      calorie_safety_floor_value: 1200,
    };
  });

  it('explains that Device Projection applies Goal Mode to the device TDEE', () => {
    mockPreferences.calorie_goal_adjustment_mode = 'tdee';
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(
      getByText(
        'Current-day device total calories (Health Connect, Garmin or Polar) are projected to midnight; completed days use the recorded total. Goal Mode is applied to that TDEE, with BMR + active calories as a fallback.'
      )
    ).toBeTruthy();
    expect(
      getByText('Device total calories (BMR + active calories fallback)')
    ).toBeTruthy();
    expect(getByText('Projected TDEE × Goal Mode − Eaten')).toBeTruthy();
  });

  it('offers and saves Goal Mode percentages on Android', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(getByText('Maintain (0%)')).toBeTruthy();
    expect(getByText('Body Recomposition (-10%)')).toBeTruthy();
    expect(getByText('Lean Bulk (+10%)')).toBeTruthy();

    fireEvent.press(getByText('Body Recomposition (-10%)'));
    expect(mockMutate).toHaveBeenCalledWith({ goal_mode: 'recomp' });
  });

  it('offers weekly weight changes without overwriting the saved percentage', () => {
    mockPreferences.goal_mode_custom_percentage = -15;
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Weekly weight change'));

    expect(mockMutate).toHaveBeenCalledWith({ goal_mode: 'weekly' });
  });

  it('converts grams to the signed weekly kilogram preference', () => {
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = -0.5;
    const { getByLabelText, getByText, getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(getByDisplayValue('0.5')).toBeTruthy();
    fireEvent.press(getByText('g'));
    expect(getByDisplayValue('500')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();

    const input = getByLabelText('Weekly weight change amount');
    fireEvent.changeText(input, '250');
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_weekly_change_kg: -0.25,
    });
  });

  it('accepts a decimal comma for a weekly weight gain', () => {
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = 0.5;
    const { getByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    const input = getByLabelText('Weekly weight change amount');

    fireEvent.changeText(input, '0,25');
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_weekly_change_kg: 0.25,
    });
  });

  it.each(['lbs', 'st_lbs'])(
    'uses the profile %s unit for weekly goal inputs and saves kilograms',
    (weightUnit) => {
      mockPreferences.goal_mode = 'weekly';
      mockPreferences.goal_mode_weekly_change_kg = -0.5;
      mockPreferences.default_weight_unit = weightUnit;
      const { getByLabelText } = render(
        <CalorieSettingsScreen navigation={navigation} route={route} />
      );
      const input = getByLabelText(
        weightUnit === 'st_lbs'
          ? 'Weekly weight change pounds'
          : 'Weekly weight change amount'
      );

      expect(input.props.value).toBe('1.102');
      fireEvent.changeText(input, '1');
      fireEvent(input, 'blur');

      expect(mockMutate).toHaveBeenCalledWith({
        goal_mode_weekly_change_kg: -0.454,
      });
    }
  );

  it('shows the weekly adjustment as calories added to a device projection', () => {
    mockPreferences.calorie_goal_adjustment_mode = 'tdee';
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = -0.5;
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(getByText('Estimated daily adjustment: −429 kcal')).toBeTruthy();
    expect(
      getByText('Projected TDEE + Weekly Goal Adjustment − Eaten')
    ).toBeTruthy();
  });

  it('includes the weekly offset when explaining an adaptive goal', () => {
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = 0.5;
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(
      getByText(/Goal = Adaptive TDEE \+ Weekly Goal Adjustment/)
    ).toBeTruthy();
  });

  it('keeps the amount when changing from weight loss to weight gain', () => {
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = -0.5;
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Gain weight'));

    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_weekly_change_kg: 0.5,
    });
  });

  it('saves zero and hides the rate input for weight maintenance', () => {
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = -0.5;
    const { getByText, queryByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Keep weight stable'));

    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_weekly_change_kg: 0,
    });
    expect(queryByLabelText('Weekly weight change amount')).toBeNull();
  });

  it('requires an explicit rate when switching from maintenance to loss', () => {
    mockPreferences.goal_mode = 'weekly';
    mockPreferences.goal_mode_weekly_change_kg = 0;
    const { getByLabelText, getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Lose weight'));
    expect(mockMutate).not.toHaveBeenCalled();
    const input = getByLabelText('Weekly weight change amount');
    fireEvent.changeText(input, '0.4');
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_weekly_change_kg: -0.4,
    });
  });

  it.each(['', '0', '-0.5', '2.001', 'Infinity', '1.2.3'])(
    'does not save an invalid weekly rate: %s',
    (value) => {
      mockPreferences.goal_mode = 'weekly';
      mockPreferences.goal_mode_weekly_change_kg = -0.5;
      const { getByLabelText, getByText } = render(
        <CalorieSettingsScreen navigation={navigation} route={route} />
      );
      const input = getByLabelText('Weekly weight change amount');

      fireEvent.changeText(input, value);
      fireEvent(input, 'blur');

      expect(mockMutate).not.toHaveBeenCalled();
      expect(
        getByText('Enter a rate above 0 and up to 2 kg per week.')
      ).toBeTruthy();
    }
  );

  it.each(['dynamic', 'percentage'])(
    'explains why %s does not earn activity back on an Adaptive target',
    (mode) => {
      mockPreferences.calorie_goal_adjustment_mode = mode;
      mockPreferences.goal_mode_calculation_method = 'adaptive';
      const { getByText, queryByLabelText } = render(
        <CalorieSettingsScreen navigation={navigation} route={route} />
      );

      expect(
        getByText(
          'Adaptive targets already include activity. Remaining calories are Target minus Eaten. Exercise earn-back applies only to Manual targets.'
        )
      ).toBeTruthy();
      expect(getByText('Goal − Eaten')).toBeTruthy();
      expect(queryByLabelText('Exercise Calories Applied')).toBeNull();
    }
  );

  it.each([0, undefined])(
    'keeps manual-fallback earn-back available when BMR is %s',
    (bmr) => {
      mockBmr = bmr;
      mockPreferences.calorie_goal_adjustment_mode = 'percentage';
      mockPreferences.goal_mode_calculation_method = 'adaptive';
      mockPreferences.exercise_calorie_percentage = 50;
      const { getByLabelText, getByText } = render(
        <CalorieSettingsScreen navigation={navigation} route={route} />
      );

      expect(getByLabelText('Exercise Calories Applied')).toBeTruthy();
      expect(getByText('Goal − Eaten + 50% of Exercise')).toBeTruthy();
    }
  );

  it('offers and saves Goal Mode calculation method on Android', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(getByText('Adaptive')).toBeTruthy();
    expect(getByText('Manual')).toBeTruthy();

    fireEvent.press(getByText('Adaptive'));
    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_calculation_method: 'adaptive',
    });
  });

  it.each([
    ['dynamic', 'adaptive', true],
    ['dynamic', 'manual', false],
    ['percentage', 'adaptive', false],
    ['adaptive', 'adaptive', false],
    ['fixed', 'adaptive', false],
    ['tdee', 'adaptive', false],
  ])('shows separate activity only for %s with %s', (mode, method, visible) => {
    mockPreferences.calorie_goal_adjustment_mode = mode;
    mockPreferences.goal_mode_calculation_method = method;
    const { queryByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(
      queryByLabelText('Count activity calories separately') !== null
    ).toBe(visible);
  });

  it('defaults separate activity off and saves the opt-in without changing the mode', () => {
    mockPreferences.calorie_goal_adjustment_mode = 'dynamic';
    mockPreferences.goal_mode_calculation_method = 'adaptive';
    const { getByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    const toggle = getByLabelText('Count activity calories separately');

    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, 'valueChange', true);
    expect(mockMutate).toHaveBeenCalledWith({
      adaptive_activity_separate: true,
    });
  });

  it('credits steps and workouts without BMR when separate activity is active', () => {
    mockPreferences.calorie_goal_adjustment_mode = 'dynamic';
    mockPreferences.goal_mode_calculation_method = 'adaptive';
    mockPreferences.adaptive_activity_separate = true;
    mockPreferences.include_bmr_in_net_calories = true;
    const { getByText, getByLabelText, queryByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(
      getByLabelText('Count activity calories separately').props.value
    ).toBe(true);
    expect(getByText('Goal − Eaten + Activity')).toBeTruthy();
    expect(getByText('Activity + BMR')).toBeTruthy();
    expect(getByText(/BMR stays in Burned and Net Energy/)).toBeTruthy();
    expect(
      queryByText(
        'Adaptive targets already include activity. Remaining calories are Target minus Eaten. Exercise earn-back applies only to Manual targets.'
      )
    ).toBeNull();
    expect(
      getByText(/consistent food, weight, step and workout history/)
    ).toBeTruthy();
  });

  it('keeps a stored opt-in dormant in Percentage Earn-Back', () => {
    mockPreferences.calorie_goal_adjustment_mode = 'percentage';
    mockPreferences.goal_mode_calculation_method = 'adaptive';
    mockPreferences.adaptive_activity_separate = true;
    const { getByText, queryByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(getByText('Goal − Eaten')).toBeTruthy();
    expect(queryByLabelText('Count activity calories separately')).toBeNull();
    fireEvent.press(getByText('Manual'));
    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_calculation_method: 'manual',
    });
  });

  it('saves the measured-BMR opt-in against the shared preference', () => {
    // Same `use_external_bmr` column the web Calculation Settings writes, so the
    // two clients stay in step without any sync of their own.
    const { getByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    const toggle = getByLabelText(
      'Use measured BMR from check-ins and synced devices'
    );
    fireEvent(toggle, 'valueChange', true);

    expect(mockMutate).toHaveBeenCalledWith({ use_external_bmr: true });
  });

  it('saves the Move ring opt-in as an account setting on iPhone', () => {
    const { getByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    fireEvent(
      getByLabelText('Use Move ring for active calories'),
      'valueChange',
      true
    );

    expect(mockMutate).toHaveBeenCalledWith({
      use_move_ring_active_calories: true,
    });
  });

  it('hides the Move ring opt-in on Android', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    const { queryByLabelText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(queryByLabelText('Use Move ring for active calories')).toBeNull();
    osSpy.restore();
  });

  it('saves a bounded custom Goal Mode percentage', () => {
    mockPreferences.goal_mode = 'manual';
    mockPreferences.goal_mode_custom_percentage = -10;
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    const input = getByDisplayValue('-10');

    fireEvent.changeText(input, '45');
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      goal_mode_custom_percentage: 40,
    });
  });

  it('offers standard, custom, and disabled safety floor modes', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    expect(getByText('Safety Floor')).toBeTruthy();
    expect(getByText('Standard')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
    expect(getByText('Disabled')).toBeTruthy();
  });

  it('saves a selected safety floor mode', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getByText('Disabled'));
    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_mode: 'disabled',
    });
  });

  it('saves a custom safety floor value', () => {
    mockPreferences.calorie_safety_floor_mode = 'custom';
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    const input = getByDisplayValue('1200');

    fireEvent.changeText(input, '1150');
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_value: 1150,
    });
  });

  it('restores the saved value without persisting when the custom input is blank', () => {
    mockPreferences.calorie_safety_floor_mode = 'custom';
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    const input = getByDisplayValue('1200');

    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');

    expect(getByDisplayValue('1200')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['799', 800],
    ['5001', 5000],
  ])('clamps custom floor %s to %s kcal', (inputValue, expectedValue) => {
    mockPreferences.calorie_safety_floor_mode = 'custom';
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    const input = getByDisplayValue('1200');

    fireEvent.changeText(input, inputValue);
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_value: expectedValue,
    });
  });
  it('renders the shipped Polish safety floor labels, descriptions, custom minimum, and keeps raw values', async () => {
    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    const cases = [
      [
        'standard',
        'Używa wyższej z wartości: szacowany BMR lub minimum kliniczne.',
      ],
      [
        'custom',
        'Zastępuje standardowe minimum wybraną przez Ciebie wartością. Zalecenia zdrowotne pozostają widoczne.',
      ],
      [
        'disabled',
        'Wyłącza automatyczne ograniczanie celu. Ostrzeżenia zdrowotne pozostają widoczne.',
      ],
    ] as const;
    const screen = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText('Bezpieczne minimum')).toBeTruthy();
    expect(screen.getByText('Standardowe')).toBeTruthy();
    expect(screen.getByText('Własne')).toBeTruthy();
    expect(screen.getByText('Wyłączone')).toBeTruthy();
    for (const [mode, description] of cases) {
      mockPreferences.calorie_safety_floor_mode = mode;
      screen.rerender(
        <CalorieSettingsScreen navigation={navigation} route={route} />
      );
      expect(screen.getByText(description)).toBeTruthy();
      if (mode === 'custom') {
        expect(screen.getByText('Własne minimum (kcal)')).toBeTruthy();
      }
    }
    fireEvent.press(screen.getByText('Standardowe'));
    fireEvent.press(screen.getByText('Własne'));
    fireEvent.press(screen.getByText('Wyłączone'));
    expect(mockMutate).toHaveBeenNthCalledWith(1, {
      calorie_safety_floor_mode: 'standard',
    });
    expect(mockMutate).toHaveBeenNthCalledWith(2, {
      calorie_safety_floor_mode: 'custom',
    });
    expect(mockMutate).toHaveBeenNthCalledWith(3, {
      calorie_safety_floor_mode: 'disabled',
    });
  });

  it('updates labels on the same mounted instance when language changes', async () => {
    const screen = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText('Safety Floor')).toBeTruthy();
    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    expect(screen.getByText('Bezpieczne minimum')).toBeTruthy();
    await act(async () => {
      await initializeI18n('en');
      await i18n.changeLanguage('en');
    });
    expect(screen.getByText('Safety Floor')).toBeTruthy();
  });
});
