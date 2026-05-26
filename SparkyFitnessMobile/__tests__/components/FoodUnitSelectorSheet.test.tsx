import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
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
        case '--color-border-strong':
          return 'borderStrong';
        case '--color-text-muted':
          return 'muted';
        case '--color-icon-success':
          return 'successIcon';
        case '--color-accent-primary':
          return 'accent';
        case '--color-bg-info':
          return 'infoBg';
        case '--color-text-info':
          return 'infoText';
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
    BottomSheetScrollView: ({ children }: any) => (
      <View testID="bottom-sheet-scroll">{children}</View>
    ),
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

    const checkmarkCalls = mockIcon.mock.calls
      .map(([props]) => props)
      .filter((props) => props.name === 'checkmark');
    expect(checkmarkCalls.length).toBeGreaterThan(0);
    expect(checkmarkCalls.every((props) => props.color === 'successIcon')).toBe(true);
    expect(screen.queryByText('icon-chevron-forward')).toBeNull();
  });

  it('shows sparkles instead of green checks for saved AI standard-unit variants', () => {
    const aiCupVariant = {
      id: 'variant-cup-ai',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      source: 'ai_estimate',
      ai_confidence: 'medium',
    };

    const screen = render(
      <FoodUnitSelectorSheet
        variants={[variants[0], aiCupVariant] as any}
        selectedVariantId="variant-g"
        selectedSelection={{
          kind: 'existing',
          variant: variants[0] as any,
        }}
        onSelect={jest.fn()}
        renderTrigger={() => <></>}
      />,
    );

    const aiRow = screen.getByTestId('food-unit-option-cup');
    expect(within(aiRow).queryByText('icon-sparkle')).toBeTruthy();
    expect(within(aiRow).queryByText('icon-checkmark')).toBeNull();
  });

  it('highlights the selected grouped unit row for a draft/manual selection', () => {
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="__food-form-draft-unit__"
        selectedSelection={{
          kind: 'draft',
          variant: {
            serving_size: 1,
            serving_unit: 'cup',
            calories: 120,
            protein: 10,
            carbs: 8,
            fat: 4,
          } as any,
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
    expect(screen.getByTestId('food-unit-option-g')).toBeTruthy();
    expect(within(screen.getByTestId('food-unit-option-cup')).queryByText('icon-checkmark')).toBeNull();
    expect(within(screen.getByTestId('food-unit-option-g')).queryByText('icon-checkmark')).toBeTruthy();
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
          calories: 1200,
        }),
      });
    });
    expect(mockToast.show).not.toHaveBeenCalled();
  });

  it('returns the saved variant when re-picking its unit', async () => {
    const onSelect = jest.fn();
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="__food-form-draft-unit__"
        selectedSelection={{
          kind: 'draft',
          variant: {
            serving_size: 100,
            serving_unit: 'kg',
            calories: 120000,
          } as any,
        }}
        onSelect={onSelect}
        renderTrigger={() => <></>}
      />,
    );

    fireEvent.press(screen.getByText('g'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        kind: 'existing',
        variant: variants[0],
      });
    });
  });

  it('dismisses the sheet for incompatible units without rendering a selector banner', async () => {
    const onSelect = jest.fn();
    const screen = render(
      <FoodUnitSelectorSheet
        variants={variants as any}
        selectedVariantId="variant-g"
        selectedSelection={{
          kind: 'existing',
          variant: variants[0] as any,
        }}
        onSelect={onSelect}
        renderTrigger={() => <></>}
      />,
    );

    fireEvent.press(screen.getByText('cup'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalled();
    });
    expect(mockDismiss).toHaveBeenCalled();
    expect(mockToast.show).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Please update the nutrition values manually.'),
    ).toBeNull();
    expect(within(screen.getByTestId('food-unit-option-cup')).queryByText('icon-checkmark')).toBeNull();
  });

  it('shows compatible checkmarks via a non-AI sibling donor when the selected variant is AI-estimated', () => {
    // Even when the current selection is an AI variant (cup AI), a sibling
    // manual variant (tbsp) acts as a math donor — so tsp and ml still get
    // green checkmarks because tbsp can math-convert to them. Matches web's
    // cross-row donor behavior.
    const aiCupVariant = {
      id: 'variant-cup-ai',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      source: 'ai_estimate',
      ai_confidence: 'high',
    };
    const tbspVariant = {
      id: 'variant-tbsp',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'tbsp',
      calories: 24,
      protein: 2,
      carbs: 1,
      fat: 1,
    };

    const screen = render(
      <FoodUnitSelectorSheet
        variants={[aiCupVariant, tbspVariant] as any}
        selectedVariantId="variant-cup-ai"
        selectedSelection={{
          kind: 'existing',
          variant: aiCupVariant as any,
        }}
        onSelect={jest.fn()}
        renderTrigger={() => <></>}
      />,
    );

    // tsp option should now show a checkmark because the manual tbsp donor
    // provides a valid math path (tbsp → tsp is intra-volume).
    expect(
      within(screen.getByTestId('food-unit-option-tsp')).queryByText(
        'icon-checkmark',
      ),
    ).not.toBeNull();
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
