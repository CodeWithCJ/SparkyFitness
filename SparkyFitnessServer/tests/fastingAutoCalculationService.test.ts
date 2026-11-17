import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clusterEatingEvents,
  classifyProtocol,
  syncCompletedAutoFasts,
  getCurrentAutoFast,
  type RawFoodMealPoint,
} from '../services/fastingAutoCalculationService.js';
import fastingRepository from '../models/fastingRepository.js';
import fastingPreferencesRepository from '../models/fastingPreferencesRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../models/fastingRepository.js', () => ({
  default: {
    findFastNearStartTime: vi.fn(),
    createCompletedFast: vi.fn().mockResolvedValue({ id: 'fast-created' }),
    endFast: vi.fn().mockResolvedValue({ id: 'fast-ended' }),
    updateFast: vi.fn().mockResolvedValue({ id: 'fast-updated' }),
    getCurrentFast: vi.fn(),
  },
  findFastNearStartTime: vi.fn(),
  createCompletedFast: vi.fn().mockResolvedValue({ id: 'fast-created' }),
  endFast: vi.fn().mockResolvedValue({ id: 'fast-ended' }),
  updateFast: vi.fn().mockResolvedValue({ id: 'fast-updated' }),
  getCurrentFast: vi.fn(),
}));

vi.mock('../models/fastingPreferencesRepository.js', () => ({
  default: {
    getFastingPreferences: vi.fn(),
  },
}));

