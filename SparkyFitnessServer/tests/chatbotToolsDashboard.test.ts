import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildDashboardTools } from '../ai/tools/dashboardTools.js';
import dashboardService from '../services/DashboardService.js';
import { todayInZone } from '@workspace/shared';

vi.mock('../services/DashboardService', () => ({
  default: {
    getDashboardStats: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
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
    svc.getDashboardStats.mockResolvedValue(STATS);
    const today = todayInZone('UTC');

    const result = await tools.sparky_get_dashboard.execute!(
      { action: 'daily_summary' },
      opts
    );

    expect(result).toBe(EXPECTED(today));
    expect(svc.getDashboardStats).toHaveBeenCalledWith('user-1', today);
  });

  it('infers daily_summary from an empty payload', async () => {
    svc.getDashboardStats.mockResolvedValue(STATS);
    const today = todayInZone('UTC');

    const result = await tools.sparky_get_dashboard.execute!({}, opts);

    expect(result).toBe(EXPECTED(today));
    expect(svc.getDashboardStats).toHaveBeenCalledWith('user-1', today);
  });

  it('returns a DB error string when the service throws', async () => {
    svc.getDashboardStats.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_dashboard.execute!(
      { action: 'daily_summary', date: '2026-02-01' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
