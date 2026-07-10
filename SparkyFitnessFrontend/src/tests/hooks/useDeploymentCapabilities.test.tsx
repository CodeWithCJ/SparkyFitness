import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDeploymentCapabilities } from '@/api/general';
import {
  deploymentCapabilitiesQueryKey,
  useDeploymentCapabilities,
} from '@/hooks/useDeploymentCapabilities';

jest.mock('@/api/general', () => ({
  getDeploymentCapabilities: jest.fn(),
}));

const mockGetDeploymentCapabilities = jest.mocked(getDeploymentCapabilities);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, Wrapper };
};

describe('useDeploymentCapabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches and caches the deployment capability contract', async () => {
    const capabilities = {
      storageMode: 'disabled' as const,
      uploadsEnabled: false,
      serverBackupsEnabled: false,
      backgroundJobsEnabled: false,
    };
    mockGetDeploymentCapabilities.mockResolvedValue(capabilities);
    const { queryClient, Wrapper } = createWrapper();

    const { result } = renderHook(() => useDeploymentCapabilities(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(capabilities);
    expect(mockGetDeploymentCapabilities).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(deploymentCapabilitiesQueryKey)).toEqual(
      capabilities
    );
  });

  it('surfaces capability request failures without retrying', async () => {
    const error = new Error('capability endpoint unavailable');
    mockGetDeploymentCapabilities.mockRejectedValue(error);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDeploymentCapabilities(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(mockGetDeploymentCapabilities).toHaveBeenCalledTimes(1);
  });
});
