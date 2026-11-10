/**
 * #1995 phase 1: server-backed workout session lifecycle.
 *
 * Covers the three moving parts:
 * 1. deriveWorkoutSessionStatus — the shared derivation that turns persisted
 *    set completion plus finished_at into planned/in_progress/partial/completed.
 * 2. The request/response schemas — finished_at on create, finished_at +
 *    revision on update, status required on responses.
 * 3. updateGroupedWorkoutSession — the optimistic-concurrency 409 and the
 *    finished_at pass-through into the repository write.
 */
import { vi, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getClient } from '../db/poolManager.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import { getGroupedExerciseSessionByIdWithClient } from '../services/exerciseEntryHistoryService.js';
import exerciseService from '../services/exerciseService.js';
import {
  createPresetSessionRequestSchema,
  updatePresetSessionRequestSchema,
  presetSessionResponseSchema,
} from '@workspace/shared';
import {
  deriveWorkoutSessionStatus,
  WORKOUT_SESSION_STATUSES,
} from '@workspace/shared';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({
  default: {
    getExerciseById: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    _createExerciseEntryWithClient: vi.fn(),
    _updateExerciseEntryWithClient: vi.fn(),
    _deleteExerciseEntryWithClient: vi.fn(),
    _reconcileExerciseEntrySetsWithClient: vi.fn(),
    deleteExerciseEntriesByPresetEntryIdWithClient: vi.fn(),
    updateExerciseEntriesDateByPresetEntryIdWithClient: vi.fn(),
    getWorkoutPlanAssignmentIdByPresetEntryIdWithClient: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    createExercisePresetEntryWithClient: vi.fn(),
    updateExercisePresetEntryWithClient: vi.fn(),
    getExercisePresetEntryById: vi.fn(),
  },
}));
vi.mock('../models/userRepository', () => ({}));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({
  default: {
    getWorkoutPresetById: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
vi.mock('../integrations/wger/wgerService', () => ({}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({}));
vi.mock('../models/measurementRepository', () => ({}));
vi.mock('../utils/imageDownloader', () => ({
  downloadImage: vi.fn(),
}));
vi.mock('../services/CalorieCalculationService', () => ({
  default: {
    estimateCaloriesBurnedPerHour: vi.fn(),
  },
}));
vi.mock('../utils/uuidUtils', () => ({
  isValidUuid: vi.fn(),
  resolveExerciseIdToUuid: vi.fn(),
}));
vi.mock('../models/familyAccessRepository', () => ({
  checkFamilyAccessPermission: vi.fn(),
}));
vi.mock('../services/exerciseEntryHistoryService', () => ({
  getGroupedExerciseSessionById: vi.fn(),
  getGroupedExerciseSessionByIdWithClient: vi.fn(),
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  getHrZonesForExerciseEntryWithClient: vi.fn().mockResolvedValue([]),
  _bulkInsertExerciseEntryHrZonesWithClient: vi.fn().mockResolvedValue([]),
}));

const FINISHED = '2026-11-10T18:30:00.000Z';
const set = (completed: boolean) => ({
  completed_at: completed ? FINISHED : null,
});

describe('deriveWorkoutSessionStatus', () => {
  it('exposes exactly the four issue statuses', () => {
    expect([...WORKOUT_SESSION_STATUSES]).toEqual([
      'planned',
      'in_progress',
      'partial',
      'completed',
    ]);
  });

  it('derives planned for an untouched plan-generated session', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'Workout Plan',
        finishedAt: null,
        hasPlanAssignment: true,
        sets: [set(false), set(false)],
      })
    ).toBe('planned');
  });

  it('derives planned for a plan-linked session regardless of source label', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'sparky',
        finishedAt: null,
        hasPlanAssignment: true,
        sets: [set(false)],
      })
    ).toBe('planned');
  });

  it('derives in_progress once any set is checked off and not finished', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'Workout Plan',
        finishedAt: null,
        hasPlanAssignment: true,
        sets: [set(true), set(false)],
      })
    ).toBe('in_progress');
  });

  it('derives in_progress for an untouched live-started session', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'sparky',
        finishedAt: null,
        hasPlanAssignment: false,
        sets: [set(false)],
      })
    ).toBe('in_progress');
  });

  it('derives completed when finished with every set checked off', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'sparky',
        finishedAt: FINISHED,
        hasPlanAssignment: false,
        sets: [set(true), set(true)],
      })
    ).toBe('completed');
  });

  it('derives partial when finished with unchecked sets', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'sparky',
        finishedAt: FINISHED,
        hasPlanAssignment: false,
        sets: [set(true), set(false)],
      })
    ).toBe('partial');
  });

  it('derives completed for manually logged sessions by definition', () => {
    expect(
      deriveWorkoutSessionStatus({
        source: 'manual',
        finishedAt: null,
        hasPlanAssignment: false,
        sets: [set(false), set(false)],
      })
    ).toBe('completed');
    expect(
      deriveWorkoutSessionStatus({
        source: 'Garmin',
        finishedAt: null,
        hasPlanAssignment: false,
        sets: [],
      })
    ).toBe('completed');
  });
});

