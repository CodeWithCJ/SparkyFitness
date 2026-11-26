import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    listCheckinCandidates: vi.fn(),
    claimCheckin: vi.fn(),
    listCoaches: vi.fn(),
    countNudgesForDay: vi.fn(),
    getNudgeKeysForDay: vi.fn(),
    getProfile: vi.fn(),
    insertNudgeWithChatMessage: vi.fn(),
    countWinsForDay: vi.fn(),
    claimEventScan: vi.fn(),
  },
  getCoachSignals: vi.fn(),
  composeCoachMessage: vi.fn(),
  judgeCustomCoach: vi.fn(),
  buildSuggestion: vi.fn(),
  getEntriesCreatedSince: vi.fn(),
  describeWorkout: vi.fn(),
  getPersonalRecordMatrix: vi.fn(),
  loadUserTimezone: vi.fn(),
  getUserPreferences: vi.fn(),
}));

vi.mock('../models/aiCoachRepository.js', () => ({ default: mocks.repo }));
vi.mock('../services/coachSignalService.js', () => ({
  getCoachSignals: mocks.getCoachSignals,
  describeWorkout: mocks.describeWorkout,
}));
vi.mock('../services/coachMessageService.js', () => ({
  composeCoachMessage: mocks.composeCoachMessage,
  judgeCustomCoach: mocks.judgeCustomCoach,
  askMessage: (question: string) => ({
    text: `ask ${question}`,
    key: `coaches.questions.${question}.ask`,
  }),
}));
vi.mock('../services/coachSuggestionService.js', () => ({
  buildSuggestion: mocks.buildSuggestion,
}));
vi.mock('../models/coachSignalRepository.js', () => ({
  default: { getEntriesCreatedSince: mocks.getEntriesCreatedSince },
}));
vi.mock('../models/cycleRepository.js', () => ({
  default: { getSettings: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/exerciseStatsService.js', () => ({
  default: { getPersonalRecordMatrix: mocks.getPersonalRecordMatrix },
}));
vi.mock('../services/heartRateZoneService.js', () => ({
  default: {
    resolveZonesForUser: vi
      .fn()
      .mockResolvedValue({ floors: [100, 120, 140, 160, 180] }),
  },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: mocks.loadUserTimezone,
}));
vi.mock('../models/foodMisc.js', () => ({
  default: { getTopFoods: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: {
    getUserPreferences: mocks.getUserPreferences,
  },
}));
vi.mock('../services/allergenPreferenceService.js', () => ({
  default: { getAllergenPreferences: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  CHECKIN_GRACE_MINUTES,
  dueCheckinSlot,
  runCheckinNow,
  runCoachCheckins,
} from '../services/coachCheckinService.js';

// 2026-11-25 19:05 in Berlin (UTC+1) is 18:05 UTC.
const NOW = new Date('2026-11-25T18:05:00Z');
const choicesOn = { web: { aiCoaches: true } };

const candidate = (over: Record<string, unknown> = {}) => ({
  user_id: 'u1',
  checkin_times: ['08:00', '13:00', '19:00'],
  max_messages_per_day: 3,
  paused_until: null,
  last_checkin_at: null,
  feature_choices: choicesOn,
  ...over,
});

const recoveryRow = {
  id: 'coach-1',
  builtin_key: 'recovery',
  name: null,
  instructions: null,
  rules: { version: 1, rules: [] },
  enabled: true,
  sort_order: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserPreferences.mockResolvedValue({
    language: 'en',
    feature_choices: choicesOn,
  });
  mocks.loadUserTimezone.mockResolvedValue('Europe/Berlin');
  mocks.repo.listCheckinCandidates.mockResolvedValue([candidate()]);
  mocks.repo.claimCheckin.mockResolvedValue(true);
  mocks.repo.listCoaches.mockResolvedValue([recoveryRow]);
  mocks.repo.countNudgesForDay.mockResolvedValue(0);
  mocks.repo.getNudgeKeysForDay.mockResolvedValue(new Set());
  mocks.repo.getProfile.mockResolvedValue(null);
  mocks.repo.countWinsForDay.mockResolvedValue(0);
  mocks.repo.claimEventScan.mockResolvedValue(null);
  mocks.buildSuggestion.mockResolvedValue({ suggestion: null, facts: {} });
  mocks.judgeCustomCoach.mockResolvedValue(null);
  mocks.getEntriesCreatedSince.mockResolvedValue([]);
  mocks.getPersonalRecordMatrix.mockResolvedValue({
    cardioPRs: [],
    strength1RMs: [],
  });
  mocks.repo.insertNudgeWithChatMessage.mockResolvedValue({
    chatMessageId: 'm1',
  });
  mocks.getCoachSignals.mockResolvedValue({
    hours_since_strength: 20,
    protein_pct_of_goal: 61,
  });
  mocks.composeCoachMessage.mockResolvedValue({
    text: 'You are 58 g short.',
    source: 'ai',
    templateKey: null,
    templateParams: null,
  });
});

describe('dueCheckinSlot', () => {
  it('finds the check-in that has just passed, in the person’s zone', () => {
    const due = dueCheckinSlot(['08:00', '19:00'], 'Europe/Berlin', NOW);
    expect(due?.time).toBe('19:00');
    expect(due?.day).toBe('2026-11-25');
    expect(due?.slot.toISOString()).toBe('2026-11-25T18:00:00.000Z');
  });

  it('ignores a check-in that has not come yet', () => {
    expect(dueCheckinSlot(['19:30'], 'Europe/Berlin', NOW)).toBeNull();
  });

  it('skips one older than the grace window', () => {
    const late = new Date(
      new Date('2026-11-25T18:00:00Z').getTime() +
        (CHECKIN_GRACE_MINUTES + 1) * 60_000
    );
    expect(dueCheckinSlot(['19:00'], 'Europe/Berlin', late)).toBeNull();
  });

  it('uses the local day, not the UTC day', () => {
    // 00:10 Tokyo on the 26th is still the 25th in UTC.
    const now = new Date('2026-11-25T15:10:00Z');
    const due = dueCheckinSlot(['00:00'], 'Asia/Tokyo', now);
    expect(due?.day).toBe('2026-11-26');
  });
});

describe('runCoachCheckins', () => {
  it('saves one message when a rule matches', async () => {
    await runCoachCheckins(NOW);
    expect(mocks.repo.claimCheckin).toHaveBeenCalledOnce();
    expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
    const [userId, nudge, chat] =
      mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
    expect(userId).toBe('u1');
    expect(nudge).toMatchObject({
      coachId: 'coach-1',
      localDay: '2026-11-25',
      checkinSlot: '19:00',
      ruleKey: 'protein_after_strength',
      source: 'ai',
    });
    expect(chat.metadata).toMatchObject({
      coach_id: 'coach-1',
      custom: { coach: { coachId: 'coach-1', builtinKey: 'recovery' } },
    });
    expect(chat.metadata.account_user_id).toBeUndefined();
  });

  it('stays quiet when nothing matches, and makes no AI call', async () => {
    mocks.getCoachSignals.mockResolvedValue({ protein_pct_of_goal: 95 });
    await runCoachCheckins(NOW);
    expect(mocks.composeCoachMessage).not.toHaveBeenCalled();
    expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the feature is off for the person', async () => {
    mocks.repo.listCheckinCandidates.mockResolvedValue([
      candidate({ feature_choices: null }),
    ]);
    await runCoachCheckins(NOW);
    expect(mocks.repo.claimCheckin).not.toHaveBeenCalled();
  });

  it('does nothing while paused', async () => {
    mocks.repo.listCheckinCandidates.mockResolvedValue([
      candidate({ paused_until: '2026-11-26' }),
    ]);
    await runCoachCheckins(NOW);
    expect(mocks.repo.claimCheckin).not.toHaveBeenCalled();
    mocks.repo.listCheckinCandidates.mockResolvedValue([
      candidate({ paused_until: '2026-11-24' }),
    ]);
    await runCoachCheckins(NOW);
    expect(mocks.repo.claimCheckin).toHaveBeenCalledOnce();
  });

  it('skips a person whose check-in time is not due', async () => {
    mocks.repo.listCheckinCandidates.mockResolvedValue([
      candidate({ checkin_times: ['07:00'] }),
    ]);
    await runCoachCheckins(NOW);
    expect(mocks.repo.claimCheckin).not.toHaveBeenCalled();
  });

  it('does not run when another instance already claimed the slot', async () => {
    mocks.repo.claimCheckin.mockResolvedValue(false);
    await runCoachCheckins(NOW);
    expect(mocks.getCoachSignals).not.toHaveBeenCalled();
    expect(mocks.composeCoachMessage).not.toHaveBeenCalled();
  });

  it('respects the daily limit', async () => {
    mocks.repo.countNudgesForDay.mockResolvedValue(3);
    await runCoachCheckins(NOW);
    expect(mocks.composeCoachMessage).not.toHaveBeenCalled();
  });

  it('skips a rule that already spoke today, before any AI call', async () => {
    mocks.repo.getNudgeKeysForDay.mockResolvedValue(
      new Set(['coach-1:protein_after_strength'])
    );
    await runCoachCheckins(NOW);
    expect(mocks.composeCoachMessage).not.toHaveBeenCalled();
  });

  it('sends at most one message per coach per check-in', async () => {
    mocks.getCoachSignals.mockResolvedValue({
      hours_since_strength: 20,
      protein_pct_of_goal: 61,
      hours_since_hard_cardio: 5,
      carbs_pct_of_goal: 20,
    });
    await runCoachCheckins(NOW);
    expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
  });

  it('stops at the budget across coaches', async () => {
    mocks.repo.countNudgesForDay.mockResolvedValue(2);
    mocks.repo.listCoaches.mockResolvedValue([
      recoveryRow,
      {
        ...recoveryRow,
        id: 'coach-2',
        builtin_key: 'nutrition',
        sort_order: 30,
      },
    ]);
    mocks.getCoachSignals.mockResolvedValue({
      hours_since_strength: 20,
      protein_pct_of_goal: 40,
      fiber_pct_of_goal: 10,
    });
    await runCoachCheckins(NOW);
    expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
  });

  it('ignores a coach that is switched off', async () => {
    mocks.repo.listCoaches.mockResolvedValue([
      { ...recoveryRow, enabled: false },
      {
        ...recoveryRow,
        id: 'c3',
        builtin_key: null,
        name: 'Mine',
        enabled: false,
      },
    ]);
    await runCoachCheckins(NOW);
    expect(mocks.getCoachSignals).not.toHaveBeenCalled();
  });

  it('keeps going when one person fails', async () => {
    mocks.repo.listCheckinCandidates.mockResolvedValue([
      candidate({ user_id: 'bad' }),
      candidate({ user_id: 'good' }),
    ]);
    mocks.repo.listCoaches.mockImplementation(async (userId: string) => {
      if (userId === 'bad') throw new Error('db down');
      return [recoveryRow];
    });
    await runCoachCheckins(NOW);
    expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
    expect(mocks.repo.insertNudgeWithChatMessage.mock.calls[0][0]).toBe('good');
  });

  it('applies the person’s changed threshold', async () => {
    mocks.repo.listCoaches.mockResolvedValue([
      {
        ...recoveryRow,
        rules: {
          version: 1,
          rules: [
            {
              id: 'protein_after_strength',
              conditions: [
                { signal: 'hours_since_strength', op: 'lte', value: 48 },
                { signal: 'protein_pct_of_goal', op: 'lt', value: 50 },
              ],
            },
          ],
        },
      },
    ]);
    await runCoachCheckins(NOW);
    // 61% is above the person's own 50% threshold.
    expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
  });

  describe('kinds of message', () => {
    const coach = (key: string, id: string, extra: object = {}) => ({
      ...recoveryRow,
      id,
      builtin_key: key,
      sort_order: 10,
      settings: {},
      ...extra,
    });

    it('sends at most one win a day', async () => {
      mocks.repo.listCoaches.mockResolvedValue([
        coach('consistency', 'c-consistency'),
        coach('nutrition', 'c-nutrition'),
      ]);
      mocks.getCoachSignals.mockResolvedValue({
        logging_streak_days: 10,
        protein_goal_hit_streak_days: 6,
        calories_pct_of_goal: 90,
        days_since_last_log: 0,
      });
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
      expect(mocks.repo.insertNudgeWithChatMessage.mock.calls[0][1].kind).toBe(
        'win'
      );
    });

    it('sends no win when one already went today', async () => {
      mocks.repo.countWinsForDay.mockResolvedValue(1);
      mocks.repo.listCoaches.mockResolvedValue([
        coach('consistency', 'c-consistency'),
      ]);
      mocks.getCoachSignals.mockResolvedValue({
        logging_streak_days: 10,
        days_since_last_log: 0,
        calories_pct_of_goal: 90,
      });
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });

    it('puts a problem before a win when the budget is tight', async () => {
      mocks.repo.countNudgesForDay.mockResolvedValue(2);
      mocks.repo.listCoaches.mockResolvedValue([
        coach('consistency', 'c-consistency'),
        coach('recovery', 'c-recovery'),
      ]);
      mocks.getCoachSignals.mockResolvedValue({
        logging_streak_days: 10,
        days_since_last_log: 0,
        calories_pct_of_goal: 90,
        hours_since_strength: 10,
        protein_pct_of_goal: 40,
      });
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
      expect(
        mocks.repo.insertNudgeWithChatMessage.mock.calls[0][1].ruleKey
      ).toBe('protein_after_strength');
    });

    it('gives the morning outlook first, with a verdict worked out in code', async () => {
      const morning = new Date('2026-11-25T07:05:00Z'); // 08:05 in Berlin
      mocks.repo.listCoaches.mockResolvedValue([
        coach('daily_outlook', 'c-outlook', { sort_order: 5 }),
      ]);
      mocks.getCoachSignals.mockResolvedValue({
        sleep_minutes_vs_avg: -120,
        training_load_ratio: 1.0,
      });
      await runCoachCheckins(morning);
      const [, nudge] = mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
      expect(nudge.kind).toBe('outlook');
      const input = mocks.composeCoachMessage.mock.calls[0][0];
      expect(input.extraFacts).toEqual({ verdict: 'easy' });
      expect(input.templateSubkey).toBe('easy');
    });

    it('stays quiet in the evening and without sleep or load data', async () => {
      mocks.repo.listCoaches.mockResolvedValue([
        coach('daily_outlook', 'c-outlook'),
      ]);
      mocks.getCoachSignals.mockResolvedValue({});
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });

    it('asks a quick question with a fixed text and no AI', async () => {
      mocks.repo.listCoaches.mockResolvedValue([
        coach('habits', 'c-habits', {
          settings: { focus_habit_id: 'habit-1' },
        }),
      ]);
      mocks.getCoachSignals.mockResolvedValue({ focus_habit_done_today: 0 });
      await runCoachCheckins(NOW);
      expect(mocks.composeCoachMessage).not.toHaveBeenCalled();
      const [, nudge] = mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
      expect(nudge).toMatchObject({
        question: 'habit_done',
        questionRef: 'habit-1',
        source: 'template',
      });
    });

    it('attaches a suggestion to the message it belongs to', async () => {
      mocks.buildSuggestion.mockResolvedValue({
        suggestion: {
          kind: 'goal_day_protein',
          day: '2026-11-25',
          from: 150,
          to: 165,
        },
        facts: { protein_goal_from: 150, protein_goal_to: 165 },
      });
      await runCoachCheckins(NOW);
      const [, nudge] = mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
      expect(nudge.suggestion).toMatchObject({ to: 165 });
      expect(mocks.composeCoachMessage.mock.calls[0][0].proposes).toContain(
        '165'
      );
    });

    it('sends nothing for a training note with no plan changes to offer', async () => {
      mocks.repo.listCoaches.mockResolvedValue([
        coach('training', 'c-training'),
      ]);
      mocks.getCoachSignals.mockResolvedValue({ stalled_lifts: 2 });
      const morning = new Date('2026-11-25T07:05:00Z');
      await runCoachCheckins(morning);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });

    it('runs the weekly review only at the first check-in of its weekday', async () => {
      const morning = new Date('2026-11-25T07:05:00Z'); // a Wednesday
      mocks.repo.listCoaches.mockResolvedValue([
        coach('weekly_review', 'c-weekly', { settings: { weekday: 1 } }),
      ]);
      mocks.buildSuggestion.mockResolvedValue({
        suggestion: null,
        facts: { days_logged: 6 },
      });
      await runCoachCheckins(morning);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();

      mocks.repo.listCoaches.mockResolvedValue([
        coach('weekly_review', 'c-weekly', { settings: { weekday: 3 } }),
      ]);
      await runCoachCheckins(morning);
      expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
      // Not at the later check-ins of the same day.
      mocks.repo.insertNudgeWithChatMessage.mockClear();
      await runCoachCheckins(new Date('2026-11-25T12:05:00Z'));
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });
  });

  describe('custom coaches', () => {
    const custom = (over: object) => ({
      ...recoveryRow,
      id: 'mine',
      builtin_key: null,
      name: 'Race prep',
      mode: 'rules',
      ai_rule: null,
      settings: {},
      rules: {
        version: 1,
        rules: [
          {
            id: 'water',
            enabled: true,
            when: 'evening',
            conditions: [{ signal: 'water_pct_of_goal', op: 'lt', value: 60 }],
          },
        ],
      },
      ...over,
    });

    it('speaks from its own rules', async () => {
      mocks.repo.listCoaches.mockResolvedValue([custom({})]);
      mocks.getCoachSignals.mockResolvedValue({ water_pct_of_goal: 20 });
      await runCoachCheckins(NOW);
      const [, nudge, chat] =
        mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
      expect(nudge.ruleKey).toBe('water');
      expect(chat.metadata.custom.coach.name).toBe('Race prep');
    });

    it('lets the AI decide, once a day, and stays quiet when it says no', async () => {
      mocks.repo.listCoaches.mockResolvedValue([
        custom({ mode: 'ai_judge', ai_rule: 'tell me if off track' }),
      ]);
      await runCoachCheckins(NOW);
      expect(mocks.judgeCustomCoach).toHaveBeenCalledOnce();
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();

      mocks.judgeCustomCoach.mockResolvedValue('Eat a little more carbs.');
      await runCoachCheckins(NOW);
      const [, nudge] = mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
      expect(nudge).toMatchObject({ ruleKey: 'ai_judge', source: 'ai' });
    });

    it('does not ask the AI again when it already spoke today', async () => {
      mocks.repo.getNudgeKeysForDay.mockResolvedValue(
        new Set(['mine:ai_judge'])
      );
      mocks.repo.listCoaches.mockResolvedValue([
        custom({ mode: 'ai_judge', ai_rule: 'tell me if off track' }),
      ]);
      await runCoachCheckins(NOW);
      expect(mocks.judgeCustomCoach).not.toHaveBeenCalled();
    });
  });

  describe('after a workout', () => {
    const entry = (over: object = {}) => ({
      id: 'e1',
      exercise_name: 'Squats',
      entry_date: '2026-11-25',
      duration_minutes: 45,
      exercise_preset_entry_id: 'session-1',
      ...over,
    });
    const workout = (over: object = {}) => ({
      sport: 'strength',
      isStrength: true,
      hard: true,
      start: new Date('2026-11-25T17:40:00Z'),
      ...over,
    });

    beforeEach(() => {
      mocks.repo.claimCheckin.mockResolvedValue(false);
      mocks.repo.claimEventScan.mockResolvedValue({
        since: new Date('2026-11-25T17:00:00Z'),
      });
      mocks.repo.listCoaches.mockResolvedValue([recoveryRow]);
      mocks.getEntriesCreatedSince.mockResolvedValue([entry()]);
      mocks.describeWorkout.mockReturnValue(workout());
    });

    it('sends one short message for a new hard strength session', async () => {
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
      const [, nudge] = mocks.repo.insertNudgeWithChatMessage.mock.calls[0];
      expect(nudge).toMatchObject({
        ruleKey: 'after_strength_session',
        exerciseEntryId: 'session-1',
      });
    });

    it('groups the entries of one session into one message', async () => {
      mocks.getEntriesCreatedSince.mockResolvedValue([
        entry(),
        entry({ id: 'e2', exercise_name: 'Lunges' }),
      ]);
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
    });

    it('stays quiet about a synced workout from days ago', async () => {
      mocks.describeWorkout.mockReturnValue(
        workout({ start: new Date('2026-11-21T10:00:00Z') })
      );
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });

    it('ignores passive device rows', async () => {
      mocks.getEntriesCreatedSince.mockResolvedValue([
        entry({ exercise_name: 'Active Calories' }),
      ]);
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });

    it('does nothing when another instance took this scan', async () => {
      mocks.repo.claimEventScan.mockResolvedValue(null);
      await runCoachCheckins(NOW);
      expect(mocks.getEntriesCreatedSince).not.toHaveBeenCalled();
    });

    it('respects the daily limit', async () => {
      mocks.repo.countNudgesForDay.mockResolvedValue(3);
      await runCoachCheckins(NOW);
      expect(mocks.repo.insertNudgeWithChatMessage).not.toHaveBeenCalled();
    });
  });
});

describe('runCheckinNow', () => {
  const profile = (over: object = {}) => ({
    user_id: 'u1',
    checkin_times: ['08:00', '19:00'],
    max_messages_per_day: 3,
    paused_until: null,
    ...over,
  });
  beforeEach(() => {
    mocks.repo.getProfile.mockResolvedValue(profile());
  });

  it('runs without waiting for a check-in time, and counts what was sent', async () => {
    mocks.repo.countNudgesForDay.mockResolvedValueOnce(0).mockResolvedValue(1);
    const result = await runCheckinNow('u1', NOW);
    expect(result).toEqual({ sent: 1, reason: null });
    // It records itself as the last check-in.
    expect(mocks.repo.claimCheckin).toHaveBeenCalledWith('u1', NOW);
    expect(mocks.repo.insertNudgeWithChatMessage).toHaveBeenCalledOnce();
  });

  it('says why nothing was sent', async () => {
    mocks.getCoachSignals.mockResolvedValue({ protein_pct_of_goal: 95 });
    expect(await runCheckinNow('u1', NOW)).toEqual({
      sent: 0,
      reason: 'nothing_to_say',
    });
    mocks.repo.getProfile.mockResolvedValue(
      profile({ paused_until: '2026-11-30' })
    );
    expect((await runCheckinNow('u1', NOW)).reason).toBe('paused');
    mocks.repo.getProfile.mockResolvedValue(profile());
    mocks.repo.listCoaches.mockResolvedValue([
      { ...recoveryRow, enabled: false },
    ]);
    expect((await runCheckinNow('u1', NOW)).reason).toBe('no_coaches');
    mocks.repo.listCoaches.mockResolvedValue([recoveryRow]);
    mocks.repo.countNudgesForDay.mockResolvedValue(3);
    expect((await runCheckinNow('u1', NOW)).reason).toBe('limit_reached');
    mocks.getUserPreferences.mockResolvedValueOnce({
      language: 'en',
      feature_choices: {
        web: { aiCoaches: false },
        mobile: { aiCoaches: false },
      },
    });
    expect((await runCheckinNow('u1', NOW)).reason).toBe('no_coaches');
  });

  it('still never repeats what was already said today', async () => {
    mocks.repo.getNudgeKeysForDay.mockResolvedValue(
      new Set(['coach-1:protein_after_strength'])
    );
    expect((await runCheckinNow('u1', NOW)).sent).toBe(0);
    expect(mocks.composeCoachMessage).not.toHaveBeenCalled();
  });
});
