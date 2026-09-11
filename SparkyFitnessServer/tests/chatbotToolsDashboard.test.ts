import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildDashboardTools } from '../ai/tools/dashboardTools.js';
import dashboardService from '../services/DashboardService.js';
import { todayInZone } from '@workspace/shared';

vi.mock('../services/DashboardService.js', () => ({
  default: {
    getDashboardStats: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const svc = dashboardService as unknown as {
  getDashboardStats: ReturnType<typeof vi.fn>;
};

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const STATS = {
  eaten: 1800,
  burned: 400,
  remaining: 600,
  goal: 2000,
  net: 1400,
  progress: 90,
  steps: 8000,
  stepCalories: 320,
  bmr: 1600,
  unit: 'kcal',
};

const EXPECTED = (date: string): string =>
  `# Daily Summary (${date})\n\n` +
  '- Eaten: 1800 kcal\n' +
  '- Burned: 400 kcal\n' +
  '- Remaining: 600 kcal\n' +
  '- Goal: 2000 kcal\n' +
  '- Net: 1400 kcal\n' +
  '- Progress: 90%\n' +
  '- Steps: 8000 (320 kcal)\n' +
  '- BMR: 1600 kcal';

let tools: ReturnType<typeof buildDashboardTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildDashboardTools('user-1', 'UTC');
});

describe('sparky_get_dashboard', () => {
  it('daily_summary renders the calorie balance for an explicit date', async () => {
    svc.getDashboardStats.mockResolvedValue(STATS);

    const result = await tools.sparky_get_dashboard.execute!(
      { action: 'daily_summary', date: '2026-02-01' },
      opts
    );

    expect(result).toBe(EXPECTED('2026-02-01'));
    expect(svc.getDashboardStats).toHaveBeenCalledWith('user-1', '2026-02-01');
  });

  it('daily_summary defaults to today when no date is given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
    try {
      svc.getDashboardStats.mockResolvedValue(STATS);
      const today = todayInZone('UTC');

      const result = await tools.sparky_get_dashboard.execute!(
        { action: 'daily_summary' },
        opts
      );

      expect(result).toBe(EXPECTED(today));
      expect(svc.getDashboardStats).toHaveBeenCalledWith('user-1', today);
    } finally {
      vi.useRealTimers();
    }
  });

  it('infers daily_summary from an empty payload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
    try {
      svc.getDashboardStats.mockResolvedValue(STATS);
      const today = todayInZone('UTC');

      const result = await tools.sparky_get_dashboard.execute!({}, opts);

      expect(result).toBe(EXPECTED(today));
      expect(svc.getDashboardStats).toHaveBeenCalledWith('user-1', today);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a DB error string when the service throws', async () => {
    svc.getDashboardStats.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_dashboard.execute!(
      { action: 'daily_summary', date: '2026-02-01' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });

  it('renders target range details and status when calorieGoalType is target', async () => {
    svc.getDashboardStats.mockResolvedValue({
      ...STATS,
      eaten: 1800,
      calorieGoalType: {
        goalType: 'target',
        targetMin: 1600,
        targetMax: 1900,
      },
    });

    const result = await tools.sparky_get_dashboard.execute!(
      { action: 'daily_summary', date: '2026-02-01' },
      opts
    );

    expect(result).toContain(
      '- Remaining: 100 kcal before reaching upper target limit (1900 kcal)'
    );
    expect(result).toContain(
      '- Goal: Target Range 1600–1900 kcal (Baseline: 2000 kcal)'
    );
    expect(result).toContain(
      '- Target Status: Within target range (1600–1900 kcal)'
    );
  });

  it('renders minimum floor status when calorieGoalType is minimum', async () => {
    svc.getDashboardStats.mockResolvedValue({
      ...STATS,
      eaten: 1800,
      goal: 2000,
      calorieGoalType: {
        goalType: 'minimum',
      },
    });

    const result = await tools.sparky_get_dashboard.execute!(
      { action: 'daily_summary', date: '2026-02-01' },
      opts
    );

    expect(result).toContain('- Goal: Minimum Floor 2000 kcal');
    expect(result).toContain(
      '- Target Status: 200 kcal needed to reach minimum floor'
    );
  });
});
