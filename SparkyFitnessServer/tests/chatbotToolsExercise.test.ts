import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildExerciseTools } from '../ai/tools/exerciseTools.js';
import exerciseService from '../services/exerciseService.js';
import workoutPresetService from '../services/workoutPresetService.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';

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
    createWorkoutPreset: vi.fn(),
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
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred. Please try again.\n\nSuggestion: If the issue persists, contact support.';
const NOT_FOUND_RESOURCE_TEXT =
  "Error [NOT_FOUND]: Resource with ID 'unknown' not found.\n\nSuggestion: Check the ID and try again.";

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const EXERCISE_ID = '22222222-2222-4222-8222-222222222222';
const EXERCISE_ID_2 = '33333333-3333-4333-8333-333333333333';
const PRESET_ID = '44444444-4444-4444-8444-444444444444';

let tools: ReturnType<typeof buildExerciseTools>;

beforeEach(() => {
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
      is_custom: true,
      shared_with_public: false,
      source: 'manual',
    });
  });
});

describe('log_exercise', () => {
  it('requires exercise_id or exercise_name', async () => {
    const result = await tools.sparky_manage_exercise.execute!(
      { action: 'log_exercise', entry_date: '2026-06-10' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Either exercise_id or exercise_name must be provided'
    );
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
            rest_time: null,
            rpe: null,
            notes: null,
          },
          {
            set_number: 2,
            set_type: 'Drop Set',
            reps: 8,
            weight: 65,
            duration: null,
            rest_time: null,
            rpe: null,
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
            rest_time: null,
            rpe: null,
            notes: null,
          },
        ],
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
      '2026-06-10'
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
        exercise_ids: [EXERCISE_ID, EXERCISE_ID_2],
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
        exercises: [
          { exercise_id: EXERCISE_ID, sort_order: 0 },
          { exercise_id: EXERCISE_ID_2, sort_order: 1 },
        ],
      }
    );
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
            rest_time: null,
            rpe: null,
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
      JSON.stringify(
        {
          data: [{ id: EXERCISE_ID, name: 'Bench Press' }],
          has_more: false,
          next_offset: null,
          total_count: 1,
        },
        null,
        2
      )
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
      JSON.stringify(
        {
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
        },
        null,
        2
      )
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
      JSON.stringify(
        {
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
        },
        null,
        2
      )
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
      JSON.stringify(
        {
          start_date: '2026-06-10',
          end_date: '2026-06-10',
          entries: [{ id: 'ee-1' }],
          sets: [{ id: 's-1' }],
        },
        null,
        2
      )
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
      JSON.stringify(
        {
          start_date: '2026-06-01',
          end_date: '2026-06-01',
          rows: [{ entry_date: '2026-06-01', entry_count: 2 }],
        },
        null,
        2
      )
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
      JSON.stringify(
        [{ id: 'ee-1', exercise_name_from_catalog: 'Running' }],
        null,
        2
      )
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
      JSON.stringify(
        {
          data: [{ id: 'ee-1' }, { id: 'ee-2' }],
          has_more: true,
          next_offset: 2,
          total_count: 12,
        },
        null,
        2
      )
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
      JSON.stringify(
        {
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
        },
        null,
        2
      )
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
      JSON.stringify(
        {
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
        },
        null,
        2
      )
    );
  });
});
