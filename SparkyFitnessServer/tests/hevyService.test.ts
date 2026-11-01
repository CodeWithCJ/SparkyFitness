import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HevyWorkout } from '../integrations/hevy/hevyDataProcessor.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
  decrypt: vi.fn(),
  processHevyUserInfo: vi.fn(),
  processHevyWorkouts: vi.fn(),
  loadRawBundle: vi.fn(),
  logRawResponse: vi.fn(),
  loadUserTimezone: vi.fn(),
  log: vi.fn(),
}));

vi.mock('axios', () => ({ default: { get: mocks.get } }));
vi.mock('../db/poolManager.js', () => ({
  getClient: mocks.getClient,
  getSystemClient: mocks.getSystemClient,
}));
vi.mock('../security/encryption.js', () => ({
  decrypt: mocks.decrypt,
  ENCRYPTION_KEY: 'test-encryption-key',
}));
vi.mock('../config/logging.js', () => ({ log: mocks.log }));
vi.mock('../utils/diagnosticLogger.js', () => ({
  loadRawBundle: mocks.loadRawBundle,
  logRawResponse: mocks.logRawResponse,
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: mocks.loadUserTimezone,
}));
vi.mock('../utils/mockDataContext.js', () => ({ setMockDataContext: vi.fn() }));
vi.mock('../integrations/hevy/hevyDataProcessor.js', () => ({
  default: {
    processHevyUserInfo: mocks.processHevyUserInfo,
    processHevyWorkouts: mocks.processHevyWorkouts,
  },
}));

import { syncHevyData } from '../integrations/hevy/hevyService.js';

const USER_ID = 'user-1';
const PROVIDER_ID = 'hevy-provider-1';
const template = {
  id: 'template-bench',
  title: 'Bench Press (Barbell)',
  primary_muscle_group: 'chest',
  secondary_muscle_groups: ['triceps', 'shoulders'],
};
const secondTemplate = {
  id: 'template-row',
  primary_muscle_group: 'upper_back',
  secondary_muscle_groups: ['biceps'],
};

function workout(id: string, startTime = '2026-10-23T18:00:00Z'): HevyWorkout {
  return {
    id,
    title: 'Strength session',
    start_time: startTime,
    end_time: startTime,
    exercises: [],
  };
}

interface WorkoutPage {
  page: number;
  page_count: number;
  workouts: HevyWorkout[];
}

interface TemplatePage {
  page: number;
  page_count: number;
  exercise_templates: (typeof template | typeof secondTemplate)[];
}

function mockApi(
  workoutPages: WorkoutPage[] = [
    { page: 1, page_count: 1, workouts: [workout('workout-1')] },
  ],
  templatePages: TemplatePage[] = [
    { page: 1, page_count: 1, exercise_templates: [template] },
  ]
) {
  mocks.get.mockImplementation(
    async (url: string, options: { params?: { page: number } }) => {
      if (url.endsWith('/v1/user/info')) {
        return { data: { user: { weight_kg: 75 } } };
      }
      const page = (options.params?.page ?? 1) - 1;
      if (url.endsWith('/v1/workouts')) {
        return { data: workoutPages[page] };
      }
      if (url.endsWith('/v1/exercise_templates')) {
        return { data: templatePages[page] };
      }
      throw new Error(`Unexpected Hevy request: ${url}`);
    }
  );
}

function syncUpdates() {
  return mocks.query.mock.calls.filter(
    ([query]) =>
      typeof query === 'string' &&
      query.startsWith('UPDATE external_data_providers')
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  const client = { query: mocks.query, release: mocks.release };
  mocks.getClient.mockResolvedValue(client);
  mocks.getSystemClient.mockResolvedValue(client);
  mocks.query.mockImplementation(async (query: string) => ({
    rows: query.startsWith('SELECT')
      ? [
          {
            id: PROVIDER_ID,
            encrypted_app_key: 'encrypted-test-key',
            app_key_iv: 'test-iv',
            app_key_tag: 'test-tag',
          },
        ]
      : [],
    rowCount: 1,
  }));
  mocks.decrypt.mockReturnValue('decrypted-test-key');
  mocks.loadUserTimezone.mockResolvedValue('Europe/Berlin');
  mocks.processHevyUserInfo.mockResolvedValue(undefined);
  mocks.processHevyWorkouts.mockResolvedValue(undefined);
  mockApi();
});

