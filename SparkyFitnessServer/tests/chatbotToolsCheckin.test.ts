import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone, moodValueToTag } from '@workspace/shared';
import { buildCheckinTools } from '../ai/tools/checkinTools.js';
import measurementService from '../services/measurementService.js';
import preferenceService from '../services/preferenceService.js';
import moodRepository, {
  type LegacyMoodEntryRow,
  type MoodEntryRow,
} from '../models/moodRepository.js';
import fastingRepository from '../models/fastingRepository.js';
import sleepRepository from '../models/sleepRepository.js';
import * as oralCareService from '../services/oralCareService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';
import { CustomCategoryExistsError } from '../utils/errors.js';

function moodRow(overrides: Partial<MoodEntryRow> = {}): MoodEntryRow {
  return {
    id: 'mood-1',
    user_id: 'user-1',
    mood_value: 50,
    energy_value: null,
    focus_value: null,
    mood_tags: [],
    notes: null,
    entry_date: '2026-06-01',
    entry_timestamp: new Date('2026-06-01T12:00:00Z'),
    source: 'manual',
    created_at: new Date('2026-06-01T12:00:00Z'),
    updated_at: new Date('2026-06-01T12:00:00Z'),
    ...overrides,
  };
}

// log_mood stamps a check-in for another day at local noon (UTC in these tests).
const NOON_JUNE_1 = new Date('2026-06-01T12:00:00.000Z');

// getLegacyMoodEntryForDate only ever returns rows that carry a mood.
function legacyRow(
  overrides: Partial<LegacyMoodEntryRow> = {}
): LegacyMoodEntryRow {
  return { ...moodRow(), mood_value: 50, ...overrides };
}

vi.mock('../services/measurementService', () => ({
  default: {
    upsertCheckInMeasurements: vi.fn(),
    getCheckInMeasurements: vi.fn(),
    getCheckInMeasurementsByDateRange: vi.fn(),
    getCustomCategories: vi.fn(),
    createCustomCategory: vi.fn(),
    upsertCustomMeasurementEntry: vi.fn(),
    getCustomMeasurementEntriesByDate: vi.fn(),
    getCustomMeasurementEntriesByDateRange: vi.fn(),
    processSleepEntry: vi.fn(),
  },
}));
vi.mock('../services/preferenceService', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));
vi.mock('../models/moodRepository', async (importOriginal) => ({
  // hasMoodContent is a pure named export; keep the real one.
  ...(await importOriginal<typeof import('../models/moodRepository.js')>()),
  default: {
    createCheckin: vi.fn(),
    getCheckinsForDate: vi.fn(),
    getLegacyMoodEntryForDate: vi.fn(),
  },
}));
vi.mock('../models/fastingRepository', () => ({
  default: {
    createFastingLog: vi.fn(),
    updateFast: vi.fn(),
    getCurrentFast: vi.fn(),
    getFastingLogsOverlappingDay: vi.fn(),
  },
}));
// get_fasting_status falls back to the auto-calculated fast, which reads
// fasting preferences and food entries from the database.
vi.mock('../services/fastingAutoCalculationService', () => ({
  default: {
    getCurrentAutoFast: vi.fn(async () => null),
  },
}));
vi.mock('../models/sleepRepository', () => ({
  default: {
    getSleepEntriesByUserIdAndDateRange: vi.fn(),
  },
}));
vi.mock('../services/oralCareService', () => ({
  MAX_HISTORY_DAYS: 366,
  getHistory: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = toolOpts;
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildCheckinTools>;

function mockEmptyDiary() {
  vi.mocked(measurementService.getCheckInMeasurements).mockResolvedValue({});
  vi.mocked(
    measurementService.getCheckInMeasurementsByDateRange
  ).mockResolvedValue([]);
  vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([]);
  vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
    undefined
  );
  vi.mocked(
    sleepRepository.getSleepEntriesByUserIdAndDateRange
  ).mockResolvedValue([]);
  vi.mocked(fastingRepository.getFastingLogsOverlappingDay).mockResolvedValue(
    []
  );
  vi.mocked(
    measurementService.getCustomMeasurementEntriesByDate
  ).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({});
  tools = buildCheckinTools('user-1', 'UTC');
});

describe('get_custom_metrics_history', () => {
  it('returns custom-only days with category metadata and source dates', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'custom-1',
        category_id: 'category-1',
        value: 82,
        entry_date: '2026-06-02',
        entry_timestamp: '2026-06-02T07:30:00.000Z',
        custom_categories: {
          id: 'category-1',
          name: 'Abdomen',
          measurement_type: 'cm',
          data_type: 'numeric',
        },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_custom_metrics_history',
        start_date: '2026-06-01',
        end_date: '2026-06-03',
      },
      opts
    );

    expect(result).toContain('Custom Metrics History');
    expect(result).toContain('Abdomen');
    expect(result).toContain('2026-06-02');
    expect(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).toHaveBeenCalledWith('user-1', 'user-1', '2026-06-01', '2026-06-03');
  });
});

