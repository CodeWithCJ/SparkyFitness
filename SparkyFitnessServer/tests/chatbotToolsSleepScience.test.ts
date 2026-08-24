import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/sleepScienceService.js', () => ({
  default: {
    calculateSleepDebt: vi.fn(),
    getMCTQStats: vi.fn(),
    getDailyNeed: vi.fn(),
    getEnergyCurve: vi.fn(),
    getChronotype: vi.fn(),
    checkDataSufficiency: vi.fn(),
    calculateBaseline: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import sleepScienceService from '../services/sleepScienceService.js';
import { buildSleepScienceTools } from '../ai/tools/sleepScienceTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = sleepScienceService as unknown as {
  calculateSleepDebt: ReturnType<typeof vi.fn>;
  getMCTQStats: ReturnType<typeof vi.fn>;
  getDailyNeed: ReturnType<typeof vi.fn>;
  getEnergyCurve: ReturnType<typeof vi.fn>;
  getChronotype: ReturnType<typeof vi.fn>;
  checkDataSufficiency: ReturnType<typeof vi.fn>;
  calculateBaseline: ReturnType<typeof vi.fn>;
};

function getTool() {
  const tools = buildSleepScienceTools('user-1', 'UTC');
  return tools.sparky_get_sleep_science;
}

describe('sparky_get_sleep_science', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports sleep debt (inferred default action from {})', async () => {
    svc.calculateSleepDebt.mockResolvedValue({
      currentDebt: 3.5,
      debtCategory: 'moderate',
      sleepNeed: 8,
      paybackTime: 2,
      trend: { direction: 'improving', change7d: -1.2 },
      last14Days: [{}, {}, {}],
    });
    const result = await getTool().execute!({}, opts);
    expect(result).toBe(
      '# Sleep Debt\n\n- Current debt: 3.5 h (moderate)\n- Sleep need: 8 h\n- Trend: improving (-1.2 h over 7d)\n- Estimated payback time: 2 day(s)\n- Based on 3 of last 14 days'
    );
  });

  it('shows a positive trend sign', async () => {
    svc.calculateSleepDebt.mockResolvedValue({
      currentDebt: 0,
      debtCategory: 'low',
      sleepNeed: 8,
      paybackTime: 0,
      trend: { direction: 'worsening', change7d: 0.5 },
      last14Days: [],
    });
    const result = await getTool().execute!({ action: 'sleep_debt' }, opts);
    expect(result).toContain('- Trend: worsening (+0.5 h over 7d)');
    expect(result).toContain('- Based on 0 of last 14 days');
  });

  it('reports MCTQ stats', async () => {
    svc.getMCTQStats.mockResolvedValue({
      profile: {
        baselineSleepNeed: 8.1,
        method: 'mctq_corrected',
        confidence: 0.9,
        basedOnDays: 45,
        socialJetlag: 1.3,
      },
    });
    const result = await getTool().execute!({ action: 'mctq_stats' }, opts);
    expect(result).toBe(
      '# MCTQ Chronotype Stats\n\n- Baseline sleep need: 8.1 h\n- Method: mctq_corrected (confidence 0.9)\n- Based on 45 days\n- Social jetlag: 1.3 h'
    );
  });

  it('handles a missing MCTQ profile', async () => {
    svc.getMCTQStats.mockResolvedValue({ profile: null });
    const result = await getTool().execute!({ action: 'mctq_stats' }, opts);
    expect(result).toBe(
      'No MCTQ baseline profile has been calculated yet. Try recalculate_baseline once enough sleep history exists.'
    );
  });

  it('reports daily need for an explicit date', async () => {
    svc.getDailyNeed.mockResolvedValue({
      date: '2026-02-01',
      baseline_need: 8,
      strain_addition: 0.5,
      debt_addition: 0.3,
      nap_subtraction: 0.2,
      total_need: 8.6,
      method: 'median_fallback',
      confidence: 0.7,
      current_debt_hours: 2.1,
    });
    const result = await getTool().execute!(
      { action: 'daily_need', date: '2026-02-01' },
      opts
    );
    expect(result).toBe(
      '# Daily Sleep Need (2026-02-01)\n\n- Total need: 8.6 h\n- Baseline: 8 h\n- Strain addition: 0.5 h\n- Debt addition: 0.3 h\n- Nap subtraction: 0.2 h\n- Method: median_fallback (confidence 0.7)\n- Current debt: 2.1 h'
    );
    expect(svc.getDailyNeed).toHaveBeenCalledWith('user-1', '2026-02-01');
  });

  it('reports the circadian energy curve', async () => {
    svc.getEnergyCurve.mockResolvedValue({
      success: true,
      currentEnergy: 72,
      currentZone: 'peak',
      nextPeak: { hour: 17, energy: 88 },
      nextDip: { hour: 14, energy: 40 },
      melatoninWindow: { start: '22:00', end: '23:30' },
      wakeTime: '07:00',
      sleepDebtPenalty: 5,
    });
    const result = await getTool().execute!({ action: 'energy_curve' }, opts);
    expect(result).toBe(
      '# Circadian Energy Curve\n\n- Current energy: 72 (peak)\n- Next peak: 17:00 (88)\n- Next dip: 14:00 (40)\n- Melatonin window: 22:00 – 23:30\n- Wake time: 07:00\n- Sleep-debt penalty: 5'
    );
  });

  it('returns a friendly message when energy curve data is insufficient', async () => {
    svc.getEnergyCurve.mockResolvedValue({
      success: false,
      message: 'Need at least 3 nights of sleep data.',
    });
    const result = await getTool().execute!({ action: 'energy_curve' }, opts);
    expect(result).toBe('Need at least 3 nights of sleep data.');
  });

  it('reports chronotype', async () => {
    svc.getChronotype.mockResolvedValue({
      success: true,
      chronotype: 'intermediate',
      averageWakeTime: '07:15',
      averageSleepTime: '23:20',
      melatoninWindowStart: '22:00',
      melatoninWindowEnd: '23:00',
      basedOnDays: 21,
      confidence: 0.82,
    });
    const result = await getTool().execute!({ action: 'chronotype' }, opts);
    expect(result).toBe(
      '# Chronotype\n\n- Chronotype: intermediate\n- Average wake time: 07:15\n- Average sleep time: 23:20\n- Melatonin window: 22:00 – 23:00\n- Based on 21 days (confidence 0.82)'
    );
  });

  it('reports data sufficiency', async () => {
    svc.checkDataSufficiency.mockResolvedValue({
      sufficient: false,
      totalDays: 10,
      daysWithTimestamps: 8,
      workdaysAvailable: 6,
      freedaysAvailable: 2,
      projectedConfidence: 0.4,
      recommendation: 'Log more nights on your days off.',
    });
    const result = await getTool().execute!(
      { action: 'data_sufficiency' },
      opts
    );
    expect(result).toBe(
      '# Sleep Data Sufficiency\n\n- Sufficient: no\n- Total days: 10 (8 with timestamps)\n- Workdays available: 6\n- Freedays available: 2\n- Projected confidence: 0.4\n- Recommendation: Log more nights on your days off.'
    );
  });

  it('recalculates the baseline', async () => {
    svc.calculateBaseline.mockResolvedValue({
      success: true,
      sleepNeedIdeal: 8.2,
      confidence: 0.88,
      method: 'mctq_corrected',
      basedOnDays: 60,
    });
    const result = await getTool().execute!(
      { action: 'recalculate_baseline', window_days: 60 },
      opts
    );
    expect(result).toBe(
      '✅ Baseline sleep need recalculated.\n\n- Ideal sleep need: 8.2 h\n- Method: mctq_corrected (confidence 0.88)\n- Based on 60 days'
    );
    expect(svc.calculateBaseline).toHaveBeenCalledWith('user-1', 60, 'UTC');
  });

  it('defaults the baseline window to 90 days', async () => {
    svc.calculateBaseline.mockResolvedValue({
      success: false,
      message: 'Insufficient data',
    });
    const result = await getTool().execute!(
      { action: 'recalculate_baseline' },
      opts
    );
    expect(result).toBe('Insufficient data');
    expect(svc.calculateBaseline).toHaveBeenCalledWith('user-1', 90, 'UTC');
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.calculateSleepDebt.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!({ action: 'sleep_debt' }, opts);
    expect(result).toBe(DB_ERROR_TEXT);
  });
});
