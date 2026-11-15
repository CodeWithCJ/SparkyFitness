import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bacModelOf,
  bloodAlcoholChartWindow,
  bloodAlcoholCurve,
} from '@workspace/shared';
import { getBloodAlcoholEstimate } from '../services/bloodAlcoholService.js';
import * as foodMisc from '../models/foodMisc.js';
import * as preferenceRepo from '../models/preferenceRepository.js';
import * as userRepo from '../models/userRepository.js';
import * as measurementRepo from '../models/measurementRepository.js';
import * as timezoneLoader from '../utils/timezoneLoader.js';
import type { RawNutrientDose } from '../models/foodMisc.js';

const userId = '11111111-1111-1111-1111-111111111111';

const drink = (
  entryDate: string,
  entryTime: string | null,
  grams = 20,
  name = 'Beer'
): RawNutrientDose => ({
  source: 'food',
  entry_date: entryDate,
  entry_time: entryTime,
  meal_default_time: null,
  taken_at: null,
  amount: grams,
  name,
});

describe('getBloodAlcoholEstimate', () => {
  let dosesSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(timezoneLoader, 'loadUserTimezone').mockResolvedValue('UTC');
    vi.spyOn(preferenceRepo, 'getUserPreferences').mockResolvedValue({
      bac_distribution_formula: 'widmark',
      // pg returns numeric columns as strings.
      bac_elimination_rate: '0.150',
      bac_display_unit: 'percent',
    });
    vi.spyOn(userRepo, 'getUserProfile').mockResolvedValue({
      gender: 'male',
      date_of_birth: '1990-01-01',
    });
    vi.spyOn(
      measurementRepo,
      'getLatestCheckInMeasurementsOnOrBeforeDate'
    ).mockResolvedValue({ weight: '80.00', height: '180.00' });
    dosesSpy = vi
      .spyOn(foodMisc, 'getNutrientDosesForWindow')
      .mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads alcohol for the day before through the date', async () => {
    await getBloodAlcoholEstimate(userId, { date: '2026-11-07' });

    expect(dosesSpy).toHaveBeenCalledWith(
      userId,
      '2026-11-06',
      '2026-11-07',
      'alcohol_g'
    );
    expect(
      measurementRepo.getLatestCheckInMeasurementsOnOrBeforeDate
    ).toHaveBeenCalledWith(userId, '2026-11-07');
  });

  it('estimates today from the preferences and profile', async () => {
    dosesSpy.mockResolvedValue([drink('2026-11-07', '20:00', 30)]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
      now: '2026-11-07T21:00:00.000Z',
    });

    expect(result.status).toBe('ok');
    expect(result.missing_inputs).toEqual([]);
    expect(result.formula).toBe('widmark');
    expect(result.fell_back_from).toBeNull();
    expect(result.display_unit).toBe('percent');
    expect(result.elimination_rate).toBe(0.15);
    expect(result.distribution_factor).toBe(0.68);
    expect(result.weight_kg).toBe(80);
    expect(result.doses).toEqual([
      {
        at: '2026-11-07T20:00:00.000Z',
        grams: 30,
        name: 'Beer',
        is_estimated: false,
      },
    ]);
    // 30 g over 0.68 x 80 kg is 0.55 per mille fully absorbed, less an
    // hour of elimination.
    expect(result.estimated_now_permille).toBeGreaterThan(0.35);
    expect(result.estimated_now_permille).toBeLessThan(0.5);
    expect(result.peak?.permille).toBeGreaterThanOrEqual(
      result.estimated_now_permille ?? 0
    );
    expect(result.has_estimated_times).toBe(false);
  });

  it('gives no "now" value for a past day but still reports its peak', async () => {
    dosesSpy.mockResolvedValue([drink('2026-11-05', '20:00', 30)]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-05',
      now: '2026-11-07T12:00:00.000Z',
    });

    expect(result.status).toBe('ok');
    expect(result.estimated_now_permille).toBeNull();
    expect(result.peak).not.toBeNull();
  });

  it('keeps last night’s drinks that still count, not earlier ones', async () => {
    dosesSpy.mockResolvedValue([
      drink('2026-11-06', '12:00', 20, 'Lunch wine'),
      drink('2026-11-06', '22:00', 30, 'Late beer'),
      drink('2026-11-06', '23:30', 30, 'Last beer'),
      drink('2026-11-07', '19:00', 20, 'Dinner wine'),
    ]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
      now: '2026-11-07T00:30:00.000Z',
    });

    expect(result.doses.map((d) => d.name)).toEqual([
      'Late beer',
      'Last beer',
      'Dinner wine',
    ]);
    expect(result.estimated_now_permille).toBeGreaterThan(0);
  });

  it('drops the previous day once its drinks are gone by midnight', async () => {
    dosesSpy.mockResolvedValue([
      drink('2026-11-06', '12:00', 20, 'Lunch wine'),
      drink('2026-11-07', '19:00', 20, 'Dinner wine'),
    ]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
    });

    expect(result.doses.map((d) => d.name)).toEqual(['Dinner wine']);
  });

  it('flags untimed drinks as estimated', async () => {
    dosesSpy.mockResolvedValue([
      { ...drink('2026-11-07', null), meal_default_time: '19:00' },
    ]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
    });

    expect(result.doses[0]?.at).toBe('2026-11-07T19:00:00.000Z');
    expect(result.has_estimated_times).toBe(true);
  });

  it('names missing inputs instead of guessing them', async () => {
    vi.mocked(preferenceRepo.getUserPreferences).mockResolvedValue(undefined);
    vi.mocked(userRepo.getUserProfile).mockResolvedValue({
      gender: 'other',
      date_of_birth: null,
    });
    vi.mocked(
      measurementRepo.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: null, height: null });
    dosesSpy.mockResolvedValue([drink('2026-11-07', '20:00')]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
      now: '2026-11-07T21:00:00.000Z',
    });

    // Defaults: Watson needs every input for anyone who is not female.
    expect(result.formula).toBe('watson');
    expect(result.display_unit).toBe('permille');
    expect(result.elimination_rate).toBe(0.15);
    expect(result.status).toBe('missing_inputs');
    expect(result.missing_inputs).toEqual(['sex', 'weight', 'height', 'age']);
    expect(result.distribution_factor).toBeNull();
    expect(result.weight_kg).toBeNull();
    expect(result.estimated_now_permille).toBeNull();
    expect(result.peak).toBeNull();
    expect(result.doses).toHaveLength(1);
  });

  it('reports implausible inputs rather than an absurd estimate', async () => {
    vi.mocked(preferenceRepo.getUserPreferences).mockResolvedValue({
      bac_distribution_formula: 'seidl',
    });
    // A mistyped weight: neither Seidl nor the Watson fallback describes it.
    vi.mocked(
      measurementRepo.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: '5', height: '180' });

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
    });

    expect(result.status).toBe('implausible_inputs');
    expect(result.missing_inputs).toEqual([]);
    expect(result.formula).toBe('seidl');
    expect(result.fell_back_from).toBeNull();
    expect(result.distribution_factor).toBeNull();
    expect(result.estimated_now_permille).toBeNull();
  });

  it('uses Watson when the chosen formula does not fit the body', async () => {
    vi.mocked(preferenceRepo.getUserPreferences).mockResolvedValue({
      bac_distribution_formula: 'seidl',
    });
    vi.mocked(userRepo.getUserProfile).mockResolvedValue({
      gender: 'female',
      date_of_birth: '1990-01-01',
    });
    vi.mocked(
      measurementRepo.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: '120', height: '165' });
    dosesSpy.mockResolvedValue([drink('2026-11-07', '20:00')]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
      now: '2026-11-07T21:00:00.000Z',
    });

    expect(result.status).toBe('ok');
    expect(result.formula).toBe('watson');
    expect(result.fell_back_from).toBe('seidl');
    expect(result.distribution_factor).toBeGreaterThan(0.3);
    expect(result.estimated_now_permille).toBeGreaterThan(0);
  });

  it('leaves Watson as chosen for the same body', async () => {
    vi.mocked(preferenceRepo.getUserPreferences).mockResolvedValue({
      bac_distribution_formula: 'watson',
    });
    vi.mocked(userRepo.getUserProfile).mockResolvedValue({
      gender: 'female',
      date_of_birth: '1990-01-01',
    });
    vi.mocked(
      measurementRepo.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: '120', height: '165' });

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
    });

    expect(result.status).toBe('ok');
    expect(result.formula).toBe('watson');
    expect(result.fell_back_from).toBeNull();
  });

  // The peak spans what the chart draws: a late drink peaks after midnight,
  // and the reported peak must be the curve's highest point, not 00:00.
  it('reports the peak of a late drink after midnight, matching the curve', async () => {
    dosesSpy.mockResolvedValue([drink('2026-11-07', '23:30', 40)]);

    const result = await getBloodAlcoholEstimate(userId, {
      date: '2026-11-07',
      now: '2026-11-09T12:00:00.000Z',
    });

    const peak = result.peak;
    expect(peak).not.toBeNull();
    const peakMs = Date.parse(peak!.at);
    expect(peakMs).toBeGreaterThan(Date.parse('2026-11-08T00:00:00.000Z'));

    const model = bacModelOf(result);
    const window = bloodAlcoholChartWindow(
      result.doses,
      model,
      {
        startMs: Date.parse('2026-11-07T00:00:00.000Z'),
        endMs: Date.parse('2026-11-08T00:00:00.000Z'),
      },
      '2026-11-09T12:00:00.000Z'
    );
    expect(window).not.toBeNull();
    expect(peakMs).toBeGreaterThanOrEqual(window!.from);
    expect(peakMs).toBeLessThanOrEqual(window!.to);
    // bloodAlcoholPeak samples the curve every 5 minutes.
    const curve = bloodAlcoholCurve(
      result.doses,
      model,
      window!.from,
      window!.to,
      5
    );
    const highest = Math.max(...curve.map((p) => p.permille));
    expect(peak!.permille).toBe(highest);
    expect(curve.find((p) => p.t === peakMs)?.permille).toBe(highest);
  });
});
