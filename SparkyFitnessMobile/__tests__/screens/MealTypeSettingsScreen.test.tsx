import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import MealTypeSettingsScreen from '../../src/screens/MealTypeSettingsScreen';
import * as mealTypesApi from '../../src/services/api/mealTypesApi';
import { mealTypesQueryKey } from '../../src/hooks/queryKeys';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/hooks/useScreenHeader', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    useScreenHeader: (config: any) => {
      const items = Array.isArray(config.right) ? config.right : config.right ? [config.right] : [];
      return React.createElement(
        React.Fragment,
        null,
        items.map((item: any, i: number) =>
          React.createElement(Pressable, {
            key: i,
            accessibilityLabel: item.accessibilityLabel,
            onPress: item.onPress,
          }),
        ),
      );
    },
  };
});

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const systemMealTypes = [
  {
    id: 'sys-b',
    name: 'breakfast',
    sort_order: 10,
    user_id: null,
    created_at: '',
    is_visible: true,
    show_in_quick_log: true,
    default_time: '08:00',
  },
  {
    id: 'sys-d',
    name: 'dinner',
    sort_order: 30,
    user_id: null,
    created_at: '',
    is_visible: true,
    show_in_quick_log: true,
    default_time: null,
  },
];

const customMealTypes = [
  {
    id: 'custom-pw',
    name: 'Pre-Workout',
    sort_order: 11,
    user_id: 'user-1',
    created_at: '',
    is_visible: true,
    show_in_quick_log: false,
    default_time: '17:30',
  },
];

const allMealTypes = [...systemMealTypes, ...customMealTypes];

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  jest
    .spyOn(mealTypesApi, 'fetchMealTypes')
    .mockResolvedValue(allMealTypes as any);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MealTypeSettingsScreen navigation={mockNavigation} route={{ params: {} } as any} />
      </QueryClientProvider>,
    ),
  };
}

