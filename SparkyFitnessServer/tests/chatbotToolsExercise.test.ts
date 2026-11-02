import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildExerciseTools } from '../ai/tools/exerciseTools.js';
import exerciseService from '../services/exerciseService.js';
import workoutPresetService from '../services/workoutPresetService.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { getResolvedExerciseCaloriesRange } from '../services/exerciseCalorieRangeService.js';
import { getExerciseAlternatives } from '../services/exerciseAlternativesService.js';
import { setWorkoutFeedbackForEntry } from '../services/workoutCoachingService.js';
import { getWorkoutCoachingSignals } from '../services/adaptiveWorkoutService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../services/exerciseService', () => ({
  default: {
    searchExercises: vi.fn(),
    searchExercisesPaginated: vi.fn(),
    createExercise: vi.fn(),
    createExerciseEntry: vi.fn(),
    getExerciseEntriesByDate: vi.fn(),
    updateExerciseEntry: vi.fn(),
    deleteExerciseEntry: vi.fn(),
    getExerciseById: vi.fn(),
    getExerciseProgressData: vi.fn(),
    logWorkoutPresetGrouped: vi.fn(),
  },
}));
vi.mock('../services/workoutPresetService', () => ({
  default: {
    getWorkoutPresets: vi.fn(),
    getWorkoutPresetById: vi.fn(),
    createWorkoutPreset: vi.fn(),
    updateWorkoutPreset: vi.fn(),
    deleteWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../models/exercise', () => ({
  default: {
    getExercisesWithPagination: vi.fn(),
    countExercises: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseDiaryRange: vi.fn(),
    getDailyExerciseTotalsRange: vi.fn(),
    getRecentExerciseEntries: vi.fn(),
    getExerciseUsage: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository', () => ({
  default: {
    getWorkoutPresetByName: vi.fn(),
  },
}));
vi.mock('../services/exerciseCalorieRangeService', () => ({
  getResolvedExerciseCaloriesRange: vi.fn(),
  getResolvedExerciseCaloriesTotal: vi.fn(),
}));
vi.mock('../services/exerciseAlternativesService', () => ({
  getExerciseAlternatives: vi.fn(),
}));
vi.mock('../services/workoutCoachingService', () => {
  class WorkoutEntryNotInSessionError extends Error {
    constructor() {
      super('This exercise entry is not part of a logged workout session');
    }
  }
  class WorkoutSessionNotFoundError extends Error {}
  return {
    setWorkoutFeedbackForEntry: vi.fn(),
    WorkoutEntryNotInSessionError,
    WorkoutSessionNotFoundError,
  };
});
vi.mock('../services/adaptiveWorkoutService', () => ({
  getWorkoutCoachingSignals: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = toolOpts;
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';
const NOT_FOUND_RESOURCE_TEXT =
  "Error [NOT_FOUND]: Resource with ID 'unknown' not found.\n\nSuggestion: Check the ID and try again.";

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const EXERCISE_ID = '22222222-2222-4222-8222-222222222222';
const EXERCISE_ID_2 = '33333333-3333-4333-8333-333333333333';
const PRESET_ID = 4;

let tools: ReturnType<typeof buildExerciseTools>;

beforeEach(() => {
  // Default: no resolved rows, so the tool falls back to the raw per-day totals and the
  // projection goldens below stay meaningful. Resolution itself is covered separately.
  vi.mocked(getResolvedExerciseCaloriesRange).mockResolvedValue(new Map());
  vi.clearAllMocks();
  tools = buildExerciseTools('user-1', 'UTC');
});

describe('sparky_manage_exercise validation', () => {
  it('renders zod issues for a missing per-action field', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'search_exercises' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: searchTerm: Invalid input: expected string, received undefined'
    );
  });

  it('infers action when missing from input parameters', async () => {
    vi.mocked(exerciseService.searchExercisesPaginated).mockResolvedValue({
      exercises: [],
      totalCount: 0,
    });
    // Omit the 'action' field, but supply 'searchTerm' to imply search_exercises
    const result = await tools.sparky_manage_exercise.execute!(
      { searchTerm: 'pushups' },
      opts
    );
    expect(result).toBe(
      '# Exercise Search: "pushups"\n\nNo results found.\n\n---\nShowing 0 of 0 results.'
    );
  });
});

describe('search_exercises', () => {
  it('renders the paginated catalog matches', async () => {
    vi.mocked(exerciseService.searchExercisesPaginated).mockResolvedValue({
      exercises: [
        {
          id: EXERCISE_ID,
          name: 'Bench Press',
          category: 'Strength',
          primary_muscles: ['Chest', 'Triceps'],
          equipment: ['Barbell'],
          level: 'intermediate',
          calories_per_hour: 400,
          description: null,
          is_custom: false,
          user_id: 'user-1',
          tags: ['private'],
        },
      ],
      totalCount: 1,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'search_exercises', searchTerm: 'bench' },
      opts
    );

    expect(result).toBe(
      `# Exercise Search: "bench"\n\n**Bench Press** (Strength)\n  Muscles: Chest, Triceps | Equipment: Barbell\n  ID: ${EXERCISE_ID}\n\n---\nShowing 1 of 1 results.`
    );
    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-1',
      'bench',
      'user-1',
      undefined,
      undefined,
      20,
      0
    );
  });

  it('passes filters as single-element arrays and reports remaining pages', async () => {
    vi.mocked(exerciseService.searchExercisesPaginated).mockResolvedValue({
      exercises: [
        {
          id: EXERCISE_ID,
          name: 'Cable Fly',
          category: null,
          primary_muscles: [],
          equipment: [],
        },
      ],
      totalCount: 41,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'search_exercises',
        searchTerm: 'fly',
        muscleGroup: 'Chest',
        equipment: 'Cable',
        limit: 1,
        offset: 0,
      },
      opts
    );

    expect(result).toBe(
      `# Exercise Search: "fly"\n\n**Cable Fly** (Uncategorized)\n  Muscles: N/A | Equipment: None\n  ID: ${EXERCISE_ID}\n\n---\nShowing 1 of 41 results. Use offset=1 to see more.`
    );
    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-1',
      'fly',
      'user-1',
      ['Cable'],
      ['Chest'],
      1,
      0
    );
  });

  it('renders an empty result set', async () => {
    vi.mocked(exerciseService.searchExercisesPaginated).mockResolvedValue({
      exercises: [],
      totalCount: 0,
    });
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'search_exercises', searchTerm: 'zzz' },
      opts
    );
    expect(result).toBe(
      '# Exercise Search: "zzz"\n\nNo results found.\n\n---\nShowing 0 of 0 results.'
    );
  });

  it('maps service failures to DB_ERROR', async () => {
    vi.mocked(exerciseService.searchExercisesPaginated).mockRejectedValue(
      new Error('boom')
    );
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'search_exercises', searchTerm: 'bench' },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });

  // A deterministic constraint violation used to reach the chat as a bare
  // "a database error occurred", so the only way to see what broke was to grep
  // the server log. Surface the constraint name (schema metadata, not row data).
  it('names the violated constraint instead of a bare DB error', async () => {
    const pgError = Object.assign(new Error('insert failed'), {
      code: '23514',
      constraint: 'food_variants_source_check',
    });
    vi.mocked(exerciseService.searchExercisesPaginated).mockRejectedValue(
      pgError
    );

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'search_exercises', searchTerm: 'bench' },
      opts
    );

    expect(result).toContain('check constraint food_variants_source_check');
    // And it must never invite the blind identical retry that a deterministic
    // failure guarantees will fail again.
    expect(result).not.toContain('try again');
    expect(result).toContain('Do NOT retry');
  });
});

describe('create_exercise', () => {
  it('reuses an existing exercise matched case-insensitively', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([
      { id: EXERCISE_ID, name: 'Running' },
    ]);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'create_exercise', name: 'running' },
      opts
    );

    expect(result).toBe('✅ Exercise "Running" created.');
    expect(exerciseService.createExercise).not.toHaveBeenCalled();
  });

  it("creates with MCP's defaults when no exercise matches", async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Jump Rope',
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'create_exercise', name: 'Jump Rope' },
      opts
    );

    expect(result).toBe('✅ Exercise "Jump Rope" created.');
    expect(exerciseService.createExercise).toHaveBeenCalledWith('user-1', {
      name: 'Jump Rope',
      category: 'custom',
      calories_per_hour: 300,
      description: null,
      is_custom: true,
      shared_with_public: false,
      source: 'manual',
    });
  });

  it('passes provided category, calories and description through', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Rowing',
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_exercise',
        name: 'Rowing',
        category: 'Cardio',
        calories_per_hour: 550,
        description: 'Indoor rower',
      },
      opts
    );

    expect(exerciseService.createExercise).toHaveBeenCalledWith('user-1', {
      name: 'Rowing',
      category: 'Cardio',
      calories_per_hour: 550,
      description: 'Indoor rower',
      modality: undefined,
      is_custom: true,
      shared_with_public: false,
      source: 'manual',
    });
  });

  it('passes an explicit modality through to the service', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Plank',
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_exercise',
        name: 'Plank',
        category: 'Isometric',
        modality: 'duration',
      },
      opts
    );

    expect(result).toBe('✅ Exercise "Plank" created.');
    expect(exerciseService.createExercise).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Plank', modality: 'duration' })
    );
  });

  it('rejects a modality outside the enum', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_exercise',
        name: 'Plank',
        modality: 'time_only',
      } as never,
      opts
    );

    expect(result).toContain('modality');
    expect(exerciseService.createExercise).not.toHaveBeenCalled();
  });
});

