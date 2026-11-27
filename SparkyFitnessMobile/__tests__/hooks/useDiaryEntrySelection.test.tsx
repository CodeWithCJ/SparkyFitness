import React, { type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiaryEntrySelection } from '../../src/hooks/useDiaryEntrySelection';
import {
  deleteFoodEntry,
  moveDiaryEntries,
} from '../../src/services/api/foodEntriesApi';
import { deleteFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import type { FoodEntry } from '../../src/types/foodEntries';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn().mockResolvedValue({ id: 'test-server' }),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  deleteFoodEntry: jest.fn(),
  moveDiaryEntries: jest.fn(),
}));
jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  deleteFoodEntryMeal: jest.fn(),
}));
jest.mock('../../src/offline/foodEntryUpdateHandOver', () => ({
  dropSupersededUpdate: jest.fn().mockResolvedValue(undefined),
}));

const date = '2026-11-24';
const targetDate = '2026-11-25';

function food(id: string, meal?: string): FoodEntry {
  return {
    id,
    food_name: id,
    entry_date: date,
    meal_type: 'Breakfast',
    meal_type_id: 'breakfast',
    quantity: 1,
    unit: 'serving',
    serving_size: 1,
    calories: 100,
    food_entry_meal_id: meal,
  };
}

const oats = food('Oats');
const banana = food('Banana');
const coffee = food('Coffee');
const ingredient1 = food('A', 'group');
const ingredient2 = food('B', 'group');
const all = [oats, banana, coffee, ingredient1, ingredient2];

function renderSelection(entries = all) {
  const client = new QueryClient();
  const moveSheetRef = { current: null };
  return renderHook(
    () =>
      useDiaryEntrySelection({ date, entries, enabled: true, moveSheetRef }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

it('moves only the selected entries and refreshes the selection on success', async () => {
  const { result } = renderSelection();
  act(() => result.current.rowSelection(oats)?.onToggle?.());
  expect(result.current.selectedCount).toBe(1);
  act(() => result.current.rowSelection(banana)?.onToggle?.());
  expect(result.current.selectedCount).toBe(2);
  act(() => result.current.openMove());

  expect(result.current.move.isDestinationDisabled(date, 'breakfast')).toBe(
    true
  );
  expect(
    result.current.move.isDestinationDisabled(targetDate, 'breakfast')
  ).toBe(false);

  act(() => result.current.move.onConfirm(targetDate, 'dinner'));

  await waitFor(() => expect(result.current.isSelecting).toBe(false));
  expect(moveDiaryEntries).toHaveBeenCalledWith(
    {
      sourceDate: date,
      targetDate,
      targetMealTypeId: 'dinner',
      foodEntryIds: ['Oats', 'Banana'],
      loggedMealIds: [],
    },
    { id: 'test-server' }
  );
});

it('moves a whole diary meal and includes a logged meal only once', async () => {
  const { result } = renderSelection();
  act(() => result.current.openMove(all));
  act(() => result.current.move.onConfirm(date, 'dinner'));

  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(moveDiaryEntries).toHaveBeenCalledWith(
    {
      sourceDate: date,
      targetDate: date,
      targetMealTypeId: 'dinner',
      foodEntryIds: ['Oats', 'Banana', 'Coffee'],
      loggedMealIds: ['group'],
    },
    { id: 'test-server' }
  );
});

it('does not write when the picker, delete confirmation, or selection is cancelled', () => {
  const { result } = renderSelection();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  act(() => result.current.rowSelection(coffee)?.onToggle?.());
  act(() => result.current.openMove());
  act(() => result.current.move.onDismiss());
  expect(result.current.selectedCount).toBe(1);

  act(() => result.current.confirmDelete());
  expect(alert.mock.calls[0][2]?.[0].style).toBe('cancel');
  act(() => result.current.cancelSelection());

  expect(result.current.isSelecting).toBe(false);
  expect(moveDiaryEntries).not.toHaveBeenCalled();
  expect(deleteFoodEntry).not.toHaveBeenCalled();
  expect(deleteFoodEntryMeal).not.toHaveBeenCalled();
});

it('keeps failed deletions selected without retrying entries already removed', async () => {
  const { result } = renderSelection();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(deleteFoodEntry).mockRejectedValueOnce(new Error('Unavailable'));

  act(() => result.current.rowSelection(oats)?.onToggle?.());
  act(() => result.current.rowSelection(ingredient1)?.onToggle?.());
  expect(result.current.selectedCount).toBe(3);
  expect(result.current.rowSelection(ingredient2)?.selected).toBe(true);

  act(() => result.current.confirmDelete());
  act(() => alert.mock.calls[0][2]?.[1].onPress?.());

  await waitFor(() => expect(result.current.selectedCount).toBe(1));
  expect(result.current.rowSelection(oats)?.selected).toBe(true);
  expect(result.current.rowSelection(ingredient1)?.selected).toBe(false);
  expect(deleteFoodEntry).toHaveBeenCalledTimes(1);
  expect(deleteFoodEntryMeal).toHaveBeenCalledTimes(1);
});