describe('log_biometrics', () => {
  it('converts explicit units to kg/cm for storage and echoes the input units', async () => {
    vi.mocked(measurementService.upsertCheckInMeasurements).mockResolvedValue({
      id: 'ci-1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_biometrics',
        entry_date: '2026-06-01',
        weight: 180,
        weight_unit: 'lbs',
        waist: 32,
        measurements_unit: 'in',
        steps: 9000,
      },
      opts
    );

    expect(result).toBe(
      '✅ Biometrics logged for 2026-06-01 (weight: 180lbs, steps: 9000, waist: 32in).'
    );
    expect(measurementService.upsertCheckInMeasurements).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-01',
      {
        weight: 180 * 0.45359237,
        waist: 32 * 2.54,
        steps: 9000,
      }
    );
  });

  it('stores smart-scale composition, converting masses by weight_unit', async () => {
    vi.mocked(measurementService.upsertCheckInMeasurements).mockResolvedValue({
      id: 'ci-1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_biometrics',
        entry_date: '2026-06-01',
        muscle_mass: 80,
        bone_mass: 8,
        body_water: 55.4,
        weight_unit: 'lbs',
      },
      opts
    );

    expect(result).toBe(
      '✅ Biometrics logged for 2026-06-01 (muscle mass: 80lbs, bone mass: 8lbs, body water: 55.4%).'
    );
    expect(measurementService.upsertCheckInMeasurements).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-01',
      {
        muscle_mass_kg: 80 * 0.45359237,
        bone_mass_kg: 8 * 0.45359237,
        // A percentage is never unit-converted.
        body_water_percentage: 55.4,
      }
    );
  });

  it('defaults smart-scale masses to kg when no weight_unit is given', async () => {
    vi.mocked(measurementService.upsertCheckInMeasurements).mockResolvedValue({
      id: 'ci-1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_biometrics',
        entry_date: '2026-06-01',
        muscle_mass: 34.2,
        bone_mass: 3.1,
      },
      opts
    );

    expect(result).toBe(
      '✅ Biometrics logged for 2026-06-01 (muscle mass: 34.2kg, bone mass: 3.1kg).'
    );
    expect(measurementService.upsertCheckInMeasurements).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-01',
      { muscle_mass_kg: 34.2, bone_mass_kg: 3.1 }
    );
  });

  it("converts the 'lb' and 'ft' alias units for storage", async () => {
    vi.mocked(measurementService.upsertCheckInMeasurements).mockResolvedValue({
      id: 'ci-1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_biometrics',
        entry_date: '2026-06-01',
        weight: 150,
        weight_unit: 'lb',
        height: 6,
        height_unit: 'ft',
      },
      opts
    );

    expect(result).toBe(
      '✅ Biometrics logged for 2026-06-01 (weight: 150lb, height: 6ft).'
    );
    expect(measurementService.upsertCheckInMeasurements).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-01',
      {
        weight: 150 * 0.45359237,
        height: 6 * 30.48,
      }
    );
  });

  it("falls back to the user's preferred units for both conversion and text", async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      default_weight_unit: 'lbs',
    });
    vi.mocked(measurementService.upsertCheckInMeasurements).mockResolvedValue({
      id: 'ci-1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_biometrics', entry_date: '2026-06-01', weight: 180 },
      opts
    );

    // The value is interpreted as lbs (the user's preference), so the text has
    // to say lbs. Reporting 'kg' here told the user a unit that was never used.
    expect(result).toBe(
      '✅ Biometrics logged for 2026-06-01 (weight: 180lbs).'
    );
    expect(measurementService.upsertCheckInMeasurements).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-01',
      { weight: 180 * 0.45359237 }
    );
  });

  it("reports 'no changes' when no measurements are provided", async () => {
    vi.mocked(measurementService.upsertCheckInMeasurements).mockResolvedValue(
      null
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_biometrics', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe('✅ Biometrics logged for 2026-06-01 (no changes).');
    expect(measurementService.upsertCheckInMeasurements).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-01',
      {}
    );
  });

  it('rejects an unknown weight unit', async () => {
    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_biometrics',
        entry_date: '2026-06-01',
        weight: 80,
        weight_unit: 'stone',
      } as any,
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: weight_unit: Invalid option: expected one of "kg"|"lbs"|"lb"|"g"'
    );
  });
});

describe('log_custom_metric', () => {
  it('logs against a case-insensitively matched category', async () => {
    vi.mocked(measurementService.getCustomCategories).mockResolvedValue([
      {
        id: 'c1',
        name: 'Blood Pressure',
        measurement_type: 'mmHg',
        frequency: 'Daily',
      },
    ]);
    vi.mocked(
      measurementService.upsertCustomMeasurementEntry
    ).mockResolvedValue({ id: 'm1' });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_custom_metric',
        category_name: 'blood pressure',
        value: 120,
        unit: 'mmHg',
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(result).toBe(
      '✅ Custom metric "blood pressure" logged: 120 mmHg on 2026-06-01.'
    );
    expect(
      measurementService.upsertCustomMeasurementEntry
    ).toHaveBeenCalledWith('user-1', 'user-1', {
      category_id: 'c1',
      value: '120',
      entry_date: '2026-06-01',
      notes: undefined,
    });
  });

  it('logs custom metric successfully for non-daily frequency category', async () => {
    vi.mocked(measurementService.getCustomCategories).mockResolvedValue([
      {
        id: 'c2',
        name: 'Blood Pressure Systolic',
        frequency: 'Unlimited',
      },
    ]);
    vi.mocked(
      measurementService.upsertCustomMeasurementEntry
    ).mockResolvedValue({ id: 'm2' });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_custom_metric',
        category_name: 'Blood Pressure Systolic',
        value: 118,
        unit: 'mmHg',
        entry_date: '2026-08-10',
      },
      opts
    );

    expect(result).toBe(
      '✅ Custom metric "Blood Pressure Systolic" logged: 118 mmHg on 2026-08-10.'
    );
    expect(
      measurementService.upsertCustomMeasurementEntry
    ).toHaveBeenCalledWith('user-1', 'user-1', {
      category_id: 'c2',
      value: '118',
      entry_date: '2026-08-10',
      notes: undefined,
    });
  });

  it('asks for create_category when the category does not exist', async () => {
    vi.mocked(measurementService.getCustomCategories).mockResolvedValue([]);

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_custom_metric',
        category_name: 'Hydration',
        value: 5,
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: Category "Hydration" not found. Create it first using the create_category action.'
    );
    expect(
      measurementService.upsertCustomMeasurementEntry
    ).not.toHaveBeenCalled();
  });
});

describe('list_categories / create_category', () => {
  it('lists categories sorted by name', async () => {
    vi.mocked(measurementService.getCustomCategories).mockResolvedValue([
      { id: 'c2', name: 'Steps Goal', measurement_type: 'steps' },
      { id: 'c1', name: 'Blood Pressure', measurement_type: 'mmHg' },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_categories' },
      opts
    );

    expect(result).toBe(
      '# Custom Measurement Categories\n\n' +
        '**Blood Pressure**\n  ID: c1\n\n' +
        '**Steps Goal**\n  ID: c2'
    );
    expect(measurementService.getCustomCategories).toHaveBeenCalledWith(
      'user-1',
      'user-1'
    );
  });

  it('creates a category with MCP defaults', async () => {
    vi.mocked(measurementService.createCustomCategory).mockResolvedValue({
      id: 'c9',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'create_category', category_name: 'Hydration', unit: 'ml' },
      opts
    );

    expect(result).toBe(
      '✅ Category "Hydration" created with measurement type "ml".'
    );
    expect(measurementService.createCustomCategory).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        name: 'Hydration',
        measurement_type: 'ml',
        data_type: 'numeric',
        frequency: 'Daily',
      }
    );
  });

  it('reports a category name the user already has', async () => {
    vi.mocked(measurementService.createCustomCategory).mockRejectedValue(
      new CustomCategoryExistsError('Hydration')
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'create_category', category_name: 'Hydration' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: A category named "Hydration" already exists.'
    );
  });

  it('creates a unit-less category', async () => {
    vi.mocked(measurementService.createCustomCategory).mockResolvedValue({
      id: 'c9',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'create_category', category_name: 'Meditation' },
      opts
    );

    expect(result).toBe('✅ Category "Meditation" created.');
    expect(measurementService.createCustomCategory).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        name: 'Meditation',
        measurement_type: 'unit',
        data_type: 'numeric',
        frequency: 'Daily',
      }
    );
  });
});

