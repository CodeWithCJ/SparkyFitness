import { beforeEach, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import repository from '../models/measurementRepository.js';
import service from '../services/measurementService.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({ loadUserTimezone: vi.fn() }));
const query = vi.fn();
const release = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as Awaited<ReturnType<typeof getClient>>);
  vi.mocked(loadUserTimezone).mockResolvedValue('America/New_York');
});

it('reads one actual local day with actor context, retaining source and a differing imported date', async () => {
  const row = {
    entry_date: '2026-11-04',
    entry_timestamp: '2026-11-04T00:00:00Z',
    source: 'dexcom-api',
    value: '100',
  };
  query.mockResolvedValue({ rows: [row] });
  await expect(
    service.getCustomMeasurementTimelineEntries('actor', 'owner', '2026-11-03')
  ).resolves.toEqual([row]);
  expect(getClient).toHaveBeenCalledWith('owner', 'actor');
  const [sql, params] = query.mock.calls[0];
  expect(sql).toContain('cm.entry_timestamp >= $2 AND cm.entry_timestamp < $3');
  expect(sql).not.toContain('cm.entry_date =');
  expect(params).toEqual([
    'owner',
    new Date('2026-11-03T05:00:00Z'),
    new Date('2026-11-04T05:00:00Z'),
  ]);
  expect(release).toHaveBeenCalledTimes(1);
});

it('uses a 25-hour timestamp window on fallback days', async () => {
  query.mockResolvedValue({ rows: [] });
  await service.getCustomMeasurementTimelineEntries(
    'owner',
    'owner',
    '2026-11-01'
  );
  expect(query.mock.calls[0][1]).toEqual([
    'owner',
    new Date('2026-11-01T04:00:00Z'),
    new Date('2026-11-02T05:00:00Z'),
  ]);
});

it('releases the actor-scoped connection when a query fails', async () => {
  query.mockRejectedValue(new Error('denied'));
  await expect(
    repository.getCustomMeasurementTimelineEntries(
      'owner',
      'actor',
      new Date(),
      new Date()
    )
  ).rejects.toThrow('denied');
  expect(release).toHaveBeenCalledTimes(1);
});
