import { vi, describe, expect, it } from 'vitest';
import { buildChatbotTools } from '../ai/tools/index.js';

// Loading the real foodEntryService trips on a deep '@workspace/shared'
// subpath import; the registry surface test never executes handlers.
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// The chat-visible tool surface: every MCP tool except the four dev tools
// (sparky_inspect_schema, sparky_get_user_info, sparky_get_db_stats,
// sparky_run_project_tests), which are intentionally not ported.
const EXPECTED_TOOLS = [
  'sparky_analyze_food_image',
  'sparky_analyze_trends',
  'sparky_check_engagement',
  'sparky_daily_checkin_wizard',
  'sparky_detect_patterns',
  'sparky_generate_coaching_plan',
  'sparky_get_30_day_trends',
  'sparky_get_contextual_nudge',
  'sparky_get_daily_exercise_totals',
  'sparky_get_daily_report',
  'sparky_get_exercise_details',
  'sparky_get_exercise_diary',
  'sparky_get_exercise_progress',
  'sparky_get_exercise_usage',
  'sparky_get_food_details',
  'sparky_get_food_diary',
  'sparky_get_food_usage',
  'sparky_get_goal_snapshot',
  'sparky_get_health_summary',
  'sparky_get_logging_streak',
  'sparky_get_nutrition_summary',
  'sparky_get_recent_exercise_entries',
  'sparky_get_recent_food_entries',
  'sparky_get_report',
  'sparky_list_exercises',
  'sparky_list_foods',
  'sparky_manage_checkin',
  'sparky_manage_exercise',
  'sparky_manage_food',
  'sparky_manage_goals',
  'sparky_manage_habits',
  'sparky_manage_profile',
  'sparky_scan_label',
  'sparky_search_exercises',
  'sparky_search_foods',
];

describe('buildChatbotTools', () => {
  it('exposes exactly the MCP chat-visible tool surface', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    expect(Object.keys(tools).sort()).toEqual(EXPECTED_TOOLS);
  });

  it('gives every tool a description, an input schema, and an executor', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    for (const [name, t] of Object.entries(tools)) {
      expect(t.description, `${name} description`).toBeTruthy();
      expect(t.inputSchema, `${name} inputSchema`).toBeDefined();
      expect(typeof t.execute, `${name} execute`).toBe('function');
    }
  });

  // OpenAI's Responses API treats an omitted strict flag as "attempt strict
  // mode", which forces models to fill every published property with
  // placeholder values that the per-action union validation then rejects.
  it('publishes every tool with provider strict mode disabled', () => {
    const tools = buildChatbotTools('user-1', 'UTC');
    for (const [name, t] of Object.entries(tools)) {
      expect(t.strict, `${name} strict`).toBe(false);
    }
  });
});
