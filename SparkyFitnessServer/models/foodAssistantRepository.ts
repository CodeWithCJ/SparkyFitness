import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  foodAssistantPreferenceSchema,
  foodAssistantTaskSchema,
  foodAssistantOperationSchema,
  type CreateFoodAssistantTask,
  type FoodAssistantTask,
  type FoodAssistantOperation,
  type RememberFoodAssistantPreference,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';

export class FoodAssistantConflict extends Error {
  constructor(
    message = 'This item changed. Read the latest version before trying again.'
  ) {
    super(message);
  }
}

import { canonicalJson } from '../utils/canonicalJson.js';

export async function listPreferences(userId: string) {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'SELECT * FROM food_assistant_preferences WHERE user_id = $1 ORDER BY key',
      [userId]
    );
    return result.rows.map((row: unknown) =>
      foodAssistantPreferenceSchema.parse(row)
    );
  } finally {
    client.release();
  }
}

export async function rememberPreference(
  userId: string,
  input: RememberFoodAssistantPreference
) {
  const client = await getClient(userId, userId);
  try {
    const result =
      input.expected_version === 0
        ? await client.query(
            `INSERT INTO food_assistant_preferences(user_id, key, value, source_quote)
          VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, key) DO NOTHING RETURNING *`,
            [userId, input.key, input.value, input.source_quote]
          )
        : await client.query(
            `UPDATE food_assistant_preferences SET value = $3, source_quote = $4, version = version + 1, updated_at = now()
          WHERE user_id = $1 AND key = $2 AND version = $5 RETURNING *`,
            [
              userId,
              input.key,
              input.value,
              input.source_quote,
              input.expected_version,
            ]
          );
    if (!result.rows[0]) throw new FoodAssistantConflict();
    return foodAssistantPreferenceSchema.parse(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function forgetPreference(
  userId: string,
  key: string,
  version: number
) {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'DELETE FROM food_assistant_preferences WHERE user_id = $1 AND key = $2 AND version = $3 RETURNING key',
      [userId, key, version]
    );
    if (!result.rows[0]) throw new FoodAssistantConflict();
  } finally {
    client.release();
  }
}

export async function listTasks(userId: string) {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'SELECT * FROM food_assistant_tasks WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100',
      [userId]
    );
    return result.rows.map((row: unknown) =>
      foodAssistantTaskSchema.parse(row)
    );
  } finally {
    client.release();
  }
}

export async function getTask(userId: string, taskId: string) {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'SELECT * FROM food_assistant_tasks WHERE user_id = $1 AND id = $2',
      [userId, taskId]
    );
    return result.rows[0]
      ? foodAssistantTaskSchema.parse(result.rows[0])
      : null;
  } finally {
    client.release();
  }
}

export async function createTask(
  userId: string,
  input: CreateFoodAssistantTask
) {
  const client = await getClient(userId, userId);
  const creationHash = createHash('sha256')
    // Preserve the original creation fingerprint for tasks made before origin
    // metadata was introduced. Structured imports include their source identity.
    .update(
      canonicalJson(
        input.origin.type === 'user_draft'
          ? {
              id: input.id,
              kind: input.kind,
              title: input.title,
              checkpoint: input.checkpoint,
            }
          : input
      )
    )
    .digest('hex');
  try {
    const result = await client.query(
      `INSERT INTO food_assistant_tasks(id, user_id, kind, title, checkpoint, creation_hash, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING *`,
      [
        input.id,
        userId,
        input.kind,
        input.title,
        JSON.stringify(input.checkpoint),
        creationHash,
        JSON.stringify(input.origin),
      ]
    );
    if (result.rows[0]) return foodAssistantTaskSchema.parse(result.rows[0]);
    const existing = await client.query(
      'SELECT * FROM food_assistant_tasks WHERE id = $1 AND user_id = $2',
      [input.id, userId]
    );
    const task = existing.rows[0]
      ? foodAssistantTaskSchema.parse(existing.rows[0])
      : null;
    if (!task || task.creation_hash !== creationHash) {
      throw new FoodAssistantConflict(
        'That request ID belongs to different work. Use a new ID for a different request.'
      );
    }
    return task;
  } finally {
    client.release();
  }
}

export async function listOperations(userId: string, taskId: string) {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'SELECT * FROM food_assistant_operations WHERE user_id = $1 AND task_id = $2 ORDER BY created_at, id',
      [userId, taskId]
    );
    return result.rows.map((row: unknown) =>
      foodAssistantOperationSchema.parse(row)
    );
  } finally {
    client.release();
  }
}

