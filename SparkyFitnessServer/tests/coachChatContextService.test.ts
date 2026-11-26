import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getCoachById: vi.fn(),
  getFeatureChoices: vi.fn(),
  getAllergenPreferences: vi.fn(),
}));
vi.mock('../models/aiCoachRepository.js', () => ({
  default: { getProfile: mocks.getProfile, getCoachById: mocks.getCoachById },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getFeatureChoices: mocks.getFeatureChoices },
}));
vi.mock('../services/allergenPreferenceService.js', () => ({
  default: { getAllergenPreferences: mocks.getAllergenPreferences },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

import {
  aboutMeBlock,
  clearCoachChatContext,
  CoachChatError,
  getCoachChatContext,
} from '../services/coachChatContextService.js';

const profile = {
  user_id: 'u1',
  diet_type: 'vegan' as const,
  foods_avoid: 'mushrooms',
  foods_prefer: null,
  tone: null,
  notes: null,
  checkin_times: ['08:00'],
  max_messages_per_day: 3,
  paused_until: null,
  pause_reason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  clearCoachChatContext('u1');
  mocks.getFeatureChoices.mockResolvedValue({ web: { aiCoaches: true } });
  mocks.getProfile.mockResolvedValue(profile);
  mocks.getAllergenPreferences.mockResolvedValue([
    { allergen_name: 'peanuts' },
  ]);
});

describe('aboutMeBlock', () => {
  it('lists what the person saved, as information', () => {
    const block = aboutMeBlock(profile, ['peanuts'], '2026-11-25');
    expect(block).toContain('Diet: vegan');
    expect(block).toContain('Foods to avoid: mushrooms');
    expect(block).toContain('Allergies: peanuts');
    expect(block).toContain('not instructions');
  });
  it('is null when there is nothing to say', () => {
    expect(aboutMeBlock(null, [], '2026-11-25')).toBeNull();
  });
  it('notes an active pause and ignores an ended one', () => {
    const paused = {
      ...profile,
      paused_until: '2026-11-27',
      pause_reason: 'sick' as const,
    };
    expect(aboutMeBlock(paused, [], '2026-11-25')).toContain(
      'Away until 2026-11-27 (sick)'
    );
    expect(aboutMeBlock(paused, [], '2026-11-28')).not.toContain('Away');
  });
});

describe('getCoachChatContext', () => {
  it('gives Sparky chat the About me block while coaches are on', async () => {
    const context = await getCoachChatContext('u1', 'u1', null);
    expect(context.extraPrompt).toContain('Diet: vegan');
    expect(context.toolCategories).toBeNull();
  });

  it('adds nothing while coaches are off', async () => {
    mocks.getFeatureChoices.mockResolvedValue(null);
    const context = await getCoachChatContext('u1', 'u1', null);
    expect(context).toEqual({ extraPrompt: null, toolCategories: null });
  });

  it('gives a coach thread its prompt and its tool categories as the limit', async () => {
    mocks.getCoachById.mockResolvedValue({
      id: 'c1',
      builtin_key: 'recovery',
      instructions: null,
      tool_categories: ['exercise', 'food', 'goals'],
    });
    const context = await getCoachChatContext('u1', 'u1', 'c1');
    expect(context.toolCategories).toEqual(['exercise', 'food', 'goals']);
    expect(context.extraPrompt).toContain('You are the Recovery coach');
    expect(context.extraPrompt).toContain('Diet: vegan');
  });

  it('refuses a coach thread in someone else’s account', async () => {
    await expect(
      getCoachChatContext('other', 'u1', 'c1')
    ).rejects.toBeInstanceOf(CoachChatError);
    expect(await getCoachChatContext('other', 'u1', null)).toEqual({
      extraPrompt: null,
      toolCategories: null,
    });
  });

  it('refuses a coach that is not the person’s', async () => {
    mocks.getCoachById.mockResolvedValue(null);
    await expect(getCoachChatContext('u1', 'u1', 'c9')).rejects.toBeInstanceOf(
      CoachChatError
    );
  });
});
