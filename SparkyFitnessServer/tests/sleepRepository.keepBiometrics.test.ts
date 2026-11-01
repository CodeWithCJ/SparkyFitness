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

const ENTRY = {
  entry_date: '2026-08-01',
  bedtime: new Date('2026-08-01T03:00:00Z'),
  wake_time: new Date('2026-08-01T11:00:00Z'),
  duration_in_seconds: 28800,
  time_asleep_in_seconds: 27000,
  source: 'GoogleHealth',
  avg_overnight_hrv: null,
  resting_heart_rate: null,
};

describe('upsertSleepEntry keepExistingBiometrics', () => {
  let mockClient: MockDbClient;

  const run = async (
    data: Parameters<typeof sleepRepository.upsertSleepEntry>[2],
    options?: { keepExistingBiometrics?: boolean },
    storedSessionId?: string
  ) => {
    // Forget earlier runs so the lookup below only sees this invocation.
    mockClient.query.mockClear();
    mockClient.query.mockImplementation(async (text: string) => {
      if (storedSessionId && text.includes('FOR UPDATE')) {
        return { rows: [{ id: storedSessionId }] };
      }
      if (
        text.includes('INSERT INTO sleep_entries') ||
        text.includes('UPDATE sleep_entries')
      ) {
        return { rows: [{ id: 'sleep-1' }] };
      }
      return { rows: [] };
    });
    await sleepRepository.upsertSleepEntry('user-1', 'user-1', data, options);
    const call = mockClient.query.mock.calls.find(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0].includes('INSERT INTO sleep_entries') ||
          c[0].includes('UPDATE sleep_entries'))
    )!;
    return { text: call[0] as string, values: call[1] as unknown[] };
  };

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('a new session inserts the incoming biometrics as they are', async () => {
    const { text } = await run(ENTRY, { keepExistingBiometrics: true });
    expect(text).toContain('INSERT INTO sleep_entries');
    expect(text).not.toContain('ON CONFLICT');
  });

  it('default id-UPDATE assigns the incoming biometrics directly', async () => {
    const { text } = await run({ ...ENTRY, id: 'sleep-1' });
    expect(text).toMatch(/avg_overnight_hrv = \$23,/);
    expect(text).toMatch(/resting_heart_rate = \$25,/);
  });

  it('keep flag: a re-sync of a stored session coalesces with the stored values', async () => {
    const { text, values } = await run(
      ENTRY,
      { keepExistingBiometrics: true },
      'sleep-1'
    );
    expect(text).toContain('UPDATE sleep_entries');
    expect(values[0]).toBe('sleep-1');
    expect(text).toMatch(
      /avg_overnight_hrv = COALESCE\(\$23, sleep_entries\.avg_overnight_hrv\)/
    );
    expect(text).toMatch(
      /resting_heart_rate = COALESCE\(\$25, sleep_entries\.resting_heart_rate\)/
    );
  });

  it('keep flag: id-UPDATE coalesces with the stored values', async () => {
    const { text } = await run(
      { ...ENTRY, id: 'sleep-1' },
      { keepExistingBiometrics: true }
    );
    expect(text).toMatch(
      /avg_overnight_hrv = COALESCE\(\$23, sleep_entries\.avg_overnight_hrv\)/
    );
    expect(text).toMatch(
      /resting_heart_rate = COALESCE\(\$25, sleep_entries\.resting_heart_rate\)/
    );
  });

  it('binds identical parameter values in both modes', async () => {
    const withBiometrics = {
      ...ENTRY,
      avg_overnight_hrv: 42,
      resting_heart_rate: 55,
    };
    const cases = [
      { data: withBiometrics, statement: 'INSERT INTO sleep_entries' },
      {
        data: { ...withBiometrics, id: 'sleep-1' },
        statement: 'UPDATE sleep_entries',
      },
    ];
    for (const { data, statement } of cases) {
      const def = await run(data);
      const keep = await run(data, { keepExistingBiometrics: true });
      expect(def.text).toContain(statement);
      expect(keep.text).toContain(statement);
      expect(def.values).toContain(42);
      expect(def.values).toContain(55);
      expect(keep.values).toEqual(def.values);
    }
  });
});
