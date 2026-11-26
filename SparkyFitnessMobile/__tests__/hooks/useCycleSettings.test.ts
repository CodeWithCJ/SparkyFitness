import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCycleSettings } from '../../src/hooks/useCycleSettings';
import { getSettings, putSettings } from '../../src/services/api/cycleApi';
import { serverConfigsQueryKey } from '../../src/hooks/queryKeys';
import {
  createTestQueryClient,
  createQueryWrapper,
  showServerOnScreen,
  testServer,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/cycleApi', () => ({
  getSettings: jest.fn(),
  putSettings: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetSettings = getSettings as jest.MockedFunction<typeof getSettings>;
const mockPutSettings = putSettings as jest.MockedFunction<typeof putSettings>;

describe('useCycleSettings', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    showServerOnScreen(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches settings on mount', async () => {
    mockGetSettings.mockResolvedValue({
      enabled: true,
      mode: 'standard',
      luteal_phase_length: 14,
      birth_control_method: 'none',
      conditions: [],
      show_fertile_window: true,
      preferred_products: [],
      dismissed_prompts: [],
      terminology: 'default',
      discreet_mode: false,
    });

    const { result } = renderHook(() => useCycleSettings(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetSettings).toHaveBeenCalled();
    expect(result.current.settings).toEqual({
      enabled: true,
      mode: 'standard',
      luteal_phase_length: 14,
      birth_control_method: 'none',
      conditions: [],
      show_fertile_window: true,
      preferred_products: [],
      dismissed_prompts: [],
      terminology: 'default',
      discreet_mode: false,
    });
  });

  test('mutates settings successfully', async () => {
    const originalSettings = {
      enabled: false,
      mode: 'standard' as const,
      luteal_phase_length: 14,
      birth_control_method: 'none',
      conditions: [],
      show_fertile_window: true,
      preferred_products: [],
      dismissed_prompts: [],
      terminology: 'default' as const,
      discreet_mode: false,
    };
    mockGetSettings.mockResolvedValue(originalSettings);

    const { result } = renderHook(() => useCycleSettings(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updatedSettings = { ...originalSettings, enabled: true };
    mockPutSettings.mockResolvedValue(updatedSettings);

    await act(async () => {
      await result.current.updateSettingsAsync({ enabled: true });
    });

    expect(mockPutSettings).toHaveBeenCalledWith({ enabled: true }, testServer);
    await waitFor(() => {
      expect(result.current.settings).toEqual(updatedSettings);
    });
  });

  test('saves nothing, and rejects, when the server on screen is not known', async () => {
    mockGetSettings.mockResolvedValue(null);
    const { result } = renderHook(() => useCycleSettings(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    queryClient.removeQueries({ queryKey: serverConfigsQueryKey });
    await expect(
      result.current.updateSettingsAsync({ mark_onboarded: true })
    ).rejects.toThrow('No server on screen');
    expect(mockPutSettings).not.toHaveBeenCalled();
  });
});
