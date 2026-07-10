import { getDeploymentCapabilities } from '@/api/general';

const mockApiCall = jest.fn();

jest.mock('@/api/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

describe('general API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads deployment capabilities from the public capability endpoint', async () => {
    const capabilities = {
      storageMode: 'disabled' as const,
      uploadsEnabled: false,
      serverBackupsEnabled: false,
      backgroundJobsEnabled: false,
    };
    mockApiCall.mockResolvedValue(capabilities);

    await expect(getDeploymentCapabilities()).resolves.toEqual(capabilities);
    expect(mockApiCall).toHaveBeenCalledWith('/deployment-capabilities', {
      method: 'GET',
    });
  });
});
