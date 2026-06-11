import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildHabitTools } from '../ai/tools/habitTools.js';
import habitRepository from '../models/habitRepository.js';

vi.mock('../models/habitRepository', () => ({
  default: {
    listHabits: vi.fn(),
    upsertHabitLog: vi.fn(),
    getHabitHistory: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const HABIT_ID = '123e4567-e89b-12d3-a456-426614174000';
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred. Please try again.\n\nSuggestion: If the issue persists, contact support.';

let tools: ReturnType<typeof buildHabitTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildHabitTools('user-1');
});

describe('sparky_manage_habits', () => {
  it('list_habits renders display name (falling back to name) and id', async () => {
    vi.mocked(habitRepository.listHabits).mockResolvedValue([
      { id: 'h1', name: 'meditate', display_name: 'Meditate' },
      { id: 'h2', name: 'stretch', display_name: null },
    ]);

    const result = await tools.sparky_manage_habits.execute!(
      { action: 'list_habits' },
      opts
    );

    expect(result).toBe(
      '# Available Habits\n\n' +
        '**Meditate**\n  ID: h1\n\n' +
        '**stretch**\n  ID: h2'
    );
    expect(habitRepository.listHabits).toHaveBeenCalledWith('user-1');
  });

  it('list_habits reports when there are none', async () => {
    vi.mocked(habitRepository.listHabits).mockResolvedValue([]);

    const result = await tools.sparky_manage_habits.execute!(
      { action: 'list_habits' },
      opts
    );

    expect(result).toBe('# Available Habits\n\nNo results found.');
  });

  it("log_habit stores 'true' for a completed habit", async () => {
    vi.mocked(habitRepository.upsertHabitLog).mockResolvedValue(undefined);

    const result = await tools.sparky_manage_habits.execute!(
      {
        action: 'log_habit',
        habit_id: HABIT_ID,
        entry_date: '2026-06-01',
        completed: true,
      },
      opts
    );

    expect(result).toBe('✅ Habit completed for 2026-06-01.');
    expect(habitRepository.upsertHabitLog).toHaveBeenCalledWith(
      'user-1',
      HABIT_ID,
      '2026-06-01',
      'true'
    );
  });

  it("log_habit stores 'false' for a missed habit", async () => {
    vi.mocked(habitRepository.upsertHabitLog).mockResolvedValue(undefined);

    const result = await tools.sparky_manage_habits.execute!(
      {
        action: 'log_habit',
        habit_id: HABIT_ID,
        entry_date: '2026-06-01',
        completed: false,
      },
      opts
    );

    expect(result).toBe('✅ Habit not completed for 2026-06-01.');
    expect(habitRepository.upsertHabitLog).toHaveBeenCalledWith(
      'user-1',
      HABIT_ID,
      '2026-06-01',
      'false'
    );
  });

  it('log_habit rejects a non-UUID habit_id', async () => {
    const result = await tools.sparky_manage_habits.execute!(
      {
        action: 'log_habit',
        habit_id: 'nope',
        entry_date: '2026-06-01',
        completed: true,
      },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: habit_id: Must be a valid UUID');
    expect(habitRepository.upsertHabitLog).not.toHaveBeenCalled();
  });

  it("get_habit_history maps stored values to '✅ Completed' / '❌ Missed'", async () => {
    vi.mocked(habitRepository.getHabitHistory).mockResolvedValue([
      {
        id: 'm1',
        value: 'true',
        entry_date: '2026-06-01',
        created_at: '2026-06-01T08:00:00Z',
      },
      {
        id: 'm2',
        value: 'false',
        entry_date: '2026-06-02',
        created_at: '2026-06-02T08:00:00Z',
      },
    ]);

    const result = await tools.sparky_manage_habits.execute!(
      {
        action: 'get_habit_history',
        habit_id: HABIT_ID,
        start_date: '2026-06-01',
        end_date: '2026-06-02',
      },
      opts
    );

    expect(result).toBe(
      '# Habit History\n\n' +
        '2026-06-01: ✅ Completed\n\n' +
        '2026-06-02: ❌ Missed'
    );
    expect(habitRepository.getHabitHistory).toHaveBeenCalledWith(
      'user-1',
      HABIT_ID,
      '2026-06-01',
      '2026-06-02'
    );
  });

  it('returns DB_ERROR when the repository throws', async () => {
    vi.mocked(habitRepository.listHabits).mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_manage_habits.execute!(
      { action: 'list_habits' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