describe('lifecycle request schemas', () => {
  it('create accepts a finished_at stamp (web playback saves once)', () => {
    const parsed = createPresetSessionRequestSchema.parse({
      workout_preset_id: 42,
      entry_date: '2026-11-10',
      source: 'sparky',
      finished_at: FINISHED,
    });
    expect(parsed.finished_at).toBe(FINISHED);
  });

  it('update accepts finished_at and revision together', () => {
    const parsed = updatePresetSessionRequestSchema.parse({
      finished_at: null,
      revision: 3,
    });
    expect(parsed.finished_at).toBeNull();
    expect(parsed.revision).toBe(3);
  });

  it('update rejects an empty payload', () => {
    expect(() => updatePresetSessionRequestSchema.parse({})).toThrow();
  });

  it('preset session responses must carry a status', () => {
    const base = {
      type: 'preset',
      id: 'preset-entry-1',
      entry_date: '2026-11-10',
      workout_preset_id: null,
      name: 'Evening Workout',
      description: null,
      notes: null,
      source: 'sparky',
      status: 'partial',
      total_duration_minutes: 30,
      exercises: [],
      activity_details: [],
    };
    expect(presetSessionResponseSchema.parse(base).status).toBe('partial');
    const { status: _status, ...withoutStatus } = base;
    expect(() => presetSessionResponseSchema.parse(withoutStatus)).toThrow();
  });
});

describe('updateGroupedWorkoutSession lifecycle writes', () => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const existingSession = {
    type: 'preset',
    id: 'preset-entry-1',
    entry_date: '2026-11-10',
    workout_preset_id: null,
    name: 'Evening Workout',
    description: null,
    notes: null,
    source: 'sparky',
    status: 'partial',
    finished_at: FINISHED,
    revision: 3,
    total_duration_minutes: 30,
    exercises: [],
    activity_details: [],
  };

  beforeAll(() => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getClient.mockResolvedValue(client);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockResolvedValue({});
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    exerciseEntryDb.getWorkoutPlanAssignmentIdByPresetEntryIdWithClient.mockResolvedValue(
      null
    );
  });

  it('rejects a stale revision with 409 instead of overwriting', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getGroupedExerciseSessionByIdWithClient.mockResolvedValue(existingSession);
    await expect(
      exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        { finished_at: null, revision: 2 }
      )
    ).rejects.toMatchObject({
      status: 409,
      message:
        'This workout session was modified by another device or tab. Reload it before saving.',
    });
    expect(
      exercisePresetEntryRepository.updateExercisePresetEntryWithClient
    ).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('refuses with 409 when a concurrent write bumps the revision mid-update', async () => {
    // The read saw revision 3, but another device committed in between:
    // the repository's guarded UPDATE misses and returns null, which the
    // service must refuse with 409 instead of a silent win.
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getGroupedExerciseSessionByIdWithClient.mockResolvedValue(existingSession);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      null
    );
    await expect(
      exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        { finished_at: null, revision: 3 }
      )
    ).rejects.toMatchObject({
      status: 409,
      message:
        'This workout session was modified by another device or tab. Reload it before saving.',
    });
    expect(
      exercisePresetEntryRepository.updateExercisePresetEntryWithClient
    ).toHaveBeenCalledWith(
      client,
      'preset-entry-1',
      'user-1',
      expect.objectContaining({
        finished_at: null,
        expected_revision: 3,
      })
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('reopens a partial session when the revision matches', async () => {
    getGroupedExerciseSessionByIdWithClient
      // @ts-expect-error the vi.mock factory is not part of the typed module API
      .mockResolvedValueOnce(existingSession)
      .mockResolvedValueOnce({ ...existingSession, status: 'in_progress' });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    await exerciseService.updateGroupedWorkoutSession(
      'user-1',
      'actor-1',
      'preset-entry-1',
      { finished_at: null, revision: 3 }
    );
    expect(
      exercisePresetEntryRepository.updateExercisePresetEntryWithClient
    ).toHaveBeenCalledWith(
      client,
      'preset-entry-1',
      'user-1',
      expect.objectContaining({ finished_at: null, expected_revision: 3 })
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('stamps finished_at on finish and leaves it untouched when omitted', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getGroupedExerciseSessionByIdWithClient.mockResolvedValue(existingSession);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    await exerciseService.updateGroupedWorkoutSession(
      'user-1',
      'actor-1',
      'preset-entry-1',
      {
        finished_at: FINISHED,
      }
    );
    expect(
      exercisePresetEntryRepository.updateExercisePresetEntryWithClient
    ).toHaveBeenCalledWith(
      client,
      'preset-entry-1',
      'user-1',
      expect.objectContaining({ finished_at: FINISHED })
    );

    // An ordinary metadata edit sends no lifecycle field: finished_at stays
    // absent from the repository write so the session keeps its state.
    // @ts-expect-error TS(2339): Property 'mockClear' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockClear();
    await exerciseService.updateGroupedWorkoutSession(
      'user-1',
      'actor-1',
      'preset-entry-1',
      {
        notes: 'felt strong',
      }
    );
    const call = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (exercisePresetEntryRepository.updateExercisePresetEntryWithClient as any)
        .mock.calls[0];
    expect(call[3]).toMatchObject({ notes: 'felt strong' });
    // finished_at is absent from the payload, so the repository leaves the
    // lifecycle columns alone on ordinary metadata edits.
    expect(call[3].finished_at).toBeUndefined();
  });
});
