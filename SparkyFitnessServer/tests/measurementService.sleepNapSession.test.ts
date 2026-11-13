import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementService from '../services/measurementService.js';
import sleepRepository from '../models/sleepRepository.js';
import userRepository from '../models/userRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exerciseRepository');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// #3240: a nap on the night's entry_date and source gets its own entry, and the
// copy of its stages an earlier sync merged into the night's entry is removed.
describe('processSleepEntry nap session (#3240)', () => {
  const userId = 'user-nap';

  const stage = (stage_type: string, start: string, end: string) => ({
    stage_type,
    start_time: start,
    end_time: end,
    duration_in_seconds:
      (new Date(end).getTime() - new Date(start).getTime()) / 1000,
  });

  const nightStages = [
    stage('light', '2026-10-27T23:00:00.000Z', '2026-10-28T03:00:00.000Z'),
    stage('deep', '2026-10-28T03:00:00.000Z', '2026-10-28T07:00:00.000Z'),
  ];
  const napStages = [
    stage('light', '2026-10-28T13:30:00.000Z', '2026-10-28T14:15:00.000Z'),
  ];

  const nap = {
    entry_date: '2026-10-28',
    bedtime: '2026-10-28T13:30:00.000Z',
    wake_time: '2026-10-28T14:15:00.000Z',
    duration_in_seconds: 2700,
    source: 'HealthKit',
    stage_events: napStages,
  };

  const storedStages = new Map<string, ReturnType<typeof stage>[]>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    userRepository.getUserProfile = vi.fn().mockResolvedValue(null);
    storedStages.clear();
    sleepRepository.mergeSleepStageEvents = vi
      .fn()
      .mockImplementation(
        async (_uid: string, entryId: string, stages: typeof napStages) => {
          storedStages.set(entryId, [
            ...(storedStages.get(entryId) ?? []),
            ...stages,
          ]);
          return [];
        }
      );
    sleepRepository.getSleepStageEventsByEntryId = vi
      .fn()
      .mockImplementation(
        async (_uid: string, entryId: string) => storedStages.get(entryId) ?? []
      );
    sleepRepository.updateSleepEntryAggregates = vi.fn().mockResolvedValue({});
  });

  it('removes a new session’s stages from the night and recomputes the night', async () => {
    // The night as an earlier sync left it: the nap merged in.
    storedStages.set('entry-night', [...nightStages, ...napStages]);
    sleepRepository.upsertSleepEntry = vi
      .fn()
      .mockResolvedValue({ id: 'entry-nap', created: true });
    sleepRepository.removeSessionStagesFromSiblingEntries = vi
      .fn()
      .mockImplementation(async () => {
        storedStages.set('entry-night', nightStages);
        return ['entry-night'];
      });

    const result = await measurementService.processSleepEntry(
      userId,
      userId,
      nap
    );

    expect(
      sleepRepository.removeSessionStagesFromSiblingEntries
    ).toHaveBeenCalledWith(
      userId,
      'entry-nap',
      '2026-10-28',
      'HealthKit',
      '2026-10-28T13:30:00.000Z',
      '2026-10-28T14:15:00.000Z'
    );
    expect(result).toMatchObject({
      id: 'entry-nap',
      time_asleep_in_seconds: 2700,
    });
    expect(result).not.toHaveProperty('created');
    const updates = vi.mocked(sleepRepository.updateSleepEntryAggregates).mock
      .calls;
    expect(updates.map((call) => call[1])).toEqual([
      'entry-nap',
      'entry-night',
    ]);
    expect(updates[1][3]).toMatchObject({
      bedtime: new Date('2026-10-27T23:00:00.000Z'),
      wake_time: new Date('2026-10-28T07:00:00.000Z'),
      time_asleep_in_seconds: 8 * 3600,
    });
  });

  it('deletes an entry left with no stages instead of blanking its times', async () => {
    storedStages.set('entry-copy', [...napStages]);
    sleepRepository.upsertSleepEntry = vi
      .fn()
      .mockResolvedValue({ id: 'entry-nap', created: true });
    sleepRepository.removeSessionStagesFromSiblingEntries = vi
      .fn()
      .mockImplementation(async () => {
        storedStages.delete('entry-copy');
        return ['entry-copy'];
      });
    sleepRepository.deleteSleepEntryIfEmpty = vi.fn().mockResolvedValue(true);

    await measurementService.processSleepEntry(userId, userId, nap);

    expect(sleepRepository.deleteSleepEntryIfEmpty).toHaveBeenCalledWith(
      userId,
      'entry-copy'
    );
    const updated = vi
      .mocked(sleepRepository.updateSleepEntryAggregates)
      .mock.calls.map((call) => call[1]);
    expect(updated).toEqual(['entry-nap']);
  });

  it('leaves other entries alone when the write updated a stored session', async () => {
    sleepRepository.upsertSleepEntry = vi
      .fn()
      .mockResolvedValue({ id: 'entry-nap', created: false });
    sleepRepository.removeSessionStagesFromSiblingEntries = vi.fn();

    await measurementService.processSleepEntry(userId, userId, nap);

    expect(
      sleepRepository.removeSessionStagesFromSiblingEntries
    ).not.toHaveBeenCalled();
    expect(sleepRepository.updateSleepEntryAggregates).toHaveBeenCalledTimes(1);
  });
});
