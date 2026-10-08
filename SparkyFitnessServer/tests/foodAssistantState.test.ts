import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  foodAssistantCheckpointSchema,
  foodAssistantTaskSchema,
} from '@workspace/shared';
import * as repository from '../models/foodAssistantRepository.js';
import * as service from '../services/foodAssistantService.js';

const query = vi.fn();
const release = vi.fn();
const getClient = vi.hoisted(() => vi.fn());
vi.mock('../db/poolManager.js', () => ({ getClient }));

const userId = 'b791c858-40de-4b0e-8aef-41d075c0c3bb';
const taskId = 'fe00e1ce-7850-4bba-91f0-eddb3bdfe97a';
const operationId = 'd371f842-edb9-43cf-97e1-a3fde4c52773';
const ingredientId = 'e93afcd0-f3fa-49c0-9227-c64e61e3ce2b';
const checkpoint = foodAssistantCheckpointSchema.parse({
  summary: 'Bread recipe',
  next_step: 'Resolve flour',
  ingredients: [
    {
      id: ingredientId,
      description: 'White flour',
      quantity: 250,
      unit: 'g',
      status: 'unresolved',
      issue: 'Choose exact flour',
    },
  ],
});
const task = foodAssistantTaskSchema.parse({
  id: taskId,
  user_id: userId,
  kind: 'recipe',
  title: 'Bread',
  creation_hash: 'original',
  status: 'awaiting_input',
  checkpoint,
  result: null,
  version: 2,
  created_at: new Date(),
  updated_at: new Date(),
});
const command = {
  taskId,
  operationId,
  expectedVersion: 2,
  kind: 'checkpoint',
  request: { value: 'same' },
};
const canonicalRequest = JSON.stringify({
  kind: 'checkpoint',
  request: { value: 'same' },
  taskId,
});
const requestHash = createHash('sha256').update(canonicalRequest).digest('hex');
const operation = {
  id: operationId,
  user_id: userId,
  task_id: taskId,
  kind: 'checkpoint',
  request_hash: requestHash,
  before_state: JSON.parse(JSON.stringify(task)),
  after_state: JSON.parse(JSON.stringify({ ...task, version: 3 })),
  created_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  getClient.mockResolvedValue({ query, release });
  query.mockResolvedValue({ rows: [] });
});

