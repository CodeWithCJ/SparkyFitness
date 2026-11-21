import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  isPendingEntry,
  useAddFoodEntry,
} from '../../src/hooks/useAddFoodEntry';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { saveFood } from '../../src/services/api/foodsApi';
import { ApiError } from '../../src/services/api/errors';
import { TimeoutError } from '../../src/utils/concurrency';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));
jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(),
  fetchFoodVariants: jest.fn(),
  saveFood: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
const mockQueueFoodEntry = jest.fn();
jest.mock('../../src/offline/foodEntryHandOver', () => ({
  ...jest.requireActual('../../src/offline/foodEntryHandOver'),
  queueFoodEntry: (...args: unknown[]) => mockQueueFoodEntry(...args),
}));

const mockQueueFoodCreate = jest.fn();
jest.mock('../../src/offline/foodCreateHandOver', () => ({
  ...jest.requireActual('../../src/offline/foodCreateHandOver'),
  queueFoodCreate: (...args: unknown[]) => mockQueueFoodCreate(...args),
}));
const mockSaveFood = saveFood as jest.MockedFunction<typeof saveFood>;
const mockCreate = createFoodEntry as jest.MockedFunction<
  typeof createFoodEntry
>;

const libraryFood = {
  meal_type_id: 'meal-1',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-11-21',
  food_id: 'food-1',
  variant_id: 'variant-1',
};
const quickAdd = {
  meal_type_id: 'meal-1',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-11-21',
  food_name: 'Quick add',
  calories: 300,
  protein: 20,
  carbs: 30,
  fat: 10,
};

function setup(onSuccess = jest.fn()) {
  const queryClient = createTestQueryClient();
  const hook = renderHook(() => useAddFoodEntry({ onSuccess }), {
    wrapper: createQueryWrapper(queryClient),
  });
  return { ...hook, onSuccess };
}

describe('useAddFoodEntry while the server is unreachable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueFoodEntry.mockReset();
  });

  test.each([
    ['a food from the library', libraryFood],
    ['a quick-add', quickAdd],
  ])('keeps %s on the phone', async (_name, payload) => {
    mockCreate.mockRejectedValue(new TypeError('Network request failed'));
    mockQueueFoodEntry.mockResolvedValue(true);
    const { result, onSuccess } = setup();

    await act(async () => {
      result.current.addEntry({ createEntryPayload: payload });
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    // The key the failed request carried is the key the upload will carry,
    // and the queued body does not hold the key itself.
    const sentKey = mockCreate.mock.calls[0][0].client_id;
    expect(sentKey).toEqual(expect.any(String));
    expect(mockQueueFoodEntry).toHaveBeenCalledWith(sentKey, payload);
    const entry = onSuccess.mock.calls[0][0];
    expect(isPendingEntry(entry)).toBe(true);
    expect(entry.entry_date).toBe('2026-11-21');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
    expect(Toast.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('does not queue after a timeout: the server may have the entry', async () => {
    mockCreate.mockRejectedValue(new TimeoutError('Request', 1000));
    const { result, onSuccess } = setup();

    await act(async () => {
      result.current.addEntry({ createEntryPayload: libraryFood });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueueFoodEntry).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('does not queue an entry the server has to work out first', async () => {
    mockCreate.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = setup();

    await act(async () => {
      // A meal is expanded by the server, so it cannot wait on the phone.
      result.current.addEntry({
        createEntryPayload: { ...libraryFood, meal_id: 'meal-9' },
      });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueueFoodEntry).not.toHaveBeenCalled();
  });

  test('shows the error for a request the server refused', async () => {
    mockCreate.mockRejectedValue(new ApiError('Bad request', 400));
    const { result } = setup();

    await act(async () => {
      result.current.addEntry({ createEntryPayload: libraryFood });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueueFoodEntry).not.toHaveBeenCalled();
  });
});

describe('useAddFoodEntry creating a food while the server is unreachable', () => {
  const food = {
    name: 'Homemade bread',
    brand: null,
    serving_size: 50,
    serving_unit: 'g',
    calories: 130,
    protein: 4,
    carbs: 25,
    fat: 1,
  };
  const entry = {
    meal_type_id: 'meal-1',
    quantity: 2,
    unit: 'g',
    entry_date: '2026-11-21',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueFoodCreate.mockReset();
  });

  it('keeps the new food and its entry on the phone', async () => {
    mockSaveFood.mockRejectedValue(new TypeError('Network request failed'));
    mockQueueFoodCreate.mockResolvedValue(true);
    const { result, onSuccess } = setup();

    await act(async () => {
      result.current.addEntry({
        saveFoodPayload: food,
        createEntryPayload: entry,
      });
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const sentKey = mockSaveFood.mock.calls[0][0].client_id;
    expect(sentKey).toEqual(expect.any(String));
    // The food keeps the key its first request carried.
    expect(mockQueueFoodCreate).toHaveBeenCalledWith(
      sentKey,
      expect.any(String),
      food,
      entry
    );
    expect(isPendingEntry(onSuccess.mock.calls[0][0])).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not queue after a timeout', async () => {
    mockSaveFood.mockRejectedValue(new TimeoutError('Request', 1000));
    const { result, onSuccess } = setup();

    await act(async () => {
      result.current.addEntry({
        saveFoodPayload: food,
        createEntryPayload: entry,
      });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueueFoodCreate).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not queue a food that carries a picture', async () => {
    mockSaveFood.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = setup();

    await act(async () => {
      result.current.addEntry({
        saveFoodPayload: food,
        saveFoodImages: { order: ['__new__0'], newUris: ['file:///a.jpg'] },
        createEntryPayload: entry,
      });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueueFoodCreate).not.toHaveBeenCalled();
  });
});
