import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildGoalTools } from '../ai/tools/goalTools.js';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import nutrientGoalPreferenceService from '../services/nutrientGoalPreferenceService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

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
vi.mock('../services/nutrientGoalPreferenceService', () => ({
  default: {
    getEffectiveGoalTypes: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = toolOpts;
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildGoalTools>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    nutrientGoalPreferenceService.getEffectiveGoalTypes
  ).mockResolvedValue({});
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

  // set_goals has no parameters for the exercise targets, the macro/meal
  // percentages or custom meal percentages. manageGoalTimeline treats a missing
  // value as "set to 0/null" (cleanNumber), so they must be carried over from the
  // existing goals -- the web UI always sends them.
  it('set_goals keeps exercise targets and meal/macro percentages it has no parameters for', async () => {
    vi.mocked(goalService.manageGoalTimeline).mockResolvedValue({
      message: 'ok',
    });
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 70,
      target_exercise_calories_burned: 400,
      target_exercise_duration_minutes: 45,
      protein_percentage: 30,
      carbs_percentage: 40,
      fat_percentage: 30,
      breakfast_percentage: 25,
      lunch_percentage: 35,
      dinner_percentage: 30,
      snacks_percentage: 10,
      custom_meal_percentages: { 'Post-workout': 5 },
    });
    await tools.sparky_manage_goals.execute!(
      { action: 'set_goals', start_date: '2026-06-15', calories: 2200 },
      opts
    );
    expect(goalService.manageGoalTimeline).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        p_calories: 2200,
        p_target_exercise_calories_burned: 400,
        p_target_exercise_duration_minutes: 45,
        p_protein_percentage: 30,
        p_carbs_percentage: 40,
        p_fat_percentage: 30,
        p_breakfast_percentage: 25,
        p_lunch_percentage: 35,
        p_dinner_percentage: 30,
        p_snacks_percentage: 10,
        custom_meal_percentages: { 'Post-workout': 5 },
      })
    );
  });

  // With all three macro percentages present, manageGoalTimeline recomputes the
  // gram values from them. An explicit gram value from the caller must win, so
  // the stored percentages are not carried over in that case.
  it('set_goals lets explicit macro grams win over stored macro percentages', async () => {
    vi.mocked(goalService.manageGoalTimeline).mockResolvedValue({
      message: 'ok',
    });
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 70,
      protein_percentage: 30,
      carbs_percentage: 40,
      fat_percentage: 30,
      breakfast_percentage: 25,
    });
    await tools.sparky_manage_goals.execute!(
      { action: 'set_goals', start_date: '2026-06-15', protein: 180 },
      opts
    );
    const payload = vi
      .mocked(goalService.manageGoalTimeline)
      .mock.calls.at(-1)![1];
    expect(payload).toMatchObject({
      p_protein: 180,
      p_breakfast_percentage: 25,
    });
    expect(payload.p_protein_percentage).toBeUndefined();
    expect(payload.p_carbs_percentage).toBeUndefined();
    expect(payload.p_fat_percentage).toBeUndefined();
  });

  // #2115/#1958/#1925: caffeine_mg and alcohol_g were added as first-class
  // user_goals columns, but this tool never grew parameters for either, so
  // Sparky could not set a caffeine or alcohol goal on request.
  it('set_goals persists caffeine_mg and alcohol_g', async () => {
    vi.mocked(goalService.manageGoalTimeline).mockResolvedValue({
      message: 'ok',
    });
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 2000,
    });

    const result = await tools.sparky_manage_goals.execute!(
      {
        action: 'set_goals',
        start_date: '2026-06-15',
        caffeine_mg: 300,
        alcohol_g: 20,
      },
      opts
    );

    expect(result).toBe('✅ Goals set successfully starting from 2026-06-15.');
    expect(goalService.manageGoalTimeline).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ p_caffeine_mg: 300, p_alcohol_g: 20 })
    );
  });

  it('infers set_goals when action is omitted and only caffeine_mg or alcohol_g is sent', async () => {
    vi.mocked(goalService.manageGoalTimeline).mockResolvedValue({
      message: 'ok',
    });
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 2000,
    });

    const caffeineOnly = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { caffeine_mg: 300 } as any,
      opts
    );
    expect(caffeineOnly).toMatch(/^✅ Goals set successfully/);
    expect(goalService.manageGoalTimeline).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ p_caffeine_mg: 300 })
    );

    vi.mocked(goalService.manageGoalTimeline).mockClear();

    const alcoholOnly = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { alcohol_g: 20 } as any,
      opts
    );
    expect(alcoholOnly).toMatch(/^✅ Goals set successfully/);
    expect(goalService.manageGoalTimeline).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ p_alcohol_g: 20 })
    );
  });

  it('get_goals renders caffeine_mg and alcohol_g when set', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 2000,
      caffeine_mg: 300,
      alcohol_g: 20,
    });

    const result = await tools.sparky_manage_goals.execute!(
      { action: 'get_goals', target_date: '2026-06-01' },
      opts
    );

    expect(result).toContain('- **Caffeine:** 300 mg\n');
    expect(result).toContain('- **Alcohol:** 20 g\n');
  });

  it('get_goals says how calorie cycling changed the day', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2161,
      calorie_cycling: {
        status: 'active',
        baseTarget: 2000,
        target: 2161,
        delta: 161,
        dayType: 'high',
        floor: 1500,
        clampedToFloor: false,
      },
    });
    const high = await tools.sparky_manage_goals.execute!(
      { action: 'get_goals', target_date: '2026-06-01' },
      opts
    );
    expect(high).toBe(
      '### Goals for 2026-06-01\n\n' +
        '- **Calories:** 2161 kcal\n' +
        '- **Calorie cycling:** high day (+161 kcal on a 2000 kcal base)\n'
    );

    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 1500,
      calorie_cycling: {
        status: 'active',
        baseTarget: 1800,
        target: 1500,
        delta: -300,
        dayType: 'low',
        floor: 1500,
        clampedToFloor: true,
      },
    });
    expect(
      await tools.sparky_manage_goals.execute!(
        { action: 'get_goals', target_date: '2026-06-01' },
        opts
      )
    ).toContain(
      '- **Calorie cycling:** low day (-300 kcal on a 1800 kcal base, held at the safety floor)\n'
    );

    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      calorie_cycling: {
        status: 'paused_weekly_plan',
        baseTarget: 2000,
        target: 2000,
        delta: 0,
        dayType: 'even',
        floor: 1500,
        clampedToFloor: false,
      },
    });
    expect(
      await tools.sparky_manage_goals.execute!(
        { action: 'get_goals', target_date: '2026-06-01' },
        opts
      )
    ).toContain(
      '- **Calorie cycling:** paused, because a weekly goal plan sets this day\n'
    );
  });

  it('set_goals without start_date defaults to today', async () => {
    vi.mocked(goalService.manageGoalTimeline).mockResolvedValue({
      message: 'ok',
    });
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 2000,
    });

    const result = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'set_goals', calories: 2200 } as any,
      opts
    );

    const today = todayInZone('UTC');
    expect(result).toBe(`✅ Goals set successfully starting from ${today}.`);
    expect(goalService.manageGoalTimeline).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ p_start_date: today, p_calories: 2200 })
    );
  });

  it('rejects unknown actions', async () => {
    const result = await tools.sparky_manage_goals.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'bogus_action' } as any,
      opts
    );

    expect(result).toMatch(/^Error \[VALIDATION\]: action:/);
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

    expect(result).toBe(
      JSON.stringify({ ...snapshotFields, goal_directions: {} })
    );
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      undefined,
      true
    );
  });

  it('includes the day of calorie cycling when switched on', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2161,
      calorie_cycling: {
        status: 'active',
        baseTarget: 2000,
        target: 2161,
        delta: 161,
        dayType: 'high',
        floor: 1500,
        clampedToFloor: false,
      },
    });

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(
      JSON.stringify({
        calories: 2161,
        calorie_cycling: {
          status: 'active',
          day_type: 'high',
          base_calories: 2000,
          change_kcal: 161,
          held_at_safety_floor: false,
        },
        goal_directions: {},
      })
    );
  });

  it('defaults to today (UTC) when no target_date is given', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(
      JSON.stringify({ calories: 2000, goal_directions: {} })
    );
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      todayInZone('UTC'),
      undefined,
      true
    );
  });

  // #2115/#1958/#1925: this tool projects the server's goal object down to
  // its own hand-enumerated column set (GOAL_SNAPSHOT_FIELDS), separate from
  // sparky_manage_goals' get_goals action, so it needed the same caffeine_mg
  // and alcohol_g addition independently.
  it('includes caffeine_mg and alcohol_g when set', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      caffeine_mg: 300,
      alcohol_g: 20,
    });

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(
      JSON.stringify({
        calories: 2000,
        caffeine_mg: 300,
        alcohol_g: 20,
        goal_directions: {},
      })
    );
  });

  it('includes custom goal_directions from nutrientGoalPreferenceService', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });
    vi.mocked(
      nutrientGoalPreferenceService.getEffectiveGoalTypes
    ).mockResolvedValue({
      calories: { goalType: 'target', targetMin: 1800, targetMax: 2200 },
    });

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(
      JSON.stringify({
        calories: 2000,
        goal_directions: {
          calories: { goalType: 'target', targetMin: 1800, targetMax: 2200 },
        },
      })
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
      'Error [VALIDATION]: target_date: Date must be in YYYY-MM-DD format (or "today", "yesterday", "tomorrow")'
    );
  });

  it('returns DB_ERROR for other service failures', async () => {
    vi.mocked(goalService.getUserGoals).mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_goal_snapshot.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