describe('syncHevyData required API reads', () => {
  it('passes every template page to the processor after all GET requests finish', async () => {
    mockApi(
      [
        { page: 1, page_count: 2, workouts: [workout('workout-1')] },
        { page: 2, page_count: 2, workouts: [workout('workout-2')] },
      ],
      [
        { page: 1, page_count: 2, exercise_templates: [template] },
        { page: 2, page_count: 2, exercise_templates: [secondTemplate] },
      ]
    );

    const result = await syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID);

    expect(mocks.processHevyWorkouts).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      [workout('workout-1'), workout('workout-2')],
      'Europe/Berlin',
      [template, secondTemplate]
    );
    expect(
      mocks.get.mock.calls.map(([url, options]) => [url, options.params])
    ).toEqual(
      expect.arrayContaining([
        ['https://api.hevyapp.com/v1/workouts', { page: 1, pageSize: 10 }],
        ['https://api.hevyapp.com/v1/workouts', { page: 2, pageSize: 10 }],
        [
          'https://api.hevyapp.com/v1/exercise_templates',
          { page: 1, pageSize: 100 },
        ],
        [
          'https://api.hevyapp.com/v1/exercise_templates',
          { page: 2, pageSize: 100 },
        ],
      ])
    );
    expect(Math.max(...mocks.get.mock.invocationCallOrder)).toBeLessThan(
      mocks.processHevyUserInfo.mock.invocationCallOrder[0]!
    );
    expect(Math.max(...mocks.get.mock.invocationCallOrder)).toBeLessThan(
      mocks.processHevyWorkouts.mock.invocationCallOrder[0]!
    );
    expect(result).toEqual({
      success: true,
      processedCount: 2,
      source: 'live_api',
    });
    expect(mocks.logRawResponse).toHaveBeenCalledWith(
      'hevy',
      'raw_exercise_templates_page_2',
      { page: 2, page_count: 2, exercise_templates: [secondTemplate] }
    );
  });

  it.each(['/v1/workouts', '/v1/exercise_templates'])(
    'rejects a failed %s read before processing or marking success',
    async (failedEndpoint) => {
      const getSuccessfulPage = mocks.get.getMockImplementation()!;
      mocks.get.mockImplementation(
        async (url: string, options: { params?: { page: number } }) => {
          if (url.endsWith(failedEndpoint)) throw new Error('Hevy unavailable');
          return getSuccessfulPage(url, options);
        }
      );

      await expect(
        syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID)
      ).rejects.toThrow('Hevy unavailable');

      expect(mocks.processHevyUserInfo).not.toHaveBeenCalled();
      expect(mocks.processHevyWorkouts).not.toHaveBeenCalled();
      expect(syncUpdates()).toEqual([]);
    }
  );

  it('rejects a later workout page failure before replacing the first page', async () => {
    mockApi([{ page: 1, page_count: 2, workouts: [workout('workout-1')] }]);
    const getSuccessfulPage = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(
      async (url: string, options: { params?: { page: number } }) => {
        if (url.endsWith('/v1/workouts') && options.params?.page === 2) {
          throw new Error('Second page unavailable');
        }
        return getSuccessfulPage(url, options);
      }
    );

    await expect(
      syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID)
    ).rejects.toThrow('Second page unavailable');
    expect(mocks.processHevyWorkouts).not.toHaveBeenCalled();
    expect(syncUpdates()).toEqual([]);
  });

  it('continues when the optional user-info endpoint is unavailable', async () => {
    const getSuccessfulPage = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(
      async (url: string, options: { params?: { page: number } }) => {
        if (url.endsWith('/v1/user/info')) throw new Error('404 Not Found');
        return getSuccessfulPage(url, options);
      }
    );

    await expect(
      syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID)
    ).resolves.toMatchObject({
      success: true,
      processedCount: 1,
    });
    expect(mocks.processHevyUserInfo).not.toHaveBeenCalled();
    expect(mocks.processHevyWorkouts).toHaveBeenCalledOnce();
    expect(syncUpdates()).toHaveLength(1);
  });

  it('does not mark the provider synced when processing fails', async () => {
    mocks.processHevyWorkouts.mockRejectedValue(new Error('Import failed'));
    await expect(
      syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID)
    ).rejects.toThrow('Import failed');
    expect(syncUpdates()).toEqual([]);
  });

  it('uses the selected owner-scoped provider for credentials and its success timestamp', async () => {
    await syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID);

    expect(mocks.getSystemClient).not.toHaveBeenCalled();
    expect(mocks.getClient).toHaveBeenCalledWith(USER_ID);
    const [query, params] = syncUpdates()[0]!;
    expect(query).toContain('id = $1');
    expect(query).toContain('user_id = $2');
    expect(query).toContain("provider_type = 'hevy'");
    expect(params).toEqual([PROVIDER_ID, USER_ID]);
  });

  it('rejects an unknown selected provider without making Hevy requests', async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      syncHevyData(USER_ID, USER_ID, true, 'someone-elses-provider')
    ).rejects.toThrow('Hevy provider not found');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(syncUpdates()).toEqual([]);
  });

  it('filters a custom range by the user calendar day before processing', async () => {
    mocks.loadUserTimezone.mockResolvedValue('America/New_York');
    const before = workout('before', '2026-10-01T03:59:59Z');
    const first = workout('first', '2026-10-01T04:00:00Z');
    const last = workout('last', '2026-10-02T03:59:59Z');
    const after = workout('after', '2026-10-02T04:00:00Z');
    mockApi([
      { page: 1, page_count: 2, workouts: [after, last] },
      { page: 2, page_count: 2, workouts: [first, before] },
    ]);

    const result = await syncHevyData(
      USER_ID,
      USER_ID,
      false,
      PROVIDER_ID,
      '2026-10-01',
      '2026-10-01'
    );

    expect(mocks.processHevyWorkouts).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      [last, first],
      'America/New_York',
      [template]
    );
    expect(result.processedCount).toBe(2);
  });
});

