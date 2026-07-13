import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Encoder, Profile, Utils } from '@garmin/fitsdk';
import { getClient } from '../db/poolManager.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import { getOrCreateGarminExercise } from '../services/garminService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { importFitFiles } from '../services/fitImportService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    _createExerciseEntryWithClient: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({
  default: {
    _createActivityDetailWithClient: vi.fn(),
    _deleteActivityDetailsByEntryIdAndProviderWithClient: vi.fn(),
  },
}));
vi.mock('../services/garminService', () => ({
  getOrCreateGarminExercise: vi.fn(),
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));

const FIXTURE_BUFFER = readFileSync(
  new URL('./fixtures/tennis-activity.fit', import.meta.url)
);

/** Minimal valid FIT file built in-test; sessions param pins rejection paths. */
function encodeMinimalFit(sessionCount: number, withActivityMesg = false) {
  const start = new Date('2026-01-15T02:00:00Z');
  const encoder = new Encoder();
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'garmin',
    serialNumber: 99,
    timeCreated: Utils.convertDateToDateTime(start),
  });
  for (let i = 0; i < sessionCount; i++) {
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.SESSION,
      timestamp: Utils.convertDateToDateTime(start),
      startTime: Utils.convertDateToDateTime(start),
      totalTimerTime: 600,
      totalCalories: 100,
      sport: 'tennis',
      messageIndex: i,
    });
  }
  if (withActivityMesg) {
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.ACTIVITY,
      timestamp: Utils.convertDateToDateTime(start),
      localTimestamp: Utils.convertDateToDateTime(
        new Date(start.getTime() - 3 * 60 * 60 * 1000)
      ),
      numSessions: sessionCount,
    });
  }
  return Buffer.from(encoder.close());
}

const mockClient = { query: vi.fn(), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(mockClient);
  vi.mocked(
    exerciseEntryRepository._createExerciseEntryWithClient
  ).mockResolvedValue({ entry: { id: 'entry-1' }, operation: 'created' });
  vi.mocked(
    activityDetailsRepository._createActivityDetailWithClient
  ).mockResolvedValue({ id: 'detail-1' });
  vi.mocked(
    activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient
  ).mockResolvedValue({ message: 'ok' });
  vi.mocked(getOrCreateGarminExercise).mockResolvedValue({ id: 'exercise-1' });
  vi.mocked(loadUserTimezone).mockResolvedValue('America/New_York');
});

function fixtureFile(name = 'tennis.fit') {
  return { originalname: name, buffer: FIXTURE_BUFFER };
}

describe('importFitFiles', () => {
  it('imports a valid file inside one transaction with garmin_fit everywhere', async () => {
    const response = await importFitFiles('user-1', 'actor-1', [fixtureFile()]);

    expect(response).toMatchObject({ created: 1, updated: 0, failed: 0 });
    expect(response.results[0]).toEqual({
      fileName: 'tennis.fit',
      status: 'created',
      exerciseEntryId: 'entry-1',
      entryDate: '2026-01-14',
      activityName: 'Synthetic Tennis',
      sport: 'tennis',
    });

    expect(getClient).toHaveBeenCalledWith('user-1', 'actor-1');
    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      'user-1',
      expect.objectContaining({
        exercise_id: 'exercise-1',
        entry_date: '2026-01-14',
        source_id: expect.stringMatching(/^1234567890_/),
        calories_burned: 850,
      }),
      'actor-1',
      'garmin_fit'
    );
    expect(
      activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient
    ).toHaveBeenCalledWith(mockClient, 'user-1', 'entry-1', 'garmin_fit');
    expect(
      activityDetailsRepository._createActivityDetailWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        exercise_entry_id: 'entry-1',
        provider_name: 'garmin_fit',
        detail_type: 'full_activity_data',
        created_by_user_id: 'actor-1',
        updated_by_user_id: 'actor-1',
      })
    );
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('reports updated when the repository deduplicates on source_id', async () => {
    vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mockResolvedValue({ entry: { id: 'entry-1' }, operation: 'updated' });

    const response = await importFitFiles('user-1', 'actor-1', [fixtureFile()]);
    expect(response).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(response.results[0].status).toBe('updated');
  });

  it('isolates per-file failures and keeps importing the rest of the batch', async () => {
    const response = await importFitFiles('user-1', 'actor-1', [
      { originalname: 'notes.txt', buffer: Buffer.from('hello') },
      { originalname: 'corrupt.fit', buffer: Buffer.from('not really fit') },
      { originalname: 'multi.fit', buffer: encodeMinimalFit(2) },
      fixtureFile('good.fit'),
    ]);

    expect(response).toMatchObject({ created: 1, updated: 0, failed: 3 });
    expect(response.message).toBe('Imported 1 of 4 FIT file(s).');
    const [txt, corrupt, multi, good] = response.results;
    expect(txt).toMatchObject({
      status: 'failed',
      reason: 'Only .fit files are supported.',
    });
    expect(corrupt).toMatchObject({
      status: 'failed',
      reason: 'Not a FIT file.',
    });
    expect(multi.status).toBe('failed');
    expect(multi.reason).toMatch(/multi-session/i);
    expect(good.status).toBe('created');
  });

  it('rolls back the transaction when the detail write fails', async () => {
    vi.mocked(activityDetailsRepository._createActivityDetailWithClient)
      .mockRejectedValueOnce(new Error('detail insert failed'))
      .mockResolvedValue({ id: 'detail-1' });

    const response = await importFitFiles('user-1', 'actor-1', [
      fixtureFile('first.fit'),
      fixtureFile('second.fit'),
    ]);

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(response.results[0]).toMatchObject({
      status: 'failed',
      reason: 'detail insert failed',
    });
    // The failed transaction never poisons the next file.
    expect(response.results[1].status).toBe('created');
    expect(mockClient.release).toHaveBeenCalledTimes(2);
  });

  it('falls back to the profile timezone when the file has no local time', async () => {
    const response = await importFitFiles('user-1', 'actor-1', [
      { originalname: 'nolocal.fit', buffer: encodeMinimalFit(1) },
    ]);

    expect(loadUserTimezone).toHaveBeenCalledWith('user-1');
    // 2026-01-15T02:00Z is still Jan 14 in America/New_York.
    expect(response.results[0]).toMatchObject({
      status: 'created',
      entryDate: '2026-01-14',
    });
    expect(response.results[0].warning).toMatch(/profile timezone/);
  });

  it('finds or creates the shared Garmin exercise from the sport key', async () => {
    await importFitFiles('user-1', 'actor-1', [fixtureFile()]);
    expect(getOrCreateGarminExercise).toHaveBeenCalledWith(
      'user-1',
      'tennis',
      'tennis'
    );
  });
});