describe('log_mood', () => {
  it('creates a check-in and echoes the time and notes', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: 80, notes: 'Feeling good' })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_mood',
        mood_value: 8,
        notes: 'Feeling good',
        entry_date: '2026-06-01',
      },
      opts
    );

    // Spoken as 8/10, stored on the 10-100 scale the column holds.
    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: 8/10 — Feeling good.'
    );
    expect(moodRepository.createCheckin).toHaveBeenCalledWith('user-1', {
      moodValue: 80,
      notes: 'Feeling good',
      moodTags: null,
      energyValue: undefined,
      focusValue: undefined,
      entryDate: '2026-06-01',
      entryTimestamp: NOON_JUNE_1,
    });
  });

  it('logs energy and focus alongside mood', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({
        mood_value: 80,
        energy_value: 4,
        focus_value: 2,
        notes: 'Feeling good',
      })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_mood',
        mood_value: 8,
        energy_value: 4,
        focus_value: 2,
        notes: 'Feeling good',
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: 8/10, energy 4/5, focus 2/5 — Feeling good.'
    );
    expect(moodRepository.createCheckin).toHaveBeenCalledWith('user-1', {
      moodValue: 80,
      notes: 'Feeling good',
      moodTags: null,
      energyValue: 4,
      focusValue: 2,
      entryDate: '2026-06-01',
      entryTimestamp: NOON_JUNE_1,
    });
  });

  it('creates a second check-in for the same day instead of updating', async () => {
    vi.mocked(moodRepository.createCheckin)
      .mockResolvedValueOnce(
        moodRow({
          id: 'mood-1',
          mood_value: 80,
          entry_timestamp: new Date('2026-06-01T08:05:00Z'),
        })
      )
      .mockResolvedValueOnce(
        moodRow({
          id: 'mood-2',
          mood_value: 40,
          entry_timestamp: new Date('2026-06-01T17:30:00Z'),
        })
      );

    const first = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', mood_value: 8, entry_date: '2026-06-01' },
      opts
    );
    const second = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', mood_value: 4, entry_date: '2026-06-01' },
      opts
    );

    expect(moodRepository.createCheckin).toHaveBeenCalledTimes(2);
    expect(first).toBe('✅ Check-in logged for 2026-06-01 at 08:05: 8/10.');
    expect(second).toBe('✅ Check-in logged for 2026-06-01 at 17:30: 4/10.');
  });

  it('renders the time in the user timezone', async () => {
    const nyTools = buildCheckinTools('user-1', 'America/New_York');
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({
        mood_value: 80,
        entry_timestamp: new Date('2026-06-01T13:05:00Z'),
      })
    );

    const result = await nyTools.sparky_manage_checkin.execute!(
      { action: 'log_mood', mood_value: 8, entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe('✅ Check-in logged for 2026-06-01 at 09:05: 8/10.');
  });

  it('logs energy alone as a check-in with no mood', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: null, energy_value: 2 })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', energy_value: 2, entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: energy 2/5.'
    );
    const input = vi.mocked(moodRepository.createCheckin).mock.calls[0]![1];
    expect(input.moodValue).toBeNull();
    expect(input.energyValue).toBe(2);
  });

  it('rejects an empty log_mood call without touching the repository', async () => {
    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: A check-in needs at least one of mood, energy, focus, notes or tags.'
    );
    expect(moodRepository.createCheckin).not.toHaveBeenCalled();
  });

  it('stores whitespace-only notes as null so no line ends in a dangling dash', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: 80, notes: null })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_mood',
        mood_value: 8,
        notes: '   ',
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(
      vi.mocked(moodRepository.createCheckin).mock.calls[0]![1].notes
    ).toBeNull();
    expect(result).toBe('✅ Check-in logged for 2026-06-01 at 12:00: 8/10.');

    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({ mood_value: 80, notes: null }),
    ]);
    const diary = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );
    expect(diary).toContain('- 12:00 8/10\n');
  });

  it('renders a notes-only diary line and keeps a note that starts with a dash', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({ mood_value: null, notes: 'Anxious today' }),
      moodRow({
        mood_value: null,
        notes: '— odd start',
        entry_timestamp: new Date('2026-06-01T13:00:00Z'),
      }),
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toContain(
      '- 12:00 — Anxious today\n- 13:00 — — odd start\n'
    );
  });

  it('rejects whitespace-only notes with no other field', async () => {
    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', notes: '   ', entry_date: '2026-06-01' },
      opts
    );

    expect(String(result)).toContain(
      'at least one of mood, energy, focus, notes or tags'
    );
    expect(moodRepository.createCheckin).not.toHaveBeenCalled();
  });

  it('rejects an energy_value outside 1-5 without touching the repository', async () => {
    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_mood',
        mood_value: 8,
        energy_value: 6,
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(String(result)).toContain('Error');
    expect(String(result)).toContain('energy_value');
    expect(moodRepository.createCheckin).not.toHaveBeenCalled();
  });

  it('infers log_mood from energy_value when no action is given', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: 70, energy_value: 3 })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { energy_value: 3, mood_value: 7, entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: 7/10, energy 3/5.'
    );
    expect(moodRepository.createCheckin).toHaveBeenCalled();
  });

  it('infers log_mood from focus_value alone when no action is given', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: null, focus_value: 3 })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { focus_value: 3, entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: focus 3/5.'
    );
  });

  it('logs mood without notes', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: 50 })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', mood_value: 5, entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe('✅ Check-in logged for 2026-06-01 at 12:00: 5/10.');
    expect(moodRepository.createCheckin).toHaveBeenCalledWith('user-1', {
      moodValue: 50,
      notes: null,
      moodTags: null,
      energyValue: undefined,
      focusValue: undefined,
      entryDate: '2026-06-01',
      entryTimestamp: NOON_JUNE_1,
    });
  });

  it("defaults to today's date and the current time if entry_date is omitted", async () => {
    const now = new Date('2026-06-01T15:20:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'], now });
    try {
      vi.mocked(moodRepository.createCheckin).mockResolvedValue(
        moodRow({ mood_value: 80 })
      );

      const today = todayInZone('UTC');
      const result = await tools.sparky_manage_checkin.execute!(
        { action: 'log_mood', mood_value: 8 },
        opts
      );

      expect(result).toBe(`✅ Check-in logged for ${today} at 12:00: 8/10.`);
      const input = vi.mocked(moodRepository.createCheckin).mock.calls[0]![1];
      expect(input.entryDate).toBe('2026-06-01');
      expect(input.entryTimestamp).toEqual(now);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stamps a check-in for another day at local noon in the user timezone', async () => {
    const nyTools = buildCheckinTools('user-1', 'America/New_York');
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(moodRow());

    await nyTools.sparky_manage_checkin.execute!(
      { action: 'log_mood', energy_value: 3, entry_date: '2026-06-01' },
      opts
    );

    expect(
      vi.mocked(moodRepository.createCheckin).mock.calls[0]![1].entryTimestamp
    ).toEqual(new Date('2026-06-01T16:00:00.000Z'));
  });

  // The reported bug: the tool validated 1-10 and stored it verbatim into a
  // 10-100 column. The `sad` band runs to 15, so all ten scores landed in it
  // and every mood logged through chat read back as Sad.
  it.each([
    [1, 'sad'],
    [4, 'neutral'],
    [5, 'thoughtful'],
    [8, 'happy'],
    [10, 'excited'],
  ])('stores a score of %i in the %s band', async (score, band) => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(moodRow());

    await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', mood_value: score, entry_date: '2026-06-01' },
      opts
    );

    const stored = vi.mocked(moodRepository.createCheckin).mock.calls[0]![1]
      .moodValue as number;
    expect(moodValueToTag(stored)).toBe(band);
  });
});

