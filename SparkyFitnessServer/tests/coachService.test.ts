import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    getProfile: vi.fn(),
    upsertProfile: vi.fn(),
    listCoaches: vi.fn(),
    getUnreadCounts: vi.fn(),
    upsertBuiltinCoach: vi.fn(),
    countCustomCoaches: vi.fn(),
    createCustomCoach: vi.fn(),
    updateCustomCoach: vi.fn(),
    deleteCustomCoach: vi.fn(),
    getCoachById: vi.fn(),
    getNudge: vi.fn(),
    setReaction: vi.fn(),
    countRecentDownvotes: vi.fn(),
    recordAnswer: vi.fn(),
  },
  listHabits: vi.fn(),
  upsertHabitLog: vi.fn(),
  createCheckin: vi.fn(),
  getActiveAiServiceSetting: vi.fn(),
  getAllergenPreferences: vi.fn(),
}));

vi.mock('../models/aiCoachRepository.js', () => ({ default: mocks.repo }));
vi.mock('../models/habitRepository.js', () => ({
  default: {
    listHabits: mocks.listHabits,
    upsertHabitLog: mocks.upsertHabitLog,
  },
}));
vi.mock('../models/moodRepository.js', () => ({
  default: { createCheckin: mocks.createCheckin },
}));
vi.mock('../models/chatRepository.js', () => ({
  default: { getActiveAiServiceSetting: mocks.getActiveAiServiceSetting },
}));
vi.mock('../services/allergenPreferenceService.js', () => ({
  default: { getAllergenPreferences: mocks.getAllergenPreferences },
}));
vi.mock('../services/coachSignalService.js', () => ({
  getCoachSignals: vi.fn(),
}));
vi.mock('../services/coachChatContextService.js', () => ({
  clearCoachChatContext: vi.fn(),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

import coachService, {
  CoachAnswerError,
  CoachInvalidError,
  CoachLimitError,
  CoachNotFoundError,
} from '../services/coachService.js';

const rules = {
  version: 1 as const,
  rules: [
    {
      id: 'water',
      enabled: true,
      when: 'evening' as const,
      conditions: [
        { signal: 'water_pct_of_goal' as const, op: 'lt' as const, value: 60 },
      ],
    },
  ],
};

const customRow = {
  id: 'mine',
  user_id: 'u1',
  builtin_key: null,
  name: 'Race prep',
  instructions: null,
  tool_categories: ['exercise'],
  mode: 'rules',
  rules,
  ai_rule: null,
  settings: {},
  enabled: true,
  sort_order: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.getProfile.mockResolvedValue(null);
  mocks.repo.listCoaches.mockResolvedValue([]);
  mocks.repo.getUnreadCounts.mockResolvedValue([]);
  mocks.getAllergenPreferences.mockResolvedValue([]);
  mocks.getActiveAiServiceSetting.mockResolvedValue(null);
  mocks.repo.upsertProfile.mockResolvedValue({});
  mocks.repo.recordAnswer.mockResolvedValue(true);
});

describe('getCoachSettings', () => {
  it('lists every built-in coach (off by default) then the person’s own', async () => {
    mocks.repo.listCoaches.mockResolvedValue([customRow]);
    const settings = await coachService.getCoachSettings('u1');
    expect(settings.coaches.at(-1)).toMatchObject({
      kind: 'custom',
      name: 'Race prep',
      enabled: true,
    });
    const builtins = settings.coaches.filter((c) => c.kind === 'builtin');
    expect(builtins.map((c) => c.builtin_key)).toContain('recovery');
    expect(builtins.every((c) => !c.enabled)).toBe(true);
    expect(settings.profile.checkin_times).toEqual(['08:00', '13:00', '19:00']);
    expect(settings.has_ai_service).toBe(false);
  });
});

describe('custom coaches', () => {
  const body = {
    name: 'Race prep',
    tool_categories: ['exercise' as const],
    mode: 'rules' as const,
    rules,
  };

  it('creates one, and refuses an eleventh', async () => {
    mocks.repo.countCustomCoaches.mockResolvedValue(0);
    mocks.repo.createCustomCoach.mockResolvedValue(customRow);
    const view = await coachService.createCustomCoach('u1', body);
    expect(view.kind).toBe('custom');
    mocks.repo.countCustomCoaches.mockResolvedValue(10);
    await expect(
      coachService.createCustomCoach('u1', body)
    ).rejects.toBeInstanceOf(CoachLimitError);
  });

  it('needs at least one rule, or the AI’s rule', async () => {
    mocks.repo.countCustomCoaches.mockResolvedValue(0);
    await expect(
      coachService.createCustomCoach('u1', {
        ...body,
        rules: { version: 1, rules: [] },
      })
    ).rejects.toBeInstanceOf(CoachInvalidError);
    await expect(
      coachService.createCustomCoach('u1', {
        ...body,
        mode: 'ai_judge',
        ai_rule: null,
      })
    ).rejects.toBeInstanceOf(CoachInvalidError);
  });

  it('drops the AI rule when it is switched back to rules', async () => {
    mocks.repo.getCoachById.mockResolvedValue({
      ...customRow,
      mode: 'ai_judge',
      ai_rule: 'tell me',
    });
    mocks.repo.updateCustomCoach.mockResolvedValue(customRow);
    await coachService.updateCustomCoach('u1', 'mine', { mode: 'rules' });
    expect(mocks.repo.updateCustomCoach.mock.calls[0][2]).toMatchObject({
      mode: 'rules',
      aiRule: null,
    });
  });

  it('will not edit or delete a built-in or someone else’s coach', async () => {
    mocks.repo.getCoachById.mockResolvedValue({
      ...customRow,
      builtin_key: 'recovery',
    });
    await expect(
      coachService.updateCustomCoach('u1', 'mine', { name: 'x' })
    ).rejects.toBeInstanceOf(CoachNotFoundError);
    mocks.repo.deleteCustomCoach.mockResolvedValue(false);
    await expect(
      coachService.deleteCustomCoach('u1', 'mine')
    ).rejects.toBeInstanceOf(CoachNotFoundError);
  });
});

describe('updateBuiltinCoach', () => {
  it('keeps a thumbs-down mute while the rule stays off, and drops it once on', async () => {
    mocks.repo.listCoaches.mockResolvedValue([
      {
        builtin_key: 'nutrition',
        rules: {
          version: 1,
          rules: [{ id: 'water_low', enabled: false, muted: 'feedback' }],
        },
      },
    ]);
    mocks.repo.upsertBuiltinCoach.mockResolvedValue({
      id: 'c',
      enabled: true,
      rules: {},
    });
    await coachService.updateBuiltinCoach('u1', 'nutrition', {
      rules: [
        { id: 'water_low', enabled: false },
        { id: 'fiber_low', enabled: true },
      ],
    });
    expect(mocks.repo.upsertBuiltinCoach.mock.calls[0][3].rules.rules).toEqual([
      { id: 'water_low', enabled: false, muted: 'feedback' },
      { id: 'fiber_low', enabled: true, muted: undefined },
    ]);
    await coachService.updateBuiltinCoach('u1', 'nutrition', {
      rules: [{ id: 'water_low', enabled: true }],
    });
    expect(
      mocks.repo.upsertBuiltinCoach.mock.calls[1][3].rules.rules[0].muted
    ).toBeUndefined();
  });

  it('only accepts a focus habit that is the person’s', async () => {
    mocks.listHabits.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111' },
    ]);
    await expect(
      coachService.updateBuiltinCoach('u1', 'habits', {
        settings: { focus_habit_id: '22222222-2222-4222-8222-222222222222' },
      })
    ).rejects.toBeInstanceOf(CoachInvalidError);
    mocks.repo.upsertBuiltinCoach.mockResolvedValue({
      id: 'c',
      enabled: true,
      rules: {},
    });
    await coachService.updateBuiltinCoach('u1', 'habits', {
      settings: { focus_habit_id: '11111111-1111-4111-8111-111111111111' },
    });
    expect(mocks.repo.upsertBuiltinCoach.mock.calls[0][3].settings).toEqual({
      focus_habit_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('refuses an unknown coach', async () => {
    await expect(
      coachService.updateBuiltinCoach('u1', 'nope', { enabled: true })
    ).rejects.toBeInstanceOf(CoachNotFoundError);
  });
});

describe('reactToNudge', () => {
  const nudge = { id: 'n1', coach_id: 'c1', rule_key: 'water_low' };
  beforeEach(() => {
    mocks.repo.getNudge.mockResolvedValue(nudge);
    mocks.repo.getCoachById.mockResolvedValue({
      id: 'c1',
      builtin_key: 'nutrition',
      rules: { version: 1, rules: [] },
    });
    mocks.repo.upsertBuiltinCoach.mockResolvedValue({});
  });

  it('records a thumbs-up without muting anything', async () => {
    expect(await coachService.reactToNudge('u1', 'n1', 1)).toEqual({
      reaction: 1,
      muted_rule: null,
    });
    expect(mocks.repo.countRecentDownvotes).not.toHaveBeenCalled();
  });

  it('mutes a rule on the third thumbs-down in 30 days, not before', async () => {
    mocks.repo.countRecentDownvotes.mockResolvedValue(2);
    expect(
      (await coachService.reactToNudge('u1', 'n1', -1)).muted_rule
    ).toBeNull();
    expect(mocks.repo.upsertBuiltinCoach).not.toHaveBeenCalled();
    mocks.repo.countRecentDownvotes.mockResolvedValue(3);
    expect((await coachService.reactToNudge('u1', 'n1', -1)).muted_rule).toBe(
      'water_low'
    );
    expect(
      mocks.repo.upsertBuiltinCoach.mock.calls[0][3].rules.rules
    ).toContainEqual({
      id: 'water_low',
      enabled: false,
      muted: 'feedback',
    });
  });

  it('switches off the matching rule of a custom coach', async () => {
    mocks.repo.getNudge.mockResolvedValue({ ...nudge, rule_key: 'water' });
    mocks.repo.countRecentDownvotes.mockResolvedValue(3);
    mocks.repo.getCoachById.mockResolvedValue(customRow);
    await coachService.reactToNudge('u1', 'n1', -1);
    expect(
      mocks.repo.updateCustomCoach.mock.calls[0][2].rules.rules[0].enabled
    ).toBe(false);
  });

  it('never mutes the AI-decides rule, and can clear a thumb', async () => {
    mocks.repo.getNudge.mockResolvedValue({ ...nudge, rule_key: 'ai_judge' });
    expect(
      (await coachService.reactToNudge('u1', 'n1', -1)).muted_rule
    ).toBeNull();
    expect(
      (await coachService.reactToNudge('u1', 'n1', null)).reaction
    ).toBeNull();
  });

  it('refuses someone else’s message', async () => {
    mocks.repo.getNudge.mockResolvedValue(null);
    await expect(
      coachService.reactToNudge('u1', 'n9', 1)
    ).rejects.toBeInstanceOf(CoachNotFoundError);
  });
});

describe('answerNudge', () => {
  it('saves an energy answer as one mood check-in', async () => {
    mocks.repo.getNudge.mockResolvedValue({
      id: 'n1',
      question: 'energy',
      answered_at: null,
    });
    expect(await coachService.answerNudge('u1', 'n1', 4)).toEqual({
      saved: 'mood_entry',
    });
    expect(mocks.createCheckin).toHaveBeenCalledOnce();
    expect(mocks.createCheckin.mock.calls[0][1]).toMatchObject({
      energyValue: 4,
    });
  });

  it('stores a mood answer on the 1 to 10 scale', async () => {
    mocks.repo.getNudge.mockResolvedValue({
      id: 'n1',
      question: 'mood',
      answered_at: null,
    });
    await coachService.answerNudge('u1', 'n1', 4);
    expect(mocks.createCheckin.mock.calls[0][1]).toMatchObject({
      moodValue: 8,
    });
  });

  it('logs the focus habit as done on yes, and only records not yet', async () => {
    mocks.repo.getNudge.mockResolvedValue({
      id: 'n1',
      question: 'habit_done',
      question_ref: 'habit-1',
      answered_at: null,
    });
    expect(await coachService.answerNudge('u1', 'n1', 'yes')).toEqual({
      saved: 'habit_log',
    });
    expect(mocks.upsertHabitLog.mock.calls[0].slice(1, 2)).toEqual(['habit-1']);
    expect(mocks.upsertHabitLog.mock.calls[0][3]).toBe('true');
    mocks.upsertHabitLog.mockClear();
    expect(await coachService.answerNudge('u1', 'n1', 'not_yet')).toEqual({
      saved: 'none',
    });
    expect(mocks.upsertHabitLog).not.toHaveBeenCalled();
  });

  it('accepts one answer only', async () => {
    mocks.repo.getNudge.mockResolvedValue({
      id: 'n1',
      question: 'energy',
      answered_at: new Date(),
    });
    await expect(coachService.answerNudge('u1', 'n1', 3)).rejects.toMatchObject(
      {
        code: 'already_answered',
      }
    );
    mocks.repo.getNudge.mockResolvedValue({
      id: 'n1',
      question: 'energy',
      answered_at: null,
    });
    mocks.repo.recordAnswer.mockResolvedValue(false);
    await expect(
      coachService.answerNudge('u1', 'n1', 3)
    ).rejects.toBeInstanceOf(CoachAnswerError);
    expect(mocks.createCheckin).not.toHaveBeenCalled();
  });

  it('rejects a value out of range or of the wrong kind', async () => {
    mocks.repo.getNudge.mockResolvedValue({
      id: 'n1',
      question: 'energy',
      answered_at: null,
    });
    await expect(coachService.answerNudge('u1', 'n1', 9)).rejects.toMatchObject(
      {
        code: 'invalid',
      }
    );
    await expect(
      coachService.answerNudge('u1', 'n1', 'yes')
    ).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(mocks.repo.recordAnswer).not.toHaveBeenCalled();
  });

  it('refuses a message with no question', async () => {
    mocks.repo.getNudge.mockResolvedValue({ id: 'n1', question: null });
    await expect(
      coachService.answerNudge('u1', 'n1', 3)
    ).rejects.toBeInstanceOf(CoachNotFoundError);
  });
});