describe('durable food task operations', () => {
  it('does not let a generic task claim a server-verified source import identity', () => {
    expect(() =>
      service.createTask(userId, {
        id: taskId,
        kind: 'recipe',
        title: 'Recipe',
        checkpoint,
        origin: {
          type: 'recipe_url',
          url: 'https://example.com/recipe',
          card_index: 0,
        },
      })
    ).toThrow('Source imports');
    expect(getClient).not.toHaveBeenCalled();
  });
  it('checks committed retries before external work and rejects a different request with the same key', async () => {
    query.mockResolvedValue({ rows: [operation] });
    expect((await repository.replayTaskMutation(userId, command))?.id).toBe(
      operationId
    );
    await expect(
      repository.replayTaskMutation(userId, {
        ...command,
        request: { value: 'different' },
      })
    ).rejects.toThrow('different request');
  });
  it('rejects a checkpoint that silently drops an unresolved ingredient', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT * FROM food_assistant_tasks') ? [task] : [],
    }));
    await expect(
      service.checkpointTask(userId, taskId, {
        operation_id: operationId,
        expected_version: 2,
        status: 'draft',
        checkpoint: { ...checkpoint, ingredients: [] },
      })
    ).rejects.toThrow('silently drop');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).startsWith('UPDATE food_assistant_tasks')
      )
    ).toBe(false);
  });
  it('a retried task creation finds the same task even after its checkpoint advanced', async () => {
    let creationHash: string;
    query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.startsWith('INSERT INTO food_assistant_tasks')) {
        creationHash = String(values[5]);
        return { rows: [] };
      }
      return {
        rows: [
          {
            ...task,
            creation_hash: creationHash!,
            version: 3,
            checkpoint: { ...checkpoint, summary: 'More progress' },
          },
        ],
      };
    });
    const saved = await repository.createTask(userId, {
      id: taskId,
      kind: 'recipe',
      title: 'Bread',
      checkpoint,
      origin: { type: 'user_draft' },
    });
    expect(saved.version).toBe(3);
    expect(saved.checkpoint.summary).toBe('More progress');
    expect(
      query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT'))
        .length
    ).toBe(1);
  });
  it('committed retries return their result without repeating domain writes', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT * FROM food_assistant_operations')
        ? [operation]
        : [],
    }));
    const mutate = vi.fn();
    expect((await repository.mutateTask(userId, command, mutate)).id).toBe(
      operationId
    );
    expect(mutate).not.toHaveBeenCalled();
    expect(getClient).toHaveBeenCalledWith(userId, userId);
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
  it('rejects reuse of an operation ID for different work', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT * FROM food_assistant_operations')
        ? [operation]
        : [],
    }));
    const mutate = vi.fn();
    await expect(
      repository.mutateTask(
        userId,
        { ...command, request: { value: 'different' } },
        mutate
      )
    ).rejects.toThrow('different request');
    expect(mutate).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });
  it.each(['cancelled', 'complete'] as const)(
    'stops writes to a %s task',
    async (status) => {
      query.mockImplementation(async (sql: string) => ({
        rows: sql.includes('FOR UPDATE')
          ? [
              {
                ...task,
                status,
                result: status === 'complete' ? { meal_id: taskId } : null,
              },
            ]
          : [],
      }));
      const mutate = vi.fn();
      await expect(
        repository.mutateTask(userId, command, mutate)
      ).rejects.toThrow('finished or was cancelled');
      expect(mutate).not.toHaveBeenCalled();
    }
  );
  it('stale versions stop before the domain callback', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FOR UPDATE') ? [task] : [],
    }));
    const mutate = vi.fn();
    await expect(
      repository.mutateTask(userId, { ...command, expectedVersion: 1 }, mutate)
    ).rejects.toThrow('changed');
    expect(mutate).not.toHaveBeenCalled();
  });
  it('rolls back domain writes if writing the audit fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO food_assistant_operations'))
        throw new Error('audit unavailable');
      return {
        rows: sql.includes('FOR UPDATE')
          ? [task]
          : sql.includes('UPDATE food_assistant_tasks')
            ? [{ ...task, version: 3 }]
            : [],
      };
    });
    const mutate = vi.fn(async (current) => {
      await query('domain write');
      return current;
    });
    await expect(
      repository.mutateTask(userId, command, mutate)
    ).rejects.toThrow('audit unavailable');
    expect(query).toHaveBeenCalledWith('domain write');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('a successful checkpoint retains unresolved ingredients and increments the version', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FOR UPDATE')
        ? [task]
        : sql.includes('UPDATE food_assistant_tasks')
          ? [{ ...task, version: 3 }]
          : sql.includes('INSERT INTO food_assistant_operations')
            ? [operation]
            : [],
    }));
    const saved = await repository.mutateTask(
      userId,
      command,
      async (current) => current
    );
    expect(
      foodAssistantTaskSchema.parse(saved.after_state).checkpoint.ingredients[0]
        .status
    ).toBe('unresolved');
    expect(foodAssistantTaskSchema.parse(saved.after_state).version).toBe(3);
    expect(query).toHaveBeenCalledWith('COMMIT');
  });
  it('cannot mark work complete with an absent result', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FOR UPDATE') ? [task] : [],
    }));
    await expect(
      repository.mutateTask(userId, command, async (current) => ({
        ...current,
        status: 'complete',
      }))
    ).rejects.toThrow('persisted result');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('never interprets an unresolved ingredient as a saved selection', () => {
    expect(
      foodAssistantCheckpointSchema.safeParse({
        ...checkpoint,
        ingredients: [{ ...checkpoint.ingredients[0], status: 'verified' }],
      }).success
    ).toBe(false);
  });
});

describe('lasting food preferences', () => {
  const preference = {
    key: 'bread',
    value: 'White bread',
    source_quote: 'Remember I prefer white bread',
    expected_version: 0,
  };
  it('accepts a verbatim explicit memory instruction', async () => {
    query.mockResolvedValue({
      rows: [
        {
          ...preference,
          user_id: userId,
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const saved = await service.rememberPreference(
      userId,
      preference,
      'Remember I prefer white bread'
    );
    expect(saved.value).toBe('White bread');
  });
  it.each([undefined, 'Use white bread', 'Remember I prefer wholemeal bread'])(
    'rejects invented or missing source quotes',
    async (text) => {
      await expect(
        service.rememberPreference(userId, preference, text)
      ).rejects.toThrow('explicit lasting preference');
      expect(getClient).not.toHaveBeenCalled();
    }
  );
  it('does not remember a one-off meal override even if a partial quote sounds enduring', async () => {
    await expect(
      service.rememberPreference(
        userId,
        { ...preference, source_quote: 'I prefer white bread' },
        'I prefer white bread tonight'
      )
    ).rejects.toThrow('explicit lasting preference');
    expect(getClient).not.toHaveBeenCalled();
  });
  it('requires the current version to overwrite or forget an existing preference', async () => {
    await expect(
      repository.rememberPreference(userId, {
        ...preference,
        expected_version: 3,
      })
    ).rejects.toThrow('changed');
    await expect(
      repository.forgetPreference(userId, 'bread', 3)
    ).rejects.toThrow('changed');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('version = $5'),
      expect.arrayContaining([userId, 'bread', 3])
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('version = $3'),
      [userId, 'bread', 3]
    );
  });
});
