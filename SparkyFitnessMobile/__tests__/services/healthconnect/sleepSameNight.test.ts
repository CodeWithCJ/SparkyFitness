import {
  getGrantedPermissions,
  readRecords,
} from 'react-native-health-connect';
import { loadHealthPreference } from '../../../src/services/healthconnect/preferences';
import { postProcessRaw } from '../../../src/services/healthconnect/provider';
import { createTelemetryRunContext } from '../../../src/services/shared/telemetryBudget';
import { atLocalTime } from '../../helpers/localTime';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
}));

const HC = { LIGHT: 4, DEEP: 5, REM: 6, AWAKE: 1 };

const session = (
  app: string,
  start: [string, string],
  end: [string, string],
  stages: number[] = []
) => {
  const startTime = atLocalTime(...start);
  const endTime = atLocalTime(...end);
  const startMs = Date.parse(startTime);
  const step = (Date.parse(endTime) - startMs) / Math.max(stages.length, 1);
  return {
    startTime,
    endTime,
    metadata: { dataOrigin: app },
    stages: stages.map((stage, i) => ({
      startTime: new Date(startMs + i * step).toISOString(),
      endTime: new Date(startMs + (i + 1) * step).toISOString(),
      stage,
    })),
  };
};

const sleepAfterPostProcess = (records: unknown[]) =>
  postProcessRaw(
    { recordType: 'SleepSession' },
    records,
    createTelemetryRunContext()
  ) as Promise<{ metadata: { dataOrigin: string } }[]>;

const apps = (records: { metadata: { dataOrigin: string } }[]) =>
  records.map((r) => r.metadata.dataOrigin);

describe('Health Connect sleep from two apps for the same night', () => {
  beforeEach(() => {
    (readRecords as jest.Mock).mockReset();
    (readRecords as jest.Mock).mockResolvedValue({ records: [] });
    (getGrantedPermissions as jest.Mock).mockResolvedValue([]);
    (loadHealthPreference as jest.Mock).mockResolvedValue(false);
  });

  test('keeps only the more detailed session', async () => {
    const kept = await sleepAfterPostProcess([
      session(
        'com.sec.android.app.shealth',
        ['2026-10-14', '23:10'],
        ['2026-10-15', '06:50']
      ),
      session(
        'com.google.android.apps.fitness',
        ['2026-10-14', '23:00'],
        ['2026-10-15', '07:00'],
        [HC.LIGHT, HC.DEEP, HC.LIGHT, HC.REM, HC.AWAKE]
      ),
    ]);
    expect(apps(kept)).toEqual(['com.google.android.apps.fitness']);
  });

  test('keeps the finer staging when both have the same stages', async () => {
    const kept = await sleepAfterPostProcess([
      session(
        'com.sec.android.app.shealth',
        ['2026-10-14', '23:00'],
        ['2026-10-15', '07:00'],
        [HC.LIGHT, HC.DEEP, HC.REM]
      ),
      session(
        'com.google.android.apps.fitness',
        ['2026-10-14', '23:00'],
        ['2026-10-15', '07:00'],
        [HC.LIGHT, HC.DEEP, HC.LIGHT, HC.REM, HC.LIGHT]
      ),
    ]);
    expect(apps(kept)).toEqual(['com.google.android.apps.fitness']);
  });

  test('keeps a nap from another app that does not overlap the night', async () => {
    const kept = await sleepAfterPostProcess([
      session(
        'com.google.android.apps.fitness',
        ['2026-10-14', '23:00'],
        ['2026-10-15', '07:00'],
        [HC.LIGHT, HC.DEEP]
      ),
      session(
        'com.sec.android.app.shealth',
        ['2026-10-15', '13:00'],
        ['2026-10-15', '13:40']
      ),
    ]);
    expect(apps(kept)).toEqual([
      'com.google.android.apps.fitness',
      'com.sec.android.app.shealth',
    ]);
  });

  test('passes a session without usable times through', async () => {
    const broken = { metadata: { dataOrigin: 'com.example' } };
    const kept = await sleepAfterPostProcess([
      broken,
      session(
        'com.google.android.apps.fitness',
        ['2026-10-14', '23:00'],
        ['2026-10-15', '07:00']
      ),
    ]);
    expect(kept).toHaveLength(2);
  });
});
