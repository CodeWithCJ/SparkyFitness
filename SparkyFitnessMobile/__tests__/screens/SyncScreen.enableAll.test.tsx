import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SyncScreen from '../../src/screens/SyncScreen';
import { HEALTH_METRICS } from '../../src/HealthMetrics';
import { initializeI18n } from '../../src/localization/i18n';
import {
  loadHealthPreference,
  requestGrantedHealthPermissions,
  saveHealthPreference,
} from '../../src/services/healthConnectService';
import type { PermissionRequest } from '../../src/types/healthRecords';

jest.mock('../../src/services/healthConnectService', () => ({
  initHealthConnect: jest.fn().mockResolvedValue(true),
  loadHealthPreference: jest.fn().mockResolvedValue(false),
  saveHealthPreference: jest.fn().mockResolvedValue(undefined),
  requestHealthPermissions: jest.fn().mockResolvedValue(true),
  requestGrantedHealthPermissions: jest.fn(),
  refreshEnabledMetricPermissions: jest.fn().mockResolvedValue(undefined),
  loadAllEnabledPermissions: jest.fn().mockResolvedValue([]),
  enableBackgroundDeliveryForMetric: jest.fn().mockResolvedValue(undefined),
  disableBackgroundDeliveryForMetric: jest.fn().mockResolvedValue(undefined),
  setupBackgroundDeliveryForEnabledMetrics: jest
    .fn()
    .mockResolvedValue(undefined),
  disableAllBackgroundDelivery: jest.fn().mockResolvedValue(undefined),
  cleanupAllSubscriptions: jest.fn(),
  refreshSubscriptions: jest.fn(),
  startObservers: jest.fn(),
  stopObservers: jest.fn(),
}));

jest.mock('../../src/services/backgroundSyncService', () => ({
  configureBackgroundSync: jest.fn().mockResolvedValue(undefined),
  stopBackgroundSync: jest.fn().mockResolvedValue(undefined),
  performBackgroundSync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/storage', () => ({
  saveTimeRange: jest.fn().mockResolvedValue(undefined),
  loadTimeRange: jest.fn().mockResolvedValue('3d'),
  loadLastSyncedTime: jest.fn().mockResolvedValue(null),
  loadBackgroundSyncEnabled: jest.fn().mockResolvedValue(false),
  saveBackgroundSyncEnabled: jest.fn().mockResolvedValue(undefined),
  saveSyncOnOpenEnabled: jest.fn().mockResolvedValue(undefined),
  loadSyncOnOpenEnabled: jest.fn().mockResolvedValue(false),
  saveCollapsedCategories: jest.fn().mockResolvedValue(undefined),
  loadCollapsedCategories: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/healthDataDisplay', () => ({
  NO_DATA_DISPLAY: '--',
  fetchHealthDisplayData: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/writeback', () => ({
  removeWrittenData: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../../src/services/shared/enrichedSessionCache', () => ({
  hasAnyEnrichedSessions: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/services/healthDiagnosticService', () => ({
  shareHealthDiagnosticReport: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useSyncHealthData: () => ({ mutate: jest.fn(), isPending: false }),
  usePreferences: () => ({ preferences: null }),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void) => {
      ReactActual.useEffect(effect, [effect]);
    },
  };
});