describe('log_exercise', () => {
  it('defaults to General Exercise when exercise_id and exercise_name are missing', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'General Exercise',
    } as any);
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'log_exercise', entry_date: '2026-06-10' },
      opts
    );
    expect(result).toBe('✅ Exercise logged for 2026-06-10.');
    expect(exerciseService.createExercise).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'General Exercise' })
    );
  });

  // Matches the web's entry_time contract; without it a chatbot-logged workout
  // had a NULL time and sorted differently in the diary than a web-logged one.
  it('persists entry_time when the user states a time', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        entry_time: '19:45',
        duration_minutes: 30,
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ entry_time: '19:45' }),
      expect.anything()
    );
  });

  it('remaps a single misfiled start_date to entry_date instead of defaulting to today', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        // Cross-action key from get_exercise_progress; for a logging action
        // the intended date is unambiguous, so it must land on the entry.
        start_date: '2026-06-10',
        duration_minutes: 30,
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ entry_date: '2026-06-10' }),
      expect.anything()
    );
  });

  it('does not default entry_date to today when both start_date and end_date are misfiled onto a log action', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        start_date: '2026-06-10',
        end_date: '2026-06-12',
        duration_minutes: 30,
      },
      opts
    );

    // The meaning is ambiguous, so the call must fail validation instead of
    // silently filing the entry on today's date.
    expect(result).toMatch(/^Error \[VALIDATION\]/);
    expect(result).toContain('entry_date');
    expect(exerciseService.createExerciseEntry).not.toHaveBeenCalled();
  });

  it('logs by exercise_id with repository-shaped sets', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        duration_minutes: 40,
        sets: [
          { reps: 10, weight: 60 },
          { reps: 8, weight: 65, set_type: 'Drop Set' },
        ],
      },
      opts
    );

    expect(result).toBe('✅ Exercise logged for 2026-06-10.');
    expect(exerciseService.searchExercises).not.toHaveBeenCalled();
    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        duration_minutes: 40,
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 10,
            weight: 60,
            duration: null,
            distance: null,
            rest_time: null,
            rpe: null,
            rir: null,
            notes: null,
          },
          {
            set_number: 2,
            set_type: 'Drop Set',
            reps: 8,
            weight: 65,
            duration: null,
            distance: null,
            rest_time: null,
            rpe: null,
            rir: null,
            notes: null,
          },
        ],
      },
      { skipDuplicateCheck: true }
    );
  });

  it('prefers the case-insensitive exact name match over substring matches', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([
      { id: EXERCISE_ID_2, name: 'Running Intervals' },
      { id: EXERCISE_ID, name: 'Running' },
    ]);
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_name: 'running',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ exercise_id: EXERCISE_ID }),
      { skipDuplicateCheck: true }
    );
  });

  it('falls back to the first fuzzy match', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([
      { id: EXERCISE_ID_2, name: 'Running Intervals' },
    ]);
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_name: 'running',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ exercise_id: EXERCISE_ID_2 }),
      { skipDuplicateCheck: true }
    );
  });

  it('auto-creates a custom 300 kcal/h exercise when nothing matches', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Underwater Hockey',
    });
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_name: 'Underwater Hockey',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe('✅ Exercise logged for 2026-06-10.');
    expect(exerciseService.createExercise).toHaveBeenCalledWith('user-1', {
      name: 'Underwater Hockey',
      category: 'custom',
      calories_per_hour: 300,
      is_custom: true,
      shared_with_public: false,
      source: 'manual',
    });
    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ exercise_id: EXERCISE_ID }),
      { skipDuplicateCheck: true }
    );
  });

  it('parses sets passed as a JSON string', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        sets: '[{"reps":5,"weight":100}]',
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 5,
            weight: 100,
            duration: null,
            distance: null,
            rest_time: null,
            rpe: null,
            rir: null,
            notes: null,
          },
        ],
      }),
      { skipDuplicateCheck: true }
    );
  });

  it('records RIR per set and clamps it when a JSON-string set skips the schema', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        sets: '[{"reps":8,"weight":100,"rir":2},{"reps":6,"weight":100,"rir":15}]',
      },
      opts
    );

    const call = vi.mocked(exerciseService.createExerciseEntry).mock
      .calls[0]![2] as { sets: { rir: number | null }[] };
    expect(call.sets.map((set) => set.rir)).toEqual([2, 10]);
  });

  it('persists per-set distance for cardio sets', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        duration_minutes: 30,
        sets: [{ duration: 1800, distance: 5.2 }],
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        sets: [expect.objectContaining({ duration: 1800, distance: 5.2 })],
      }),
      { skipDuplicateCheck: true }
    );
  });

  it('rejects a fractional set duration (per-set duration is integer seconds)', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        sets: [{ reps: 5, duration: 90.5 }],
      },
      opts
    );

    // The sets union collapses inner paths, so the issue is reported on 'sets'.
    expect(result).toBe('Error [VALIDATION]: sets: Invalid input');
    expect(exerciseService.createExerciseEntry).not.toHaveBeenCalled();
  });

  it('rounds fractional durations arriving through the JSON-string sets branch', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        sets: '[{"reps":5,"duration":90.6}]',
      },
      opts
    );

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        sets: [expect.objectContaining({ duration: 91 })],
      }),
      { skipDuplicateCheck: true }
    );
  });

  it('ignores an unparseable sets string and still logs', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_exercise',
        exercise_id: EXERCISE_ID,
        entry_date: '2026-06-10',
        sets: '{not json',
      },
      opts
    );

    expect(result).toBe('✅ Exercise logged for 2026-06-10.');
    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ sets: undefined }),
      { skipDuplicateCheck: true }
    );
  });
});

describe('list_exercise_diary', () => {
  it('flattens preset sessions and renders the per-entry list in created_at order', async () => {
    vi.mocked(exerciseService.getExerciseEntriesByDate).mockResolvedValue([
      {
        type: 'preset',
        id: 'pe-1',
        name: 'Push Day',
        created_at: '2026-06-10T08:00:00Z',
        exercises: [
          {
            id: 'ee-2',
            name: 'Bench Press',
            sets: [
              {
                id: 's1',
                set_number: 1,
                set_type: 'Working Set',
                reps: 10,
                weight: 60,
                duration: null,
                rest_time: 90,
                rpe: 8,
                rir: null,
                notes: null,
              },
              {
                id: 's2',
                set_number: 2,
                set_type: 'Working Set',
                reps: 8,
                weight: 65,
                duration: null,
                rest_time: null,
                rpe: null,
                notes: 'tough',
              },
            ],
            duration_minutes: 0,
            calories_burned: 0,
            notes: 'felt good',
            distance: null,
            avg_heart_rate: null,
            steps: null,
            created_at: '2026-06-10T08:05:00Z',
          },
        ],
      },
      {
        type: 'individual',
        id: 'ee-1',
        name: 'Morning Run',
        sets: [],
        duration_minutes: 30,
        calories_burned: 300,
        notes: null,
        distance: 5,
        avg_heart_rate: 150,
        steps: 6000,
        created_at: '2026-06-10T07:00:00Z',
      },
    ]);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'list_exercise_diary', entry_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      '# Exercise Diary: 2026-06-10\n\n' +
        '**Morning Run** | 30 min | 300 kcal | 5 dist | 150 bpm | 6000 steps\n  ID: ee-1\n\n' +
        '**Bench Press** — 2 sets\n  Sets: 10r×60kg×RPE 8 (rest 90s); 8r×65kg (tough)\n  Notes: felt good\n  ID: ee-2'
    );
    expect(exerciseService.getExerciseEntriesByDate).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-10'
    );
  });

  it('renders an empty diary', async () => {
    vi.mocked(exerciseService.getExerciseEntriesByDate).mockResolvedValue([]);
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'list_exercise_diary', entry_date: '2026-06-11' },
      opts
    );
    expect(result).toBe('# Exercise Diary: 2026-06-11\n\nNo results found.');
  });
});

