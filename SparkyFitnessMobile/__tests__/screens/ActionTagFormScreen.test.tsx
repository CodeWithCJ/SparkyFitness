import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ActionTagFormScreen from '../../src/screens/ActionTagFormScreen';
import {
  useActionTagsQuery,
  useCreateActionTagMutation,
  useDeleteActionTagMutation,
  useUpdateActionTagMutation,
} from '../../src/hooks/useActionTags';
import { useNfcSupport } from '../../src/hooks/useNfcSupport';
import { useWaterContainersQuery } from '../../src/hooks';
import { writeTag } from '../../src/services/nfc/nfcService';
import { useFocusEffect } from '@react-navigation/native';
import { useMeal } from '../../src/hooks/useMeals';
import { setPendingActionTagSelection } from '../../src/services/actionTagSelection';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import { initializeI18n } from '../../src/localization/i18n';
import { ApiError } from '../../src/services/api/errors';
import Toast from 'react-native-toast-message';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useActionTags', () => ({
  useActionTagsQuery: jest.fn(),
  useCreateActionTagMutation: jest.fn(),
  useUpdateActionTagMutation: jest.fn(),
  useDeleteActionTagMutation: jest.fn(),
}));
jest.mock('../../src/hooks/useNfcSupport', () => ({
  useNfcSupport: jest.fn(),
}));
jest.mock('../../src/hooks', () => ({ useWaterContainersQuery: jest.fn() }));
jest.mock('../../src/hooks/useMealTypes', () => ({ useMealTypes: jest.fn() }));
jest.mock('../../src/hooks/useMeals', () => ({ useMeal: jest.fn() }));
jest.mock('../../src/hooks/useFoods', () => ({
  useFood: () => ({ food: { name: 'Greek yogurt' } }),
}));
jest.mock('../../src/services/nfc/nfcService', () => ({
  generateTagCode: () => '0123456789abcdef0123456789abcdef',
  writeTag: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const MEAL_ID = '33333333-3333-4333-8333-333333333333';
const SNACKS_ID = '44444444-4444-4444-8444-444444444444';
const FOOD_2_ID = '55555555-5555-4555-8555-555555555555';
const VARIANT_2_ID = '66666666-6666-4666-8666-666666666666';
const CODE = '0123456789abcdef0123456789abcdef';
const createTag = jest.fn();
const updateTag = jest.fn();
const navigation = { goBack: jest.fn() };

const renderForm = (params?: object) =>
  render(
    <ActionTagFormScreen
      {...({
        navigation,
        route: { params },
      } as unknown as RootStackScreenProps<'ActionTagForm'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  createTag.mockResolvedValue({});
  updateTag.mockResolvedValue({});
  jest.mocked(useNfcSupport).mockReturnValue({
    supported: true,
    enabled: true,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useNfcSupport>);
  jest.mocked(useWaterContainersQuery).mockReturnValue({
    containers: [{ id: 7, name: 'Stanley' }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useWaterContainersQuery>);
  jest.mocked(useMealTypes).mockReturnValue({
    mealTypes: [
      { id: SNACKS_ID, name: 'snacks', user_id: null, sort_order: 4 },
    ],
    defaultMealTypeId: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useMealTypes>);
  jest.mocked(useMeal).mockReturnValue({
    meal: { id: MEAL_ID, name: 'Overnight oats' },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useMeal>);
  jest.mocked(useFocusEffect).mockImplementation(() => undefined);
  jest.mocked(useActionTagsQuery).mockReturnValue({
    tags: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useActionTagsQuery>);
  jest.mocked(useCreateActionTagMutation).mockReturnValue({
    createActionTagAsync: createTag,
    isPending: false,
  });
  jest.mocked(useUpdateActionTagMutation).mockReturnValue({
    updateActionTagAsync: updateTag,
    isPending: false,
  });
  jest.mocked(useDeleteActionTagMutation).mockReturnValue({
    deleteActionTagAsync: jest.fn(),
    isPending: false,
  });
});

const preset = {
  presetAction: { type: 'water', container_id: 7, drinks: 1 },
};

describe('ActionTagFormScreen', () => {
  it('writes the sticker first, then saves the tag with the same code', async () => {
    jest.mocked(writeTag).mockResolvedValue({ status: 'written' });
    renderForm(preset);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(writeTag).toHaveBeenCalledWith(
      CODE,
      expect.objectContaining({ overwrite: false })
    );
    expect(createTag).toHaveBeenCalledWith({
      tag_code: CODE,
      label: 'Stanley',
      action: { type: 'water', container_id: 7, drinks: 1 },
      ask_before_running: false,
    });
    expect(writeTag.mock.invocationCallOrder[0]).toBeLessThan(
      createTag.mock.invocationCallOrder[0]
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('saves nothing when writing the sticker fails or is cancelled', async () => {
    jest.mocked(writeTag).mockResolvedValue({ status: 'cancelled' });
    renderForm(preset);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(writeTag).toHaveBeenCalled());
    expect(createTag).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('asks before replacing data already on the sticker', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(writeTag).mockResolvedValueOnce({
      status: 'has_data',
      contents: { kind: 'other' },
    });
    renderForm(preset);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // Cancelling the prompt leaves the sticker alone and saves nothing.
    const buttons = alertSpy.mock.calls[0][2] as { onPress?: () => void }[];
    buttons[0].onPress?.();
    await waitFor(() => expect(navigation.goBack).not.toHaveBeenCalled());
    expect(createTag).not.toHaveBeenCalled();
    expect(writeTag).toHaveBeenCalledTimes(1);
  });

  it('does not write anything for a tag found by a tap, only saves it', async () => {
    renderForm({ tagCode: 'f'.repeat(32), ...preset });
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(writeTag).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({ tag_code: 'f'.repeat(32) })
    );
  });

  it('saves a food tag with the amount and meal from the food screen', async () => {
    renderForm({
      tagCode: 'f'.repeat(32),
      presetAction: {
        type: 'food',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        quantity: 170,
        unit: 'g',
        meal: { mode: 'auto' },
      },
      presetLabel: 'Greek yogurt',
    });
    expect(screen.getByText('Greek yogurt')).toBeTruthy();
    fireEvent.changeText(screen.getByDisplayValue('170'), '200');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(createTag).toHaveBeenCalledWith({
      tag_code: 'f'.repeat(32),
      label: 'Greek yogurt',
      action: {
        type: 'food',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        quantity: 200,
        unit: 'g',
        meal: { mode: 'auto' },
      },
      ask_before_running: false,
    });
  });

  it('saves a meal tag named after the meal, logging to a fixed meal type', async () => {
    renderForm({
      tagCode: 'f'.repeat(32),
      presetAction: {
        type: 'meal',
        meal_template_id: MEAL_ID,
        quantity: 1,
        unit: 'serving',
        meal: { mode: 'fixed', meal_type_id: SNACKS_ID },
      },
    });
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Overnight oats',
        action: {
          type: 'meal',
          meal_template_id: MEAL_ID,
          quantity: 1,
          unit: 'serving',
          meal: { mode: 'fixed', meal_type_id: SNACKS_ID },
        },
      })
    );
  });

  it('saves the gram-based meal picked on the logging amount screen', async () => {
    // The food search and its amount screen hand the pick back on focus.
    jest
      .mocked(useFocusEffect)
      .mockImplementation((effect) => React.useEffect(effect, [effect]));
    setPendingActionTagSelection({
      kind: 'meal',
      mealId: MEAL_ID,
      name: 'Creamy chicken pasta',
      quantity: 50,
      unit: 'g',
    });
    renderForm({ tagCode: 'f'.repeat(32) });
    expect(screen.getByText('Creamy chicken pasta')).toBeTruthy();
    expect(screen.getByText('Meal')).toBeTruthy();
    expect(screen.getByDisplayValue('50')).toBeTruthy();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Creamy chicken pasta',
        action: {
          type: 'meal',
          meal_template_id: MEAL_ID,
          quantity: 50,
          unit: 'g',
          meal: { mode: 'auto' },
        },
      })
    );
  });

  it('saves a food picked from the search', async () => {
    jest
      .mocked(useFocusEffect)
      .mockImplementation((effect) => React.useEffect(effect, [effect]));
    setPendingActionTagSelection({
      kind: 'food',
      foodId: FOOD_2_ID,
      variantId: VARIANT_2_ID,
      name: 'Banana',
      quantity: 1,
      unit: 'piece',
    });
    renderForm({ tagCode: 'f'.repeat(32) });
    expect(screen.queryByText('Meal')).toBeNull();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Banana',
        action: {
          type: 'food',
          food_id: FOOD_2_ID,
          variant_id: VARIANT_2_ID,
          quantity: 1,
          unit: 'piece',
          meal: { mode: 'auto' },
        },
      })
    );
  });

  it('names a new tag after a long meal name, cut to the server limit', async () => {
    jest.mocked(useMeal).mockReturnValue({
      meal: { id: MEAL_ID, name: 'A'.repeat(200) },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useMeal>);
    renderForm({
      tagCode: 'f'.repeat(32),
      presetAction: {
        type: 'meal',
        meal_template_id: MEAL_ID,
        quantity: 1,
        unit: 'serving',
        meal: { mode: 'auto' },
      },
    });
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'A'.repeat(120) })
    );
  });

  it('refuses a food tag with no amount', async () => {
    renderForm({
      tagCode: 'f'.repeat(32),
      presetAction: {
        type: 'food',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        quantity: 170,
        unit: 'g',
        meal: { mode: 'auto' },
      },
      presetLabel: 'Greek yogurt',
    });
    fireEvent.changeText(screen.getByDisplayValue('170'), '0');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).not.toHaveBeenCalled());
  });

  it('writes nothing to the sticker for an amount the server would refuse', async () => {
    renderForm({
      presetAction: {
        type: 'food',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        quantity: 170,
        unit: 'g',
        meal: { mode: 'auto' },
      },
      presetLabel: 'Greek yogurt',
    });
    fireEvent.changeText(screen.getByDisplayValue('170'), '20000');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(writeTag).not.toHaveBeenCalled();
    expect(createTag).not.toHaveBeenCalled();
  });

  it('says the server is too old when it does not know food tags', async () => {
    createTag.mockRejectedValue(
      new ApiError(
        'Bad request',
        400,
        JSON.stringify({
          error: 'Invalid request body',
          details: {
            _errors: [],
            action: {
              _errors: [],
              type: { _errors: ['Invalid discriminator'] },
            },
          },
        })
      )
    );
    renderForm({
      tagCode: 'f'.repeat(32),
      presetAction: {
        type: 'food',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        quantity: 170,
        unit: 'g',
        meal: { mode: 'auto' },
      },
      presetLabel: 'Greek yogurt',
    });
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          text2: expect.stringContaining('does not support food and meal tags'),
        })
      )
    );
  });

  it("shows the food's own name when editing a food tag", () => {
    jest.mocked(useActionTagsQuery).mockReturnValue({
      tags: [
        {
          id: 'tag-1',
          tag_code: CODE,
          label: 'Desk snack',
          action: {
            type: 'food',
            food_id: FOOD_ID,
            variant_id: VARIANT_ID,
            quantity: 170,
            unit: 'g',
            meal: { mode: 'auto' },
          },
          ask_before_running: false,
          last_run_at: null,
          created_at: '',
          updated_at: '',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useActionTagsQuery>);
    renderForm({ tagId: 'tag-1' });
    expect(screen.getByText('Greek yogurt')).toBeTruthy();
    expect(screen.getByDisplayValue('Desk snack')).toBeTruthy();
  });

  it('does not offer to edit a tag type this app does not know', () => {
    jest.mocked(useActionTagsQuery).mockReturnValue({
      tags: [
        {
          id: 'tag-1',
          tag_code: CODE,
          label: 'Vitamins',
          action: { type: 'medication' },
          ask_before_running: false,
          last_run_at: null,
          created_at: '',
          updated_at: '',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useActionTagsQuery>);
    renderForm({ tagId: 'tag-1' });
    expect(screen.getByText('Update the app to use this tag')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('refuses an invalid number of drinks', async () => {
    renderForm(preset);
    fireEvent.changeText(screen.getByDisplayValue('1'), '0');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(writeTag).not.toHaveBeenCalled());
    expect(createTag).not.toHaveBeenCalled();
  });

  it('tells a phone without NFC that it cannot set up tags', () => {
    jest.mocked(useNfcSupport).mockReturnValue({
      supported: false,
      enabled: false,
      isLoading: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useNfcSupport>);
    renderForm(preset);
    expect(screen.getByText('This phone cannot use NFC tags')).toBeTruthy();
  });
});
