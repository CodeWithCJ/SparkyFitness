import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import WeeklyWeightGoalFields from '../../src/components/WeeklyWeightGoalFields';

jest.mock('../../src/components/BottomSheetPicker', () => {
  const ReactModule = require('react');
  const { Pressable: MockPressable, Text: MockText } = require('react-native');
  return {
    __esModule: true,
    default: ({
      value,
      options,
      onSelect,
      title,
    }: {
      value: string;
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
      title: string;
    }) =>
      ReactModule.createElement(
        ReactModule.Fragment,
        null,
        ReactModule.createElement(MockText, { testID: title }, value),
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

jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#22c55e'],
}));

describe('WeeklyWeightGoalFields', () => {
  beforeEach(async () => {
    await act(async () => {
      await initializeI18n('en');
      await i18n.changeLanguage('en');
    });
  });

  it.each([
    ['kg', 'kg', '0.5'],
    ['g', 'kg', '0.5'],
    ['lbs', 'lbs', '1.102'],
    ['st_lbs', 'st_lbs', '0'],
  ])('uses the profile weight unit %s', (weightUnit, selectedUnit, amount) => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.5}
        weightUnit={weightUnit}
        energyUnit="kcal"
        onChange={onChange}
      />
    );

    expect(getByTestId('Weekly rate unit').props.children).toBe(selectedUnit);
    expect(getByLabelText('Weekly weight change amount').props.value).toBe(
      amount
    );
    if (weightUnit === 'st_lbs') {
      expect(getByLabelText('Weekly weight change pounds').props.value).toBe(
        '1.102'
      );
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['lbs', 'st_lbs'])(
    'saves a %s rate in signed kilograms',
    (weightUnit) => {
      const onChange = jest.fn();
      const { getByLabelText } = render(
        <WeeklyWeightGoalFields
          weeklyChangeKg={-0.5}
          weightUnit={weightUnit}
          energyUnit="kcal"
          onChange={onChange}
        />
      );
      const input = getByLabelText(
        weightUnit === 'st_lbs'
          ? 'Weekly weight change pounds'
          : 'Weekly weight change amount'
      );

      fireEvent.changeText(input, '1');
      fireEvent(input, 'blur');

      expect(onChange).toHaveBeenCalledWith(-0.454);
    }
  );

  it.each([
    ['lbs', '4.41', undefined],
    ['lbs', '0', undefined],
    ['st_lbs', '1', '0'],
    ['st_lbs', '0', '14'],
    ['st_lbs', '0.1', '1'],
    ['st_lbs', '0', '-1'],
  ])(
    'rejects an invalid %s rate %s + %s pounds',
    (weightUnit, amount, pounds) => {
      const onChange = jest.fn();
      const { getByLabelText, getByRole } = render(
        <WeeklyWeightGoalFields
          weeklyChangeKg={-0.5}
          weightUnit={weightUnit}
          energyUnit="kcal"
          onChange={onChange}
        />
      );
      const input = getByLabelText('Weekly weight change amount');
      fireEvent.changeText(input, amount);
      if (pounds !== undefined) {
        fireEvent.changeText(
          getByLabelText('Weekly weight change pounds'),
          pounds
        );
      }
      fireEvent(input, 'blur');

      expect(onChange).not.toHaveBeenCalled();
      expect(getByRole('alert')).toBeTruthy();
    }
  );

  it('keeps the exact saved rate through unit switches and blur', () => {
    const onChange = jest.fn();
    const { getByText, getByLabelText } = render(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.1234}
        energyUnit="kcal"
        onChange={onChange}
      />
    );

    for (const label of ['lb', 'st / lb', 'g', 'kg']) {
      fireEvent.press(getByText(label));
      fireEvent(getByLabelText('Weekly weight change amount'), 'blur');
    }

    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(getByText('Gain weight'));
    expect(onChange).toHaveBeenCalledWith(0.1234);
  });

  it('follows a changed profile unit without saving or losing an edited rate', () => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId, rerender } = render(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.5}
        weightUnit="kg"
        energyUnit="kcal"
        onChange={onChange}
      />
    );
    fireEvent.changeText(getByLabelText('Weekly weight change amount'), '0.25');

    rerender(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.5}
        weightUnit="lbs"
        energyUnit="kcal"
        onChange={onChange}
      />
    );

    expect(getByTestId('Weekly rate unit').props.children).toBe('lbs');
    expect(getByLabelText('Weekly weight change amount').props.value).toBe(
      '0.551'
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(getByLabelText('Weekly weight change amount'), 'blur');
    expect(onChange).toHaveBeenCalledWith(-0.25);
  });

  it('retains an explicitly chosen rate unit when the profile changes', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId, getByLabelText, rerender } = render(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.5}
        weightUnit="kg"
        energyUnit="kcal"
        onChange={onChange}
      />
    );
    fireEvent.press(getByText('g'));
    rerender(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.5}
        weightUnit="st_lbs"
        energyUnit="kcal"
        onChange={onChange}
      />
    );

    expect(getByTestId('Weekly rate unit').props.children).toBe('g');
    expect(getByLabelText('Weekly weight change amount').props.value).toBe(
      '500'
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows choosing stone and pounds after clearing a previous rate', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId, getByLabelText } = render(
      <WeeklyWeightGoalFields
        weeklyChangeKg={-0.5}
        energyUnit="kcal"
        onChange={onChange}
      />
    );
    fireEvent.changeText(getByLabelText('Weekly weight change amount'), '');

    fireEvent.press(getByText('st / lb'));

    expect(getByTestId('Weekly rate unit').props.children).toBe('st_lbs');
    expect(getByLabelText('Weekly weight change amount').props.value).toBe('0');
    const poundsInput = getByLabelText('Weekly weight change pounds');
    expect(poundsInput.props.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.changeText(poundsInput, '1');
    fireEvent(poundsInput, 'blur');
    expect(onChange).toHaveBeenCalledWith(-0.454);
  });
});
