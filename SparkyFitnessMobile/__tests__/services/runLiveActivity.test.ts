import type { TFunction } from 'i18next';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import type { RecordingSession } from '../../src/services/gpsRecordingService';
import type { WatchRunLive } from '../../src/stores/watchRunLiveStore';
// On macOS Jest resolves the `.ios.ts` variant, which is the module under test.
import {
  computeRecordingProps,
  computeWatchRunProps,
} from '../../src/services/runLiveActivity.ios';

jest.mock('../../src/services/RunLiveActivityLayout', () => ({
  __esModule: true,
  default: { start: jest.fn(), getInstances: jest.fn(() => []) },
}));
jest.mock('expo-widgets', () => ({
  addUserInteractionListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({ localUri: null, downloadAsync: jest.fn() })),
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { appleSharedContainers: {} },
  File: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

const NOW = 1_800_000_000_000;

function session(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: 's1',
    activity: 'run',
    status: 'recording',
    startedAt: NOW - 600_000,
    finishedAt: null,
    pausedAt: null,
    pausedMs: 0,
    seg: 0,
    indoor: true,
    ...overrides,
  } as RecordingSession;
}

function watchRun(overrides: Partial<WatchRunLive> = {}): WatchRunLive {
  return {
    runId: 'r1',
    kind: 'run',
    place: 'outdoor',
    status: 'running',
    autoPaused: false,
    autoPause: null,
    voiceCues: null,
    elapsed: 300,
    distanceMeters: 1000,
    heartRate: 150,
    energyKcal: 0,
    lapCount: 0,
    stepLabel: null,
    stepRemaining: null,
    nextLabel: null,
    sentAt: NOW,
    receivedAt: NOW,
    ...overrides,
  };
}

describe('run Live Activity props', () => {
  let ctx: { t: TFunction; distanceUnit: 'km' | 'miles' };

  beforeAll(async () => {
    await initializeI18n('en');
    ctx = { t: i18n.t.bind(i18n) as TFunction, distanceUnit: 'km' };
  });

  it('has no props without a recording', () => {
    expect(
      computeRecordingProps({ session: null, points: [] }, ctx, NOW, null)
    ).toBeNull();
  });

  it('shows an indoor recording as a running clock with no distance', () => {
    const props = computeRecordingProps(
      { session: session(), points: [] },
      ctx,
      NOW,
      null
    );
    expect(props).toMatchObject({
      title: 'Indoor run',
      status: 'running',
      clockLabel: '10:00',
      distanceLabel: null,
      paceLabel: null,
      canToggle: true,
    });
    expect(props?.clockStartedAt).toBe(NOW - 600_000);
  });

  it('reports a paused recording and stops offering Lap indoors', () => {
    const props = computeRecordingProps(
      {
        session: session({ status: 'paused', pausedAt: NOW - 1000 }),
        points: [],
      },
      ctx,
      NOW,
      null
    );
    expect(props).toMatchObject({
      status: 'paused',
      statusLabel: 'Paused',
      canLap: false,
    });
  });

  it('shows a fresh heart rate for this session only', () => {
    const fresh = { bpm: 152, at: NOW - 1000, sessionId: 's1' };
    const snap = { session: session(), points: [] };
    expect(computeRecordingProps(snap, ctx, NOW, fresh)?.heartRateLabel).toBe(
      '152 bpm'
    );
    expect(
      computeRecordingProps(snap, ctx, NOW, { ...fresh, sessionId: 'other' })
        ?.heartRateLabel
    ).toBeNull();
    expect(
      computeRecordingProps(snap, ctx, NOW, { ...fresh, at: NOW - 600_000 })
        ?.heartRateLabel
    ).toBeNull();
  });

  it('advances a watch run by the time since it last reported', () => {
    const props = computeWatchRunProps(watchRun(), ctx, NOW + 5000);
    expect(props).toMatchObject({
      title: 'Outdoor run',
      status: 'running',
      clockLabel: '5:05',
      distanceLabel: '1.00 km',
      heartRateLabel: '150 bpm',
    });
  });

  it('freezes a paused watch run and labels it', () => {
    const props = computeWatchRunProps(
      watchRun({ status: 'paused', autoPaused: true }),
      ctx,
      NOW + 5000
    );
    expect(props).toMatchObject({
      status: 'paused',
      statusLabel: 'Auto-paused',
      clockLabel: '5:00',
    });
  });

  it('drops a watch run that has gone quiet', () => {
    expect(computeWatchRunProps(watchRun(), ctx, NOW + 60_000)).toBeNull();
  });

  it('counts the interval step down on the watch run', () => {
    const props = computeWatchRunProps(
      watchRun({ stepLabel: 'Run 2 of 6', stepRemaining: 30 }),
      ctx,
      NOW + 10_000
    );
    expect(props?.stepLabel).toBe('Run 2 of 6 · 0:20');
  });

  it('formats distance in miles', () => {
    const props = computeWatchRunProps(
      watchRun({ distanceMeters: 1609.344 }),
      { ...ctx, distanceUnit: 'miles' },
      NOW
    );
    expect(props?.distanceLabel).toBe('1.00 mi');
  });
});
