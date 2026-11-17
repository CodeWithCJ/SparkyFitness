import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCalendarEntries: vi.fn(),
  getEntryDays: vi.fn(),
  getTrainingLoadSessions: vi.fn(),
  getPlanTemplatesForCalendar: vi.fn(),
  getActiveWorkoutPlanForDate: vi.fn(),
  getUserPreferences: vi.fn(),
  getRunProgram: vi.fn(),
  resolveZonesForUser: vi.fn(),
}));

vi.mock('../models/reportRepository.js', () => ({
  default: {
    getCalendarEntries: mocks.getCalendarEntries,
    getEntryDays: mocks.getEntryDays,
    getTrainingLoadSessions: mocks.getTrainingLoadSessions,
  },
}));
vi.mock('../models/workoutPlanTemplateRepository.js', () => ({
  default: {
    getPlanTemplatesForCalendar: mocks.getPlanTemplatesForCalendar,
    getActiveWorkoutPlanForDate: mocks.getActiveWorkoutPlanForDate,
  },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: mocks.getUserPreferences },
}));
vi.mock('../models/runProgramRepository.js', () => ({
  getRunProgram: mocks.getRunProgram,
}));
vi.mock('../services/heartRateZoneService.js', () => ({
  default: { resolveZonesForUser: mocks.resolveZonesForUser },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('@workspace/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/shared')>()),
  todayInZone: () => '2026-10-14',
}));

import { getTrainingCalendar } from '../services/trainingCalendarService.js';

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const run = {
  id: ENTRY_ID,
  day: '2026-10-12',
  exerciseName: 'Run',
  category: 'Cardio',
  notes: null,
  providerName: null,
  detailData: null,
  exerciseSourceId: null,
  durationMinutes: 30,
  distanceKm: 5,
  avgHeartRate: null,
  presetEntryId: null,
  presetName: null,
  workoutPlanAssignmentId: null,
};
const inDays = (start: string, end: string) =>
  [run].filter((row) => row.day >= start && row.day <= end);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserPreferences.mockResolvedValue({ first_day_of_week: 1 });
  mocks.resolveZonesForUser.mockResolvedValue({
    floors: [95, 114, 133, 152, 171],
  });
  mocks.getTrainingLoadSessions.mockResolvedValue([]);
  mocks.getPlanTemplatesForCalendar.mockResolvedValue([]);
  mocks.getEntryDays.mockResolvedValue(new Map([[ENTRY_ID, '2026-10-12']]));
  mocks.getCalendarEntries.mockImplementation(
    async (_user: string, start: string, end: string) => inDays(start, end)
  );
  // Runs on Friday and Monday since 9 October; workout 3 was done on the 12th.
  mocks.getRunProgram.mockResolvedValue({
    program_id: 'beginner5k',
    enabled: true,
    next_index: 3,
    run_days: [1, 5],
    start_date: '2026-10-09',
    end_date: null,
    last_done_date: '2026-10-12',
    completion_log: [{ index: 2, entry_id: ENTRY_ID }],
    workouts: Array.from({ length: 10 }, () => ({
      plan: { steps: [{ seconds: 1800 }] },
    })),
  });
});

const statusOn = (
  planned: { day: string; status: string }[],
  day: string
): string | undefined => planned.find((item) => item.day === day)?.status;

describe('getTrainingCalendar boundaries', () => {
  it('gives the same day the same status whatever range is asked for', async () => {
    const narrow = await getTrainingCalendar(
      'u',
      'u',
      '2026-10-09',
      '2026-10-11'
    );
    const wide = await getTrainingCalendar(
      'u',
      'u',
      '2026-10-09',
      '2026-10-12'
    );
    // The completion of the 12th is one day past the narrow range, yet it
    // claims the 12th in both, so the 9th stays missed in both.
    expect(statusOn(narrow.planned, '2026-10-09')).toBe('missed');
    expect(statusOn(wide.planned, '2026-10-09')).toBe('missed');
    expect(statusOn(wide.planned, '2026-10-12')).toBe('done');
    for (const day of ['2026-10-09', '2026-10-10', '2026-10-11']) {
      expect(narrow.planned.filter((p) => p.day === day)).toEqual(
        wide.planned.filter((p) => p.day === day)
      );
    }
  });

  it('shows only what falls inside the requested range', async () => {
    const narrow = await getTrainingCalendar(
      'u',
      'u',
      '2026-10-09',
      '2026-10-11'
    );
    expect(narrow.planned.every((p) => p.day <= '2026-10-11')).toBe(true);
    expect(narrow.completed).toEqual([]);
    expect(narrow.weeks.reduce((n, w) => n + w.completedSessions, 0)).toBe(0);
  });
});