interface TaskMutation {
  allowComplete?: boolean;
  taskId: string;
  operationId: string;
  expectedVersion: number;
  kind: string;
  request: unknown;
}

function mutationHash(command: TaskMutation): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        taskId: command.taskId,
        kind: command.kind,
        request: command.request,
      })
    )
    .digest('hex');
}

/** Check committed work before repeating an external lookup. mutateTask also
 * checks under its lock, so concurrent callers still commit at most once. */
export async function replayTaskMutation(
  userId: string,
  command: TaskMutation
) {
  const client = await getClient(userId, userId);
  try {
    const result = await client.query(
      'SELECT * FROM food_assistant_operations WHERE user_id = $1 AND id = $2',
      [userId, command.operationId]
    );
    if (!result.rows[0]) return null;
    const saved = foodAssistantOperationSchema.parse(result.rows[0]);
    if (saved.request_hash !== mutationHash(command))
      throw new FoodAssistantConflict(
        'This operation ID was already used for a different request.'
      );
    return saved;
  } finally {
    client.release();
  }
}

/**
 * The callback shares the task lock and transaction. Domain writes must use
 * this client, so cancellation, audit recording and the result commit together.
 * A committed retry returns the saved result without re-running its callback.
 */
export async function mutateTask(
  userId: string,
  command: TaskMutation,
  mutate: (
    task: FoodAssistantTask,
    client: PoolClient
  ) => Promise<FoodAssistantTask>
): Promise<FoodAssistantOperation> {
  const client = await getClient(userId, userId);
  const requestHash = mutationHash(command);
  try {
    await client.query('BEGIN');
    // Operation locks serialize the same key even when it targets two tasks.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`food-assistant:${userId}:${command.operationId}`]
    );
    const prior = await client.query(
      'SELECT * FROM food_assistant_operations WHERE user_id = $1 AND id = $2',
      [userId, command.operationId]
    );
    if (prior.rows[0]) {
      const saved = foodAssistantOperationSchema.parse(prior.rows[0]);
      if (saved.request_hash !== requestHash)
        throw new FoodAssistantConflict(
          'This operation ID was already used for a different request.'
        );
      await client.query('COMMIT');
      return saved;
    }
    const current = await client.query(
      'SELECT * FROM food_assistant_tasks WHERE user_id = $1 AND id = $2 FOR UPDATE',
      [userId, command.taskId]
    );
    if (!current.rows[0]) throw new FoodAssistantConflict('Task not found.');
    const task = foodAssistantTaskSchema.parse(current.rows[0]);
    if (task.version !== command.expectedVersion)
      throw new FoodAssistantConflict();
    if (
      (task.status === 'complete' && !command.allowComplete) ||
      task.status === 'cancelled'
    )
      throw new FoodAssistantConflict(
        'This task has finished or was cancelled. Start a new task.'
      );
    const next = foodAssistantTaskSchema.parse(await mutate(task, client));
    if (
      next.id !== task.id ||
      next.user_id !== userId ||
      next.kind !== task.kind ||
      next.creation_hash !== task.creation_hash ||
      canonicalJson(next.origin) !== canonicalJson(task.origin) ||
      next.version !== task.version
    )
      throw new FoodAssistantConflict('Invalid task transition.');
    if (next.status === 'complete' && next.result === null)
      throw new FoodAssistantConflict(
        'A completed task requires a persisted result.'
      );
    const updated = await client.query(
      `UPDATE food_assistant_tasks SET status = $3, checkpoint = $4, result = $5,
       version = version + 1, updated_at = now() WHERE user_id = $1 AND id = $2 RETURNING *`,
      [
        userId,
        task.id,
        next.status,
        JSON.stringify(next.checkpoint),
        next.result === null ? null : JSON.stringify(next.result),
      ]
    );
    const after = foodAssistantTaskSchema.parse(updated.rows[0]);
    const operation = await client.query(
      `INSERT INTO food_assistant_operations(id, user_id, task_id, kind, request_hash, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        command.operationId,
        userId,
        task.id,
        command.kind,
        requestHash,
        JSON.stringify(task),
        JSON.stringify(after),
      ]
    );
    const saved = foodAssistantOperationSchema.parse(operation.rows[0]);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
