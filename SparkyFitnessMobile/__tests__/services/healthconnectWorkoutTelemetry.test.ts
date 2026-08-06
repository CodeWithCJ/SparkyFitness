jest.mock('react-native-health-connect', () => ({
  readRecords: jest.fn(),
  requestExerciseRoute: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import { readFileSync } from 'fs';

// Android-specific module: on macOS Jest resolves .ios.ts by default, so this
// path is required explicitly to be sure we are not testing the iOS provider.
const {
  collectSessionLaps,
  collectSessionRoute,
  collectSessionTelemetry,
  prefetchSessionRoutes,
  routeNeedsConsent,
} = require('../../src/services/healthconnect/workoutTelemetry.ts');

const { readRecords, requestExerciseRoute } =
  require('react-native-health-connect') as {
    readRecords: jest.Mock;
    requestExerciseRoute: jest.Mock;
  };

const AsyncStorage =
  require('@react-native-async-storage/async-storage') as {
    getItem: jest.Mock;
    setItem: jest.Mock;
  };

const at = (seconds: number): string =>
  new Date(Date.parse('2026-08-04T09:00:00.000Z') + seconds * 1000).toISOString();

const session = (overrides: Record<string, unknown> = {}) => ({
  startTime: at(0),
  endTime: at(600),
  metadata: { id: 'session-1', dataOrigin: 'com.strava' },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  readRecords.mockResolvedValue({ records: [] });
  if (AsyncStorage.getItem?.mockResolvedValue) {
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(undefined);
  }
});

describe('routeNeedsConsent', () => {
  // The native module writes this field as a STRING while the library's
  // TypeScript declares a numeric enum (CONSENT_REQUIRED = 2). Comparing
  // against the enum alone never matches, so routes would never be requested.
  it('recognises the string the native module actually sends', () => {
    expect(routeNeedsConsent({ type: 'CONSENT_REQUIRED' })).toBe(true);
  });

  it('also recognises the numeric enum value', () => {
    expect(routeNeedsConsent({ type: 2 })).toBe(true);
  });

  it('is false for the other states', () => {
    expect(routeNeedsConsent({ type: 'DATA' })).toBe(false);
    expect(routeNeedsConsent({ type: 'NO_DATA' })).toBe(false);
    expect(routeNeedsConsent(undefined)).toBe(false);
  });

  it('keeps the library enum string-valued', () => {
    // Guards patches/react-native-health-connect@3.5.3.patch, which makes this
    // enum string-valued to match what the native module actually sends. If an
    // upgrade drops the patch the enum reverts to numeric and comparing against
    // it stops matching — a silent failure: no consent prompt, so no GPS.
    //
    // Asserted by reading the shipped source rather than importing it: the
    // package is mocked above, and its untranspiled .ts is not in Jest's
    // transform scope.
    const source = readFileSync(
      require.resolve('react-native-health-connect/src/types/base.types.ts'),
      'utf8'
    );
    expect(source).toContain("CONSENT_REQUIRED = 'CONSENT_REQUIRED'");
  });
});

describe('collectSessionRoute', () => {
  it('uses route data that is already present without prompting', async () => {
    const points = await collectSessionRoute(
      session({
        exerciseRoute: {
          type: 'DATA',
          route: [
            { time: at(0), latitude: 37.7, longitude: -122.4, altitude: { inMeters: 10 } },
          ],
        },
      }),
      true
    );
    expect(requestExerciseRoute).not.toHaveBeenCalled();
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ lat: 37.7, lon: -122.4, alt: 10 });
  });

  it('prompts for consent in the foreground and remembers the grant', async () => {
    // The native module resolves the bare location array, not the { type,
    // route } wrapper its 3.5.3 typings declare — coding to the wrapper meant
    // the freshly granted route was discarded and zero points uploaded.
    requestExerciseRoute.mockResolvedValue([
      { time: at(0), latitude: 1, longitude: 2 },
    ]);

    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      true
    );

    expect(requestExerciseRoute).toHaveBeenCalledWith('session-1');
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ lat: 1, lon: 2 });
    const [key, stored] = AsyncStorage.setItem.mock.calls[0];
    expect(key).toContain('session-1');
    expect(JSON.parse(stored)).toMatchObject({ value: 'granted' });
  });

  it('still accepts the wrapped { type, route } result shape', async () => {
    requestExerciseRoute.mockResolvedValue({
      route: [{ time: at(0), latitude: 1, longitude: 2 }],
    });

    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      true
    );

    expect(points).toHaveLength(1);
  });

  it('never runs two consent requests concurrently', async () => {
    // The native side has one uncorrelated result channel: overlapping
    // requests are matched to callers by ordering alone, so a second in-flight
    // dialog can hand one workout another workout's route.
    let inFlight = 0;
    let maxInFlight = 0;
    requestExerciseRoute.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight -= 1;
      return [{ time: at(0), latitude: 1, longitude: 2 }];
    });

    const needsConsent = (id: string) =>
      session({
        metadata: { id, dataOrigin: 'com.strava' },
        exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] },
      });

    const [a, b] = await Promise.all([
      collectSessionRoute(needsConsent('session-a'), true),
      collectSessionRoute(needsConsent('session-b'), true),
    ]);

    expect(maxInFlight).toBe(1);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('never prompts when not interactive', async () => {
    // requestExerciseRoute shows a system dialog, which a headless background
    // task cannot present.
    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      false
    );
    expect(requestExerciseRoute).not.toHaveBeenCalled();
    expect(points).toEqual([]);
  });

  it('remembers a refusal so the overlap re-sync does not prompt again', async () => {
    requestExerciseRoute.mockRejectedValue(new Error('denied'));

    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      true
    );

    expect(points).toEqual([]);
    const [key, stored] = AsyncStorage.setItem.mock.calls[0];
    expect(key).toContain('session-1');
    expect(JSON.parse(stored)).toMatchObject({ value: 'denied' });
  });

  it('does not re-prompt a session denied recently', async () => {
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ value: 'denied', storedAtMs: Date.now() })
    );

    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      true
    );

    expect(requestExerciseRoute).not.toHaveBeenCalled();
    expect(points).toEqual([]);
  });

  it('re-prompts once a denial older than 24h expires (transient failures must not be permanent)', async () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ value: 'denied', storedAtMs: twoDaysAgo })
    );
    requestExerciseRoute.mockResolvedValue([
      { time: at(0), latitude: 1, longitude: 2 },
    ]);

    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      true
    );

    expect(requestExerciseRoute).toHaveBeenCalledWith('session-1');
    expect(points).toHaveLength(1);
  });

  it('treats a legacy bare-string stored value as undecided and re-prompts once', async () => {
    // Pre-fix storage wrote the raw string 'denied', not JSON — JSON.parse
    // throws on it, which must fall back to "no decision" rather than crash.
    AsyncStorage.getItem.mockResolvedValue('denied');
    requestExerciseRoute.mockResolvedValue([
      { time: at(0), latitude: 1, longitude: 2 },
    ]);

    const points = await collectSessionRoute(
      session({ exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] } }),
      true
    );

    expect(requestExerciseRoute).toHaveBeenCalledWith('session-1');
    expect(points).toHaveLength(1);
  });

  it('drops locations without a usable fix', async () => {
    const points = await collectSessionRoute(
      session({
        exerciseRoute: {
          type: 'DATA',
          route: [
            { time: at(0), latitude: 37.7, longitude: -122.4 },
            { time: 'not-a-date', latitude: 1, longitude: 1 },
            { time: at(10), latitude: null, longitude: -122.4 },
          ],
        },
      }),
      true
    );
    expect(points).toHaveLength(1);
  });
});

