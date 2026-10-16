import { saveDailyGoals } from '../../../src/services/api/goalsApi';
import { apiFetch } from '../../../src/services/api/apiClient';
import type { DailyGoals } from '../../../src/types/goals';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('saveDailyGoals', () => {
  it('posts the full goal row to manage-timeline with p_ keys', async () => {
    mockApiFetch.mockResolvedValue({});
    const goals: DailyGoals = {
      calories: 2200,
      protein: 150,
      carbs: 250,
      fat: 70,
      dietary_fiber: 30,
      sodium: 2300,
      water_goal_ml: 2500,
      custom_nutrients: { zinc: 11 },
    };

    await saveDailyGoals('2026-10-05', goals, true);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0][0];
    expect(call.endpoint).toBe('/api/goals/manage-timeline');
    expect(call.method).toBe('POST');
    expect(call.body).toMatchObject({
      p_start_date: '2026-10-05',
      p_cascade: true,
      p_calories: 2200,
      p_protein: 150,
      p_sodium: 2300,
      p_water_goal_ml: 2500,
      custom_nutrients: { zinc: 11 },
    });
  });
});