describe('log_fasting', () => {
  it('creates an active fast without a follow-up update', async () => {
    vi.mocked(fastingRepository.createFastingLog).mockResolvedValue({
      id: 'f1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_fasting', start_time: '2026-06-01T20:00:00Z' },
      opts
    );

    expect(result).toBe('✅ Fasting window logged (ACTIVE).');
    expect(fastingRepository.createFastingLog).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01T20:00:00Z',
      null,
      null
    );
    expect(fastingRepository.updateFast).not.toHaveBeenCalled();
  });

  it('records a completed window via a follow-up update', async () => {
    vi.mocked(fastingRepository.createFastingLog).mockResolvedValue({
      id: 'f1',
    });
    vi.mocked(fastingRepository.updateFast).mockResolvedValue({ id: 'f1' });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_fasting',
        start_time: '2026-06-01T20:00:00Z',
        end_time: '2026-06-02T12:00:00Z',
        fasting_status: 'COMPLETED',
        fasting_type: '16:8',
      },
      opts
    );

    expect(result).toBe('✅ Fasting window logged (COMPLETED) — 16:8.');
    expect(fastingRepository.createFastingLog).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01T20:00:00Z',
      null,
      '16:8'
    );
    expect(fastingRepository.updateFast).toHaveBeenCalledWith('f1', 'user-1', {
      end_time: '2026-06-02T12:00:00Z',
      status: 'COMPLETED',
    });
  });
});

describe('log_sleep', () => {
  it('defaults wake time to 7 AM UTC and derives bedtime from the duration', async () => {
    vi.mocked(measurementService.processSleepEntry).mockResolvedValue({
      id: 's1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_sleep',
        entry_date: '2026-06-01',
        duration_seconds: 27000,
        sleep_score: 85,
      },
      opts
    );

    // The provided sleep_score must not be echoed: it is never stored
    // (processSleepEntry computes its own score).
    expect(result).toBe('✅ Sleep logged for 2026-06-01 (7h 30m).');
    expect(measurementService.processSleepEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        entry_date: '2026-06-01',
        bedtime: '2026-05-31T23:30:00.000Z',
        wake_time: '2026-06-01T07:00:00.000Z',
        duration_in_seconds: 27000,
        source: 'manual',
      }
    );
  });

  it("anchors the default wake time at 7 AM in the user's timezone", async () => {
    vi.mocked(measurementService.processSleepEntry).mockResolvedValue({
      id: 's1',
    });
    const tokyoTools = buildCheckinTools('user-1', 'Asia/Tokyo');

    await tokyoTools.sparky_manage_checkin.execute!(
      {
        action: 'log_sleep',
        entry_date: '2026-06-01',
        duration_seconds: 27000,
      },
      opts
    );

    // 7 AM in Tokyo on 2026-06-01 is 22:00 UTC the previous day.
    expect(measurementService.processSleepEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        entry_date: '2026-06-01',
        bedtime: '2026-05-31T14:30:00.000Z',
        wake_time: '2026-05-31T22:00:00.000Z',
        duration_in_seconds: 27000,
        source: 'manual',
      }
    );
  });

  it('derives wake time from bedtime using the default 8h duration', async () => {
    vi.mocked(measurementService.processSleepEntry).mockResolvedValue({
      id: 's1',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_sleep',
        entry_date: '2026-06-01',
        bedtime: '2026-05-31T22:00:00.000Z',
      },
      opts
    );

    expect(result).toBe('✅ Sleep logged for 2026-06-01 (recorded).');
    expect(measurementService.processSleepEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        entry_date: '2026-06-01',
        bedtime: '2026-05-31T22:00:00.000Z',
        wake_time: '2026-06-01T06:00:00.000Z',
        duration_in_seconds: 28800,
        source: 'manual',
      }
    );
  });

  it('stamps record_utc_offset_minutes from an explicit-offset caller timestamp', async () => {
    vi.mocked(measurementService.processSleepEntry).mockResolvedValue({
      id: 's1',
    });

    await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_sleep',
        entry_date: '2026-06-01',
        bedtime: '2026-05-31T22:00:00+05:30',
      },
      opts
    );

    expect(measurementService.processSleepEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ record_utc_offset_minutes: 330 })
    );
  });

  it('falls back to the wake_time offset when bedtime carries none', async () => {
    vi.mocked(measurementService.processSleepEntry).mockResolvedValue({
      id: 's1',
    });

    await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_sleep',
        entry_date: '2026-06-01',
        wake_time: '2026-06-01T06:00:00-04:00',
      },
      opts
    );

    expect(measurementService.processSleepEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ record_utc_offset_minutes: -240 })
    );
  });

  it('leaves the stamp unset for Z-suffixed and generated timestamps', async () => {
    vi.mocked(measurementService.processSleepEntry).mockResolvedValue({
      id: 's1',
    });

    await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_sleep',
        entry_date: '2026-06-01',
        bedtime: '2026-05-31T22:00:00.000Z',
      },
      opts
    );

    const payload = vi.mocked(measurementService.processSleepEntry).mock
      .calls[0][2];
    expect(payload.record_utc_offset_minutes).toBeUndefined();
  });
});