describe('prefetchSessionRoutes', () => {
  const consentSession = (id: string) => ({
    startTime: at(0),
    endTime: at(600),
    metadata: { id, dataOrigin: 'com.strava' },
    exerciseRoute: { type: 'CONSENT_REQUIRED', route: [] },
  });

  it('resolves consent up front so the timed read never prompts', async () => {
    readRecords.mockResolvedValue({
      records: [consentSession('prefetch-1')],
    });
    requestExerciseRoute.mockResolvedValue([
      { time: at(0), latitude: 1, longitude: 2 },
    ]);

    await prefetchSessionRoutes(new Date(at(0)), new Date(at(600)));
    expect(requestExerciseRoute).toHaveBeenCalledTimes(1);

    // The later in-window read consumes the cached points without a dialog.
    const points = await collectSessionRoute(consentSession('prefetch-1'), true);
    expect(points).toHaveLength(1);
    expect(requestExerciseRoute).toHaveBeenCalledTimes(1);
  });

  it('skips sessions that already carry route data or need no consent', async () => {
    readRecords.mockResolvedValue({
      records: [
        session({
          metadata: { id: 'prefetch-2' },
          exerciseRoute: { type: 'DATA', route: [{ time: at(0), latitude: 1, longitude: 2 }] },
        }),
        session({ metadata: { id: 'prefetch-3' }, exerciseRoute: { type: 'NO_DATA', route: [] } }),
      ],
    });

    await prefetchSessionRoutes(new Date(at(0)), new Date(at(600)));
    expect(requestExerciseRoute).not.toHaveBeenCalled();
  });

  it('a failed session read costs the prefetch, not the sync', async () => {
    readRecords.mockRejectedValue(new Error('unavailable'));
    await expect(
      prefetchSessionRoutes(new Date(at(0)), new Date(at(600)))
    ).resolves.toBeUndefined();
  });

  it('remembers a prefetch refusal like an inline one', async () => {
    readRecords.mockResolvedValue({
      records: [consentSession('prefetch-4')],
    });
    requestExerciseRoute.mockRejectedValue(new Error('denied'));

    await prefetchSessionRoutes(new Date(at(0)), new Date(at(600)));

    const [key, stored] = AsyncStorage.setItem.mock.calls[0];
    expect(key).toContain('prefetch-4');
    expect(JSON.parse(stored)).toMatchObject({ value: 'denied' });
  });
});