describe('MealTypeSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Toast.show as jest.Mock).mockClear();
  });

  it('renders system and custom types with their ownership tag', async () => {
    const { findByText, getByText, getAllByText } = renderScreen();
    expect(await findByText('Pre-Workout')).toBeTruthy();
    expect(getByText('breakfast')).toBeTruthy();
    expect(getByText('dinner')).toBeTruthy();
    expect(getAllByText(/^System/).length).toBeGreaterThan(0);
    expect(getAllByText(/^Custom/).length).toBeGreaterThan(0);
    // Order values are visible for both.
    expect(getByText(/Order: 11/)).toBeTruthy();
    expect(getByText(/Order: 10/)).toBeTruthy();
  });

  it('creates a custom meal type with name, order, and default time', async () => {
    const createSpy = jest
      .spyOn(mealTypesApi, 'createMealType')
      .mockResolvedValue({ ...customMealTypes[0], name: 'Brunch', sort_order: 25, default_time: '10:45' } as any);
    const { getByPlaceholderText, getByLabelText } = renderScreen();

    fireEvent.press(await getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Brunch');
    fireEvent.changeText(getByPlaceholderText('e.g. 11'), '25');
    fireEvent.changeText(getByPlaceholderText('HH:MM (e.g. 07:30)'), '10:45');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Brunch',
        sort_order: 25,
        default_time: '10:45',
      });
    });
  });

  it('create sends null default_time when the field is empty', async () => {
    const createSpy = jest
      .spyOn(mealTypesApi, 'createMealType')
      .mockResolvedValue({ ...customMealTypes[0], name: 'Snack2' } as any);
    const { getByPlaceholderText, getByLabelText } = renderScreen();

    fireEvent.press(await getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Snack2');
    fireEvent.changeText(getByPlaceholderText('e.g. 11'), '40');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Snack2',
        sort_order: 40,
        default_time: null,
      });
    });
  });

  it('rejects an invalid numeric order on create', async () => {
    const createSpy = jest.spyOn(mealTypesApi, 'createMealType');
    const { getByPlaceholderText, getByLabelText } = renderScreen();

    fireEvent.press(await getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Brunch');
    fireEvent.changeText(getByPlaceholderText('e.g. 11'), 'abc');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Invalid order' }),
      );
    });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid default time on create', async () => {
    const createSpy = jest.spyOn(mealTypesApi, 'createMealType');
    const { getByPlaceholderText, getByLabelText } = renderScreen();

    fireEvent.press(await getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Brunch');
    fireEvent.changeText(getByPlaceholderText('e.g. 11'), '5');
    fireEvent.changeText(getByPlaceholderText('HH:MM (e.g. 07:30)'), '25:99');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Invalid time' }),
      );
    });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('opens edit with existing name, order, and default time; saving sends all three', async () => {
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValue({ ...customMealTypes[0], name: 'Post-Workout', sort_order: 20, default_time: '18:15' } as any);
    const { getByLabelText, getByDisplayValue, getAllByDisplayValue, findByText } = renderScreen();

    fireEvent.press(await findByText('Pre-Workout'));
    // Existing values are prefilled.
    expect(getByDisplayValue('Pre-Workout')).toBeTruthy();
    expect(getByDisplayValue('11')).toBeTruthy();
    // Two inputs show 17:30 (inline row + edit modal); the modal one is last.
    const modalTimeInput = getAllByDisplayValue('17:30').at(-1);
    expect(modalTimeInput).toBeTruthy();

    fireEvent.changeText(getByDisplayValue('Pre-Workout'), 'Post-Workout');
    fireEvent.changeText(getByDisplayValue('11'), '20');
    fireEvent.changeText(modalTimeInput, '18:15');
    fireEvent.press(getByLabelText('Save meal type'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', {
        name: 'Post-Workout',
        sort_order: 20,
        default_time: '18:15',
      });
    });
  });

  it('edit can clear default_time (null) while keeping name and order', async () => {
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValue({ ...customMealTypes[0], default_time: null } as any);
    const { getAllByDisplayValue, getByLabelText, findByText } = renderScreen();

    fireEvent.press(await findByText('Pre-Workout'));
    fireEvent.changeText(getAllByDisplayValue('17:30').at(-1), '');
    fireEvent.press(getByLabelText('Save meal type'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', {
        name: 'Pre-Workout',
        sort_order: 11,
        default_time: null,
      });
    });
  });

  it('toggles visibility for a meal type', async () => {
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ ...customMealTypes[0] } as any);
    const { findByText, UNSAFE_getAllByType } = renderScreen();
    await findByText('Pre-Workout');
    const { Switch } = require('react-native');
    const switches = UNSAFE_getAllByType(Switch);
    // Row order: breakfast, dinner, Pre-Workout → switches are (Visible, Quick) x3.
    fireEvent(switches[4], 'valueChange', false);
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { is_visible: false });
    });
  });

  it('toggles quick-log for a meal type', async () => {
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ ...customMealTypes[0] } as any);
    const { findByText, UNSAFE_getAllByType } = renderScreen();
    await findByText('Pre-Workout');
    const { Switch } = require('react-native');
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[5], 'valueChange', true);
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { show_in_quick_log: true });
    });
  });

  it('updates default_time for a system meal type (inline, per-user override)', async () => {
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ ...systemMealTypes[1], default_time: '19:00' } as any);
    const { findByText, getByLabelText } = renderScreen();
    await findByText('dinner');

    const dinnerTimeInput = getByLabelText('Default time for dinner');
    fireEvent.changeText(dinnerTimeInput, '19:00');
    fireEvent(dinnerTimeInput, 'blur');

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('sys-d', { default_time: '19:00' });
    });
  });

  it('deletes a custom meal type after confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });
    const deleteSpy = jest.spyOn(mealTypesApi, 'deleteMealType').mockResolvedValue(undefined as any);
    const { findByLabelText } = renderScreen();

    fireEvent.press(await findByLabelText('Delete Pre-Workout'));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('custom-pw');
    });
    alertSpy.mockRestore();
  });

  it('does not offer delete for system meal types', async () => {
    const { findByText, queryByLabelText } = renderScreen();
    await findByText('breakfast');
    expect(queryByLabelText('Delete breakfast')).toBeNull();
    expect(queryByLabelText('Delete dinner')).toBeNull();
  });

  it('does not open the rename/reorder edit modal for system meal types', async () => {
    const { findByText, queryByText } = renderScreen();
    await findByText('breakfast');
    // System rows are not tappable for editing (name/sort_order are locked by
    // the backend); only the custom row opens the edit modal.
    expect(queryByText('Edit Meal Type')).toBeNull();
  });

  it('invalidates/refetches the meal types query after a successful mutation', async () => {
    jest
      .spyOn(mealTypesApi, 'createMealType')
      .mockResolvedValue({ ...customMealTypes[0], name: 'Brunch', sort_order: 5 } as any);
    const invalidateSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    const { getByPlaceholderText, getByLabelText } = renderScreen();

    fireEvent.press(await getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Brunch');
    fireEvent.changeText(getByPlaceholderText('e.g. 11'), '5');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mealTypesQueryKey });
    });
  });
});
