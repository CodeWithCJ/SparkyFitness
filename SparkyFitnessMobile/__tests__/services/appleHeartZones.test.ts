const mockPreferred = jest.fn();
const mockAvailable = jest.fn(() => true);
jest.mock('../../modules/apple-heart-zones', () => ({
  __esModule: true,
  default: {
    isAvailable: () => mockAvailable(),
    preferredHeartRateZones: () => mockPreferred(),
  },
}));

const mockRequestAuthorization = jest.fn();
const mockQuery = jest.fn();
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: () => true,
  requestAuthorization: (...args: unknown[]) =>
    mockRequestAuthorization(...args),
  queryQuantitySamples: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import { readAppleHeartRateZones } from '../../src/services/appleHeartZones';

describe('readAppleHeartRateZones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailable.mockReturnValue(true);
    mockRequestAuthorization.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([{ quantity: 51.4 }]);
  });

  it('maps Apple zones and reads resting heart rate when asked', async () => {
    mockPreferred.mockResolvedValue({
      source: 'user',
      zones: [
        { index: 1, maximumBpm: 114 },
        { index: 2, minimumBpm: 114, maximumBpm: 133 },
        { index: 3, minimumBpm: 133, maximumBpm: 152 },
        { index: 4, minimumBpm: 152, maximumBpm: 171 },
        { index: 5, minimumBpm: 171 },
      ],
    });
    await expect(
      readAppleHeartRateZones({ includeRestingHeartRate: true })
    ).resolves.toEqual({
      floors: [30, 114, 133, 152, 171],
      restingHeartRate: 51,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierRestingHeartRate',
      expect.objectContaining({ limit: 1, ascending: false })
    );
  });

  it('returns null when Apple does not return five usable zones', async () => {
    mockPreferred.mockResolvedValue({
      source: 'system',
      zones: [{ index: 1, minimumBpm: 100 }],
    });
    await expect(readAppleHeartRateZones()).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
