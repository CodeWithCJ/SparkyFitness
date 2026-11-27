import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import coachRoutes from '../routes/v2/coachRoutes.js';
import coachService, {
  CoachAnswerError,
  CoachLimitError,
} from '../services/coachService.js';
import {
  applySuggestion,
  CoachSuggestionError,
  dismissSuggestion,
} from '../services/coachSuggestionService.js';
import aiCoachRepository from '../models/aiCoachRepository.js';
import { runCheckinNow } from '../services/coachCheckinService.js';

vi.mock('../services/coachService.js', () => {
  class CoachNotFoundError extends Error {}
  return {
    CoachNotFoundError,
    default: {
      getCoachSettings: vi.fn(),
      updateCoachProfile: vi.fn(),
      updateBuiltinCoach: vi.fn(),
      previewBuiltinCoach: vi.fn(),
      getUnread: vi.fn(),
      markThreadRead: vi.fn(),
      createCustomCoach: vi.fn(),
      updateCustomCoach: vi.fn(),
      deleteCustomCoach: vi.fn(),
      previewDraft: vi.fn(),
      reactToNudge: vi.fn(),
      answerNudge: vi.fn(),
      getKnowledge: vi.fn(),
    },
    CoachLimitError: class CoachLimitError extends Error {},
    CoachInvalidError: class CoachInvalidError extends Error {},
    CoachAnswerError: class CoachAnswerError extends Error {
      code = 'already_answered';
    },
  };
});
vi.mock('../services/coachCheckinService.js', () => ({
  runCheckinNow: vi.fn(),
}));
vi.mock('../services/coachSuggestionService.js', () => {
  class CoachSuggestionError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    CoachSuggestionError,
    applySuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
  };
});
vi.mock('../models/aiCoachRepository.js', () => ({
  default: { listNudgeStates: vi.fn(), listUnreadMessages: vi.fn() },
}));

