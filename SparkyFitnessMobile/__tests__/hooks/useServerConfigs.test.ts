import { renderHook, waitFor } from '@testing-library/react-native';
import { useServerConfigs } from '../../src/hooks/useServerConfigs';
import {
  getActiveServerConfig,
  getAllServerConfigs,
  getSavedActiveServerConfigId,
} from '../../src/services/storage';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  getAllServerConfigs: jest.fn(),
  getSavedActiveServerConfigId: jest.fn(),
}));

const mockGetAll = jest.mocked(getAllServerConfigs);
const mockGetActive = jest.mocked(getActiveServerConfig);
const mockGetActiveId = jest.mocked(getSavedActiveServerConfigId);

describe('useServerConfigs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the stored active id when the configuration itself cannot be read', async () => {
    // A failed keychain read: the configurations come back empty, so the
    // active one resolves to null, but a server is still active.
    mockGetAll.mockResolvedValue([]);
    mockGetActive.mockResolvedValue(null);
    mockGetActiveId.mockResolvedValue('server-1');

    const { result } = renderHook(() => useServerConfigs(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeConfig).toBeNull();
    expect(result.current.activeConfigId).toBe('server-1');
  });

  it('answers null only when no server is active', async () => {
    mockGetAll.mockResolvedValue([]);
    mockGetActive.mockResolvedValue(null);
    mockGetActiveId.mockResolvedValue(null);

    const { result } = renderHook(() => useServerConfigs(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeConfigId).toBeNull();
  });

  it('does not know while loading or after a failed read', async () => {
    mockGetAll.mockResolvedValue([]);
    mockGetActive.mockRejectedValue(new Error('storage unavailable'));
    mockGetActiveId.mockResolvedValue('server-1');

    const { result } = renderHook(() => useServerConfigs(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    expect(result.current.activeConfigId).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeConfigId).toBeUndefined();
  });
});