describe('syncHevyData current-day completion', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T20:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {
      name: 'historical range',
      start: '2026-09-01',
      end: '2026-09-30',
      full: false,
      marksSuccess: false,
    },
    {
      name: 'past end without a start',
      start: null,
      end: '2026-10-31',
      full: false,
      marksSuccess: false,
    },
    {
      name: 'future start without an end',
      start: '2026-11-02',
      end: null,
      full: false,
      marksSuccess: false,
    },
    {
      name: 'default incremental window',
      start: null,
      end: null,
      full: false,
      marksSuccess: true,
    },
    {
      name: 'full history',
      start: null,
      end: null,
      full: true,
      marksSuccess: true,
    },
    {
      name: 'inclusive current-day bounds',
      start: '2026-11-01',
      end: '2026-11-01',
      full: false,
      marksSuccess: true,
    },
  ])(
    '$name only counts when it covers today',
    async ({ start, end, full, marksSuccess }) => {
      await expect(
        syncHevyData(USER_ID, USER_ID, full, PROVIDER_ID, start, end)
      ).resolves.toMatchObject({ success: true, source: 'live_api' });
      expect(syncUpdates()).toHaveLength(marksSuccess ? 1 : 0);
    }
  );

  it.each([
    {
      timezone: 'Europe/Berlin',
      now: '2026-11-01T23:30:00Z',
      marksSuccess: false,
    },
    {
      timezone: 'America/New_York',
      now: '2026-11-02T02:30:00Z',
      marksSuccess: true,
    },
  ])(
    'uses the current day in $timezone rather than UTC',
    async ({ timezone, now, marksSuccess }) => {
      vi.setSystemTime(new Date(now));
      mocks.loadUserTimezone.mockResolvedValue(timezone);
      await syncHevyData(
        USER_ID,
        USER_ID,
        false,
        PROVIDER_ID,
        '2026-11-01',
        '2026-11-01'
      );
      expect(syncUpdates()).toHaveLength(marksSuccess ? 1 : 0);
    }
  );
});