describe('fastingAutoCalculationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classifyProtocol', () => {
    it('classifies 23h+ as OMAD', () => {
      expect(classifyProtocol(23 * 60)).toBe('23:1 OMAD');
      expect(classifyProtocol(24 * 60)).toBe('23:1 OMAD');
    });

    it('classifies 20h as 20:4 Warrior', () => {
      expect(classifyProtocol(20 * 60)).toBe('20:4 Warrior');
      expect(classifyProtocol(21 * 60)).toBe('20:4 Warrior');
    });

    it('classifies 18h as 18:6 Warrior', () => {
      expect(classifyProtocol(18 * 60)).toBe('18:6 Warrior');
      expect(classifyProtocol(19 * 60)).toBe('18:6 Warrior');
    });

    it('classifies 16h as 16:8 Leangains', () => {
      expect(classifyProtocol(16 * 60)).toBe('16:8 Leangains');
      expect(classifyProtocol(17.5 * 60)).toBe('16:8 Leangains');
    });

    it('classifies 14h as 14:10 Fast', () => {
      expect(classifyProtocol(14 * 60)).toBe('14:10 Fast');
    });

    it('classifies 12h as 12:12 Circadian', () => {
      expect(classifyProtocol(12 * 60)).toBe('12:12 Circadian');
    });

    it('classifies < 12h as Custom Fast', () => {
      expect(classifyProtocol(11 * 60)).toBe('Custom Fast');
    });
  });

  describe('clusterEatingEvents', () => {
    it('returns empty array when no food points exist', () => {
      expect(clusterEatingEvents([])).toEqual([]);
    });

    it('clusters food entries within 45 minutes into a single eating event', () => {
      const baseTime = new Date('2026-10-03T18:00:00.000Z');
      const point1: RawFoodMealPoint = {
        id: '1',
        entry_date: '2026-10-03',
        entry_time: '18:00',
        meal_default_time: null,
        meal_timestamp: baseTime,
        calories: 450,
        food_name: 'Steak',
        meal_type_name: 'Dinner',
      };

      const point2: RawFoodMealPoint = {
        id: '2',
        entry_date: '2026-10-03',
        entry_time: '18:20',
        meal_default_time: null,
        meal_timestamp: new Date('2026-10-03T18:20:00.000Z'),
        calories: 150,
        food_name: 'Salad',
        meal_type_name: 'Dinner',
      };

      const events = clusterEatingEvents([point1, point2]);
      expect(events).toHaveLength(1);
      expect(events[0].start).toEqual(baseTime);
      expect(events[0].end).toEqual(new Date('2026-10-03T18:20:00.000Z'));
      expect(events[0].calories).toBe(600);
      expect(events[0].description).toBe('Dinner');
    });

    it('separates meals further than 45 minutes apart into distinct events', () => {
      const dinnerPoint: RawFoodMealPoint = {
        id: '1',
        entry_date: '2026-10-03',
        entry_time: '18:00',
        meal_default_time: null,
        meal_timestamp: new Date('2026-10-03T18:00:00.000Z'),
        calories: 700,
        food_name: 'Dinner',
        meal_type_name: 'Dinner',
      };

      const breakfastNextDay: RawFoodMealPoint = {
        id: '2',
        entry_date: '2026-10-04',
        entry_time: '10:00',
        meal_default_time: null,
        meal_timestamp: new Date('2026-10-04T10:00:00.000Z'),
        calories: 500,
        food_name: 'Eggs',
        meal_type_name: 'Breakfast',
      };

      const events = clusterEatingEvents([dinnerPoint, breakfastNextDay]);
      expect(events).toHaveLength(2);
      expect(events[0].description).toBe('Dinner');
      expect(events[1].description).toBe('Breakfast');
    });
  });

  describe('syncCompletedAutoFasts', () => {
    it('returns 0 when auto_calculate is false', async () => {
      vi.mocked(
        fastingPreferencesRepository.getFastingPreferences
      ).mockResolvedValue({
        id: 'pref-1',
        user_id: 'user-123',
        auto_calculate: false,
        default_protocol: '16-8',
        target_fasting_hours: 16.0,
        target_eating_hours: 8.0,
        calorie_threshold: 10,
        pre_end_alert_minutes: 30,
        eating_window_alert: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const count = await syncCompletedAutoFasts(
        'user-123',
        'America/New_York'
      );
      expect(count).toBe(0);
      expect(fastingRepository.createCompletedFast).not.toHaveBeenCalled();
    });

    it('creates completed fast between overnight meals >= 12 hours', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'food-1',
              entry_date: '2026-10-03',
              entry_time: '19:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-03T19:00:00.000Z'),
              calories: 750,
              food_name: 'Dinner Steak',
              meal_type_name: 'Dinner',
            },
            {
              id: 'food-2',
              entry_date: '2026-10-04',
              entry_time: '13:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-04T13:00:00.000Z'),
              calories: 600,
              food_name: 'Lunch Salad',
              meal_type_name: 'Lunch',
            },
          ],
        }),
        release: vi.fn(),
      };
      vi.mocked(getClient).mockResolvedValue(
        mockClient as unknown as Awaited<ReturnType<typeof getClient>>
      );

      vi.mocked(
        fastingPreferencesRepository.getFastingPreferences
      ).mockResolvedValue({
        id: 'pref-1',
        user_id: 'user-123',
        auto_calculate: true,
        default_protocol: '16-8',
        target_fasting_hours: 16.0,
        target_eating_hours: 8.0,
        calorie_threshold: 10,
        pre_end_alert_minutes: 30,
        eating_window_alert: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      vi.mocked(fastingRepository.findFastNearStartTime).mockResolvedValue(
        null
      );
      vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue(null);

      const count = await syncCompletedAutoFasts('user-123', 'UTC');
      expect(count).toBe(1);
      expect(fastingRepository.createCompletedFast).toHaveBeenCalledWith(
        'user-123',
        '2026-10-03T19:00:00.000Z',
        '2026-10-04T13:00:00.000Z',
        expect.any(String),
        18 * 60, // 18 hours = 1080 minutes
        '18:6 Warrior',
        expect.anything()
      );
    });

    it('skips duplicate when fast is already COMPLETED', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'food-1',
              entry_date: '2026-10-03',
              entry_time: '19:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-03T19:00:00.000Z'),
              calories: 750,
              food_name: 'Dinner Steak',
              meal_type_name: 'Dinner',
            },
            {
              id: 'food-2',
              entry_date: '2026-10-04',
              entry_time: '13:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-04T13:00:00.000Z'),
              calories: 600,
              food_name: 'Lunch Salad',
              meal_type_name: 'Lunch',
            },
          ],
        }),
        release: vi.fn(),
      };
      vi.mocked(getClient).mockResolvedValue(
        mockClient as unknown as Awaited<ReturnType<typeof getClient>>
      );

      vi.mocked(
        fastingPreferencesRepository.getFastingPreferences
      ).mockResolvedValue({
        id: 'pref-1',
        user_id: 'user-123',
        auto_calculate: true,
        default_protocol: '16-8',
        target_fasting_hours: 16.0,
        target_eating_hours: 8.0,
        calorie_threshold: 10,
        pre_end_alert_minutes: 30,
        eating_window_alert: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      vi.mocked(fastingRepository.findFastNearStartTime).mockResolvedValue({
        id: 'existing-fast-1',
        status: 'COMPLETED',
        start_time: '2026-10-03T19:00:00.000Z',
        end_time: '2026-10-04T13:00:00.000Z',
      });
      vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue(null);

      const count = await syncCompletedAutoFasts('user-123', 'UTC');
      expect(count).toBe(0);
      expect(fastingRepository.createCompletedFast).not.toHaveBeenCalled();
    });

    it('completes active fast if food was eaten after it started', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'food-1',
              entry_date: '2026-10-03',
              entry_time: '19:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-03T19:00:00.000Z'),
              calories: 750,
              food_name: 'Dinner Steak',
              meal_type_name: 'Dinner',
            },
            {
              id: 'food-2',
              entry_date: '2026-10-04',
              entry_time: '13:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-04T13:00:00.000Z'),
              calories: 600,
              food_name: 'Lunch Salad',
              meal_type_name: 'Lunch',
            },
          ],
        }),
        release: vi.fn(),
      };
      vi.mocked(getClient).mockResolvedValue(
        mockClient as unknown as Awaited<ReturnType<typeof getClient>>
      );

      vi.mocked(
        fastingPreferencesRepository.getFastingPreferences
      ).mockResolvedValue({
        id: 'pref-1',
        user_id: 'user-123',
        auto_calculate: true,
        default_protocol: '16-8',
        target_fasting_hours: 16.0,
        target_eating_hours: 8.0,
        calorie_threshold: 10,
        pre_end_alert_minutes: 30,
        eating_window_alert: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      vi.mocked(fastingRepository.findFastNearStartTime).mockResolvedValue({
        id: 'active-fast-1',
        status: 'ACTIVE',
        start_time: '2026-10-03T19:00:00.000Z',
        end_time: null,
      });
      vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue(null);

      const count = await syncCompletedAutoFasts('user-123', 'UTC');
      expect(count).toBe(1);
      expect(fastingRepository.endFast).toHaveBeenCalledWith(
        'active-fast-1',
        'user-123',
        '2026-10-04T13:00:00.000Z',
        18 * 60,
        '2026-10-03T19:00:00.000Z',
        expect.anything()
      );
    });

    it('skips same-day gaps that do not meet target hours', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'food-1',
              entry_date: '2026-10-03',
              entry_time: '06:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-03T06:00:00.000Z'),
              calories: 400,
              food_name: 'Breakfast',
              meal_type_name: 'Breakfast',
            },
            {
              id: 'food-2',
              entry_date: '2026-10-03',
              entry_time: '19:00',
              meal_default_time: null,
              meal_timestamp: new Date('2026-10-03T19:00:00.000Z'),
              calories: 750,
              food_name: 'Dinner',
              meal_type_name: 'Dinner',
            },
          ],
        }),
        release: vi.fn(),
      };
      vi.mocked(getClient).mockResolvedValue(
        mockClient as unknown as Awaited<ReturnType<typeof getClient>>
      );

      vi.mocked(
        fastingPreferencesRepository.getFastingPreferences
      ).mockResolvedValue({
        id: 'pref-1',
        user_id: 'user-123',
        auto_calculate: true,
        default_protocol: '16-8',
        target_fasting_hours: 16.0,
        target_eating_hours: 8.0,
        calorie_threshold: 10,
        pre_end_alert_minutes: 30,
        eating_window_alert: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue(null);

      // 13 hours on the exact same day in UTC does not cross days and is < 16h target
      const count = await syncCompletedAutoFasts('user-123', 'UTC');
      expect(count).toBe(0);
      expect(fastingRepository.createCompletedFast).not.toHaveBeenCalled();
    });

    it('excludes future planned meals from ending an active fast or creating completed fasts', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
      try {
        const mockClient = {
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: 'food-past',
                entry_date: '2026-10-03',
                entry_time: '19:00',
                meal_default_time: null,
                meal_timestamp: new Date('2026-10-03T19:00:00.000Z'),
                calories: 750,
                food_name: 'Dinner Steak',
                meal_type_name: 'Dinner',
              },
              {
                id: 'food-future',
                entry_date: '2026-10-04',
                entry_time: '19:00',
                meal_default_time: null,
                meal_timestamp: new Date('2026-10-04T19:00:00.000Z'),
                calories: 600,
                food_name: 'Planned Dinner',
                meal_type_name: 'Dinner',
              },
            ],
          }),
          release: vi.fn(),
        };
        vi.mocked(getClient).mockResolvedValue(
          mockClient as unknown as Awaited<ReturnType<typeof getClient>>
        );

        vi.mocked(
          fastingPreferencesRepository.getFastingPreferences
        ).mockResolvedValue({
          id: 'pref-1',
          user_id: 'user-123',
          auto_calculate: true,
          default_protocol: '16-8',
          target_fasting_hours: 16.0,
          target_eating_hours: 8.0,
          calorie_threshold: 10,
          pre_end_alert_minutes: 30,
          eating_window_alert: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        vi.mocked(fastingRepository.getCurrentFast).mockResolvedValue({
          id: 'active-fast-1',
          user_id: 'user-123',
          start_time: '2026-10-03T19:00:00.000Z',
          status: 'ACTIVE',
        });

        const count = await syncCompletedAutoFasts('user-123', 'UTC');
        expect(count).toBe(0);
        expect(fastingRepository.createCompletedFast).not.toHaveBeenCalled();
        expect(fastingRepository.endFast).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getCurrentAutoFast', () => {
    it('returns eating window status when meal was eaten today within eating window duration', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
      try {
        const breakfastTime = new Date('2026-10-04T10:00:00Z');
        const todayStr = '2026-10-04';

        const mockClient = {
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: 'food-breakfast',
                entry_date: todayStr,
                entry_time: '10:00',
                meal_default_time: null,
                meal_timestamp: breakfastTime,
                calories: 500,
                food_name: 'Eggs and Avocado',
                meal_type_name: 'Breakfast',
              },
            ],
          }),
          release: vi.fn(),
        };
        vi.mocked(getClient).mockResolvedValue(
          mockClient as unknown as Awaited<ReturnType<typeof getClient>>
        );

        vi.mocked(
          fastingPreferencesRepository.getFastingPreferences
        ).mockResolvedValue({
          id: 'pref-1',
          user_id: 'user-123',
          auto_calculate: true,
          default_protocol: '16-8',
          target_fasting_hours: 16.0,
          target_eating_hours: 8.0,
          calorie_threshold: 10,
          pre_end_alert_minutes: 30,
          eating_window_alert: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const fast = await getCurrentAutoFast('user-123', 'UTC');
        expect(fast).not.toBeNull();
        expect(fast?.is_eating_window).toBe(true);
        expect(fast?.eating_window_remaining_minutes).toBeGreaterThan(0);
        expect(fast?.start_meal_name).toBe('Breakfast');
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns eating window status if the overnight fast was manually ended today before any meals are logged', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-04T13:00:00Z'));
      try {
        const dinnerTime = new Date('2026-10-03T20:00:00Z');
        const mockClient = {
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: 'food-dinner',
                entry_date: '2026-10-03',
                entry_time: '20:00',
                meal_default_time: null,
                meal_timestamp: dinnerTime,
                calories: 700,
                food_name: 'Steak and Veggies',
                meal_type_name: 'Dinner',
              },
            ],
          }),
          release: vi.fn(),
        };
        vi.mocked(getClient).mockResolvedValue(
          mockClient as unknown as Awaited<ReturnType<typeof getClient>>
        );

        vi.mocked(
          fastingPreferencesRepository.getFastingPreferences
        ).mockResolvedValue({
          id: 'pref-1',
          user_id: 'user-123',
          auto_calculate: true,
          default_protocol: '16-8',
          target_fasting_hours: 16.0,
          target_eating_hours: 8.0,
          calorie_threshold: 10,
          pre_end_alert_minutes: 30,
          eating_window_alert: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // The user ended this fast at 12:00 PM today (16 hours in)
        vi.mocked(
          fastingRepository.findFastNearStartTime
        ).mockResolvedValueOnce({
          id: 'completed-fast-id',
          start_time: dinnerTime.toISOString(),
          end_time: '2026-10-04T12:00:00.000Z',
          status: 'COMPLETED',
        });

        const fast = await getCurrentAutoFast('user-123', 'UTC');
        expect(fast).not.toBeNull();
        expect(fast?.is_eating_window).toBe(true);
        expect(fast?.eating_window_remaining_minutes).toBe(420); // 7 hours left of 8
        expect(fast?.start_time).toBe('2026-10-04T12:00:00.000Z');
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not resurrect an auto fast as active after its eating window has expired', async () => {
      vi.useFakeTimers();
      // Server clock is 21:00 PM (9 hours after 12:00 fast end, eating window was 8 hours)
      vi.setSystemTime(new Date('2026-10-04T21:00:00Z'));
      try {
        const dinnerTime = new Date('2026-10-03T20:00:00Z');
        const mockClient = {
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: 'food-dinner',
                entry_date: '2026-10-03',
                entry_time: '20:00',
                meal_default_time: null,
                meal_timestamp: dinnerTime,
                calories: 700,
                food_name: 'Steak and Veggies',
                meal_type_name: 'Dinner',
              },
            ],
          }),
          release: vi.fn(),
        };
        vi.mocked(getClient).mockResolvedValue(
          mockClient as unknown as Awaited<ReturnType<typeof getClient>>
        );

        vi.mocked(
          fastingPreferencesRepository.getFastingPreferences
        ).mockResolvedValue({
          id: 'pref-1',
          user_id: 'user-123',
          auto_calculate: true,
          default_protocol: '16-8',
          target_fasting_hours: 16.0,
          target_eating_hours: 8.0,
          calorie_threshold: 10,
          pre_end_alert_minutes: 30,
          eating_window_alert: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // The user ended this fast at 12:00 PM today (16 hours in)
        vi.mocked(
          fastingRepository.findFastNearStartTime
        ).mockResolvedValueOnce({
          id: 'completed-fast-id',
          start_time: dinnerTime.toISOString(),
          end_time: '2026-10-04T12:00:00.000Z',
          status: 'COMPLETED',
        });

        const fast = await getCurrentAutoFast('user-123', 'UTC');
        expect(fast).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('preserves eating window timer when fastEndTime is slightly in future due to clock skew', async () => {
      vi.useFakeTimers();
      // Server clock is 12:00:00 PM
      vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
      try {
        const dinnerTime = new Date('2026-10-03T20:00:00Z');
        const mockClient = {
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: 'food-dinner',
                entry_date: '2026-10-03',
                entry_time: '20:00',
                meal_default_time: null,
                meal_timestamp: dinnerTime,
                calories: 700,
                food_name: 'Steak and Veggies',
                meal_type_name: 'Dinner',
              },
            ],
          }),
          release: vi.fn(),
        };
        vi.mocked(getClient).mockResolvedValue(
          mockClient as unknown as Awaited<ReturnType<typeof getClient>>
        );

        vi.mocked(
          fastingPreferencesRepository.getFastingPreferences
        ).mockResolvedValue({
          id: 'pref-1',
          user_id: 'user-123',
          auto_calculate: true,
          default_protocol: '16-8',
          target_fasting_hours: 16.0,
          target_eating_hours: 8.0,
          calorie_threshold: 10,
          pre_end_alert_minutes: 30,
          eating_window_alert: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Fast was ended with timestamp 2 minutes in the future (12:02 PM) due to device skew
        vi.mocked(
          fastingRepository.findFastNearStartTime
        ).mockResolvedValueOnce({
          id: 'completed-fast-id',
          start_time: dinnerTime.toISOString(),
          end_time: '2026-10-04T12:02:00.000Z',
          status: 'COMPLETED',
        });

        const fast = await getCurrentAutoFast('user-123', 'UTC');
        expect(fast).not.toBeNull();
        expect(fast?.is_eating_window).toBe(true);
        expect(fast?.duration_minutes).toBe(0); // Clamped, not negative
        expect(fast?.eating_window_remaining_minutes).toBeGreaterThan(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('tolerates clock skew when meal was logged with timestamp slightly ahead of server time', async () => {
      vi.useFakeTimers();
      // Server clock is 12:00:00 PM
      vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'));
      try {
        const mockClient = {
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: 'food-yesterday',
                entry_date: '2026-10-03',
                entry_time: '20:00',
                meal_default_time: null,
                meal_timestamp: new Date('2026-10-03T20:00:00.000Z'),
                calories: 600,
                food_name: 'Dinner',
                meal_type_name: 'Dinner',
              },
              {
                id: 'food-skewed-today',
                entry_date: '2026-10-04',
                entry_time: '12:01', // 1 minute ahead due to device clock / minute rounding
                meal_default_time: null,
                meal_timestamp: new Date('2026-10-04T12:01:00.000Z'),
                calories: 450,
                food_name: 'Lunch',
                meal_type_name: 'Lunch',
              },
            ],
          }),
          release: vi.fn(),
        };
        vi.mocked(getClient).mockResolvedValue(
          mockClient as unknown as Awaited<ReturnType<typeof getClient>>
        );

        vi.mocked(
          fastingPreferencesRepository.getFastingPreferences
        ).mockResolvedValue({
          id: 'pref-1',
          user_id: 'user-123',
          auto_calculate: true,
          default_protocol: '16-8',
          target_fasting_hours: 16.0,
          target_eating_hours: 8.0,
          calorie_threshold: 10,
          pre_end_alert_minutes: 30,
          eating_window_alert: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const fast = await getCurrentAutoFast('user-123', 'UTC');
        expect(fast).not.toBeNull();
        expect(fast?.is_eating_window).toBe(true);
        expect(fast?.status).toBe('ACTIVE');
        // Skewed start is clamped to server now, so elapsed minutes is 0 and full eating window remains
        expect(fast?.duration_minutes).toBe(0);
        expect(fast?.eating_window_remaining_minutes).toBe(480);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