let actingAs = 'test-user-id';
const app = express();
app.use(express.json());
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/coaches', coachRoutes);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('coach routes', () => {
  it('returns the settings for the owner', async () => {
    vi.mocked(coachService.getCoachSettings).mockResolvedValue({
      coaches: [],
    } as never);
    const res = await request(app).get('/api/v2/coaches');
    expect(res.status).toBe(200);
    expect(coachService.getCoachSettings).toHaveBeenCalledWith('test-user-id');
  });

  it('refuses someone acting for the owner on every route', async () => {
    actingAs = 'delegate-id';
    for (const [method, path] of [
      ['get', '/api/v2/coaches'],
      ['put', '/api/v2/coaches/profile'],
      ['put', '/api/v2/coaches/builtin/recovery'],
      ['post', '/api/v2/coaches/builtin/recovery/preview'],
      ['get', '/api/v2/coaches/unread'],
      ['post', '/api/v2/coaches/read'],
      ['post', '/api/v2/coaches/custom'],
      ['post', '/api/v2/coaches/check-in-now'],
      ['patch', '/api/v2/coaches/custom/x'],
      ['delete', '/api/v2/coaches/custom/x'],
      ['post', '/api/v2/coaches/preview'],
      ['get', '/api/v2/coaches/knowledge'],
      ['get', '/api/v2/coaches/messages/unread'],
      ['get', '/api/v2/coaches/c1/nudges'],
      ['post', '/api/v2/coaches/nudges/n1/react'],
      ['post', '/api/v2/coaches/nudges/n1/answer'],
      ['post', '/api/v2/coaches/nudges/n1/apply'],
      ['post', '/api/v2/coaches/nudges/n1/dismiss'],
    ] as const) {
      const res = await request(app)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect(coachService.getCoachSettings).not.toHaveBeenCalled();
  });

  it('saves a valid profile change', async () => {
    vi.mocked(coachService.updateCoachProfile).mockResolvedValue({} as never);
    const res = await request(app)
      .put('/api/v2/coaches/profile')
      .send({ checkin_times: ['07:30', '20:00'], max_messages_per_day: 2 });
    expect(res.status).toBe(200);
    expect(coachService.updateCoachProfile).toHaveBeenCalledWith(
      'test-user-id',
      { checkin_times: ['07:30', '20:00'], max_messages_per_day: 2 }
    );
  });

  it.each([
    ['a time with invalid format', { checkin_times: ['25:99'] }],
    [
      'more than four times',
      { checkin_times: ['06:00', '09:00', '12:00', '15:00', '18:00'] },
    ],
    ['the same time twice', { checkin_times: ['08:00', '08:00'] }],
    ['a limit above fifty', { max_messages_per_day: 51 }],
    ['a limit of zero', { max_messages_per_day: 0 }],
    ['an unknown diet', { diet_type: 'carnivore-only' }],
    ['an empty body', {}],
  ])('rejects %s', async (_name, body) => {
    const res = await request(app).put('/api/v2/coaches/profile').send(body);
    expect(res.status).toBe(400);
    expect(coachService.updateCoachProfile).not.toHaveBeenCalled();
  });

  it('switches a built-in coach on', async () => {
    vi.mocked(coachService.updateBuiltinCoach).mockResolvedValue({} as never);
    const res = await request(app)
      .put('/api/v2/coaches/builtin/recovery')
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(coachService.updateBuiltinCoach).toHaveBeenCalledWith(
      'test-user-id',
      'recovery',
      { enabled: true }
    );
  });

  it('answers 404 for an unknown coach', async () => {
    const { CoachNotFoundError } = await import('../services/coachService.js');
    vi.mocked(coachService.previewBuiltinCoach).mockRejectedValue(
      new CoachNotFoundError()
    );
    const res = await request(app).post('/api/v2/coaches/builtin/nope/preview');
    expect(res.status).toBe(404);
  });

  it('marks a thread read, and refuses a bad id', async () => {
    vi.mocked(coachService.markThreadRead).mockResolvedValue({
      total: 0,
      by_coach: [],
    });
    const ok = await request(app)
      .post('/api/v2/coaches/read')
      .send({ coach_id: '6f1f3b0e-1c5a-4a64-8f2e-2a8b9d1c0e11' });
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post('/api/v2/coaches/read')
      .send({ coach_id: 'not-a-uuid' });
    expect(bad.status).toBe(400);
  });

  const customBody = {
    name: 'Race prep',
    tool_categories: ['exercise'],
    mode: 'rules',
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
  };

  it('runs a check-in on request and says what happened', async () => {
    vi.mocked(runCheckinNow).mockResolvedValue({ sent: 1, reason: null });
    const res = await request(app).post('/api/v2/coaches/check-in-now');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 1, reason: null });
    expect(runCheckinNow).toHaveBeenCalledWith('test-user-id');
  });

  it('creates a custom coach, and answers 409 past the limit', async () => {
    vi.mocked(coachService.createCustomCoach).mockResolvedValue({} as never);
    const ok = await request(app)
      .post('/api/v2/coaches/custom')
      .send(customBody);
    expect(ok.status).toBe(201);
    vi.mocked(coachService.createCustomCoach).mockRejectedValue(
      new CoachLimitError()
    );
    const full = await request(app)
      .post('/api/v2/coaches/custom')
      .send(customBody);
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('limit');
  });

  it.each([
    ['no name', { ...customBody, name: '' }],
    ['a name over 40 characters', { ...customBody, name: 'x'.repeat(41) }],
    ['no data access', { ...customBody, tool_categories: [] }],
    ['an unknown data access', { ...customBody, tool_categories: ['nope'] }],
    [
      'rules mode with no rules',
      { ...customBody, rules: { version: 1, rules: [] } },
    ],
    ['the AI deciding with no rule', { ...customBody, mode: 'ai_judge' }],
    [
      'more than 4 conditions in a rule',
      {
        ...customBody,
        rules: {
          version: 1,
          rules: [
            {
              ...customBody.rules.rules[0],
              conditions: Array(5).fill(
                customBody.rules.rules[0]?.conditions[0]
              ),
            },
          ],
        },
      },
    ],
  ])('refuses a custom coach with %s', async (_name, body) => {
    const res = await request(app).post('/api/v2/coaches/custom').send(body);
    expect(res.status).toBe(400);
    expect(coachService.createCustomCoach).not.toHaveBeenCalled();
  });

  it('updates and deletes a custom coach', async () => {
    vi.mocked(coachService.updateCustomCoach).mockResolvedValue({} as never);
    expect(
      (
        await request(app)
          .patch('/api/v2/coaches/custom/c1')
          .send({ enabled: true })
      ).status
    ).toBe(200);
    expect(
      (await request(app).patch('/api/v2/coaches/custom/c1').send({})).status
    ).toBe(400);
    expect(
      (await request(app).delete('/api/v2/coaches/custom/c1')).status
    ).toBe(204);
  });

  it('checks a draft without the AI', async () => {
    vi.mocked(coachService.previewDraft).mockResolvedValue({
      would_speak: false,
    } as never);
    const res = await request(app)
      .post('/api/v2/coaches/preview')
      .send({ mode: 'rules', rules: customBody.rules });
    expect(res.status).toBe(200);
    expect(
      (await request(app).post('/api/v2/coaches/preview').send({ mode: 'x' }))
        .status
    ).toBe(400);
  });

  it('reacts to a message, and refuses a bad reaction', async () => {
    vi.mocked(coachService.reactToNudge).mockResolvedValue({
      reaction: -1,
      muted_rule: null,
    });
    const ok = await request(app)
      .post('/api/v2/coaches/nudges/n1/react')
      .send({ reaction: -1 });
    expect(ok.status).toBe(200);
    expect(coachService.reactToNudge).toHaveBeenCalledWith(
      'test-user-id',
      'n1',
      -1
    );
    expect(
      (
        await request(app)
          .post('/api/v2/coaches/nudges/n1/react')
          .send({ reaction: 2 })
      ).status
    ).toBe(400);
  });

  it('answers a question once', async () => {
    vi.mocked(coachService.answerNudge).mockResolvedValue({
      saved: 'mood_entry',
    });
    const ok = await request(app)
      .post('/api/v2/coaches/nudges/n1/answer')
      .send({ value: 4 });
    expect(ok.body).toEqual({ answered: true, saved: 'mood_entry' });
    expect(
      (
        await request(app)
          .post('/api/v2/coaches/nudges/n1/answer')
          .send({ value: 9 })
      ).status
    ).toBe(400);
    vi.mocked(coachService.answerNudge).mockRejectedValue(
      new CoachAnswerError('already_answered', 'x')
    );
    expect(
      (
        await request(app)
          .post('/api/v2/coaches/nudges/n1/answer')
          .send({ value: 4 })
      ).status
    ).toBe(409);
  });

  it('applies and dismisses a suggestion, with 409 once handled', async () => {
    vi.mocked(applySuggestion).mockResolvedValue({ applied: true } as never);
    expect(
      (await request(app).post('/api/v2/coaches/nudges/n1/apply')).status
    ).toBe(200);
    vi.mocked(applySuggestion).mockRejectedValue(
      new CoachSuggestionError('not_pending', 'done')
    );
    const again = await request(app).post('/api/v2/coaches/nudges/n1/apply');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('not_pending');
    vi.mocked(dismissSuggestion).mockResolvedValue({ dismissed: true });
    expect(
      (await request(app).post('/api/v2/coaches/nudges/n1/dismiss')).status
    ).toBe(200);
  });

  it('lists a thread’s message states and the unread messages', async () => {
    vi.mocked(aiCoachRepository.listNudgeStates).mockResolvedValue([]);
    expect((await request(app).get('/api/v2/coaches/c1/nudges')).status).toBe(
      200
    );
    vi.mocked(aiCoachRepository.listUnreadMessages).mockResolvedValue([]);
    await request(app).get(
      '/api/v2/coaches/messages/unread?since=2026-11-25T10:00:00Z'
    );
    expect(aiCoachRepository.listUnreadMessages).toHaveBeenCalledWith(
      'test-user-id',
      new Date('2026-11-25T10:00:00Z')
    );
    await request(app).get('/api/v2/coaches/messages/unread');
    expect(
      vi.mocked(aiCoachRepository.listUnreadMessages).mock.calls[1]?.[1]
    ).toBeNull();
  });
});