describe('list_checkin_diary', () => {
  it('renders all sections with unit conversion', async () => {
    mockEmptyDiary();
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([
      {
        id: 'ci-1',
        entry_date: '2026-06-01',
        weight: 80,
        height: null,
        body_fat_percentage: null,
        neck: null,
        waist: 90,
        hips: null,
        steps: 9000,
      },
    ]);
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({
        // Stored on the 10-100 scale the column holds; read back as 8/10.
        mood_value: 80,
        notes: 'Good',
      }),
    ]);
    vi.mocked(
      sleepRepository.getSleepEntriesByUserIdAndDateRange
    ).mockResolvedValue([
      {
        id: 's1',
        entry_date: '2026-06-01',
        duration_in_seconds: 27000,
        sleep_score: 85,
        bedtime: '2026-05-31T23:30:00.000Z',
        wake_time: '2026-06-01T07:00:00.000Z',
        source: 'manual',
        created_at: '2026-06-01T08:00:00Z',
      },
    ]);
    vi.mocked(fastingRepository.getFastingLogsOverlappingDay).mockResolvedValue(
      [
        {
          id: 'f1',
          start_time: '2026-06-01T20:00:00.000Z',
          end_time: null,
          status: 'ACTIVE',
          fasting_type: '16:8',
        },
      ]
    );
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDate
    ).mockResolvedValue([
      {
        id: 'm1',
        value: '120',
        notes: null,
        entry_date: '2026-06-01',
        created_at: '2026-06-01T09:00:00Z',
        custom_categories: { name: 'Blood Pressure', measurement_type: 'mmHg' },
      },
    ]);
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      default_weight_unit: 'lbs',
    });

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '#### Biometrics\n' +
        `- **Weight:** ${80 * 2.20462262} lbs\n` +
        '- **Steps:** 9000\n' +
        '- **Waist:** 90 cm\n' +
        '\n' +
        '## Mood\n' +
        '- 12:00 8/10 — Good\n' +
        '\n' +
        '## Sleep\n' +
        '- 7h 30m | score: 85/100 | bed: 2026-05-31 23:30 | wake: 2026-06-01 07:00 | (manual)\n' +
        '\n' +
        '## Fasting\n' +
        '- ACTIVE (16:8): 2026-06-01 20:00\n' +
        '\n' +
        '## Custom Metrics\n' +
        '- **Blood Pressure**: 120\n' +
        '\n'
    );
  });

  it('renders fasting times from pg Date objects as local date and time', async () => {
    mockEmptyDiary();
    vi.mocked(fastingRepository.getFastingLogsOverlappingDay).mockResolvedValue(
      [
        {
          id: 'f1',
          start_time: new Date('2026-06-01T20:00:00Z'),
          end_time: new Date('2026-06-02T12:00:00Z'),
          status: 'COMPLETED',
          fasting_type: '16:8',
        },
      ]
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Fasting\n' +
        '- COMPLETED (16:8): 2026-06-01 20:00 → 2026-06-02 12:00\n' +
        '\n'
    );
    expect(fastingRepository.getFastingLogsOverlappingDay).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      'UTC'
    );
  });

  it('renders checkin diary mood section with tags', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({
        mood_value: 70,
        notes: 'Feeling okay',
        mood_tags: ['anxious', 'worried'],
      }),
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Mood\n' +
        '- 12:00 7/10 [😰 Anxious, 😟 Worried] — Feeling okay\n\n'
    );
  });

  it('renders energy and focus in the diary mood line, skipping null ratings', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({ mood_value: 70, energy_value: 3, focus_value: null }),
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Mood\n' +
        '- 12:00 7/10, energy 3/5\n\n'
    );
  });

  it('lists every check-in of the day in time order, omitting /10 when mood is null', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({
        id: 'mood-1',
        mood_value: 80,
        entry_timestamp: new Date('2026-06-01T08:05:00Z'),
      }),
      moodRow({
        id: 'mood-2',
        mood_value: null,
        energy_value: 2,
        notes: 'Crashed',
        entry_timestamp: new Date('2026-06-01T15:40:00Z'),
      }),
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Mood\n' +
        '- 08:05 8/10\n' +
        '- 15:40 energy 2/5 — Crashed\n\n'
    );
  });

  it('shows the derived mood when no manual check-in has a mood', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({ mood_value: null, energy_value: 4 }),
    ]);
    vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
      legacyRow({ id: 'mood-g', mood_value: 60, source: 'garmin' })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Mood\n' +
        '- 12:00 energy 4/5\n' +
        '- Derived mood (garmin): 6/10\n\n'
    );
  });

  it('shows a Garmin-only day as the derived mood', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
      legacyRow({ id: 'mood-g', mood_value: 60, source: 'garmin' })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Mood\n' +
        '- Derived mood (garmin): 6/10\n\n'
    );
  });

  it('hides the derived mood when a manual check-in has a mood', async () => {
    mockEmptyDiary();
    vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
      moodRow({ mood_value: 80 }),
    ]);
    vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
      legacyRow({ id: 'mood-g', mood_value: 20, source: 'garmin' })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(String(result)).not.toContain('Derived');
    expect(result).toContain('- 12:00 8/10\n');
  });

  it('defaults to today and reports an empty diary', async () => {
    mockEmptyDiary();

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: today\n\nNo check-in data found for this date.\n'
    );
    expect(
      measurementService.getCheckInMeasurementsByDateRange
    ).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      todayInZone('UTC'),
      todayInZone('UTC')
    );
  });
});

