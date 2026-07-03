import { ensureTimezoneBootstrapped } from '../../../src/services/api/preferencesApi';
import { addLog } from '../../../src/services/LogService';

// Mock the underlying apiFetch so we control fetch/update responses directly
const mockApiFetch = jest.fn();
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('@workspace/shared', () => ({
  isValidTimeZone: (tz: string) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
}));

const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('ensureTimezoneBootstrapped', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('posts device timezone to the bootstrap endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce({ timezone: deviceTz });

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBe(deviceTz);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/user-preferences/bootstrap-timezone',
        method: 'POST',
        body: { timezone: deviceTz },
      }),
    );
  });

  test('returns the existing server timezone without a second request', async () => {
    mockApiFetch.mockResolvedValueOnce({ timezone: 'America/Los_Angeles' });

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBe('America/Los_Angeles');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  test('coalesces concurrent bootstrap requests', async () => {
    let resolveRequest: ((value: { timezone: string }) => void) | undefined;
    mockApiFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRequest = resolve;
        }),
    );

    const first = ensureTimezoneBootstrapped();
    const second = ensureTimezoneBootstrapped();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    resolveRequest?.({ timezone: deviceTz });

    await expect(first).resolves.toBe(deviceTz);
    await expect(second).resolves.toBe(deviceTz);
  });

  test('handles invalid device timezone gracefully', async () => {
    const resolvedOptionsSpy = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        locale: 'en-US',
        calendar: 'gregory',
        numberingSystem: 'latn',
        timeZone: 'not-a-real-timezone',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      } as Intl.ResolvedDateTimeFormatOptions);

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBeUndefined();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Device timezone invalid or unavailable'),
      'WARNING',
    );

    resolvedOptionsSpy.mockRestore();
  });

  test('handles bootstrap request failure gracefully', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Server error'));

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBeUndefined();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Timezone bootstrap failed'),
      'WARNING',
    );
  });
});
