import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { saveFood } from '../../src/services/api/foodsApi';
import { isPendingFoodId } from '../../src/offline/foodCreateHandOver';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({ saveFood: jest.fn() }));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
const mockQueueFoodCreate = jest.fn();
jest.mock('../../src/offline/foodCreateHandOver', () => ({
  ...jest.requireActual('../../src/offline/foodCreateHandOver'),
  queueFoodCreate: (...args: unknown[]) => mockQueueFoodCreate(...args),
}));

const mockSave = saveFood as jest.MockedFunction<typeof saveFood>;
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

function setup() {
  return renderHook(() => useSaveFood(), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });
}

describe('useSaveFood for a food made only for the library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockRejectedValue(new TypeError('Network request failed'));
    mockQueueFoodCreate.mockResolvedValue(true);
  });

  it('keeps a plain food on the phone when asked to, under the key its first request carried', async () => {
    const { result } = setup();
    let saved: Awaited<ReturnType<typeof result.current.saveFoodAsync>>;

    await act(async () => {
      saved = await result.current.saveFoodAsync(
        food,
        undefined,
        undefined,
        true
      );
    });

    const sentKey = mockSave.mock.calls[0][0].client_id;
    expect(sentKey).toEqual(expect.any(String));
    expect(mockQueueFoodCreate).toHaveBeenCalledWith(sentKey, null, food, null);
    expect(isPendingFoodId(saved!.id)).toBe(true);
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'info' })
      )
    );
  });

  it('still needs the server when not asked to keep it', async () => {
    const { result } = setup();

    await act(async () => {
      await expect(result.current.saveFoodAsync(food)).rejects.toThrow();
    });

    expect(mockQueueFoodCreate).not.toHaveBeenCalled();
  });
});
