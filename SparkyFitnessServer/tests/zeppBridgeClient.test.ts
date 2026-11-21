import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  ZeppBridgeError,
  fetchZeppBridgeInfo,
  fetchZeppBridgeWorkoutDetail,
  pullZeppBridgeRecords,
  splitDayRange,
  type ZeppBridgeConnection,
} from '../integrations/zeppbridge/zeppBridgeClient.js';
import type { ZeppBridgeRecordSet } from '../integrations/zeppbridge/zeppBridgeTypes.js';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

function connectionWith(fetchMock: ReturnType<typeof vi.fn>) {
  return {
    baseUrl: 'http://serve:43921',
    token: 'secret-pull-token',
    fetch: fetchMock as unknown as typeof fetch,
  } satisfies ZeppBridgeConnection;
}

const page = (records: unknown[], next: string | null = null) => ({
  records_version: 'zeppbridge.records.v2',
  next_cursor: next,
  records,
});

describe('splitDayRange', () => {
  it('keeps a short range in one span', () => {
    expect(splitDayRange('2026-11-01', '2026-11-07')).toEqual([
      { from: '2026-11-01', to: '2026-11-07' },
    ]);
  });

  it('cuts a long range into spans of at most 92 days', () => {
    const spans = splitDayRange('2026-01-01', '2026-12-31');
    expect(spans[0]).toEqual({ from: '2026-01-01', to: '2026-04-02' });
    expect(spans[spans.length - 1]!.to).toBe('2026-12-31');
    expect(spans.length).toBe(4);
  });
});

describe('fetchZeppBridgeInfo', () => {
  it('sends the bearer token and accepts a supported record format', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ version: '3.2.1', records_version: 'zeppbridge.records.v2' })
      );
    const info = await fetchZeppBridgeInfo(connectionWith(fetchMock));

    expect(info.version).toBe('3.2.1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://serve:43921/v1');
    expect(init.headers.Authorization).toBe('Bearer secret-pull-token');
  });

  it('refuses a newer record format than SparkyFitness understands', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ version: '9.0.0', records_version: 'zeppbridge.records.v3' })
      );
    await expect(
      fetchZeppBridgeInfo(connectionWith(fetchMock))
    ).rejects.toMatchObject({ code: 'records_version_unsupported' });
  });

  it('turns a 401 into an error carrying the status, never the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        {
          error: { code: 'unauthorized', message: 'Missing or wrong token' },
        },
        { status: 401 }
      )
    );
    const error = await fetchZeppBridgeInfo(connectionWith(fetchMock)).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(ZeppBridgeError);
    expect((error as ZeppBridgeError).status).toBe(401);
    expect((error as Error).message).not.toContain('secret-pull-token');
  });

  it('says so when the address answers 200 with something that is not JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('<html>router login</html>', { status: 200 })
      );
    await expect(
      fetchZeppBridgeInfo(connectionWith(fetchMock))
    ).rejects.toMatchObject({ code: 'not_zeppbridge', status: 0 });
  });

  it('reports an unreachable server without the URL or headers', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const error = await fetchZeppBridgeInfo(connectionWith(fetchMock)).catch(
      (e: unknown) => e
    );
    expect((error as ZeppBridgeError).status).toBe(0);
    expect((error as Error).message).toContain('ECONNREFUSED');
    expect((error as Error).message).not.toContain('secret-pull-token');
  });
});

describe('pullZeppBridgeRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('follows the cursor and sorts records by kind, counting unusable ones', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          page(
            [
              {
                record_type: 'sleep_session',
                start_time: '2026-11-01T23:00:00+02:00',
                end_time: '2026-11-02T07:00:00+02:00',
              },
              { record_type: 'life_event', id: 'x' },
              { record_type: 'workout', workout_id: 1 },
            ],
            'cursor-1'
          )
        )
      )
      .mockResolvedValueOnce(
        json(
          page([
            {
              record_type: 'daily_metric',
              date: '2026-11-02',
              metric: 'steps',
              value: 9000,
            },
          ])
        )
      );
    const spans: ZeppBridgeRecordSet[] = [];
    await pullZeppBridgeRecords(
      connectionWith(fetchMock),
      '2026-11-01',
      '2026-11-07',
      async (records) => {
        spans.push(records);
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('cursor=cursor-1');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.sleep).toHaveLength(1);
    expect(spans[0]!.dailyMetrics).toHaveLength(1);
    // The life event is a kind we do not import; the workout has no start_time.
    expect(spans[0]!.skipped).toBe(1);
    expect(spans[0]!.invalid).toBe(1);
  });

  it('restarts a span without a cursor when the snapshot expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(page([], 'cursor-1')))
      .mockResolvedValueOnce(
        json(
          { error: { code: 'cursor_expired', message: 'expired' } },
          { status: 409 }
        )
      )
      .mockResolvedValueOnce(json(page([])));
    await pullZeppBridgeRecords(
      connectionWith(fetchMock),
      '2026-11-01',
      '2026-11-02',
      async () => {}
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]![0])).not.toContain('cursor=');
  });

  it('waits out a 429 using Retry-After, then continues', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429, headers: { 'retry-after': '2' } }
        )
      )
      .mockResolvedValueOnce(json(page([])));
    const pulled = pullZeppBridgeRecords(
      connectionWith(fetchMock),
      '2026-11-01',
      '2026-11-02',
      async () => {}
    );
    await vi.advanceTimersByTimeAsync(2000);
    await pulled;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails with the status when the library is unavailable (503)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json(
          { error: { code: 'local_data_unavailable', message: 'busy' } },
          { status: 503 }
        )
      );
    await expect(
      pullZeppBridgeRecords(
        connectionWith(fetchMock),
        '2026-11-01',
        '2026-11-02',
        async () => {}
      )
    ).rejects.toMatchObject({ status: 503, code: 'local_data_unavailable' });
  });

  it('rejects a page with a newer record format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        records_version: 'zeppbridge.records.v3',
        next_cursor: null,
        records: [],
      })
    );
    await expect(
      pullZeppBridgeRecords(
        connectionWith(fetchMock),
        '2026-11-01',
        '2026-11-02',
        async () => {}
      )
    ).rejects.toMatchObject({ code: 'records_version_unsupported' });
  });
});

describe('fetchZeppBridgeWorkoutDetail', () => {
  it('asks for a day range of workouts with full detail and GPS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        page([
          {
            record_type: 'workout',
            workout_id: 'w-1',
            start_time: '2026-11-03T07:30:00+02:00',
            route_point_count: 2,
            route: [{ timestamp: '2026-11-03T07:30:01+02:00' }],
          },
        ])
      )
    );
    const workouts = await fetchZeppBridgeWorkoutDetail(
      connectionWith(fetchMock),
      '2026-11-02',
      '2026-11-04'
    );

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('from')).toBe('2026-11-02');
    expect(url.searchParams.get('to')).toBe('2026-11-04');
    expect(url.searchParams.get('types')).toBe('workouts');
    expect(url.searchParams.get('detail')).toBe('full');
    expect(url.searchParams.get('include_gps')).toBe('true');
    expect(workouts).toHaveLength(1);
    expect(workouts[0]!.route).toHaveLength(1);
  });
});
