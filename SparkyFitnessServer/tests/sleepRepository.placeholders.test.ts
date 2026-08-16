import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import sleepRepository from '../models/sleepRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Placeholder-integrity guard for the hand-numbered SQL in sleepRepository:
// a miscounted $N corrupts every provider's sleep writes silently (values
// land in the wrong columns), so these tests pin placeholder count to param
// count and pin the recording-zone columns to their bound values.

const FULL_ENTRY = {
  entry_date: '2026-08-01',
  bedtime: new Date('2026-08-01T03:00:00Z'),
  wake_time: new Date('2026-08-01T11:00:00Z'),
  duration_in_seconds: 28800,
  time_asleep_in_seconds: 27000,
  sleep_score: 82,
  source: 'Health Connect',
  deep_sleep_seconds: 5400,
  light_sleep_seconds: 14400,
  rem_sleep_seconds: 5400,
  awake_sleep_seconds: 1800,
  average_spo2_value: 96,
  lowest_spo2_value: 91,
  highest_spo2_value: 99,
  average_respiration_value: 14,
  lowest_respiration_value: 12,
  highest_respiration_value: 17,
  awake_count: 2,
  avg_sleep_stress: 18,
  restless_moments_count: 5,
  avg_overnight_hrv: 52,
  body_battery_change: 40,
  resting_heart_rate: 54,
  record_timezone: 'America/New_York',
  record_utc_offset_minutes: -300,
};

const maxPlaceholder = (sql: string): number => {
  const matches = sql.match(/\$(\d+)/g) || [];
  return matches.reduce((max, m) => Math.max(max, Number(m.slice(1))), 0);
};

const distinctPlaceholders = (sql: string): number =>
  new Set(sql.match(/\$(\d+)/g) || []).size;

// Returns the param bound to `column = $N` (or `column = COALESCE($N, ...)`)
// in an UPDATE without building a dynamic RegExp
// (security/detect-non-literal-regexp).
const boundValueFor = (
  sql: string,
  values: unknown[],
  column: string
): unknown => {
  for (const marker of [`${column} = $`, `${column} = COALESCE($`]) {
    const at = sql.indexOf(marker);
    if (at !== -1) {
      const digits = sql.slice(at + marker.length).match(/^\d+/);
      expect(digits).toBeTruthy();
      return values[Number(digits![0]) - 1];
    }
  }
  throw new Error(`expected "${column} = $N" in the UPDATE`);
};

describe('sleepRepository placeholder integrity', () => {
  let mockClient: MockDbClient;

  const queryCalls = (): Array<{ text: string; values?: unknown[] }> =>
    mockClient.query.mock.calls.map((call) => ({
      text: call[0],
      values: call[1],
    }));

  const findCall = (fragment: string) => {
    const call = queryCalls().find((c) => c.text.includes(fragment));
    expect(call, `expected a query containing "${fragment}"`).toBeDefined();
    return call!;
  };

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('upsertSleepEntry INSERT: placeholders, columns, and params line up', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      return { rows: [] }; // existing-entry check finds nothing
    });

    await sleepRepository.upsertSleepEntry('user-1', 'user-1', FULL_ENTRY);

    const insert = findCall('INSERT INTO sleep_entries');
    const columns = insert.text
      .slice(insert.text.indexOf('(') + 1, insert.text.indexOf(')'))
      .split(',')
      .map((c) => c.trim());

    expect(columns.length).toBe(insert.values!.length);
    expect(distinctPlaceholders(insert.text)).toBe(insert.values!.length);
    expect(maxPlaceholder(insert.text)).toBe(insert.values!.length);

    expect(insert.values![columns.indexOf('record_timezone')]).toBe(
      'America/New_York'
    );
    expect(insert.values![columns.indexOf('record_utc_offset_minutes')]).toBe(
      -300
    );
    // Spot-check a neighbor to catch off-by-one shifts.
    expect(insert.values![columns.indexOf('resting_heart_rate')]).toBe(54);
  });

  it('upsertSleepEntry UPDATE: placeholders and zone-column bindings line up', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT id FROM sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      if (text.includes('UPDATE sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      return { rows: [] };
    });

    await sleepRepository.upsertSleepEntry('user-1', 'user-1', FULL_ENTRY);

    const update = findCall('UPDATE sleep_entries');
    expect(distinctPlaceholders(update.text)).toBe(update.values!.length);
    expect(maxPlaceholder(update.text)).toBe(update.values!.length);

    expect(boundValueFor(update.text, update.values!, 'record_timezone')).toBe(
      'America/New_York'
    );
    expect(
      boundValueFor(update.text, update.values!, 'record_utc_offset_minutes')
    ).toBe(-300);
    expect(
      boundValueFor(update.text, update.values!, 'resting_heart_rate')
    ).toBe(54);
  });

  it('upsertSleepEntry UPDATE preserves stored zone metadata when the payload omits it', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT id FROM sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      if (text.includes('UPDATE sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      return { rows: [] };
    });

    const {
      record_timezone: _tz,
      record_utc_offset_minutes: _offset,
      ...zonelessEntry
    } = FULL_ENTRY;
    await sleepRepository.upsertSleepEntry('user-1', 'user-1', zonelessEntry);

    const update = findCall('UPDATE sleep_entries');
    // A metadata-less re-sync (older client, provider fallback branch) binds
    // NULL for both zone params; COALESCE keeps the stored values instead of
    // erasing them.
    expect(update.text).toContain('record_timezone = COALESCE(');
    expect(update.text).toContain('record_utc_offset_minutes = COALESCE(');
    expect(
      boundValueFor(update.text, update.values!, 'record_timezone')
    ).toBeUndefined();
    expect(
      boundValueFor(update.text, update.values!, 'record_utc_offset_minutes')
    ).toBeUndefined();
  });

  it('updateSleepEntry dynamic builder: zone fields update when present', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('UPDATE sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      return { rows: [] };
    });

    await sleepRepository.updateSleepEntry('user-1', 'sleep-1', 'acting-1', {
      record_timezone: 'Asia/Tokyo',
      record_utc_offset_minutes: 540,
    });

    const update = findCall('UPDATE sleep_entries');
    expect(distinctPlaceholders(update.text)).toBe(update.values!.length);
    expect(maxPlaceholder(update.text)).toBe(update.values!.length);

    expect(boundValueFor(update.text, update.values!, 'record_timezone')).toBe(
      'Asia/Tokyo'
    );
    expect(
      boundValueFor(update.text, update.values!, 'record_utc_offset_minutes')
    ).toBe(540);
  });

  it('updateSleepEntry dynamic builder: omitted zone fields stay untouched', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('UPDATE sleep_entries')) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      return { rows: [] };
    });

    await sleepRepository.updateSleepEntry('user-1', 'sleep-1', 'acting-1', {
      duration_in_seconds: 25200,
    });

    const update = findCall('UPDATE sleep_entries');
    expect(update.text).not.toContain('record_timezone');
    expect(update.text).not.toContain('record_utc_offset_minutes');
    expect(distinctPlaceholders(update.text)).toBe(update.values!.length);
  });
});
