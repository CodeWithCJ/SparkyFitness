import {
  createMealPlan,
  deleteMealPlan,
  duplicateMealPlan,
  fetchMealPlans,
  updateMealPlan,
} from '../../../src/services/api/mealPlansApi';
import { getActiveServerConfig, type ServerConfig } from '../../../src/services/storage';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

const payload = {
  plan_name: 'Prep week',
  description: 'Lunch boxes',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  is_active: true,
  assignments: [
    {
      item_type: 'meal' as const,
      day_of_week: 1,
      meal_type_id: 'lunch',
      meal_id: 'meal-1',
      quantity: 350,
      unit: 'g',
    },
  ],
};

describe('mealPlansApi', () => {
  const mockFetch = jest.fn();
  const testConfig: ServerConfig = {
    id: 'test-id',
    url: 'https://example.com',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('fetches plans for the authenticated account', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await fetchMealPlans();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/meal-plan-templates',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('creates a plan with the client calendar day', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'plan-1' }) });

    await createMealPlan(payload, '2026-08-29');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/meal-plan-templates',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...payload, currentClientDate: '2026-08-29' }),
      }),
    );
  });

  test('updates a plan with the client calendar day', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'plan-1' }) });

    await updateMealPlan('plan-1', payload, '2026-08-29');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/meal-plan-templates/plan-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ...payload, currentClientDate: '2026-08-29' }),
      }),
    );
  });

  test('duplicates a plan as inactive using the client calendar day', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'plan-2' }) });

    await duplicateMealPlan('plan-1', '2026-08-29');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/meal-plan-templates/plan-1/duplicate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ currentClientDate: '2026-08-29' }),
      }),
    );
  });

  test('deletes a plan from the correct local day forward', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => null },
    });

    await deleteMealPlan('plan-1', '2026-08-29');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/meal-plan-templates/plan-1?currentClientDate=2026-08-29',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