describe('collectSessionLaps', () => {
  it('maps laps to dense 1-based windows', () => {
    const laps = collectSessionLaps(
      session({
        laps: [
          { startTime: at(300), endTime: at(600) },
          { startTime: at(0), endTime: at(300) },
        ],
      })
    );
    expect(laps).toEqual([
      { lap_index: 1, start_time: at(0), end_time: at(300) },
      { lap_index: 2, start_time: at(300), end_time: at(600) },
    ]);
  });

  it('falls back to segments when there are no laps', () => {
    const laps = collectSessionLaps(
      session({ laps: [], segments: [{ startTime: at(0), endTime: at(600) }] })
    );
    expect(laps).toHaveLength(1);
  });

  it('returns nothing when the session has neither', () => {
    expect(collectSessionLaps(session())).toEqual([]);
  });
});

describe('collectSessionTelemetry — heart-rate correlation', () => {
  it('prefers samples from the session own data origin', async () => {
    readRecords.mockImplementation((type: string, options: { dataOriginFilter?: string[] }) => {
      if (type === 'HeartRate' && options.dataOriginFilter) {
        return Promise.resolve({
          records: [
            {
              samples: [
                { time: at(0), beatsPerMinute: 100 },
                { time: at(60), beatsPerMinute: 140 },
              ],
            },
          ],
        });
      }
      return Promise.resolve({ records: [] });
    });

    const bundle = await collectSessionTelemetry(session(), {
      interactive: false,
    });

    expect(bundle.telemetry.avg_heart_rate).toBe(120);
    expect(bundle.telemetry.max_heart_rate).toBe(140);
    expect(bundle.hr_samples).toHaveLength(2);
  });

  it('falls back to an unfiltered read when the origin-scoped one is empty', async () => {
    // Common in practice: the session comes from one app and the heart rate
    // from another (Strava session, Wear OS heart rate).
    readRecords.mockImplementation((type: string, options: { dataOriginFilter?: string[] }) => {
      if (type !== 'HeartRate') return Promise.resolve({ records: [] });
      if (options.dataOriginFilter) return Promise.resolve({ records: [] });
      return Promise.resolve({
        records: [{ samples: [{ time: at(0), beatsPerMinute: 130 }] }],
      });
    });

    const bundle = await collectSessionTelemetry(session(), {
      interactive: false,
    });

    expect(bundle.telemetry.avg_heart_rate).toBe(130);
  });

  it('rejects a fallback read dense enough to be another activity', async () => {
    readRecords.mockImplementation((type: string, options: { dataOriginFilter?: string[] }) => {
      if (type !== 'HeartRate') return Promise.resolve({ records: [] });
      if (options.dataOriginFilter) return Promise.resolve({ records: [] });
      // ~10 samples/second over a 600s window — far beyond one device's output.
      return Promise.resolve({
        records: [
          {
            samples: Array.from({ length: 6000 }, (_, i) => ({
              time: at(i / 10),
              beatsPerMinute: 130,
            })),
          },
        ],
      });
    });

    const bundle = await collectSessionTelemetry(session(), {
      interactive: false,
    });

    expect(bundle.hr_samples).toBeUndefined();
  });

  it('discards samples outside the session window', async () => {
    readRecords.mockImplementation((type: string) =>
      type === 'HeartRate'
        ? Promise.resolve({
            records: [
              {
                samples: [
                  { time: at(-120), beatsPerMinute: 60 },
                  { time: at(60), beatsPerMinute: 140 },
                  { time: at(9999), beatsPerMinute: 200 },
                ],
              },
            ],
          })
        : Promise.resolve({ records: [] })
    );

    const bundle = await collectSessionTelemetry(session(), {
      interactive: false,
    });

    expect(bundle.hr_samples).toHaveLength(1);
    expect(bundle.telemetry.max_heart_rate).toBe(140);
  });

  it('returns nothing for a session with an unusable window', async () => {
    expect(
      await collectSessionTelemetry(session({ endTime: at(0) }), {
        interactive: false,
      })
    ).toEqual({});
    expect(
      await collectSessionTelemetry(session({ startTime: undefined }), {
        interactive: false,
      })
    ).toEqual({});
  });

  it('survives a read failure without losing the session', async () => {
    readRecords.mockRejectedValue(new Error('health connect unavailable'));
    const bundle = await collectSessionTelemetry(session(), {
      interactive: false,
    });
    expect(bundle.hr_samples).toBeUndefined();
  });
});