describe('get_fasting_status', () => {
  it('returns the active fasting session', async () => {
    vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue({
      id: 'f1',
      user_id: 'user-1',
      start_time: '2026-06-01T20:00:00.000Z',
      end_time: null,
      status: 'ACTIVE',
      fasting_type: '16:8',
      created_at: '2026-06-01T20:00:01.000Z',
      target_end_time: null,
    });

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_fasting_status' },
      opts
    );

    expect(result).toBe(
      '# Fasting Status\n\n' +
        JSON.stringify(
          {
            id: 'f1',
            user_id: 'user-1',
            start_time: '2026-06-01T20:00:00.000Z',
            end_time: null,
            fasting_status: 'ACTIVE',
            fasting_type: '16:8',
            created_at: '2026-06-01T20:00:01.000Z',
          },
          null,
          2
        )
    );
  });

  it('reports when no fast is active', async () => {
    vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue(undefined);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_fasting_status' },
      opts
    );

    expect(result).toBe('No active fasting session.');
  });
});

describe('get_biometrics_history', () => {
  it('renders oldest-first with converted units', async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      default_weight_unit: 'lbs',
    });
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([
      {
        entry_date: '2026-06-02',
        weight: 80,
        body_fat_percentage: 22,
        steps: 9000,
      },
      { entry_date: '2026-06-01', weight: 81, steps: null },
    ]);

    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'custom-1',
        category_id: 'category-1',
        value: 82,
        entry_date: '2026-06-02',
        entry_timestamp: '2026-06-02T07:30:00.000Z',
        custom_categories: {
          id: 'category-1',
          name: 'Abdomen',
          measurement_type: 'cm',
          data_type: 'numeric',
        },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_biometrics_history',
        start_date: '2026-06-01',
        end_date: '2026-06-02',
      },
      opts
    );

    const history = JSON.parse(result as string);
    expect(history.standard_measurements).toHaveLength(2);
    expect(history.standard_measurements[0]).toMatchObject({
      entry_date: '2026-06-01',
      value_date: '2026-06-01',
      weight: 81 * 2.20462262,
    });
    expect(history.custom_measurements[0]).toMatchObject({
      id: 'custom-1',
      entry_date: '2026-06-02',
      value_date: '2026-06-02',
      custom_categories: { name: 'Abdomen', measurement_type: 'cm' },
    });
    expect(
      measurementService.getCheckInMeasurementsByDateRange
    ).toHaveBeenCalledWith('user-1', 'user-1', '2026-06-01', '2026-06-02');
  });

  it('defaults to the full history range', async () => {
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);

    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([]);
    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_biometrics_history' },
      opts
    );

    expect(JSON.parse(result as string)).toEqual({
      start_date: '1970-01-01',
      end_date: '9999-12-31',
      standard_measurements: [],
      custom_measurements: [],
    });
    expect(
      measurementService.getCheckInMeasurementsByDateRange
    ).toHaveBeenCalledWith('user-1', 'user-1', '1970-01-01', '9999-12-31');
  });
});

describe('error handling', () => {
  it("maps service 'not found' errors to VALIDATION", async () => {
    vi.mocked(measurementService.getCustomCategories).mockResolvedValue([
      { id: 'c1', name: 'Hydration' },
    ]);
    vi.mocked(
      measurementService.upsertCustomMeasurementEntry
    ).mockRejectedValue(new Error('Custom category with ID c1 not found.'));

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_custom_metric',
        category_name: 'Hydration',
        value: 5,
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: Custom category with ID c1 not found.'
    );
  });

  it('returns DB_ERROR for other failures', async () => {
    vi.mocked(moodRepository.createCheckin).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'log_mood', mood_value: 8, entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });

  it('normalizes nested log_mood and logs notes with no mood', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: null, notes: 'Anxious today' })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { log_mood: { notes: 'Anxious today', entry_date: '2026-06-01' } } as any,
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: — Anxious today.'
    );
    expect(moodRepository.createCheckin).toHaveBeenCalledWith('user-1', {
      moodValue: null,
      notes: 'Anxious today',
      moodTags: null,
      energyValue: undefined,
      focusValue: undefined,
      entryDate: '2026-06-01',
      entryTimestamp: NOON_JUNE_1,
    });
  });

  it('infers log_mood from notes only without inventing a mood', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({ mood_value: null, notes: 'Anxious today' })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { notes: 'Anxious today', entry_date: '2026-06-01' } as any,
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: — Anxious today.'
    );
    expect(
      vi.mocked(moodRepository.createCheckin).mock.calls[0]![1].moodValue
    ).toBeNull();
  });

  it('logs mood with explicit mood_tags', async () => {
    vi.mocked(moodRepository.createCheckin).mockResolvedValue(
      moodRow({
        mood_value: 80,
        notes: 'Feeling good',
        mood_tags: ['anxious', 'tired'],
      })
    );

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'log_mood',
        mood_value: 8,
        notes: 'Feeling good',
        mood_tags: ['anxious', 'tired'],
        entry_date: '2026-06-01',
      },
      opts
    );

    expect(result).toBe(
      '✅ Check-in logged for 2026-06-01 at 12:00: 8/10 [😰 Anxious, 😴 Tired] — Feeling good.'
    );
    expect(moodRepository.createCheckin).toHaveBeenCalledWith('user-1', {
      moodValue: 80,
      notes: 'Feeling good',
      moodTags: ['anxious', 'tired'],
      energyValue: undefined,
      focusValue: undefined,
      entryDate: '2026-06-01',
      entryTimestamp: NOON_JUNE_1,
    });
  });
});

