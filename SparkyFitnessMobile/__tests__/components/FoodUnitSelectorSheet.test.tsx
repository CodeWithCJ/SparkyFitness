import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import FoodUnitSelectorSheet from '../../src/components/FoodUnitSelectorSheet';

const mockIcon = jest.fn();
const mockPresent = jest.fn();
const mockDismiss = jest.fn();

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: {
    show: jest.fn(),
  },
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) => {
    if (!Array.isArray(keys)) {
      return 'token';
    }

    return keys.map((key) => {
      switch (key) {
        case '--color-surface':
          return 'surface';
        case '--color-raised':
          return 'raised';
        case '--color-border-subtle':
          return 'border';
        case '--color-text-muted':
          return 'muted';
        case '--color-accent-primary':
          return 'accent';
        case '--color-text-success':
          return 'success';
        default:
          return 'token';
      }
    });
  },
  useUniwind: () => ({ theme: 'dark' }),
}));

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      mockIcon(props);
      return <Text>{`icon-${props.name}`}</Text>;
    },
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockBottomSheetModal = React.forwardRef(({ children, onDismiss }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockPresent,
      dismiss: () => {
        mockDismiss();
        onDismiss?.();
      },
    }));
    return <View>{children}</View>;
  });
  MockBottomSheetModal.displayName = 'MockBottomSheetModal';

  return {
    __esModule: true,
    BottomSheetBackdrop: () => <View />,
    BottomSheetModal: MockBottomSheetModal,
    BottomSheetScrollView: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: any) => children,
}));

describe('FoodUnitSelectorSheet', () => {
  const variants = [
    {
      id: 'variant-g',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    },
  ];
  const mockToast = Toast as unknown as { show: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the new title and removes the old inline conversion UI', () => {
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="variant-g"
        onSelect={jest.fn()}
        renderTrigger={() => <></>}
      />,
    );

    expect(screen.getByText('Select Unit')).toBeTruthy();
    expect(screen.queryByText('Available Units')).toBeNull();
    expect(screen.queryByText('100 g (120 cal)')).toBeNull();
    expect(screen.queryByText('Custom')).toBeNull();
    expect(screen.queryByText('Custom unit...')).toBeNull();
    expect(screen.queryByText('Use Unit')).toBeNull();
  });

  it('highlights the selected grouped row and uses stronger green checkmarks for compatible units', () => {
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="variant-g"
        selectedSelection={{
          kind: 'existing',
          variant: variants[0] as any,
        }}
        onSelect={jest.fn()}
        renderTrigger={() => <></>}
      />,
    );

    const selectedRowStyle = screen.getByTestId('food-unit-option-g').props.style;
    expect(selectedRowStyle).toEqual(
      expect.objectContaining({
        backgroundColor: 'raised',
      }),
    );
    expect(selectedRowStyle.borderLeftWidth).toBeUndefined();

    const checkmarkCalls = mockIcon.mock.calls
      .map(([props]) => props)
      .filter((props) => props.name === 'checkmark');
    expect(checkmarkCalls.length).toBeGreaterThan(0);
    expect(checkmarkCalls.every((props) => props.color === '#22c55e')).toBe(true);
    expect(screen.queryByText('icon-chevron-forward')).toBeNull();
  });

  it('highlights the selected grouped unit row for a draft/manual selection', () => {
    const draftVariant = {
      id: '__food-form-draft-unit__',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    const screen = render(
      <FoodUnitSelectorSheet
        variants={[...(variants as any), draftVariant] as any}
        selectedVariantId="__food-form-draft-unit__"
        selectedSelection={{
          kind: 'draft',
          variant: draftVariant as any,
          requiresNutritionUpdate: true,
        }}
        onSelect={jest.fn()}
        renderTrigger={() => <></>}
      />,
    );

    const selectedRowStyle =
      screen.getByTestId('food-unit-option-cup').props.style;
    expect(selectedRowStyle).toEqual(
      expect.objectContaining({
        backgroundColor: 'raised',
      }),
    );
    expect(selectedRowStyle.borderLeftWidth).toBeUndefined();
  });

  it('keeps selected saved custom units visible in their own section', () => {
    const customVariant = {
      id: 'variant-fillet',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'fillet',
      calories: 180,
      protein: 28,
      carbs: 0,
      fat: 7,
    };

    const screen = render(
      <FoodUnitSelectorSheet
        variants={[variants[0], customVariant] as any}
        selectedVariantId="variant-fillet"
        selectedSelection={{
          kind: 'existing',
          variant: customVariant as any,
        }}
        onSelect={jest.fn()}
        renderTrigger={() => <></>}
      />,
    );

    expect(screen.getByText('Saved Custom Units')).toBeTruthy();

    const selectedRowStyle =
      screen.getByTestId('food-unit-custom-variant-variant-fillet').props.style;
    expect(selectedRowStyle).toEqual(
      expect.objectContaining({
        backgroundColor: 'raised',
      }),
    );
    expect(screen.queryByText('100 g (120 cal)')).toBeNull();
  });

  it('immediately selects compatible units', async () => {
    const onSelect = jest.fn();
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="variant-g"
        onSelect={onSelect}
        renderTrigger={() => <></>}
      />,
    );

    fireEvent.press(screen.getByText('kg'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        kind: 'draft',
        variant: expect.objectContaining({
          serving_size: 1,
          serving_unit: 'kg',
        }),
      });
    });
    expect(mockToast.show).not.toHaveBeenCalled();
  });

  it('shows a toast and returns a manual-update draft for incompatible units', async () => {
    const onSelect = jest.fn();
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="variant-g"
        onSelect={onSelect}
        renderTrigger={() => <></>}
      />,
    );

    fireEvent.press(screen.getByText('cup'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        kind: 'draft',
        variant: expect.objectContaining({
          serving_size: 1,
          serving_unit: 'cup',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        }),
        requiresNutritionUpdate: true,
      });
    });
    await waitFor(() => {
      expect(mockDismiss).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith({
        type: 'info',
        text1: 'Please update the nutrition values manually.',
      });
    });
  });

  it('shows an error toast when saving a compatible draft unit fails', async () => {
    const onSelect = jest.fn().mockRejectedValue(new Error('save failed'));
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="variant-g"
        onSelect={onSelect}
        renderTrigger={() => <></>}
      />,
    );

    fireEvent.press(screen.getByText('kg'));

    await waitFor(() => {
      expect(mockToast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Could not update that unit',
        text2: 'Please try again.',
      });
    });
  });
});
