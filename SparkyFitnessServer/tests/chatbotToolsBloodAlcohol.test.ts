import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone, type BloodAlcoholResponse } from '@workspace/shared';
import {
  buildBloodAlcoholTools,
  BLOOD_ALCOHOL_DISCLAIMER,
} from '../ai/tools/bloodAlcoholTools.js';
import { getBloodAlcoholEstimate } from '../services/bloodAlcoholService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../services/bloodAlcoholService.js', () => ({
  getBloodAlcoholEstimate: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const getEstimate = vi.mocked(getBloodAlcoholEstimate);
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const ESTIMATE: BloodAlcoholResponse = {
  status: 'ok',
  missing_inputs: [],
  formula: 'watson',
  fell_back_from: null,
  display_unit: 'percent',
  elimination_rate: 0.15,
  distribution_factor: 0.7,
  weight_kg: 80,
  doses: [
    {
      at: '2026-11-06T23:00:00.000Z',
      grams: 14,
      name: 'Beer',
      is_estimated: false,
    },
    {
      at: '2026-11-07T19:30:00.000Z',
      grams: 20,
      name: 'Wine',
      is_estimated: true,
    },
  ],
  estimated_now_permille: 0.312,
  peak: { at: '2026-11-07T20:15:00.000Z', permille: 0.351 },
  has_estimated_times: true,
};

const MISSING_INPUTS: BloodAlcoholResponse = {
  ...ESTIMATE,
  status: 'missing_inputs',
  missing_inputs: ['sex', 'age'],
  display_unit: 'permille',
  distribution_factor: null,
  weight_kg: null,
  doses: [],
  estimated_now_permille: null,
  peak: null,
  has_estimated_times: false,
};

let tools: ReturnType<typeof buildBloodAlcoholTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildBloodAlcoholTools('user-1', 'Europe/Berlin');
});

describe('sparky_get_blood_alcohol', () => {
  it('returns the estimate in the display unit and local times, with the disclaimer', async () => {
    getEstimate.mockResolvedValue(ESTIMATE);

    const result = await tools.sparky_get_blood_alcohol.execute!(
      { action: 'estimate', date: '2026-11-07' },
      toolOpts
    );

    expect(getEstimate).toHaveBeenCalledWith('user-1', { date: '2026-11-07' });
    expect(result).toBe(
      JSON.stringify({
        disclaimer: BLOOD_ALCOHOL_DISCLAIMER,
        status: 'ok',
        missing_inputs: [],
        where_to_set: [],
        unit: 'percent',
        estimated_now: 0.0312,
        peak: { value: 0.0351, date: '2026-11-07', time: '21:15' },
        total_alcohol_g_for_date: 34,
        doses: [
          {
            grams: 14,
            name: 'Beer',
            is_estimated: false,
            date: '2026-11-07',
            time: '00:00',
          },
          {
            grams: 20,
            name: 'Wine',
            is_estimated: true,
            date: '2026-11-07',
            time: '20:30',
          },
        ],
        has_estimated_times: true,
        formula: 'watson',
      })
    );
  });

  it('says when the chosen formula did not fit and Watson was used', async () => {
    getEstimate.mockResolvedValue({ ...ESTIMATE, fell_back_from: 'seidl' });

    const result = JSON.parse(
      String(
        await tools.sparky_get_blood_alcohol.execute!(
          { action: 'estimate', date: '2026-11-07' },
          toolOpts
        )
      )
    );

    expect(result.formula).toBe('watson');
    expect(result.fell_back_from).toBe('seidl');
    expect(result.formula_note).toBe(
      'The chosen formula did not fit the body measurements, so Watson was used instead.'
    );
  });

  it('names missing profile inputs and where to set them', async () => {
    getEstimate.mockResolvedValue(MISSING_INPUTS);

    const result = await tools.sparky_get_blood_alcohol.execute!(
      { date: '2026-11-07' },
      toolOpts
    );

    expect(result).toBe(
      JSON.stringify({
        disclaimer: BLOOD_ALCOHOL_DISCLAIMER,
        status: 'missing_inputs',
        missing_inputs: ['sex', 'age'],
        where_to_set: [
          'sex: Settings > Profile',
          'date of birth: Settings > Profile',
        ],
        unit: 'permille',
        estimated_now: null,
        peak: null,
        total_alcohol_g_for_date: 0,
        doses: [],
        has_estimated_times: false,
        formula: 'watson',
      })
    );
  });

  // The estimate must never read as fitness to drive, so the tool must not
  // hand the model a time the curve returns to zero.
  it('never returns a sober or back-to-zero time', async () => {
    getEstimate.mockResolvedValue(ESTIMATE);

    const result = String(
      await tools.sparky_get_blood_alcohol.execute!({}, toolOpts)
    );

    expect(result).not.toMatch(/sober|zero|safe/i);
    expect(result).not.toMatch(/elimination/i);
    expect(result).toContain('fit to drive');
  });

  it('defaults to today in the user zone', async () => {
    getEstimate.mockResolvedValue(ESTIMATE);

    await tools.sparky_get_blood_alcohol.execute!({}, toolOpts);

    expect(getEstimate).toHaveBeenCalledWith('user-1', {
      date: todayInZone('Europe/Berlin'),
    });
  });

  it('rejects an unknown action', async () => {
    const result = await tools.sparky_get_blood_alcohol.execute!(
      { action: 'sober_time' } as never,
      toolOpts
    );

    expect(result).toBe(
      "Error [VALIDATION]: action: Invalid discriminator value. Expected 'estimate'"
    );
    expect(getEstimate).not.toHaveBeenCalled();
  });

  it('returns DB_ERROR instead of throwing when the service fails', async () => {
    getEstimate.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_blood_alcohol.execute!(
      { action: 'estimate', date: '2026-11-07' },
      toolOpts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