// #3378: tool results must give the model local times and stay small enough
// for a 16K-context local model.
describe('check-in tool output size and local times', () => {
  const rawStress = JSON.stringify(
    Array.from({ length: 400 }, (_, i) => [1780000000000 + i * 180000, 30])
  );

  it('shows sleep and fasting times in local time, using the recording zone for sleep', async () => {
    tools = buildCheckinTools('user-1', 'America/New_York');
    mockEmptyDiary();
    vi.mocked(
      sleepRepository.getSleepEntriesByUserIdAndDateRange
    ).mockResolvedValue([
      {
        id: 's1',
        entry_date: '2026-11-02',
        duration_in_seconds: 26700,
        bedtime: '2026-11-02T03:13:31.000Z',
        wake_time: '2026-11-02T11:00:31.000Z',
        source: 'garmin',
        created_at: '2026-11-02T12:00:00Z',
      },
      {
        id: 's2',
        entry_date: '2026-11-02',
        duration_in_seconds: 1800,
        bedtime: '2026-11-02T13:00:00.000Z',
        wake_time: '2026-11-02T13:30:00.000Z',
        source: 'manual',
        record_timezone: 'Europe/Berlin',
        created_at: '2026-11-02T14:00:00Z',
      },
    ]);
    vi.mocked(fastingRepository.getFastingLogsOverlappingDay).mockResolvedValue(
      [
        {
          id: 'f1',
          start_time: '2026-11-02T01:00:00.000Z',
          end_time: '2026-11-02T17:00:00.000Z',
          status: 'COMPLETED',
          fasting_type: '16:8',
        },
      ]
    );

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-11-02' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-11-02\n\n' +
        '## Sleep\n' +
        '- 7h 25m | bed: 2026-11-01 22:13 | wake: 2026-11-02 06:00 | (garmin)\n' +
        '- 0h 30m | bed: 2026-11-02 14:00 | wake: 2026-11-02 14:30 | times in Europe/Berlin | (manual)\n' +
        '\n' +
        '## Fasting\n' +
        '- COMPLETED (16:8): 2026-11-01 20:00 → 2026-11-02 12:00\n' +
        '\n'
    );
  });

  it('leaves raw data series out of the diary and rounds long decimals', async () => {
    mockEmptyDiary();
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDate
    ).mockResolvedValue([
      {
        id: 'm1',
        value: rawStress,
        notes: 'Source: Garmin',
        entry_date: '2026-06-01',
        created_at: '2026-06-01T09:00:00Z',
        custom_categories: {
          name: 'Raw Stress Data',
          measurement_type: 'JSON',
        },
      },
      {
        id: 'm2',
        value: '42.666666667',
        notes: null,
        entry_date: '2026-06-01',
        created_at: '2026-06-01T09:00:00Z',
        custom_categories: { name: 'HRV', measurement_type: 'ms' },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Check-in Diary: 2026-06-01\n\n' +
        '## Custom Metrics\n' +
        '- **HRV**: 42.67\n' +
        '- **Raw Stress Data**: (raw data series, not shown) — Source: Garmin\n' +
        '\n'
    );
  });

  const historyRows = [
    {
      id: 'c1',
      value: '40.25',
      entry_date: '2026-11-01',
      custom_categories: {
        id: 'k1',
        name: 'hrv_last_night_avg',
        display_name: 'HRV Last Night Average',
        measurement_type: 'ms',
      },
    },
    {
      id: 'c2',
      value: rawStress,
      entry_date: '2026-11-01',
      custom_categories: {
        id: 'k2',
        name: 'Raw Stress Data',
        measurement_type: 'JSON',
      },
    },
    {
      id: 'c3',
      value: '42.333333',
      entry_date: '2026-11-02',
      custom_categories: {
        id: 'k1',
        name: 'hrv_last_night_avg',
        display_name: 'HRV Last Night Average',
        measurement_type: 'ms',
      },
    },
    {
      id: 'c4',
      value: '3',
      entry_date: '2026-11-02',
      custom_categories: {
        id: 'k3',
        name: 'Headache',
        measurement_type: 'N/A',
      },
    },
  ];

  it('returns compact custom metric history, newest day first', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue(historyRows);

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_custom_metrics_history',
        start_date: '2026-11-01',
        end_date: '2026-11-02',
      },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\n' +
        '## 2026-11-02\n' +
        '- HRV Last Night Average: 42.33 ms\n' +
        '- Headache: 3\n\n' +
        '## 2026-11-01\n' +
        '- HRV Last Night Average: 40.25 ms\n' +
        '- Raw Stress Data: (raw data series, not shown)'
    );
  });

  it('filters custom metric history by category name or display name', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue(historyRows);

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_custom_metrics_history',
        category_name: 'hrv last night average',
      },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\n' +
        '## 2026-11-02\n' +
        '- HRV Last Night Average: 42.33 ms\n\n' +
        '## 2026-11-01\n' +
        '- HRV Last Night Average: 40.25 ms'
    );
  });

  it('filters custom metric history by stored category name', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue(historyRows);

    const result = await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_custom_metrics_history',
        category_name: 'hrv_last_night_avg',
      },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\n' +
        '## 2026-11-02\n' +
        '- HRV Last Night Average: 42.33 ms\n\n' +
        '## 2026-11-01\n' +
        '- HRV Last Night Average: 40.25 ms'
    );
  });

  it('matches a stored category name that has surrounding spaces', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'c5',
        value: '61',
        entry_date: '2026-11-02',
        custom_categories: { id: 'k5', name: ' HRV ', measurement_type: 'ms' },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: 'HRV' },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\n## 2026-11-02\n- HRV: 61 ms'
    );
  });

  it('prefers a stored-name match over another category with that display name', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'c6',
        value: '61',
        entry_date: '2026-11-02',
        custom_categories: { id: 'k6', name: 'HRV', measurement_type: 'ms' },
      },
      {
        id: 'c7',
        value: '48',
        entry_date: '2026-11-02',
        custom_categories: {
          id: 'k7',
          name: 'hrv_last_night_avg',
          display_name: 'HRV',
          measurement_type: 'ms',
        },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: 'hrv' },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\n## 2026-11-02\n- HRV: 61 ms'
    );
  });

  it('asks for the stored name when two metrics share a display name', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'c10',
        value: '61',
        entry_date: '2026-11-02',
        custom_categories: {
          id: 'k10',
          name: 'garmin_hrv',
          display_name: 'HRV',
          measurement_type: 'ms',
        },
      },
      {
        id: 'c11',
        value: '48',
        entry_date: '2026-11-02',
        custom_categories: {
          id: 'k11',
          name: 'oura_hrv',
          display_name: 'HRV',
          measurement_type: 'ms',
        },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: 'HRV' },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\nSeveral metrics match "HRV": garmin_hrv, oura_hrv. Ask again with one of these names as category_name.'
    );
  });

  it('uses an exact stored-name match over one differing only in case', async () => {
    const rows = [
      {
        id: 'c12',
        value: '61',
        entry_date: '2026-11-02',
        custom_categories: {
          id: 'k12',
          name: 'garmin_hrv',
          measurement_type: 'ms',
        },
      },
      {
        id: 'c13',
        value: '48',
        entry_date: '2026-11-02',
        custom_categories: {
          id: 'k13',
          name: 'Garmin_HRV',
          measurement_type: 'ms',
        },
      },
    ];
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue(rows);

    const exact = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: 'Garmin_HRV' },
      opts
    );
    expect(exact).toBe(
      '# Custom Metrics History\n\n## 2026-11-02\n- Garmin_HRV: 48 ms'
    );

    const otherCase = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: 'GARMIN_HRV' },
      opts
    );
    expect(otherCase).toBe(
      '# Custom Metrics History\n\nSeveral metrics match "GARMIN_HRV": garmin_hrv, Garmin_HRV. Ask again with one of these names as category_name.'
    );
  });

  it('labels a metric by its name when the display name is blank', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'c8',
        value: '7',
        entry_date: '2026-11-02',
        custom_categories: {
          id: 'k8',
          name: 'Energy',
          display_name: '   ',
          measurement_type: 'N/A',
        },
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history' },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\n## 2026-11-02\n- Energy: 7'
    );
  });

  it('rejects a blank category_name instead of returning every metric', async () => {
    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: '   ' },
      opts
    );

    expect(String(result)).not.toContain('# Custom Metrics History');
    expect(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).not.toHaveBeenCalled();
  });

  it('keeps a decimal too large to round as written', async () => {
    const huge = `${'9'.repeat(320)}.123`;
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([
      {
        id: 'c9',
        value: huge,
        entry_date: '2026-11-02',
        custom_categories: { id: 'k9', name: 'Big', measurement_type: 'N/A' },
      },
    ]);

    const result = String(
      await tools.sparky_manage_checkin.execute!(
        { action: 'get_custom_metrics_history' },
        opts
      )
    );

    expect(result).not.toContain('Infinity');
    expect(result).toContain(`- Big: ${huge}`);
  });

  it('names an offset-only recording zone on the sleep line', async () => {
    mockEmptyDiary();
    vi.mocked(
      sleepRepository.getSleepEntriesByUserIdAndDateRange
    ).mockResolvedValue([
      {
        id: 's3',
        entry_date: '2026-06-01',
        duration_in_seconds: 28800,
        bedtime: '2026-05-31T17:00:00.000Z',
        wake_time: '2026-06-01T01:00:00.000Z',
        source: 'manual',
        record_utc_offset_minutes: 330,
        created_at: '2026-06-01T02:00:00Z',
      },
    ]);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'list_checkin_diary', entry_date: '2026-06-01' },
      opts
    );

    expect(result).toContain(
      '- 8h 0m | bed: 2026-05-31 22:30 | wake: 2026-06-01 06:30 | times in UTC+05:30 | (manual)\n'
    );
  });

  it('says so when no custom metric matches', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue(historyRows);

    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history', category_name: 'Glucose' },
      opts
    );

    expect(result).toBe(
      '# Custom Metrics History\n\nNo custom metrics found for "Glucose" in this range.'
    );
  });

  it('keeps the newest days when a long history is cut short', async () => {
    const days = Array.from({ length: 400 }, (_, i) => ({
      id: `h${i}`,
      value: '50',
      entry_date: `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      custom_categories: { id: 'k1', name: 'HRV', measurement_type: 'ms' },
    })).filter((row) => Number(row.entry_date.slice(5, 7)) <= 12);
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue(days);

    const result = (await tools.sparky_manage_checkin.execute!(
      { action: 'get_custom_metrics_history' },
      opts
    )) as string;

    const newest = days[days.length - 1]!.entry_date;
    expect(
      result.startsWith(`# Custom Metrics History\n\n## ${newest}\n`)
    ).toBe(true);
    expect(result).toContain('Older days were left out.');
    // The cut falls between whole lines, never inside one.
    const kept = result.split('\n\n---\n')[0]!;
    expect(
      kept.endsWith('- HRV: 50 ms') || /## \d{4}-\d{2}-\d{2}$/.test(kept)
    ).toBe(true);
    expect(result).not.toContain(`## ${days[0]!.entry_date}\n`);
  });

  it('leaves raw data series out of the biometrics history', async () => {
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDateRange
    ).mockResolvedValue([historyRows[1]!, historyRows[0]!]);

    const result = (await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_biometrics_history',
        start_date: '2026-11-01',
        end_date: '2026-11-01',
      },
      opts
    )) as string;

    expect(result).not.toContain('1780000000000');
    expect(result).toContain('"value":"(raw data series, not shown)"');
    expect(result).toContain('"value":"40.25"');
  });
});

