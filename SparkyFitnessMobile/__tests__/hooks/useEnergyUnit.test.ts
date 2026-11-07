import { renderHook, waitFor } from '@testing-library/react-native';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';

jest.mock('../../src/services/api/preferencesApi', () => ({
  fetchPreferences: jest.fn(),
}));

const { useEnergyUnit } = jest.requireActual<
  typeof import('../../src/hooks/useEnergyUnit')
>('../../src/hooks/useEnergyUnit');

describe('useEnergyUnit', () => {
  test("reads the account's energy unit", async () => {
    const client = createTestQueryClient();
    client.setQueryData(preferencesQueryKey, { energy_unit: 'kJ' });
    const { result } = renderHook(() => useEnergyUnit(), {
      wrapper: createQueryWrapper(client),
    });
    await waitFor(() => expect(result.current).toBe('kJ'));
  });

  test('falls back to kcal without a setting', async () => {
    const client = createTestQueryClient();
    client.setQueryData(preferencesQueryKey, {});
    const { result } = renderHook(() => useEnergyUnit(), {
      wrapper: createQueryWrapper(client),
    });
    await waitFor(() => expect(result.current).toBe('kcal'));
  });
});