jest.mock('../../src/components/DateRangeSheet', () => {
  const { forwardRef } = require('react');
  return { __esModule: true, default: forwardRef(() => null) };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockRequestGranted = requestGrantedHealthPermissions as jest.Mock;
const mockLoadPreference = loadHealthPreference as jest.Mock;
const mockSavePreference = saveHealthPreference as jest.Mock;

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const allPermissions = (): PermissionRequest[] =>
  HEALTH_METRICS.flatMap((metric) => metric.permissions);

const isHeartRate = (permission: PermissionRequest): boolean =>
  permission.recordType === 'HeartRate' && permission.accessType === 'read';

const metricSwitch = (label: string) =>
  screen.getByLabelText(`Sync ${label}`, { exact: true });

const pressEnableAll = async (): Promise<void> => {
  await act(async () => {
    fireEvent(
      screen.getByLabelText('Enable All Health Metrics'),
      'valueChange',
      true
    );
  });
};

const savedPreference = (preferenceKey: string): unknown =>
  mockSavePreference.mock.calls.find(([key]) => key === preferenceKey)?.[1];

describe('SyncScreen Enable All Health Metrics', () => {
  let alertSpy: jest.SpyInstance;

  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(
      <SyncScreen {...({ navigation, route: { params: {} } } as never)} />
    );
    // Let the focus-time initialization (preference loads) settle.
    await act(async () => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  test('keeps the metrics whose permissions were granted and warns on a partial grant', async () => {
    mockRequestGranted.mockResolvedValue(
      allPermissions().filter((permission) => !isHeartRate(permission))
    );

    await pressEnableAll();

    expect(mockRequestGranted).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Permissions Required',
      expect.stringContaining('Some permissions were not granted')
    );

    // Granted metrics stay on.
    expect(metricSwitch('Steps').props.value).toBe(true);
    expect(metricSwitch('Weight').props.value).toBe(true);
    // Heart Rate was declined, and Exercise Session also needs it.
    expect(metricSwitch('Heart Rate').props.value).toBe(false);
    expect(metricSwitch('Exercise Session').props.value).toBe(false);
    // Not everything is on, so Enable All itself reads as off.
    expect(screen.getByLabelText('Enable All Health Metrics').props.value).toBe(
      false
    );

    // The same states are what the screen persists.
    expect(mockSavePreference).toHaveBeenCalledTimes(HEALTH_METRICS.length);
    const stepsMetric = HEALTH_METRICS.find((m) => m.id === 'steps');
    const heartRateMetric = HEALTH_METRICS.find((m) => m.id === 'heartRate');
    const exerciseMetric = HEALTH_METRICS.find(
      (m) => m.id === 'exerciseSession'
    );
    expect(savedPreference(stepsMetric!.preferenceKey)).toBe(true);
    expect(savedPreference(heartRateMetric!.preferenceKey)).toBe(false);
    expect(savedPreference(exerciseMetric!.preferenceKey)).toBe(false);
  });

  test('turns every metric on without an alert when everything is granted', async () => {
    mockRequestGranted.mockResolvedValue(allPermissions());

    await pressEnableAll();

    expect(alertSpy).not.toHaveBeenCalled();
    for (const metric of HEALTH_METRICS) {
      expect(savedPreference(metric.preferenceKey)).toBe(true);
    }
    expect(metricSwitch('Steps').props.value).toBe(true);
    expect(metricSwitch('Heart Rate').props.value).toBe(true);
    expect(metricSwitch('Exercise Session').props.value).toBe(true);
    expect(screen.getByLabelText('Enable All Health Metrics').props.value).toBe(
      true
    );
  });
});

describe('SyncScreen Enable All with a declined write-back permission', () => {
  let alertSpy: jest.SpyInstance;

  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockLoadPreference.mockImplementation(
      async (key: string) => key === 'writebackNutritionEnabled'
    );
    render(
      <SyncScreen {...({ navigation, route: { params: {} } } as never)} />
    );
    await act(async () => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    mockLoadPreference.mockReset();
    mockLoadPreference.mockResolvedValue(false);
  });

  test('says only write-back was declined and keeps every read metric on', async () => {
    mockRequestGranted.mockResolvedValue(allPermissions());

    await pressEnableAll();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Permissions Required',
      expect.stringMatching(
        /^Every metric will sync\. To write your data back, grant the missing permissions in .+\.$/
      )
    );
    for (const metric of HEALTH_METRICS) {
      expect(savedPreference(metric.preferenceKey)).toBe(true);
    }
    expect(metricSwitch('Steps').props.value).toBe(true);
    expect(metricSwitch('Heart Rate').props.value).toBe(true);
  });
});