describe('get_oral_care_summary', () => {
  it('reads the last 7 days by default and reports the goal and streak', async () => {
    vi.mocked(oralCareService.getHistory).mockResolvedValue({
      settings: { daily_target: 2, target_seconds: 120 },
      days: [
        {
          date: '2026-11-08',
          brushing_count: 2,
          brushing_seconds: 250,
          goal_met: true,
          other_count: 1,
        },
      ],
      streak: 4,
      best_streak: 9,
      recent_custom_labels: [],
    });
    const result = await tools.sparky_manage_checkin.execute!(
      { action: 'get_oral_care_summary', end_date: '2026-11-08' },
      opts
    );
    expect(oralCareService.getHistory).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-11-02',
      '2026-11-08'
    );
    expect(String(result)).toContain('"daily_brushing_goal":2');
    expect(String(result)).toContain('"current_streak_days":4');
  });

  it('caps a long range at 366 days', async () => {
    vi.mocked(oralCareService.getHistory).mockResolvedValue({
      settings: { daily_target: 2, target_seconds: 120 },
      days: [],
      streak: 0,
      best_streak: 0,
      recent_custom_labels: [],
    });
    await tools.sparky_manage_checkin.execute!(
      {
        action: 'get_oral_care_summary',
        start_date: '2020-01-01',
        end_date: '2026-11-08',
      },
      opts
    );
    expect(vi.mocked(oralCareService.getHistory).mock.calls[0]![2]).toBe(
      '2025-11-08'
    );
  });
});
