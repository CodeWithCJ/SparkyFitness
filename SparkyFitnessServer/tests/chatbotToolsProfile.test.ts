import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildProfileTools } from '../ai/tools/profileTools.js';
import userRepository from '../models/userRepository.js';
import preferenceService from '../services/preferenceService.js';

vi.mock('../models/userRepository', () => ({
  default: {
    getAuthUserProfile: vi.fn(),
    updateAuthUserProfile: vi.fn(),
  },
}));
vi.mock('../services/preferenceService', () => ({
  default: {
    getUserPreferences: vi.fn(),
    updateUserPreferences: vi.fn(),
    upsertUserPreferences: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildProfileTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildProfileTools('user-1');
});

describe('sparky_manage_profile', () => {
  it('get_profile renders name, email and id', async () => {
    vi.mocked(userRepository.getAuthUserProfile).mockResolvedValue({
      id: 'user-1',
      email: 'andrew@example.com',
      name: 'Andrew',
      image: null,
    });

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'get_profile' },
      opts
    );

    expect(result).toBe(
      '### User Profile\n\n' +
        '- **Name:** Andrew\n' +
        '- **Email:** andrew@example.com\n' +
        '- **ID:** user-1\n'
    );
    expect(userRepository.getAuthUserProfile).toHaveBeenCalledWith('user-1');
  });

  it('get_profile falls back to N/A when name is unset', async () => {
    vi.mocked(userRepository.getAuthUserProfile).mockResolvedValue({
      id: 'user-1',
      email: 'andrew@example.com',
      name: null,
      image: null,
    });

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'get_profile' },
      opts
    );

    expect(result).toBe(
      '### User Profile\n\n' +
        '- **Name:** N/A\n' +
        '- **Email:** andrew@example.com\n' +
        '- **ID:** user-1\n'
    );
  });

  it('update_profile passes provided fields and nulls for the rest', async () => {
    vi.mocked(userRepository.updateAuthUserProfile).mockResolvedValue({
      id: 'user-1',
      email: 'andrew@example.com',
      name: 'New Name',
      image: null,
    });

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'update_profile', display_name: 'New Name' },
      opts
    );

    expect(result).toBe('✅ Profile updated.');
    expect(userRepository.updateAuthUserProfile).toHaveBeenCalledWith(
      'user-1',
      'New Name',
      null,
      null
    );
  });

  it('update_profile does not accept an email field (cannot change account email)', async () => {
    const result = await tools.sparky_manage_profile.execute!(
      { action: 'update_profile', email: 'admin@example.com' } as any,
      opts
    );

    // Email was dropped from the tool; a strict-parse rejects the unknown key
    // and nothing is written, so the account email can't be set from chat.
    expect(result).toMatch(/^Error \[VALIDATION\]/);
    expect(userRepository.updateAuthUserProfile).not.toHaveBeenCalled();
  });

  it('get_preferences renders stored preferences', async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      timezone: 'America/New_York',
      energy_unit: 'kJ',
      default_weight_unit: 'lbs',
      default_distance_unit: 'miles',
      item_display_limit: 10,
    });

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'get_preferences' },
      opts
    );

    expect(result).toBe(
      '### User Preferences\n\n' +
        '- **Timezone:** America/New_York\n' +
        '- **Energy Unit:** kJ\n' +
        '- **Weight Unit:** lbs\n' +
        '- **Distance Unit:** miles\n'
    );
    expect(preferenceService.getUserPreferences).toHaveBeenCalledWith(
      'user-1',
      'user-1'
    );
  });

  it('get_preferences falls back to defaults when fields are unset', async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'dynamic',
      show_net_carbs: false,
      timezone: null,
    });

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'get_preferences' },
      opts
    );

    expect(result).toBe(
      '### User Preferences\n\n' +
        '- **Timezone:** UTC\n' +
        '- **Energy Unit:** kcal\n' +
        '- **Weight Unit:** kg\n' +
        '- **Distance Unit:** km\n'
    );
  });

  it('update_preferences sends a partial COALESCE update', async () => {
    vi.mocked(preferenceService.updateUserPreferences).mockResolvedValue({});

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'update_preferences', energy_unit: 'kJ' },
      opts
    );

    expect(result).toBe('✅ Preferences updated.');
    expect(preferenceService.updateUserPreferences).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        timezone: null,
        energy_unit: 'kJ',
        default_weight_unit: null,
        default_measurement_unit: null,
        default_distance_unit: null,
        water_display_unit: null,
      }
    );
    expect(preferenceService.upsertUserPreferences).not.toHaveBeenCalled();
  });

  it('update_preferences creates the row when none exists yet', async () => {
    vi.mocked(preferenceService.updateUserPreferences).mockRejectedValue(
      new Error('User preferences not found or not authorized to update.')
    );
    vi.mocked(preferenceService.upsertUserPreferences).mockResolvedValue({});

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'update_preferences', timezone: 'UTC' },
      opts
    );

    expect(result).toBe('✅ Preferences updated.');
    expect(preferenceService.upsertUserPreferences).toHaveBeenCalledWith(
      'user-1',
      {
        timezone: 'UTC',
        energy_unit: null,
        default_weight_unit: null,
        default_measurement_unit: null,
        default_distance_unit: null,
        water_display_unit: null,
      }
    );
  });

  it('update_preferences surfaces invalid timezones as validation errors', async () => {
    vi.mocked(preferenceService.updateUserPreferences).mockRejectedValue(
      new Error("Invalid timezone: 'Mars/Olympus'")
    );

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'update_preferences', timezone: 'Mars/Olympus' },
      opts
    );

    expect(result).toBe("Error [VALIDATION]: Invalid timezone: 'Mars/Olympus'");
    expect(preferenceService.upsertUserPreferences).not.toHaveBeenCalled();
  });
  it('returns DB_ERROR when the repository throws', async () => {
    vi.mocked(userRepository.getAuthUserProfile).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_manage_profile.execute!(
      { action: 'get_profile' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });

  it('normalizes nested action parameters and infers action', async () => {
    vi.mocked(preferenceService.updateUserPreferences).mockResolvedValue({});

    const result = await tools.sparky_manage_profile.execute!(
      { update_preferences: { default_weight_unit: 'lbs' } } as any,
      opts
    );

    expect(result).toBe('✅ Preferences updated.');
    expect(preferenceService.updateUserPreferences).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        timezone: null,
        energy_unit: null,
        default_weight_unit: 'lbs',
        default_measurement_unit: null,
        default_distance_unit: null,
        water_display_unit: null,
      }
    );
  });

  it('infers action when action is missing from flat parameters', async () => {
    vi.mocked(preferenceService.updateUserPreferences).mockResolvedValue({});

    const result = await tools.sparky_manage_profile.execute!(
      { default_weight_unit: 'lbs' } as any,
      opts
    );

    expect(result).toBe('✅ Preferences updated.');
    expect(preferenceService.updateUserPreferences).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        timezone: null,
        energy_unit: null,
        default_weight_unit: 'lbs',
        default_measurement_unit: null,
        default_distance_unit: null,
        water_display_unit: null,
      }
    );
  });
});