describe('workout presets', () => {
  it('get_workout_presets lists presets with exercise counts', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresets).mockResolvedValue({
      presets: [{ id: 7, name: 'Push Day', exercises: [{}, {}, {}] }],
      total: 1,
      page: 1,
      limit: 1000,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_presets' },
      opts
    );

    expect(result).toBe(
      '# Workout Presets\n\n**Push Day** — 3 exercises\n  ID: 7'
    );
    expect(workoutPresetService.getWorkoutPresets).toHaveBeenCalledWith(
      'user-1',
      1,
      1000
    );
  });

  it('get_workout_preset renders exercise ids, sets, and superset groups', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValue({
      id: PRESET_ID,
      name: 'Push Day',
      description: 'Chest focused',
      is_public: true,
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          exercise_name: 'Bench Press',
          superset_group: 1,
          sets: [
            {
              set_number: 1,
              set_type: 'Working Set',
              reps: 10,
              weight: 60,
              duration: null,
              distance: null,
              rest_time: null,
              notes: null,
            },
          ],
        },
        {
          exercise_id: EXERCISE_ID_2,
          exercise_name: 'Incline Fly',
          superset_group: 1,
          sets: [],
        },
      ],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset', preset_id: PRESET_ID },
      opts
    );

    expect(result).toBe(
      `### Push Day (ID: ${PRESET_ID})\n\n` +
        'Chest focused\n\n' +
        'Public: yes\n\n' +
        `1. **Bench Press** [superset group 1]\n   exercise_id: ${EXERCISE_ID}\n` +
        '   Set 1 (Working Set): 10 reps, 60kg\n' +
        `2. **Incline Fly** [superset group 1]\n   exercise_id: ${EXERCISE_ID_2}\n` +
        '   No sets recorded\n'
    );
    expect(workoutPresetService.getWorkoutPresetById).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID
    );
  });

  it('get_workout_preset resolves the preset by name', async () => {
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      { id: PRESET_ID, name: 'Push Day' }
    );
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValue({
      id: PRESET_ID,
      name: 'Push Day',
      description: null,
      is_public: false,
      exercises: [],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset', preset_name: 'Push Day' },
      opts
    );

    expect(result).toBe(
      `### Push Day (ID: ${PRESET_ID})\n\nPublic: no\n\n_No exercises in this preset._`
    );
    expect(workoutPresetService.getWorkoutPresetById).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID
    );
  });

  it('get_workout_preset requires preset_id or preset_name', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Either preset_id or preset_name must be provided'
    );
  });

  it('get_workout_preset maps a missing preset to not found', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockRejectedValue(
      new Error('Workout preset not found.')
    );
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset', preset_id: PRESET_ID },
      opts
    );
    expect(result).toBe(
      `Error [NOT_FOUND]: Workout preset with ID '${PRESET_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('log_workout_preset requires preset_id or preset_name', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'log_workout_preset', entry_date: '2026-06-10' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Either preset_id or preset_name must be provided'
    );
  });

  it('log_workout_preset resolves the preset by name and logs a grouped session', async () => {
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      { id: 7, name: 'Push Day' }
    );
    vi.mocked(exerciseService.logWorkoutPresetGrouped).mockResolvedValue({
      id: 'pe-1',
      exercises: [{}, {}],
      // The full PresetSessionResponse shape isn't needed by the handler.
    } as never);

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_name: 'Push Day',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      '✅ Workout preset logged for 2026-06-10. 2 exercises added.'
    );
    expect(workoutPresetRepository.getWorkoutPresetByName).toHaveBeenCalledWith(
      'user-1',
      'Push Day'
    );
    expect(exerciseService.logWorkoutPresetGrouped).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      7,
      '2026-06-10',
      {}
    );
  });

  it('log_workout_preset reports an unknown preset name as not found', async () => {
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      null
    );
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_name: 'Nope',
        entry_date: '2026-06-10',
      },
      opts
    );
    expect(result).toBe(NOT_FOUND_RESOURCE_TEXT);
    expect(exerciseService.logWorkoutPresetGrouped).not.toHaveBeenCalled();
  });

  it('log_workout_preset maps a missing preset_id to not found', async () => {
    vi.mocked(exerciseService.logWorkoutPresetGrouped).mockRejectedValue(
      new Error('Workout preset not found.')
    );
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_id: PRESET_ID,
        entry_date: '2026-06-10',
      },
      opts
    );
    expect(result).toBe(NOT_FOUND_RESOURCE_TEXT);
  });

  it('create_workout_preset builds ordered exercises and confirms', async () => {
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 9,
      name: 'Leg Day',
      exercises: [{}, {}],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: [
          { exercise_id: EXERCISE_ID },
          { exercise_id: EXERCISE_ID_2 },
        ],
      },
      opts
    );

    expect(result).toBe(
      '✅ Workout preset "Leg Day" created with 2 exercises.'
    );
    expect(workoutPresetService.createWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      {
        user_id: 'user-1',
        name: 'Leg Day',
        description: null,
        is_public: false,
        workout_format: 'standard',
        time_cap_seconds: null,
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            sort_order: 0,
            superset_group: null,
            ramp_increment: null,
            sets: undefined,
          },
          {
            exercise_id: EXERCISE_ID_2,
            sort_order: 1,
            superset_group: null,
            ramp_increment: null,
            sets: undefined,
          },
        ],
      }
    );
  });

  it('create_workout_preset drops cross-action keys (confirmed/start_date/end_date) and succeeds', async () => {
    // Models echo shared flat-schema parameters (confirmed, start_date,
    // end_date) onto create_workout_preset even though they belong to
    // update/delete_workout_preset and get_exercise_progress.
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 9,
      name: 'Leg Day',
      exercises: [{}],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: [{ exercise_id: EXERCISE_ID }],
        confirmed: true,
        start_date: '2026-11-01',
        end_date: '2026-11-30',
      },
      opts
    );

    expect(result).toBe(
      '✅ Workout preset "Leg Day" created with 1 exercises.'
    );
    expect(workoutPresetService.createWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Leg Day' })
    );
  });

  it('create_workout_preset still rejects a data-bearing cross-action key (top-level sets) instead of dropping it', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: [{ exercise_id: EXERCISE_ID }],
        confirmed: true,
        // Data-bearing: the strict preset schema only accepts sets nested
        // inside exercises, so a top-level sets must NOT be silently dropped.
        sets: [{ reps: 10 }],
      },
      opts
    );

    expect(result).toMatch(/^Error \[VALIDATION\]/);
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('create_workout_preset builds sets and superset groups', async () => {
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 9,
      name: 'Push/Pull Superset',
      exercises: [{}, {}],
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Push/Pull Superset',
        description: 'Chest + back superset',
        is_public: true,
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            superset_group: 1,
            sets: [
              { reps: 10, weight: 60 },
              { reps: 8, weight: 65, set_type: 'Drop Set' },
            ],
          },
          {
            exercise_id: EXERCISE_ID_2,
            superset_group: 1,
            sets: [{ reps: 12, weight: 20 }],
          },
        ],
      },
      opts
    );

    expect(workoutPresetService.createWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      {
        user_id: 'user-1',
        name: 'Push/Pull Superset',
        description: 'Chest + back superset',
        is_public: true,
        workout_format: 'standard',
        time_cap_seconds: null,
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            sort_order: 0,
            superset_group: 1,
            ramp_increment: null,
            sets: [
              {
                set_number: 1,
                set_type: 'Working Set',
                reps: 10,
                weight: 60,
                duration: null,
                distance: null,
                rest_time: null,
                rpe: null,
                rir: null,
                notes: null,
              },
              {
                set_number: 2,
                set_type: 'Drop Set',
                reps: 8,
                weight: 65,
                duration: null,
                distance: null,
                rest_time: null,
                rpe: null,
                rir: null,
                notes: null,
              },
            ],
          },
          {
            exercise_id: EXERCISE_ID_2,
            sort_order: 1,
            superset_group: 1,
            ramp_increment: null,
            sets: [
              {
                set_number: 1,
                set_type: 'Working Set',
                reps: 12,
                weight: 20,
                duration: null,
                distance: null,
                rest_time: null,
                rpe: null,
                rir: null,
                notes: null,
              },
            ],
          },
        ],
      }
    );
  });

  it('create_workout_preset accepts exercises as a JSON string', async () => {
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 9,
      name: 'Leg Day',
      exercises: [{}],
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: JSON.stringify([{ exercise_id: EXERCISE_ID }]),
      },
      opts
    );

    expect(workoutPresetService.createWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            sort_order: 0,
            superset_group: null,
            ramp_increment: null,
            sets: undefined,
          },
        ],
      })
    );
  });

  it('create_workout_preset rejects a fractional rep increment', async () => {
    for (const exercise of [
      {
        exercise_id: EXERCISE_ID,
        increment_type: 'reps' as const,
        increment_value: 1.5,
      },
      {
        exercise_id: EXERCISE_ID,
        progression_mode: 'step_load' as const,
        increment_value: 2.5,
      },
    ]) {
      const result = await tools.sparky_manage_exercise.execute!(
        {
          action: 'create_workout_preset',
          name: 'Bench',
          exercises: [exercise],
        },
        opts
      );
      expect(String(result)).toContain('Rep increment must be a whole number');
    }
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('create_workout_preset accepts a fractional weight increment', async () => {
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 9,
      name: 'Bench',
      exercises: [{}],
    });
    await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Bench',
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            increment_type: 'weight',
            increment_value: 2.5,
          },
        ],
      },
      opts
    );
    expect(workoutPresetService.createWorkoutPreset).toHaveBeenCalled();
  });

  it('create_workout_preset passes ramp_increment (kg, negative allowed) through', async () => {
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 9,
      name: 'Bench',
      exercises: [{}, {}],
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Bench',
        exercises: [
          { exercise_id: EXERCISE_ID, ramp_increment: 4.54 },
          { exercise_id: EXERCISE_ID_2, ramp_increment: -2.5 },
        ],
      },
      opts
    );

    const [, data] = vi.mocked(workoutPresetService.createWorkoutPreset).mock
      .calls[0];
    expect(
      data.exercises.map(
        (e: { ramp_increment?: number | null }) => e.ramp_increment
      )
    ).toEqual([4.54, -2.5]);
  });

  it('get_workout_preset renders a ramp_increment so updates can round-trip it', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValue({
      id: PRESET_ID,
      name: 'Bench',
      description: null,
      is_public: false,
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          exercise_name: 'Bench Press',
          superset_group: null,
          ramp_increment: 4.54,
          sets: [],
        },
      ],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset', preset_id: PRESET_ID },
      opts
    );

    expect(result).toContain('   ramp_increment: +4.54kg per working set\n');
  });

  it('create_workout_preset rejects malformed JSON exercises', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: '{not json',
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: Invalid JSON format for exercises'
    );
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('create_workout_preset rejects non-array JSON exercises', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: JSON.stringify({ exercise_id: EXERCISE_ID }),
      },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: exercises must be a JSON array');
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('create_workout_preset rejects decoded exercises that fail the preset schema', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Leg Day',
        exercises: JSON.stringify([null]),
      },
      opts
    );

    expect(String(result)).toMatch(/^Error \[VALIDATION\]:/);
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('create_workout_preset creates preset with workout_format and time_cap_seconds', async () => {
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 10,
      name: 'Cindy',
      exercises: [{}],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Cindy',
        workout_format: 'amrap',
        time_cap_seconds: 1200,
        exercises: [{ exercise_id: EXERCISE_ID }],
      },
      opts
    );

    expect(result).toBe('✅ Workout preset "Cindy" created with 1 exercises.');
    expect(workoutPresetService.createWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        workout_format: 'amrap',
        time_cap_seconds: 1200,
      })
    );
  });

  it('create_workout_preset rejects AMRAP preset without time_cap_seconds', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'create_workout_preset',
        name: 'Invalid AMRAP',
        workout_format: 'amrap',
        exercises: [{ exercise_id: EXERCISE_ID }],
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: AMRAP workout presets require time_cap_seconds to be specified.'
    );
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('get_workout_preset renders workout format and time cap', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValue({
      id: PRESET_ID,
      name: 'Fight Gone Bad',
      workout_format: 'interval',
      time_cap_seconds: 1020,
      is_public: false,
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          exercise_name: 'Wall Ball',
          sets: [{ reps: 20, set_type: 'Working Set' }],
        },
      ],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset', preset_id: PRESET_ID },
      opts
    );

    expect(result).toContain('### Fight Gone Bad (ID: 4)');
    expect(result).toContain('Format: **interval** (Cap: 17:00)');
    expect(result).toContain('Wall Ball');
  });

  it('log_workout_preset logs preset with wod_score activity details', async () => {
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      {
        id: 7,
        name: 'Fran',
        workout_format: 'for_time',
        time_cap_seconds: 600,
      }
    );
    vi.mocked(exerciseService.logWorkoutPresetGrouped).mockResolvedValue({
      id: 'pe-2',
      exercises: [{}, {}],
    } as never);

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_name: 'Fran',
        entry_date: '2026-06-10',
        wod_score: {
          score_type: 'time',
          elapsed_seconds: 245,
          status: 'rx',
        },
      },
      opts
    );

    expect(result).toBe(
      '✅ Workout preset logged for 2026-06-10. 2 exercises added.'
    );
    expect(exerciseService.logWorkoutPresetGrouped).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      7,
      '2026-06-10',
      {
        activity_details: [
          {
            provider_name: 'SparkyFitness',
            detail_type: 'wod_score',
            detail_data: {
              workout_format: 'for_time',
              time_cap_seconds: 600,
              score_type: 'time',
              rounds_completed: null,
              reps_completed: null,
              elapsed_seconds: 245,
              status: 'rx',
              scaling_notes: null,
            },
          },
        ],
      }
    );
  });

  it('duplicate_exercise copies library fields into a private custom exercise', async () => {
    vi.mocked(exerciseService.getExerciseById).mockResolvedValue({
      id: 'ex-1',
      name: 'Bench Press',
      category: 'strength',
      modality: 'weight_reps',
      calories_per_hour: 300,
      description: 'Flat bench',
      level: 'intermediate',
      force: 'push',
      mechanic: 'compound',
      equipment: '["Barbell"]',
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
      instructions: ['Lower the bar', 'Press'],
      images: ['Bench_Press/0.jpg'],
      source: 'free-exercise-db',
      source_id: 'Bench_Press',
      shared_with_public: true,
    } as never);
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: 'ex-2',
      name: 'Bench Press (copy)',
    } as never);

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'duplicate_exercise',
        exercise_id: '11111111-1111-4111-8111-111111111111',
      },
      opts
    );

    expect(result).toContain(
      'Exercise "Bench Press (copy)" created as a copy of "Bench Press"'
    );
    expect(exerciseService.createExercise).toHaveBeenCalledWith('user-1', {
      name: 'Bench Press (copy)',
      category: 'strength',
      modality: 'weight_reps',
      calories_per_hour: 300,
      description: 'Flat bench',
      level: 'intermediate',
      force: 'push',
      mechanic: 'compound',
      equipment: ['Barbell'],
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
      instructions: ['Lower the bar', 'Press'],
      images: ['Bench_Press/0.jpg'],
      source: 'custom',
      source_id: null,
      is_custom: true,
      shared_with_public: false,
    });
  });

  it('duplicate_exercise returns NOT_FOUND for an unknown exercise', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([] as never);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'duplicate_exercise', exercise_name: 'Nope', name: 'X' },
      opts
    );

    expect(result).toContain('Error [NOT_FOUND]');
    expect(exerciseService.createExercise).not.toHaveBeenCalled();
  });

  it('log_workout_preset passes a gym location through to the session', async () => {
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      { id: 5, name: 'Push Day', workout_format: 'standard' }
    );
    vi.mocked(exerciseService.logWorkoutPresetGrouped).mockResolvedValue({
      id: 'pe-9',
      exercises: [{}],
    } as never);

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_name: 'Push Day',
        entry_date: '2026-06-10',
        location: '  Home Gym ',
      },
      opts
    );

    expect(exerciseService.logWorkoutPresetGrouped).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      5,
      '2026-06-10',
      { location: 'Home Gym' }
    );
  });

  it('list_exercise_diary reads WOD scores logged by the mobile app (legacy keys)', async () => {
    vi.mocked(exerciseService.getExerciseEntriesByDate).mockResolvedValue([
      {
        id: 'pe-2',
        type: 'preset',
        name: 'Cindy',
        created_at: '2026-06-10T10:00:00Z',
        activity_details: [
          {
            detail_type: 'wod_score',
            detail_data: {
              format: 'amrap',
              rounds_completed: 5,
              reps_completed: 3,
              status: 'rx',
            },
          },
        ],
        exercises: [
          {
            id: 'ee-9',
            name: 'Pull-up',
            created_at: '2026-06-10T10:00:00Z',
            sets: [],
          },
        ],
      },
    ] as never);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'list_exercise_diary', entry_date: '2026-06-10' },
      opts
    );

    expect(result).toContain('Score: AMRAP — 5 rounds + 3 reps (Rx)');
  });

  it('list_exercise_diary shows per-set RIR and the session location', async () => {
    vi.mocked(exerciseService.getExerciseEntriesByDate).mockResolvedValue([
      {
        id: 'pe-1',
        type: 'preset',
        name: 'Push Day',
        location: 'Home Gym',
        created_at: '2026-06-10T10:00:00Z',
        exercises: [
          {
            id: 'ee-1',
            name: 'Bench Press',
            created_at: '2026-06-10T10:00:00Z',
            sets: [{ reps: 8, weight: 100, rir: 2 }],
          },
        ],
      },
    ] as never);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'list_exercise_diary', entry_date: '2026-06-10' },
      opts
    );

    expect(result).toContain('RIR 2');
    expect(result).toContain('Location: Home Gym');
  });

  it('log_workout_preset rejects wod_score on a standard-format preset', async () => {
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      { id: 8, name: 'Push Day', workout_format: 'standard' }
    );

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_name: 'Push Day',
        entry_date: '2026-06-10',
        wod_score: { score_type: 'completion' },
      },
      opts
    );

    expect(result).toContain('Error [VALIDATION]');
    expect(result).toContain('wod_score only applies to interval/WOD presets');
    expect(exerciseService.logWorkoutPresetGrouped).not.toHaveBeenCalled();
  });

  it('log_workout_preset validates a wod_score sent as a JSON string', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_id: 7,
        entry_date: '2026-06-10',
        wod_score: JSON.stringify({ score_type: 'fastest' }),
      },
      opts
    );

    expect(result).toContain('Error [VALIDATION]');
    expect(exerciseService.logWorkoutPresetGrouped).not.toHaveBeenCalled();
  });

  it('log_workout_preset by preset_id reads the preset format for the score', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValue({
      id: 9,
      name: 'Cindy',
      workout_format: 'amrap',
      time_cap_seconds: 1200,
    } as never);
    vi.mocked(exerciseService.logWorkoutPresetGrouped).mockResolvedValue({
      id: 'pe-3',
      exercises: [{}],
    } as never);

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'log_workout_preset',
        preset_id: 9,
        entry_date: '2026-06-10',
        wod_score: JSON.stringify({
          score_type: 'rounds_reps',
          rounds_completed: 18,
          reps_completed: 7,
        }),
      },
      opts
    );

    const options = vi.mocked(exerciseService.logWorkoutPresetGrouped).mock
      .calls[0][4] as {
      activity_details: { detail_data: Record<string, unknown> }[];
    };
    expect(options.activity_details[0].detail_data).toMatchObject({
      workout_format: 'amrap',
      time_cap_seconds: 1200,
      rounds_completed: 18,
    });
  });

  it('list_exercise_diary renders WOD scores when preset activity details are present', async () => {
    vi.mocked(exerciseService.getExerciseEntriesByDate).mockResolvedValue([
      {
        id: 'pe-1',
        type: 'preset',
        name: 'Cindy',
        created_at: '2026-06-10T10:00:00Z',
        activity_details: [
          {
            detail_type: 'wod_score',
            detail_data: {
              workout_format: 'amrap',
              time_cap_seconds: 1200,
              score_type: 'rounds_reps',
              rounds_completed: 18,
              reps_completed: 7,
              status: 'rx',
            },
          },
        ],
        exercises: [
          {
            id: 'ee-1',
            name: 'Pull-up',
            created_at: '2026-06-10T10:00:00Z',
            sets: [{ reps: 5 }],
          },
          {
            id: 'ee-2',
            name: 'Push-up',
            created_at: '2026-06-10T10:00:01Z',
            sets: [{ reps: 10 }],
          },
        ],
      },
    ] as never);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'list_exercise_diary', entry_date: '2026-06-10' },
      opts
    );

    expect(result).toContain('**Pull-up** — 1 sets');
    expect(result).toContain(
      'Score: AMRAP 20:00 cap — 18 rounds + 7 reps (Rx)'
    );
    // One score per session, not repeated on every exercise.
    expect(String(result).split('Score:').length - 1).toBe(1);
  });

  it('update_workout_preset updates only the provided fields and confirms', async () => {
    vi.mocked(workoutPresetService.updateWorkoutPreset).mockResolvedValue({
      id: PRESET_ID,
      name: 'Leg Day (updated)',
      exercises: [{}],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        name: 'Leg Day (updated)',
        confirmed: true,
      },
      opts
    );

    expect(result).toBe('✅ Workout preset "Leg Day (updated)" updated.');
    expect(workoutPresetService.updateWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID,
      {
        name: 'Leg Day (updated)',
        description: undefined,
        is_public: undefined,
        exercises: undefined,
      }
    );
  });

  it('update_workout_preset keeps progression and ramp settings the model left out', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValueOnce({
      id: PRESET_ID,
      name: 'Bench',
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          progression_mode: 'fixed',
          rep_goal: 8,
          increment_type: 'weight',
          increment_value: 2.5,
          equipment_brand: 'Rogue',
          ramp_increment: 4.54,
          sets: [],
        },
        {
          exercise_id: EXERCISE_ID_2,
          progression_mode: 'rep_goal',
          rep_goal: 30,
          ramp_increment: -2.5,
          sets: [],
        },
      ],
    });
    vi.mocked(workoutPresetService.updateWorkoutPreset).mockResolvedValue({
      id: PRESET_ID,
      name: 'Bench',
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
        exercises: [
          // Only sets change: settings carry over.
          { exercise_id: EXERCISE_ID, sets: [{ reps: 5, weight: 100 }] },
          // Explicit values win; an explicit null clears the ramp.
          { exercise_id: EXERCISE_ID_2, rep_goal: 36, ramp_increment: null },
        ],
      },
      opts
    );

    const [, , data] = vi.mocked(workoutPresetService.updateWorkoutPreset).mock
      .calls[0];
    expect(data.exercises[0]).toMatchObject({
      progression_mode: 'fixed',
      rep_goal: 8,
      increment_type: 'weight',
      increment_value: 2.5,
      equipment_brand: 'Rogue',
      ramp_increment: 4.54,
    });
    expect(data.exercises[1]).toMatchObject({
      progression_mode: 'rep_goal',
      rep_goal: 36,
      ramp_increment: null,
    });
  });

  it('get_workout_preset renders an active progression configuration', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValueOnce({
      id: PRESET_ID,
      name: 'Bench',
      description: null,
      is_public: false,
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          exercise_name: 'Bench Press',
          progression_mode: 'fixed',
          rep_goal: 8,
          increment_type: 'weight',
          increment_value: 2.5,
          equipment_brand: 'Rogue',
          sets: [],
        },
        {
          // Stored defaults with no rep goal never fire: not rendered.
          exercise_id: EXERCISE_ID_2,
          exercise_name: 'Row',
          progression_mode: 'rep_goal',
          rep_goal: null,
          increment_type: 'weight',
          increment_value: 5,
          sets: [],
        },
      ],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_preset', preset_id: PRESET_ID },
      opts
    );

    expect(result).toContain(
      '   progression: progression_mode fixed, rep_goal 8, increment_type weight, increment_value 2.5kg\n   equipment_brand: Rogue\n'
    );
    expect(String(result).match(/progression:/g)).toHaveLength(1);
  });

  it('update_workout_preset replaces the exercise list, sets, and superset groups when exercises is provided', async () => {
    vi.mocked(workoutPresetService.updateWorkoutPreset).mockResolvedValue({
      id: PRESET_ID,
      name: 'Leg Day',
      exercises: [{}, {}],
    });

    await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            superset_group: 2,
            sets: [{ reps: 5, weight: 100 }],
          },
          { exercise_id: EXERCISE_ID_2 },
        ],
      },
      opts
    );

    expect(workoutPresetService.updateWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID,
      {
        name: undefined,
        description: undefined,
        is_public: undefined,
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            sort_order: 0,
            superset_group: 2,
            ramp_increment: null,
            sets: [
              {
                set_number: 1,
                set_type: 'Working Set',
                reps: 5,
                weight: 100,
                duration: null,
                distance: null,
                rest_time: null,
                rpe: null,
                rir: null,
                notes: null,
              },
            ],
          },
          {
            exercise_id: EXERCISE_ID_2,
            sort_order: 1,
            superset_group: null,
            ramp_increment: null,
            sets: undefined,
          },
        ],
      }
    );
  });

  it('update_workout_preset rejects malformed JSON exercises', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
        exercises: '{not json',
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: Invalid JSON format for exercises'
    );
    expect(workoutPresetService.updateWorkoutPreset).not.toHaveBeenCalled();
  });

  it('update_workout_preset rejects non-array JSON exercises', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
        exercises: JSON.stringify({ exercise_id: EXERCISE_ID }),
      },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: exercises must be a JSON array');
    expect(workoutPresetService.updateWorkoutPreset).not.toHaveBeenCalled();
  });

  it('update_workout_preset rejects decoded exercises that fail the preset schema', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
        exercises: JSON.stringify([null]),
      },
      opts
    );

    expect(String(result)).toMatch(/^Error \[VALIDATION\]:/);
    expect(workoutPresetService.updateWorkoutPreset).not.toHaveBeenCalled();
  });

  it('infers update_workout_preset from exercises plus preset_id, not from preset_name', async () => {
    vi.mocked(workoutPresetService.updateWorkoutPreset).mockResolvedValue({
      id: PRESET_ID,
      name: 'Leg Day',
      exercises: [{}],
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        preset_id: PRESET_ID,
        confirmed: true,
        exercises: [{ exercise_id: EXERCISE_ID }],
      },
      opts
    );

    expect(result).toBe('✅ Workout preset "Leg Day" updated.');
    expect(workoutPresetService.updateWorkoutPreset).toHaveBeenCalled();
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('does not infer update_workout_preset from exercises plus preset_name', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        preset_name: 'Push Day',
        exercises: [{ exercise_id: EXERCISE_ID }],
      },
      opts
    );

    expect(String(result)).toMatch(/Error \[VALIDATION\]/);
    expect(workoutPresetService.updateWorkoutPreset).not.toHaveBeenCalled();
  });

  it('update_workout_preset maps a forbidden/missing preset to not found', async () => {
    vi.mocked(workoutPresetService.updateWorkoutPreset).mockRejectedValue(
      new Error(
        'Forbidden: You do not have permission to update this workout preset.'
      )
    );

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        name: 'X',
        confirmed: true,
      },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Workout preset with ID '${PRESET_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('delete_workout_preset deletes and confirms', async () => {
    vi.mocked(workoutPresetService.deleteWorkoutPreset).mockResolvedValue({
      message: 'Workout preset deleted successfully.',
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'delete_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
      },
      opts
    );

    expect(result).toBe('✅ Workout preset deleted.');
    expect(workoutPresetService.deleteWorkoutPreset).toHaveBeenCalledWith(
      'user-1',
      PRESET_ID
    );
  });

  it('delete_workout_preset maps a forbidden/missing preset to not found', async () => {
    vi.mocked(workoutPresetService.deleteWorkoutPreset).mockRejectedValue(
      new Error(
        'Forbidden: You do not have permission to delete this workout preset.'
      )
    );

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'delete_workout_preset',
        preset_id: PRESET_ID,
        confirmed: true,
      },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Workout preset with ID '${PRESET_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('update_workout_preset does not mutate without confirmed=true', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_workout_preset',
        preset_id: PRESET_ID,
        name: 'Leg Day (updated)',
      },
      opts
    );

    expect(result).toBe(
      `Updating workout preset ${PRESET_ID} can overwrite its exercise list. Confirm with the user first. If they agree, call update_workout_preset again with the same fields and confirmed=true. Nothing was changed.`
    );
    expect(workoutPresetService.updateWorkoutPreset).not.toHaveBeenCalled();
  });

  it('delete_workout_preset does not mutate without confirmed=true', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'delete_workout_preset', preset_id: PRESET_ID },
      opts
    );

    expect(result).toBe(
      `Deleting workout preset ${PRESET_ID} is permanent. Confirm with the user first. If they agree, call delete_workout_preset again with preset_id=${PRESET_ID} and confirmed=true. Nothing was deleted.`
    );
    expect(workoutPresetService.deleteWorkoutPreset).not.toHaveBeenCalled();
  });
});

describe('update_exercise_entry / delete_exercise_entry', () => {
  it('updates only the provided fields and replaces sets', async () => {
    vi.mocked(exerciseService.updateExerciseEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'update_exercise_entry',
        entry_id: ENTRY_ID,
        duration_minutes: 45,
        steps: 1234,
        sets: '[{"reps":12}]',
      },
      opts
    );

    expect(result).toBe('✅ Exercise entry updated.');
    expect(exerciseService.updateExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ENTRY_ID,
      {
        duration_minutes: 45,
        steps: 1234,
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 12,
            weight: null,
            duration: null,
            distance: null,
            rest_time: null,
            rpe: null,
            rir: null,
            notes: null,
          },
        ],
      }
    );
  });

  it('rejects an unparseable sets string', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'update_exercise_entry', entry_id: ENTRY_ID, sets: '{bad' },
      opts
    );
    expect(result).toBe('Error [VALIDATION]: Invalid JSON format for sets');
    expect(exerciseService.updateExerciseEntry).not.toHaveBeenCalled();
  });

  it('maps a missing entry to NOT_FOUND with the entry id', async () => {
    vi.mocked(exerciseService.updateExerciseEntry).mockRejectedValue(
      new Error('Exercise entry not found.')
    );
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'update_exercise_entry', entry_id: ENTRY_ID, notes: 'x' },
      opts
    );
    expect(result).toBe(
      `Error [NOT_FOUND]: Exercise Entry with ID '${ENTRY_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('deletes an entry', async () => {
    vi.mocked(exerciseService.deleteExerciseEntry).mockResolvedValue({
      message: 'Exercise entry deleted successfully.',
    });
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'delete_exercise_entry', entry_id: ENTRY_ID },
      opts
    );
    expect(result).toBe('✅ Exercise entry deleted.');
    expect(exerciseService.deleteExerciseEntry).toHaveBeenCalledWith(
      'user-1',
      ENTRY_ID
    );
  });

  it('maps a missing entry on delete to NOT_FOUND with the entry id', async () => {
    vi.mocked(exerciseService.deleteExerciseEntry).mockRejectedValue(
      new Error('Exercise entry not found.')
    );
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'delete_exercise_entry', entry_id: ENTRY_ID },
      opts
    );
    expect(result).toBe(
      `Error [NOT_FOUND]: Exercise Entry with ID '${ENTRY_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });
});

describe('get_exercise_details (manage action)', () => {
  it('renders the markdown detail card with parsed text columns', async () => {
    vi.mocked(exerciseService.getExerciseById).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Bench Press',
      description: 'A classic chest press.',
      category: 'Strength',
      equipment: '["Barbell"]',
      primary_muscles: '["Chest","Triceps"]',
      instructions: '["Lie on the bench.","Press the bar."]',
      images: ['bench.png'],
      level: 'intermediate',
      calories_per_hour: 400,
      is_custom: false,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_exercise_details', exercise_id: EXERCISE_ID },
      opts
    );

    expect(result).toBe(
      '### Bench Press\n\n' +
        '*A classic chest press.*\n\n' +
        '**Category:** Strength\n' +
        '**Equipment:** Barbell\n' +
        '**Muscles:** Chest, Triceps\n\n' +
        '#### Instructions\n' +
        '1. Lie on the bench.\n' +
        '2. Press the bar.\n'
    );
    expect(exerciseService.getExerciseById).toHaveBeenCalledWith(
      'user-1',
      EXERCISE_ID
    );
  });

  it('returns DB_ERROR when neither id nor name is given (MCP quirk)', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_exercise_details' },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });

  it('maps an unmatched name to the generic not-found text', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_exercise_details', exercise_name: 'Benchh' },
      opts
    );
    expect(result).toBe(NOT_FOUND_RESOURCE_TEXT);
  });
});

describe('get_exercise_progress (manage action)', () => {
  it('aggregates per-day set stats, skipping days without sets', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([
      { id: EXERCISE_ID, name: 'Bench Press' },
    ]);
    vi.mocked(exerciseService.getExerciseProgressData).mockResolvedValue([
      {
        entry_date: '2026-06-01',
        sets: [
          { reps: 10, weight: 60 },
          { reps: 8, weight: 70 },
        ],
      },
      { entry_date: '2026-06-01', sets: [{ reps: 5, weight: 80 }] },
      { entry_date: '2026-06-03', sets: [] },
      {
        entry_date: '2026-06-05',
        sets: [
          { reps: null, weight: 50 },
          { reps: 12, weight: null },
        ],
      },
    ]);

    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_exercise_progress', exercise_name: 'bench press' },
      opts
    );

    expect(result).toBe(
      '# Exercise Progress: bench press\n\n' +
        '**2026-06-01**: Max Weight: 80kg | Max Reps: 10 | Volume: 1560kg\n\n' +
        '**2026-06-05**: Max Weight: 50kg | Max Reps: 12 | Volume: 0kg\n\n' +
        '---\nShowing 2 of 2 results.'
    );
    expect(exerciseService.getExerciseProgressData).toHaveBeenCalledWith(
      'user-1',
      EXERCISE_ID,
      '1970-01-01',
      '9999-12-31'
    );
  });

  it('maps an unknown exercise to the generic not-found text', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_exercise_progress', exercise_name: 'nope' },
      opts
    );
    expect(result).toBe(NOT_FOUND_RESOURCE_TEXT);
  });
});

describe('sparky_list_exercises', () => {
  it('returns the paginated catalog as JSON', async () => {
    vi.mocked(exerciseDb.getExercisesWithPagination).mockResolvedValue([
      { id: EXERCISE_ID, name: 'Bench Press' },
    ]);
    vi.mocked(exerciseDb.countExercises).mockResolvedValue(1);

    const result = await tools.sparky_list_exercises.execute!({}, opts);

    expect(result).toBe(
      JSON.stringify({
        data: [{ id: EXERCISE_ID, name: 'Bench Press' }],
        has_more: false,
        next_offset: null,
        total_count: 1,
      })
    );
    expect(exerciseDb.getExercisesWithPagination).toHaveBeenCalledWith(
      'user-1',
      undefined,
      null,
      null,
      null,
      null,
      20,
      0
    );
    expect(exerciseDb.countExercises).toHaveBeenCalledWith(
      'user-1',
      undefined,
      null,
      null,
      null,
      null
    );
  });

  it('clamps the limit to 50 and treats a blank search as absent', async () => {
    vi.mocked(exerciseDb.getExercisesWithPagination).mockResolvedValue([]);
    vi.mocked(exerciseDb.countExercises).mockResolvedValue(0);

    await tools.sparky_list_exercises.execute!(
      { limit: 500, offset: 10, search: '   ' },
      opts
    );

    expect(exerciseDb.getExercisesWithPagination).toHaveBeenCalledWith(
      'user-1',
      undefined,
      null,
      null,
      null,
      null,
      50,
      10
    );
  });
});

describe('sparky_get_exercise_details', () => {
  it('returns the projected exercise as JSON', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([
      {
        id: EXERCISE_ID,
        name: 'Bench Press',
        category: 'Strength',
        primary_muscles: ['Chest', 'Triceps'],
        equipment: ['Barbell'],
        level: 'intermediate',
        calories_per_hour: 400,
        description: null,
        is_custom: false,
        instructions: ['Lie on the bench.'],
        images: [],
        user_id: 'user-1',
      },
    ]);

    const result = await tools.sparky_get_exercise_details.execute!(
      { exercise_name: 'Bench Press' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        id: EXERCISE_ID,
        name: 'Bench Press',
        category: 'Strength',
        muscle_groups: ['Chest', 'Triceps'],
        equipment: ['Barbell'],
        level: 'intermediate',
        calories_per_hour: 400,
        description: null,
        is_custom: false,
        instructions: ['Lie on the bench.'],
        images: [],
      })
    );
  });

  it('names the missing exercise in the NOT_FOUND error', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    const result = await tools.sparky_get_exercise_details.execute!(
      { exercise_name: 'Benchh' },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Exercise with ID 'Benchh' not found.\n\nSuggestion: Check the ID and try again."
    );
  });
});

describe('sparky_search_exercises', () => {
  it('requires a query', async () => {
    const result = await tools.sparky_search_exercises.execute!(
      {} as never,
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: query: Invalid input: expected string, received undefined'
    );
  });

  it('returns projected matches as JSON', async () => {
    vi.mocked(exerciseService.searchExercisesPaginated).mockResolvedValue({
      exercises: [
        {
          id: EXERCISE_ID,
          name: 'Bench Press',
          category: 'Strength',
          primary_muscles: ['Chest'],
          equipment: ['Barbell'],
          level: 'intermediate',
          calories_per_hour: 400,
          description: null,
          is_custom: false,
          user_id: 'user-1',
          tags: ['private'],
        },
      ],
      totalCount: 1,
    });

    const result = await tools.sparky_search_exercises.execute!(
      { query: 'bench', muscle_group: 'Chest' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        data: [
          {
            id: EXERCISE_ID,
            name: 'Bench Press',
            category: 'Strength',
            muscle_groups: ['Chest'],
            equipment: ['Barbell'],
            level: 'intermediate',
            calories_per_hour: 400,
            description: null,
            is_custom: false,
          },
        ],
        has_more: false,
        next_offset: null,
        total_count: 1,
      })
    );
    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-1',
      'bench',
      'user-1',
      undefined,
      ['Chest'],
      20,
      0
    );
  });
});

describe('sparky_get_exercise_diary', () => {
  it('lets a single date override the range and wraps entries plus sets', async () => {
    vi.mocked(exerciseEntryDb.getExerciseDiaryRange).mockResolvedValue({
      entries: [{ id: 'ee-1' }],
      sets: [{ id: 's-1' }],
    });

    const result = await tools.sparky_get_exercise_diary.execute!(
      { date: '2026-06-10', start_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        start_date: '2026-06-10',
        end_date: '2026-06-10',
        entries: [{ id: 'ee-1' }],
        sets: [{ id: 's-1' }],
      })
    );
    expect(exerciseEntryDb.getExerciseDiaryRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-10',
      '2026-06-10'
    );
  });

  it('defaults to today (UTC) when no dates are given', async () => {
    vi.mocked(exerciseEntryDb.getExerciseDiaryRange).mockResolvedValue({
      entries: [],
      sets: [],
    });
    await tools.sparky_get_exercise_diary.execute!({}, opts);
    const today = todayInZone('UTC');
    expect(exerciseEntryDb.getExerciseDiaryRange).toHaveBeenCalledWith(
      'user-1',
      today,
      today
    );
  });
});

describe('sparky_get_daily_exercise_totals', () => {
  it('uses start_date as the end of an open range and wraps the rows', async () => {
    vi.mocked(exerciseEntryDb.getDailyExerciseTotalsRange).mockResolvedValue([
      { entry_date: '2026-06-01', entry_count: 2 },
    ]);

    const result = await tools.sparky_get_daily_exercise_totals.execute!(
      { start_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        start_date: '2026-06-01',
        end_date: '2026-06-01',
        rows: [{ entry_date: '2026-06-01', entry_count: 2 }],
      })
    );
    expect(exerciseEntryDb.getDailyExerciseTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      '2026-06-01'
    );
  });
});

describe('sparky_get_recent_exercise_entries', () => {
  it('defaults the limit to 50 and returns raw rows as JSON', async () => {
    vi.mocked(exerciseEntryDb.getRecentExerciseEntries).mockResolvedValue([
      { id: 'ee-1', exercise_name_from_catalog: 'Running' },
    ]);

    const result = await tools.sparky_get_recent_exercise_entries.execute!(
      {},
      opts
    );

    expect(result).toBe(
      JSON.stringify([{ id: 'ee-1', exercise_name_from_catalog: 'Running' }])
    );
    expect(exerciseEntryDb.getRecentExerciseEntries).toHaveBeenCalledWith(
      'user-1',
      50
    );
  });

  it('rejects an out-of-range limit', async () => {
    const result = await tools.sparky_get_recent_exercise_entries.execute!(
      { limit: 999 },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: limit: Too big: expected number to be <=200'
    );
  });
});

describe('sparky_get_exercise_usage', () => {
  it('returns paginated usage rows as JSON', async () => {
    vi.mocked(exerciseEntryDb.getExerciseUsage).mockResolvedValue({
      rows: [{ id: 'ee-1' }, { id: 'ee-2' }],
      totalCount: 12,
    });

    const result = await tools.sparky_get_exercise_usage.execute!(
      {
        exercise_id: EXERCISE_ID,
        start_date: '2026-06-01',
        end_date: '2026-06-07',
        limit: 2,
      },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        data: [{ id: 'ee-1' }, { id: 'ee-2' }],
        has_more: true,
        next_offset: 2,
        total_count: 12,
      })
    );
    expect(exerciseEntryDb.getExerciseUsage).toHaveBeenCalledWith(
      'user-1',
      EXERCISE_ID,
      '2026-06-01',
      '2026-06-07',
      2,
      0
    );
  });
});

describe('sparky_get_exercise_progress', () => {
  it('returns the aggregated days as JSON and forwards the date range', async () => {
    vi.mocked(exerciseService.getExerciseProgressData).mockResolvedValue([
      { entry_date: '2026-06-01', sets: [{ reps: 10, weight: 60 }] },
    ]);

    const result = await tools.sparky_get_exercise_progress.execute!(
      {
        exercise_id: EXERCISE_ID,
        start_date: '2026-06-01',
        end_date: '2026-06-07',
      },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        data: [
          {
            entry_date: '2026-06-01',
            max_weight: 60,
            max_reps: 10,
            total_volume: 600,
          },
        ],
        has_more: false,
        next_offset: null,
        total_count: 1,
      })
    );
    expect(exerciseService.getExerciseProgressData).toHaveBeenCalledWith(
      'user-1',
      EXERCISE_ID,
      '2026-06-01',
      '2026-06-07'
    );
  });

  it('collapses two same-day pg Date entries into one calendar-day group', async () => {
    vi.mocked(exerciseService.getExerciseProgressData).mockResolvedValue([
      { entry_date: new Date(2026, 5, 10), sets: [{ reps: 10, weight: 60 }] },
      { entry_date: new Date(2026, 5, 10), sets: [{ reps: 8, weight: 70 }] },
    ]);

    const result = await tools.sparky_get_exercise_progress.execute!(
      { exercise_id: EXERCISE_ID },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        data: [
          {
            entry_date: '2026-06-10',
            max_weight: 70,
            max_reps: 10,
            total_volume: 10 * 60 + 8 * 70,
          },
        ],
        has_more: false,
        next_offset: null,
        total_count: 1,
      })
    );
  });
});

describe('suggest_alternatives (manage action)', () => {
  const benchRow = {
    id: EXERCISE_ID,
    name: 'Bench Press',
    category: 'Strength',
    equipment: '["barbell"]',
    primary_muscles: '["chest"]',
  };
  const alternative = {
    origin: 'library' as const,
    id: EXERCISE_ID_2,
    name: 'Dumbbell Bench Press',
    source: 'custom',
    category: 'strength',
    modality: 'weight_reps' as const,
    level: null,
    mechanic: null,
    force: null,
    equipment: ['dumbbell'],
    primary_muscles: ['chest'],
    secondary_muscles: [],
    images: [],
    instructions: [],
    description: null,
    calories_per_hour: 300,
    score: 70,
    reasons: ['same_primary_muscles' as const, 'recently_performed' as const],
    last_performed_date: '2026-09-20',
  };

  it('resolves by name and passes filters through', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([benchRow]);
    vi.mocked(getExerciseAlternatives).mockResolvedValue({
      source: {
        id: EXERCISE_ID,
        name: 'Bench Press',
        primary_muscles: ['chest'],
        equipment: ['barbell'],
      },
      alternatives: [
        alternative,
        {
          ...alternative,
          origin: 'catalog',
          id: 'Cable_Crossover',
          name: 'Cable Crossover',
          equipment: ['cable'],
          reasons: ['same_primary_muscles', 'different_equipment'],
          last_performed_date: null,
        },
      ],
      rankable: true,
      catalog_available: false,
    });

    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'suggest_alternatives',
        exercise_name: 'bench press',
        alternative_mode: 'different_equipment',
        equipment: 'dumbbell, cable',
        avoid_muscles: 'shoulders',
        limit: 5,
      },
      opts
    );

    expect(getExerciseAlternatives).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      EXERCISE_ID,
      {
        mode: 'different_equipment',
        equipment: ['dumbbell', 'cable'],
        excludeMuscles: ['shoulders'],
        excludeIds: [],
        includeCatalog: true,
        limit: 5,
      }
    );
    expect(result).toBe(
      '### Alternatives to Bench Press\n\n' +
        '1. **Dumbbell Bench Press**\n' +
        '   Muscles: chest | Equipment: dumbbell | Last done: 2026-09-20\n' +
        '   Why: same primary muscles, done recently\n' +
        `   ID: ${EXERCISE_ID_2}\n` +
        '2. **Cable Crossover**\n' +
        '   Muscles: chest | Equipment: cable\n' +
        '   Why: same primary muscles, different equipment\n' +
        '   Free Exercise DB (not in library yet), catalog ID: Cable_Crossover\n\n' +
        '_Free Exercise DB is unavailable right now, so only library exercises are listed._'
    );
  });

  it('explains when the exercise has no muscles to rank against', async () => {
    vi.mocked(exerciseService.getExerciseById).mockResolvedValue(benchRow);
    vi.mocked(getExerciseAlternatives).mockResolvedValue({
      source: {
        id: EXERCISE_ID,
        name: 'Bench Press',
        primary_muscles: [],
        equipment: [],
      },
      alternatives: [],
      rankable: false,
      catalog_available: true,
    });
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'suggest_alternatives', exercise_id: EXERCISE_ID },
      opts
    );
    expect(result).toBe(
      '### Alternatives to Bench Press\n\nBench Press has no primary muscles recorded, so alternatives cannot be ranked. Use search_exercises instead.'
    );
    expect(vi.mocked(getExerciseAlternatives).mock.calls[0][3]).toMatchObject({
      mode: 'similar',
      limit: 10,
    });
  });

  it('maps an unknown exercise to the generic not-found text', async () => {
    vi.mocked(exerciseService.searchExercises).mockResolvedValue([]);
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'suggest_alternatives', exercise_name: 'Nope' },
      opts
    );
    expect(result).toBe(NOT_FOUND_RESOURCE_TEXT);
  });
});

describe('rate_workout (manage action)', () => {
  it('rates the whole session and confirms what was saved', async () => {
    vi.mocked(setWorkoutFeedbackForEntry).mockResolvedValue({
      exercise_preset_entry_id: 'session-1',
      session: {
        difficulty: 'too_hard',
        pain: true,
        pain_note: 'left knee',
        updated_at: 'x',
      },
      exercises: [],
    });
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'rate_workout',
        entry_id: ENTRY_ID,
        difficulty: 'too_hard',
        pain: true,
        pain_note: 'left knee',
      },
      opts
    );
    expect(setWorkoutFeedbackForEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ENTRY_ID,
      'session',
      { difficulty: 'too_hard', pain: true, pain_note: 'left knee' }
    );
    expect(result).toContain(
      'Workout feedback saved (too hard, pain: left knee). Adaptive suggestions will use it next time.'
    );
  });

  it('rates a single exercise', async () => {
    vi.mocked(setWorkoutFeedbackForEntry).mockResolvedValue({
      exercise_preset_entry_id: 'session-1',
      session: null,
      exercises: [
        {
          exercise_entry_id: ENTRY_ID,
          difficulty: 'too_easy',
          pain: false,
          pain_note: null,
          updated_at: 'x',
        },
      ],
    });
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'rate_workout',
        entry_id: ENTRY_ID,
        scope: 'exercise',
        difficulty: 'too_easy',
      },
      opts
    );
    expect(vi.mocked(setWorkoutFeedbackForEntry).mock.calls[0][3]).toBe(
      'exercise'
    );
    expect(result).toContain('Exercise feedback saved (too easy).');
  });

  it('rejects a note together with pain=false', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      {
        action: 'rate_workout',
        entry_id: ENTRY_ID,
        pain: false,
        pain_note: 'sore',
      },
      opts
    );
    expect(result).toContain('pain_note cannot be combined with pain=false');
    expect(setWorkoutFeedbackForEntry).not.toHaveBeenCalled();
  });

  it('passes omitted fields through so saved pain is kept', async () => {
    vi.mocked(setWorkoutFeedbackForEntry).mockResolvedValue({
      exercise_preset_entry_id: 'session-1',
      session: {
        difficulty: 'too_hard',
        pain: true,
        pain_note: 'knee',
        updated_at: 'x',
      },
      exercises: [],
    });
    await tools.sparky_manage_exercise.execute!(
      { action: 'rate_workout', entry_id: ENTRY_ID, difficulty: 'too_hard' },
      opts
    );
    expect(vi.mocked(setWorkoutFeedbackForEntry).mock.calls[0][4]).toEqual({
      difficulty: 'too_hard',
      pain: undefined,
      pain_note: undefined,
    });
  });

  it('explains when the entry is not part of a session', async () => {
    const { WorkoutEntryNotInSessionError } =
      await import('../services/workoutCoachingService.js');
    vi.mocked(setWorkoutFeedbackForEntry).mockRejectedValue(
      new WorkoutEntryNotInSessionError()
    );
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'rate_workout', entry_id: ENTRY_ID, difficulty: 'just_right' },
      opts
    );
    expect(result).toContain(
      'This exercise entry is not part of a logged workout session'
    );
  });
});

describe('get_workout_coaching (manage action)', () => {
  const baseSignal = {
    exercise_id: EXERCISE_ID,
    last_performed_date: '2026-09-24',
    days_since_last_performed: 2,
    last_difficulty: null,
    last_pain: null,
    too_easy_streak: 0,
    too_hard_streak: 0,
    pain_streak: 0,
    avg_rpe: null,
    avg_rir: null,
    sessions_in_variation_window: 1,
  };

  it('explains the adjustment for each exercise of a preset', async () => {
    vi.mocked(workoutPresetService.getWorkoutPresetById).mockResolvedValue({
      id: PRESET_ID,
      exercises: [
        { exercise_id: EXERCISE_ID, exercise_name: 'Bench Press' },
        {
          exercise_id: EXERCISE_ID_2,
          exercise_name: 'Cable Fly',
          exercise: { mechanic: 'isolation' },
        },
      ],
    } as never);
    vi.mocked(getWorkoutCoachingSignals).mockResolvedValue({
      adaptive_suggestions: true,
      signals: [
        { ...baseSignal, last_pain: 'exercise', pain_streak: 1 },
        {
          ...baseSignal,
          exercise_id: EXERCISE_ID_2,
          sessions_in_variation_window: 7,
        },
      ],
    });
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_coaching', preset_id: PRESET_ID },
      opts
    );
    expect(getWorkoutCoachingSignals).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      [EXERCISE_ID, EXERCISE_ID_2],
      null
    );
    expect(result).toBe(
      '### Adaptive coaching\n\n' +
        '- **Bench Press** (last done 2026-09-24): lighter (-10%): pain was reported in this exercise last time\n' +
        '- **Cable Fly** (last done 2026-09-24): done in most recent workouts; consider a variation (suggest_alternatives)\n\n' +
        'The user can decline any change in the app ("Use my usual").'
    );
  });

  it('says when adaptive suggestions are off', async () => {
    vi.mocked(exerciseService.getExerciseById).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Bench Press',
    });
    vi.mocked(getWorkoutCoachingSignals).mockResolvedValue({
      adaptive_suggestions: false,
      signals: [],
    });
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_coaching', exercise_id: EXERCISE_ID },
      opts
    );
    expect(result).toContain('Adaptive suggestions are turned off');
  });

  it('reports normal progression without recent history', async () => {
    vi.mocked(exerciseService.getExerciseById).mockResolvedValue({
      id: EXERCISE_ID,
      name: 'Bench Press',
    });
    vi.mocked(getWorkoutCoachingSignals).mockResolvedValue({
      adaptive_suggestions: true,
      signals: [],
    });
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'get_workout_coaching', exercise_id: EXERCISE_ID },
      opts
    );
    expect(result).toContain(
      '- **Bench Press**: no recent history: normal progression'
    );
  });
});
