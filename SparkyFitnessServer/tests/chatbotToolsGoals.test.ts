import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildGoalTools } from '../ai/tools/goalTools.js';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';

vi.mock('../services/goalService', () => ({
  default: {
    getUserGoals: vi.fn(),
    manageGoalTimeline: vi.fn(),
  },
}));
vi.mock('../models/goalRepository', () => ({
  default: {
    getGoalTimeline: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred. Please try again.\n\nSuggestion: If the issue persists, contact support.';

let tools: ReturnType<typeof buildGoalTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildGoalTools('user-1', 'UTC');
});

describe('sparky_manage_goals', () => {
  it('get_goals renders the goals for an explicit date', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2100,
      protein: 160,
      carbs: 240,
      fat: 70,
      water_goal_ml: 2200,
      saturated_fat: 20,
    });

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'get_goals', target_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      '### Goals for 2026-06-01\n\n' +
        '- **Calories:** 2100 kcal\n' +
        '- **Protein:** 160g\n' +
        '- **Carbs:** 240g\n' +
        '- **Fat:** 70g\n' +
        '- **Water:** 2200ml\n'
    );
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      undefined,
      true
    );
  });

  it('get_goals defaults to today (UTC) and labels it "today"', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 1920,
    });

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'get_goals' },
      opts
    );

    expect(result).toBe(
      '### Goals for today\n\n' +
        '- **Calories:** 2000 kcal\n' +
        '- **Protein:** 150g\n' +
        '- **Carbs:** 250g\n' +
        '- **Fat:** 67g\n' +
        '- **Water:** 1920ml\n'
    );
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      todayInZone('UTC'),
      undefined,
      true
    );
  });

  it('set_goals applies MCP defaults for omitted fields and cascades', async () => {
    vi.mocked(goalService.manageGoalTimeline).mockResolvedValue({
      message: 'ok',
    });
    // Mock existing goals to provide defaults for omitted fields
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 2000,
    });
    const result = await tools.sparky_manage_goals.execute!(
      { action: 'set_goals', start_date: '2026-06-15', calories: 2200 },
      opts
    );
    expect(result).toBe('✅ Goals set successfully starting from 2026-06-15.');
    expect(goalService.manageGoalTimeline).toHaveBeenCalledWith('user-1', {
      p_start_date: '2026-06-15',
      p_cascade: true,
      p_calories: 2200,
      p_protein: 150,
      p_carbs: 250,
      p_fat: 67,
      p_water_goal_ml: 2000,
      p_saturated_fat: undefined,
      p_polyunsaturated_fat: undefined,
      p_monounsaturated_fat: undefined,
      p_trans_fat: undefined,
      p_cholesterol: undefined,
      p_sodium: undefined,
      p_potassium: undefined,
      p_dietary_fiber: undefined,
      p_sugars: undefined,
      p_vitamin_a: undefined,
      p_vitamin_c: undefined,
      p_calcium: undefined,
      p_iron: undefined,
      custom_nutrients: undefined,
    });
  });

  it('set_goals without start_date returns a validation error', async () => {
    const result = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'set_goals' } as any,
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: start_date: Invalid input: expected string, received undefined'
    );
    expect(goalService.manageGoalTimeline).not.toHaveBeenCalled();
  });

  it('rejects unknown actions', async () => {
    const result = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'bogus_action' } as any,
      opts
    );

    expect(result).toBe('Error [VALIDATION]: action: Invalid input');
  });

  it('rejects stray keys (strict per-action schema)', async () => {
    const result = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'get_goals', foo: 1 } as any,
      opts
    );

    expect(result).toBe('Error [VALIDATION]: Unrecognized key: "foo"');
  });

  it('list_goal_timeline renders one line per goal change', async () => {
    vi.mocked(goalRepository.getGoalTimeline).mockResolvedValue([
      {
        id: 1,
        goal_date: '2026-06-01',
        calories: 2000,
        protein: 150,
        carbs: 250,
        fat: 67,
        water_goal_ml: 2000,
      },
      {
        id: 2,
        goal_date: '2026-05-01',
        calories: 1800,
        protein: 140,
        carbs: 200,
        fat: 60,
        water_goal_ml: 1500,
      },
    ]);

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'list_goal_timeline' },
      opts
    );

    expect(result).toBe(
      '# Goal Timeline\n\n' +
        '**2026-06-01**: 2000 kcal | P: 150g | C: 250g | F: 67g | W: 2000ml\n\n' +
        '**2026-05-01**: 1800 kcal | P: 140g | C: 200g | F: 60g | W: 1500ml'
    );
    expect(goalRepository.getGoalTimeline).toHaveBeenCalledWith('user-1');
  });

  it('list_goal_timeline renders a pg local-midnight Date goal_date as a calendar-day string', async () => {
    vi.mocked(goalRepository.getGoalTimeline).mockResolvedValue([
      {
        id: 1,
        goal_date: new Date(2026, 5, 1),
        calories: 2000,
        protein: 150,
        carbs: 250,
        fat: 67,
        water_goal_ml: 2000,
      },
    ]);

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'list_goal_timeline' },
      opts
    );

    expect(result).toBe(
      '# Goal Timeline\n\n' +
        '**2026-06-01**: 2000 kcal | P: 150g | C: 250g | F: 67g | W: 2000ml'
    );
  });

  it('list_goal_timeline reports when there are no goals', async () => {
    vi.mocked(goalRepository.getGoalTimeline).mockResolvedValue([]);

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'list_goal_timeline' },
      opts
    );

    expect(result).toBe('# Goal Timeline\n\nNo results found.');
  });

  it('returns DB_ERROR when the service throws', async () => {
    vi.mocked(goalService.getUserGoals).mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'get_goals' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_get_goal_snapshot', () => {
  it("projects the server's goal object down to MCP's column set", async () => {
    const snapshotFields = {
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 1920,
      saturated_fat: 20,
      polyunsaturated_fat: 10,
      monounsaturated_fat: 25,
      trans_fat: 0,
      cholesterol: 300,
      sodium: 2300,
      potassium: 3500,
      dietary_fiber: 25,
      sugars: 50,
      vitamin_a: 900,
      vitamin_c: 90,
      calcium: 1000,
      iron: 18,
    };
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      ...snapshotFields,
      protein_percentage: null,
      breakfast_percentage: 25,
      custom_nutrients: {},
    });

    const result = await tools.sparky_get_goal_snapshot.execute!(
      { target_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(JSON.stringify(snapshotFields));
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      undefined,
      true
    );
  });

  it('defaults to today (UTC) when no target_date is given', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(JSON.stringify({ calories: 2000 }));
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      todayInZone('UTC'),
      undefined,
      true
    );
  });

  it("maps 'not found' service errors to NOT_FOUND", async () => {
    vi.mocked(goalService.getUserGoals).mockRejectedValue(
      new Error('Goal not found')
    );

    const result = await tools.sparky_get_goal_snapshot.execute!(
      { target_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(
      "Error [NOT_FOUND]: Goal with ID '2026-06-01' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('rejects malformed dates', async () => {
    const result = await tools.sparky_get_goal_snapshot.execute!(
      { target_date: '06/01/2026' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: target_date: Invalid string: must match pattern /^\\d{4}-\\d{2}-\\d{2}$/'
    );
  });

  it('returns DB_ERROR for other service failures', async () => {
    vi.mocked(goalService.getUserGoals).mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
