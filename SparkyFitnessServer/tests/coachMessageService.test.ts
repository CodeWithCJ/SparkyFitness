import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveTextAiProvider: vi.fn(),
  dispatchAiRequest: vi.fn(),
}));
vi.mock('../ai/resolveTextAiProvider.js', () => ({
  resolveTextAiProvider: mocks.resolveTextAiProvider,
}));
vi.mock('../ai/providerDispatch.js', () => ({
  dispatchAiRequest: mocks.dispatchAiRequest,
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  askMessage,
  composeCoachMessage,
  judgeCustomCoach,
} from '../services/coachMessageService.js';

const input = {
  userId: 'u1',
  coachKey: 'recovery',
  coachName: null,
  coachInstructions: null,
  ruleId: 'protein_after_strength',
  because: [
    {
      signal: 'protein_pct_of_goal' as const,
      value: 61,
      op: 'lt' as const,
      threshold: 70,
    },
  ],
  signals: { protein_pct_of_goal: 61 },
  profile: {
    user_id: 'u1',
    diet_type: 'vegetarian' as const,
    foods_avoid: 'mushrooms',
    foods_prefer: null,
    tone: 'friendly' as const,
    notes: null,
    checkin_times: ['08:00'],
    max_messages_per_day: 3,
    paused_until: null,
    pause_reason: null,
  },
  allergens: ['peanuts'],
  language: 'en',
  topFoods: ['Greek yogurt'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveTextAiProvider.mockResolvedValue({
    provider: { service_type: 'openai' },
    networkPolicy: {},
  });
});

describe('composeCoachMessage', () => {
  it('uses a fixed template when no AI provider is set up', async () => {
    mocks.resolveTextAiProvider.mockResolvedValue(null);
    const result = await composeCoachMessage(input);
    expect(result.source).toBe('template');
    expect(result.templateKey).toBe(
      'coaches.templates.recovery.protein_after_strength'
    );
    expect(result.templateParams).toEqual({ protein_pct_of_goal: 61 });
    expect(mocks.dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('writes the message with the AI and gives it the facts, diet and allergies', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '',
      json: { message: '  Try lentil soup tonight.  ' },
    });
    const result = await composeCoachMessage(input);
    expect(result).toMatchObject({
      text: 'Try lentil soup tonight.',
      source: 'ai',
      templateKey: null,
    });
    const prompt = mocks.dispatchAiRequest.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('protein_pct_of_goal: 61');
    expect(prompt).toContain('Diet: vegetarian');
    expect(prompt).toContain('Foods to avoid: mushrooms');
    expect(prompt).toContain('Allergies: peanuts');
    expect(prompt).toContain('Greek yogurt');
    expect(prompt).toContain('You are the Recovery coach');
  });

  it('falls back to the template when the AI call fails', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: false,
      category: 'upstream_error',
      detail: 'boom',
    });
    const result = await composeCoachMessage(input);
    expect(result.source).toBe('template_fallback');
    expect(result.templateKey).not.toBeNull();
  });

  it('falls back when the AI answers with no message', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '',
      json: { message: '   ' },
    });
    expect((await composeCoachMessage(input)).source).toBe('template_fallback');
  });

  it('caps a long answer at 400 characters', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '',
      json: { message: 'x'.repeat(900) },
    });
    expect((await composeCoachMessage(input)).text).toHaveLength(400);
  });
});

describe('cycle awareness', () => {
  it('tells the AI the phase only when there is one', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '',
      json: { message: 'Hi.' },
    });
    await composeCoachMessage({ ...input, signals: { cycle_phase: 'luteal' } });
    expect(mocks.dispatchAiRequest.mock.calls[0][0].prompt).toContain(
      'Cycle phase today: luteal'
    );
    await composeCoachMessage({
      ...input,
      signals: { protein_pct_of_goal: 61 },
    });
    expect(mocks.dispatchAiRequest.mock.calls[1][0].prompt).not.toContain(
      'Cycle phase'
    );
  });
});

describe('askMessage', () => {
  it('gives fixed, translatable question text', () => {
    expect(askMessage('energy')).toEqual({
      text: expect.stringContaining('energy'),
      key: 'coaches.questions.energy.ask',
    });
    expect(askMessage('habit_done').key).toBe(
      'coaches.questions.habit_done.ask'
    );
  });
});

describe('composeCoachMessage extras', () => {
  it('quotes the extra facts and what it proposes, and picks the sub-template', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '',
      json: { message: 'Easy day.' },
    });
    await composeCoachMessage({
      ...input,
      coachKey: 'daily_outlook',
      ruleId: 'outlook',
      extraFacts: { verdict: 'easy' },
      templateSubkey: 'easy',
      proposes: 'a protein goal of 165 g for today only',
    });
    const prompt = mocks.dispatchAiRequest.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('verdict: easy');
    expect(prompt).toContain('165 g for today only');
    mocks.resolveTextAiProvider.mockResolvedValue(null);
    const fixed = await composeCoachMessage({
      ...input,
      coachKey: 'daily_outlook',
      ruleId: 'outlook',
      extraFacts: { verdict: 'easy' },
      templateSubkey: 'easy',
    });
    expect(fixed.templateKey).toBe(
      'coaches.templates.daily_outlook.outlook.easy'
    );
    expect(fixed.templateParams).toMatchObject({ verdict: 'easy' });
  });
});

describe('judgeCustomCoach', () => {
  const judge = {
    userId: 'u1',
    coachName: 'Race prep',
    coachInstructions: 'Short and direct.',
    aiRule: 'Tell me if anything looks off for my half marathon.',
    signals: { water_pct_of_goal: 20, sleep_minutes_vs_avg: null },
    profile: null,
    allergens: ['peanuts'],
    language: 'en',
  };

  it('returns the message when the AI decides to speak', async () => {
    mocks.dispatchAiRequest.mockResolvedValue({
      ok: true,
      text: '',
      json: { speak: true, message: ' Drink more today. ' },
    });
    expect(await judgeCustomCoach(judge)).toBe('Drink more today.');
    const prompt = mocks.dispatchAiRequest.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('water_pct_of_goal: 20');
    expect(prompt).not.toContain('sleep_minutes_vs_avg');
    expect(prompt).toContain('half marathon');
  });

  it.each([
    ['says no', { ok: true, text: '', json: { speak: false, message: 'x' } }],
    [
      'gives no message',
      { ok: true, text: '', json: { speak: true, message: '  ' } },
    ],
    ['answers with something else', { ok: true, text: '', json: null }],
    ['fails', { ok: false, category: 'timeout', detail: 'slow' }],
  ])('stays quiet when the AI %s', async (_name, result) => {
    mocks.dispatchAiRequest.mockResolvedValue(result);
    expect(await judgeCustomCoach(judge)).toBeNull();
  });

  it('stays quiet with no AI provider, without calling anything', async () => {
    mocks.resolveTextAiProvider.mockResolvedValue(null);
    expect(await judgeCustomCoach(judge)).toBeNull();
    expect(mocks.dispatchAiRequest).not.toHaveBeenCalled();
  });
});