describe('syncHevyData error details', () => {
  const connectionFailure = () =>
    new AggregateError(
      [Object.assign(new Error(''), { code: 'ECONNREFUSED' })],
      ''
    );

  it('keeps the cause of an aggregate error in request and sync failure logs', async () => {
    const error = connectionFailure();
    mocks.get.mockRejectedValueOnce(error);
    await expect(
      syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID)
    ).rejects.toBe(error);
    expect(mocks.log).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(
        /Error fetching Hevy raw_workouts_page_1.*ECONNREFUSED/
      )
    );
    expect(mocks.log).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/Hevy synchronization failed.*ECONNREFUSED/)
    );
  });

  it('keeps the cause of an optional user-info error without failing the import', async () => {
    const getSuccessfulPage = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(
      async (url: string, options: { params?: { page: number } }) => {
        if (url.endsWith('/v1/user/info')) throw connectionFailure();
        return getSuccessfulPage(url, options);
      }
    );
    await expect(
      syncHevyData(USER_ID, USER_ID, true, PROVIDER_ID)
    ).resolves.toMatchObject({ success: true });
    expect(mocks.log).toHaveBeenCalledWith(
      'warn',
      expect.stringMatching(/Skipping optional Hevy user info.*ECONNREFUSED/)
    );
  });
});

describe('syncHevyData local replay', () => {
  it('replays saved template pages without advancing the live sync timestamp', async () => {
    mocks.loadRawBundle.mockReturnValue({
      last_updated: '2026-10-24T10:00:00Z',
      responses: {
        raw_workouts_page_1: { data: { workouts: [workout('workout-1')] } },
        raw_exercise_templates_page_1: {
          data: { exercise_templates: [template] },
        },
        raw_exercise_templates_page_2: {
          data: { exercise_templates: [secondTemplate] },
        },
      },
    });

    const result = await syncHevyData(
      USER_ID,
      USER_ID,
      true,
      PROVIDER_ID,
      null,
      null,
      'local'
    );

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.processHevyWorkouts).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      [workout('workout-1')],
      'Europe/Berlin',
      [template, secondTemplate]
    );
    expect(syncUpdates()).toHaveLength(0);
    expect(result).toMatchObject({
      success: true,
      processedCount: 1,
      source: 'local_raw_replay',
    });
  });

  it('supports legacy saved workouts without template pages', async () => {
    mocks.loadRawBundle.mockReturnValue({
      responses: {
        raw_workouts_page: { data: { workouts: [workout('legacy')] } },
      },
    });

    await syncHevyData(
      USER_ID,
      USER_ID,
      true,
      PROVIDER_ID,
      null,
      null,
      'local'
    );

    expect(mocks.processHevyWorkouts).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      [workout('legacy')],
      'Europe/Berlin',
      []
    );
  });

  it('applies the requested range to saved workouts before replay', async () => {
    mocks.loadRawBundle.mockReturnValue({
      responses: {
        raw_workouts_page_1: {
          data: {
            workouts: [
              workout('outside', '2026-10-22T12:00:00Z'),
              workout('inside'),
            ],
          },
        },
      },
    });

    const result = await syncHevyData(
      USER_ID,
      USER_ID,
      true,
      PROVIDER_ID,
      '2026-10-23',
      '2026-10-23',
      'local'
    );

    expect(mocks.processHevyWorkouts).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      [workout('inside')],
      'Europe/Berlin',
      []
    );
    expect(result.processedCount).toBe(1);
  });
});
