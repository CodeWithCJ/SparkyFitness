jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/healthkit/index', () => ({
  ...jest.requireActual('../../src/services/healthkit/index'),
  hasUnrequestedHealthPermissions: jest.fn(),
  requestHealthPermissions: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/healthkit/preferences', () => ({
  ...jest.requireActual('../../src/services/healthkit/preferences'),
  // A current stored permission version must not stop iOS from asking.
  loadHealthPreference: jest.fn().mockResolvedValue(5),
}));

import { refreshEnabledMetricPermissions } from '../../src/services/healthConnectService.ios';
import {
  hasUnrequestedHealthPermissions,
  requestHealthPermissions,
} from '../../src/services/healthkit/index';

const mockHasUnrequested = hasUnrequestedHealthPermissions as jest.Mock;
const mockRequest = requestHealthPermissions as jest.Mock;

beforeEach(() => {
  mockHasUnrequested.mockReset();
  mockRequest.mockClear();
});

describe('refreshEnabledMetricPermissions (iOS)', () => {
  // Existing installs never got the caffeine type added to Nutrition because the
  // shared permission version was not bumped; iOS now asks HealthKit instead.
  it('requests enabled permissions when HealthKit has unrequested types', async () => {
    mockHasUnrequested.mockResolvedValue(true);

    await refreshEnabledMetricPermissions(
      { isNutritionSyncEnabled: true },
      { nutrition: true }
    );

    const checked = mockHasUnrequested.mock.calls[0][0];
    expect(checked).toEqual(
      expect.arrayContaining([
        { accessType: 'read', recordType: 'Nutrition' },
        { accessType: 'write', recordType: 'Nutrition' },
      ])
    );
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(checked);
  });

  it('does not request when every enabled type was already asked about', async () => {
    mockHasUnrequested.mockResolvedValue(false);

    await expect(
      refreshEnabledMetricPermissions({ isNutritionSyncEnabled: true })
    ).resolves.toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
