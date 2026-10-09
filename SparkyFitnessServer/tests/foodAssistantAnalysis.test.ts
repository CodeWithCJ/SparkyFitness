import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  foodAssistantAnalysisDraftSchema,
  foodAssistantTaskSchema,
  todayInZone,
} from '@workspace/shared';
import * as service from '../services/foodAssistantAnalysisService.js';
import * as data from '../models/foodAssistantAnalysisRepository.js';
import * as tasks from '../models/foodAssistantRepository.js';
import goalService from '../services/goalService.js';
import type { PoolClient } from 'pg';
vi.mock('../models/foodAssistantAnalysisRepository.js', () => ({
  readAnalysisEntries: vi.fn(),
}));
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  mutateTask: vi.fn(),
}));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoalsForRange: vi.fn() },
}));
const user = randomUUID(),
  id = randomUUID(),
  op = randomUUID();
const range = { start_date: '2020-03-28', end_date: '2020-03-30' },
  fields = ['calories', 'protein', 'sodium'] as const;
const row = {
  id: randomUUID(),
  user_id: user,
  entry_date: '2020-03-28',
  food_name: 'White bread',
  quantity: 2,
  unit: 'slice',
  serving_size: 1,
  serving_unit: 'slice',
  calories: 80,
  protein: 3,
  carbs: 15,
  fat: 1,
  sodium: null,
};
const goals = {
  '2020-03-28': { calories: 2000, protein: 100 },
  '2020-03-29': { calories: 2100, protein: 105 },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(data.readAnalysisEntries).mockResolvedValue([row]);
  vi.mocked(goalService.getUserGoalsForRange).mockResolvedValue(goals);
});
it('uses recorded serving snapshots and averages logged days without imputing unlogged intake', () => {
  const result = service.summarizeNutrition(
    [row, { ...row, id: randomUUID(), entry_date: '2020-03-29', quantity: 1 }],
    range,
    [...fields],
    goals
  );
  expect(result).toMatchObject({
    calendar_days: 3,
    logged_days: 2,
    unlogged_days: 1,
    entry_count: 2,
    nutrients: {
      calories: {
        total: 240,
        average_per_logged_day: 120,
        known_entries: 2,
        missing_entries: 0,
        goal_comparable_days: 2,
        average_goal: 2050,
        average_daily_goal_gap: -1930,
      },
      sodium: {
        total: null,
        known_total: null,
        average_per_logged_day: null,
        missing_entries: 2,
      },
    },
  });
  expect(result.days[2]!.nutrients.calories).toMatchObject({
    total: null,
    known_total: null,
  });
});
it('keeps a known subtotal separate from an incomplete nutrient total', () => {
  const result = service.summarizeNutrition(
    [
      { ...row, sodium: 100 },
      { ...row, id: randomUUID() },
    ],
    range,
    ['sodium'],
    {}
  );
  expect(result.nutrients.sodium).toMatchObject({
    known_total: 200,
    total: null,
    average_per_logged_day: null,
    known_entries: 1,
    missing_entries: 1,
    complete_reference_days: 0,
  });
});
it('converts compatible weight units but never guesses a slice weight or food density', () => {
  const result = service.summarizeNutrition(
    [
      {
        ...row,
        quantity: 0.25,
        unit: 'kg',
        serving_size: 100,
        serving_unit: 'g',
        calories: 260,
      },
      {
        ...row,
        id: randomUUID(),
        unit: 'slice',
        serving_size: 100,
        serving_unit: 'g',
        calories: 260,
      },
    ],
    range,
    ['calories'],
    {}
  );
  expect(result.nutrients.calories).toMatchObject({
    known_total: 650,
    total: null,
    known_entries: 1,
    missing_entries: 1,
  });
  expect(result.issues).toHaveLength(1);
  expect(result.issues[0]!.message).toMatch(/Cannot safely convert/);
});
it('flags implausible historical nutrition while retaining the recorded values and leaves invalid values unknown', () => {
  const result = service.summarizeNutrition(
    [{ ...row, calories: 2.5, protein: 0, carbs: 0.5, fat: 0 }],
    range,
    ['calories'],
    {}
  );
  expect(result.nutrients.calories!.total).toBe(5);
  expect(result.issues[0]!.message).toMatch(
    /implausible.*recorded values are retained/
  );
  const invalid = service.summarizeNutrition(
    [{ ...row, calories: -5 }],
    range,
    ['calories'],
    {}
  );
  expect(invalid.nutrients.calories!.total).toBeNull();
});
it('returns null averages and goal gaps for a period without food records', () => {
  expect(
    service.summarizeNutrition([], range, ['calories'], goals)
  ).toMatchObject({
    logged_days: 0,
    unlogged_days: 3,
    nutrients: {
      calories: {
        known_total: null,
        total: null,
        average_per_logged_day: null,
        goal_comparable_days: 0,
        average_daily_goal_gap: null,
      },
    },
  });
});
it('captures source fingerprints, corresponding goals and descriptive comparison coverage', async () => {
  vi.mocked(data.readAnalysisEntries)
    .mockResolvedValueOnce([row])
    .mockResolvedValueOnce([{ ...row, entry_date: '2020-03-21', quantity: 1 }]);
  const result = await service.analyzeNutrition(user, 'Europe/London', {
    ...range,
    nutrients: ['calories'],
    compare: { start_date: '2020-03-21', end_date: '2020-03-23' },
  });
  expect(result.current.nutrients.calories!.average_per_logged_day).toBe(160);
  expect(result.changes?.calories).toMatchObject({
    average_per_logged_day_change: 80,
    current_logged_days: 1,
    comparison_logged_days: 1,
  });
  expect(result.current.evidence.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(result.current.evidence.entry_ids).toEqual([row.id]);
  expect(goalService.getUserGoalsForRange).toHaveBeenCalledWith(
    user,
    range.start_date,
    range.end_date,
    false
  );
  expect(result.limitations.join(' ')).toMatch(
    /Unlogged days.*never zero.*do not establish causes/
  );
});
it('rejects future dates, long windows, duplicate nutrients and invalid calendar dates before reading', async () => {
  await expect(
    service.analyzeNutrition(user, 'Europe/London', {
      start_date: '2099-01-01',
      end_date: '2099-01-02',
    })
  ).rejects.toThrow(/history/);
  await expect(
    service.analyzeNutrition(user, 'Europe/London', {
      start_date: '2020-01-01',
      end_date: '2020-04-30',
    })
  ).rejects.toThrow(/90/);
  expect(
    foodAssistantAnalysisDraftSchema.safeParse({
      ...range,
      nutrients: ['calories', 'calories'],
    }).success
  ).toBe(false);
  expect(
    foodAssistantAnalysisDraftSchema.safeParse({
      ...range,
      end_date: '2020-02-30',
    }).success
  ).toBe(false);
  expect(data.readAnalysisEntries).not.toHaveBeenCalled();
});
it('identifies today as a partial day using the actor timezone', async () => {
  const today = todayInZone('Pacific/Auckland');
  const result = await service.analyzeNutrition(user, 'Pacific/Auckland', {
    start_date: today,
    end_date: today,
  });
  expect(result.includes_partial_today).toBe(true);
});
it('saves a completed analysis only after capture on the shared task transaction and rejects a different task kind', async () => {
  const task = foodAssistantTaskSchema.parse({
    id,
    user_id: user,
    kind: 'analysis',
    title: 'Weekly nutrition',
    checkpoint: { summary: 'Analyze history', analysis: range },
    status: 'draft',
    result: null,
    creation_hash: 'test',
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });
  const client = { query: vi.fn() } as unknown as PoolClient;
  await service.saveNutritionAnalysis(user, 'Europe/London', id, {
    operation_id: op,
    expected_version: 1,
  });
  const callback = vi.mocked(tasks.mutateTask).mock.calls[0]![2],
    next = await callback(task, client);
  expect(data.readAnalysisEntries).toHaveBeenCalledWith(
    user,
    range.start_date,
    range.end_date,
    client
  );
  expect(next.status).toBe('complete');
  expect(next.result).toMatchObject({
    kind: 'nutrition_analysis',
    publication_operation_id: op,
  });
  await expect(callback({ ...task, kind: 'diary' }, client)).rejects.toThrow(
    /analysis task/
  );
});
