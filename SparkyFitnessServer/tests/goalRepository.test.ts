import { vi, beforeEach, describe, expect, it } from 'vitest';
import goalRepository from '../models/goalRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('goalRepository', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getClient as any).mockResolvedValue(mockClient);
  });

  describe('upsertGoal', () => {
    it('passes caffeine_mg and alcohol_g at $34 and $35 without shifting earlier params', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            caffeine_mg: 300,
            alcohol_g: 14,
          },
        ],
      });

      const goalData = {
        user_id: 'user-1',
        goal_date: '2026-09-05',
        calories: 2000,
        protein: 150,
        carbs: 250,
        fat: 65,
        water_goal_ml: 2000,
        saturated_fat: 20,
        polyunsaturated_fat: 10,
        monounsaturated_fat: 25,
        trans_fat: 0,
        cholesterol: 300,
        sodium: 2300,
        potassium: 3500,
        dietary_fiber: 30,
        sugars: 45,
        vitamin_a: 900,
        vitamin_c: 90,
        calcium: 1000,
        iron: 18,
        target_exercise_calories_burned: 400,
        target_exercise_duration_minutes: 45,
        protein_percentage: 30,
        carbs_percentage: 45,
        fat_percentage: 25,
        breakfast_percentage: 25,
        lunch_percentage: 35,
        dinner_percentage: 30,
        snacks_percentage: 10,
        custom_meal_percentages: {},
        custom_nutrients: {},
        caffeine_mg: 300,
        alcohol_g: 14,
      };

      const result = await goalRepository.upsertGoal(goalData);

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockClient.query.mock.calls[0];

      // Check positional params count ($1 through $35)
      expect(params).toHaveLength(35);
      expect(params[0]).toBe('user-1'); // $1 user_id
      expect(params[1]).toBe('2026-09-05'); // $2 goal_date
      expect(params[2]).toBe(2000); // $3 calories
      expect(params[33]).toBe(300); // $34 caffeine_mg
      expect(params[34]).toBe(14); // $35 alcohol_g

      // Check SQL includes caffeine_mg and alcohol_g in INSERT and DO UPDATE
      expect(sql).toContain('caffeine_mg');
      expect(sql).toContain('alcohol_g');
      expect(sql).toContain('caffeine_mg = EXCLUDED.caffeine_mg');
      expect(sql).toContain('alcohol_g = EXCLUDED.alcohol_g');

      expect(result).toEqual({
        id: 'goal-1',
        user_id: 'user-1',
        caffeine_mg: 300,
        alcohol_g: 14,
      });
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
