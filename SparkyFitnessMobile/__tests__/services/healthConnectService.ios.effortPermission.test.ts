jest.mock('@kingstinct/react-native-healthkit', () => ({
  requestAuthorization: jest.fn().mockResolvedValue(true),
  getRequestStatusForAuthorization: jest.fn(),
  AuthorizationRequestStatus: { unknown: 0, shouldRequest: 1, unnecessary: 2 },
  isHealthDataAvailable: jest.fn().mockResolvedValue(true),
  queryQuantitySamples: jest.fn(),
  queryStatisticsCollectionForQuantity: jest.fn(),
  queryCategorySamples: jest.fn(),
  queryWorkoutSamples: jest.fn(),
  queryCorrelationSamples: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/healthkit/preferences', () => ({
  ...jest.requireActual('../../src/services/healthkit/preferences'),
  loadHealthPreference: jest.fn().mockResolvedValue(5),
}));

import { refreshEnabledMetricPermissions } from '../../src/services/healthConnectService.ios';
import { initHealthConnect } from '../../src/services/healthkit/index';
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

const statusMock = getRequestStatusForAuthorization as jest.Mock;
const requestMock = requestAuthorization as jest.Mock;
const effort = 'HKQuantityTypeIdentifierWorkoutEffortScore';
const route = 'HKWorkoutRouteTypeIdentifier';

beforeAll(async () => {
  await initHealthConnect();
});

beforeEach(() => {
  statusMock.mockReset();
  requestMock.mockClear();
});

// Health keeps reporting the workout effort rating as never requested, so
// counting it showed the sheet on every visit to the sync options.
describe('refreshEnabledMetricPermissions (iOS) and the workout effort rating', () => {
  it('requests the effort rating with the rest when another type is new', async () => {
    statusMock.mockResolvedValue(AuthorizationRequestStatus.shouldRequest);

    await refreshEnabledMetricPermissions({
      isExerciseSessionSyncEnabled: true,
      isNutritionSyncEnabled: true,
    });

    expect(statusMock.mock.calls[0][0].toRead).not.toContain(effort);
    expect(requestMock.mock.calls[0][0].toRead).toContain(effort);
    expect(statusMock.mock.calls[0][0].toRead).not.toContain(route);
    expect(requestMock.mock.calls[0][0].toRead).toContain(route);
  });

  it('does not request anything when only workouts are enabled and answered', async () => {
    statusMock.mockResolvedValue(AuthorizationRequestStatus.unnecessary);

    await refreshEnabledMetricPermissions({
      isExerciseSessionSyncEnabled: true,
    });

    expect(statusMock.mock.calls[0][0].toRead).not.toContain(effort);
    expect(requestMock).not.toHaveBeenCalled();
  });
});
