import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  foodAssistantTaskSchema,
  foodAssistantFoodDraftSchema,
  type FoodAssistantTask,
} from '@workspace/shared';
import type { PoolClient } from 'pg';
import * as service from '../services/foodAssistantLibraryService.js';
import * as tasks from '../models/foodAssistantRepository.js';
import * as library from '../models/foodAssistantLibraryRepository.js';
import foodRepository from '../models/foodRepository.js';
import { updateOwnedSnapshot } from '../utils/ownedSnapshotWriter.js';
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  mutateTask: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock('../models/foodAssistantLibraryRepository.js', async (original) => ({
  ...(await original<
    typeof import('../models/foodAssistantLibraryRepository.js')
  >()),
  readFoodLibrary: vi.fn(),
  deleteUnusedFood: vi.fn(),
  deleteUnusedVariant: vi.fn(),
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { createFoodWithClient: vi.fn(), createFoodVariant: vi.fn() },
}));
vi.mock('../utils/ownedSnapshotWriter.js', () => ({
  updateOwnedSnapshot: vi.fn(),
}));
const user = randomUUID(),
  id = randomUUID(),
  foodId = randomUUID(),
  variantId = randomUUID(),
  extraId = randomUUID(),
  op = randomUUID();
const client = { query: vi.fn() } as unknown as PoolClient;
const json = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));
async function published(input: unknown, text?: string) {
  return foodAssistantTaskSchema.parse(
    (await service.publishFood(user, id, input, text)).after_state
  );
}
async function undone(input: unknown, text?: string) {
  return foodAssistantTaskSchema.parse(
    (await service.undoFood(user, id, input, text)).after_state
  );
}
const reference = {
  serving_size: 1,
  serving_unit: 'slice',
  calories: 80,
  protein: 3,
  carbs: 15,
  fat: 1,
  sodium: null,
};
let current: FoodAssistantTask;
let stored: library.FoodLibrarySnapshot | null;
function task(food: unknown) {
  return foodAssistantTaskSchema.parse({
    id,
    user_id: user,
    kind: 'food',
    title: 'White bread',
    status: 'draft',
    checkpoint: { summary: 'Save label', food },
    version: 1,
    creation_hash: 'test',
    result: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
}
function existing() {
  return {
    food: {
      id: foodId,
      user_id: user,
      name: 'White bread',
      notes: 'Original notes',
      barcode: null,
      shared_with_public: false,
      provider_verified: true,
      updated_at: 'old',
    },
    variants: [
      {
        ...reference,
        id: variantId,
        food_id: foodId,
        is_default: true,
        source: 'imported',
        traces: ['sesame'],
        custom_nutrients: { caffeine: 0 },
      },
      {
        ...reference,
        id: extraId,
        food_id: foodId,
        serving_size: 100,
        serving_unit: 'g',
        calories: 260,
        carbs: 50,
        protein: 8,
        fat: 3,
        is_default: false,
        source: 'imported',
      },
    ],
  };
}
const command = {
  operation_id: op,
  expected_version: 1,
  source_quote: 'Label: 80 calories, 3 protein, 15 carbs, 1 fat per slice',
};
beforeEach(() => {
  vi.resetAllMocks();
  stored = null;
  current = task({ name: 'White bread', variants: [reference] });
  vi.mocked(tasks.getTask).mockImplementation(async () => current);
  vi.mocked(tasks.mutateTask).mockImplementation(
    async (_user, _command, fn) => {
      const before = json(current);
      const next = await fn(current, client);
      current = { ...next, version: current.version + 1 };
      return {
        id: _command.operationId,
        user_id: _user,
        task_id: _command.taskId,
        kind: _command.kind,
        request_hash: 'test',
        before_state: before,
        after_state: json(current),
        created_at: new Date(),
      };
    }
  );
  vi.mocked(library.readFoodLibrary).mockImplementation(
    async (_user, _id, _client, lock) =>
      lock && stored?.food.user_id !== user
        ? null
        : stored
          ? structuredClone(stored)
          : null
  );
  vi.mocked(updateOwnedSnapshot).mockImplementation(
    async (_client, table, _user, row) => {
      if (!stored) throw new Error('Missing fixture');
      if (table === 'foods') stored.food = { ...row, updated_at: 'new' };
      else
        stored.variants = stored.variants.map((value) =>
          value.id === row.id ? { ...row, updated_at: 'new' } : value
        );
    }
  );
  vi.mocked(foodRepository.createFoodWithClient).mockImplementation(
    async (_client, input) => {
      stored = library.foodLibrarySnapshotSchema.parse({
        food: { id: foodId, ...input, shared_with_public: false },
        variants: [
          { ...input, id: variantId, food_id: foodId, is_default: true },
        ],
      });
      return { id: foodId, default_variant: { id: variantId } };
    }
  );
  vi.mocked(foodRepository.createFoodVariant).mockImplementation(
    async (input) => {
      const row = z
        .record(z.string(), z.json())
        .parse(json({ ...input, id: extraId, is_default: false }));
      stored!.variants.push(row);
      return row;
    }
  );
  vi.mocked(library.deleteUnusedFood).mockImplementation(async () => {
    stored = null;
  });
  vi.mocked(library.deleteUnusedVariant).mockImplementation(
    async (_client, _user, _food, variant) => {
      stored!.variants = stored!.variants.filter((row) => row.id !== variant);
    }
  );
});
describe('food publication and verified readback', () => {
  it('creates a private label food with its explicit slice basis, null micronutrients and a receipt', async () => {
    const result = await published(command, command.source_quote);
    expect(result.status).toBe('complete');
    expect(result.result).toMatchObject({
      kind: 'food',
      food_id: foodId,
      before: null,
      after: {
        food: { shared_with_public: false, user_id: user },
        variants: [
          {
            serving_size: 1,
            serving_unit: 'slice',
            calories: 80,
            sodium: null,
            source: 'manual',
          },
        ],
      },
    });
    expect(foodRepository.createFoodWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        is_custom: true,
        shared_with_public: false,
        source: 'manual',
      })
    );
  });
  it('edits one serving while preserving other variants and original metadata, and clears stale provider verification', async () => {
    stored = existing();
    const before = structuredClone(stored);
    current = task({
      name: 'White bread',
      variants: [{ variant_id: variantId, calories: 90, carbs: 17 }],
    });
    await service.publishFood(
      user,
      id,
      {
        ...command,
        food_id: foodId,
        expected_fingerprint: service.foodLibraryFingerprint(before),
      },
      command.source_quote
    );
    expect(stored!.variants[0]).toMatchObject({
      calories: 90,
      protein: 3,
      sodium: null,
      traces: ['sesame'],
      custom_nutrients: { caffeine: 0 },
      source: 'manual',
    });
    expect(stored!.variants[1]).toEqual(before.variants[1]);
    expect(stored!.food).toMatchObject({
      notes: 'Original notes',
      provider_verified: false,
    });
  });
  it('does not require new nutrition or estimate acceptance for a notes-only edit', async () => {
    stored = existing();
    stored.variants[0]!.source = 'ai_estimate';
    current = task({ name: 'White bread', notes: 'New note', variants: [] });
    await service.publishFood(user, id, {
      operation_id: op,
      expected_version: 1,
      food_id: foodId,
      expected_fingerprint: service.foodLibraryFingerprint(stored),
    });
    expect(stored!.food).toMatchObject({
      notes: 'New note',
      provider_verified: true,
    });
    expect(stored!.variants[0]!.source).toBe('ai_estimate');
  });
  it('can change the default without rescaling or discarding another serving', async () => {
    stored = existing();
    current = task({
      name: 'White bread',
      variants: [{ variant_id: extraId }],
      default_variant_index: 0,
    });
    await service.publishFood(user, id, {
      operation_id: op,
      expected_version: 1,
      food_id: foodId,
      expected_fingerprint: service.foodLibraryFingerprint(stored),
    });
    expect(stored!.variants.map((row) => [row.id, row.is_default])).toEqual([
      [variantId, false],
      [extraId, true],
    ]);
    expect(stored!.variants[1]!.calories).toBe(260);
  });
  it.each([
    {
      name: 'White bread',
      variants: [
        { ...reference, calories: 2.5, protein: 0, carbs: 0.5, fat: 0 },
      ],
    },
    {
      name: 'White bread',
      variants: [{ serving_size: 100, serving_unit: 'g', calories: 260 }],
    },
    {
      name: 'White bread',
      variants: [{ ...reference, variant_id: randomUUID() }],
    },
  ])(
    'blocks implausible, incomplete and foreign-serving drafts before a write',
    async (food) => {
      current = task(food);
      await expect(
        service.publishFood(user, id, command, command.source_quote)
      ).rejects.toThrow(/implausible|incomplete|does not belong/);
      expect(foodRepository.createFoodWithClient).not.toHaveBeenCalled();
    }
  );
  it('requires verbatim evidence or explicitly accepted estimates', async () => {
    await expect(
      service.publishFood(user, id, command, 'Some other request')
    ).rejects.toThrow(/actual label/);
    current = task({
      name: 'White bread',
      variants: [{ ...reference, source: 'ai_estimate' }],
    });
    await expect(
      service.publishFood(user, id, command, command.source_quote)
    ).rejects.toThrow(/estimat/);
    const result = await published(
      { ...command, estimate_source_quote: 'Use an estimate' },
      'Use an estimate'
    );
    expect(result.status).toBe('complete');
  });
  it('blocks changed fingerprints and foods owned by someone else', async () => {
    stored = existing();
    await expect(
      service.publishFood(
        user,
        id,
        { ...command, food_id: foodId, expected_fingerprint: 'a'.repeat(64) },
        command.source_quote
      )
    ).rejects.toThrow(/changed/);
    stored.food.user_id = randomUUID();
    await expect(
      service.publishFood(
        user,
        id,
        {
          ...command,
          food_id: foodId,
          expected_fingerprint: service.foodLibraryFingerprint(stored),
        },
        command.source_quote
      )
    ).rejects.toThrow(/owned/);
    expect(updateOwnedSnapshot).not.toHaveBeenCalled();
  });
  it('rejects corrupted readback, including an untouched serving changed by the writer', async () => {
    stored = existing();
    current = task({ name: 'White bread', notes: 'New', variants: [] });
    vi.mocked(updateOwnedSnapshot).mockImplementation(async () => {
      stored!.variants[1]!.calories = 5;
    });
    await expect(
      service.publishFood(
        user,
        id,
        {
          ...command,
          food_id: foodId,
          expected_fingerprint: service.foodLibraryFingerprint(stored),
        },
        command.source_quote
      )
    ).rejects.toThrow(/did not match/);
    expect(current.status).toBe('draft');
  });
  it('previews all submitted serving values and identifies retained variants without a write', async () => {
    stored = existing();
    current = task({
      name: 'White bread',
      variants: [{ variant_id: variantId, calories: 90, carbs: 17 }],
    });
    const preview = await service.previewFood(user, id, foodId);
    expect(preview).toMatchObject({
      historical_diary_entries_changed: 0,
      preserved_variant_ids: [extraId],
      variants: [{ calories: 90, serving_unit: 'slice' }],
    });
    expect(updateOwnedSnapshot).not.toHaveBeenCalled();
  });
});
describe('food undo', () => {
  const undo = () => ({
    operation_id: randomUUID(),
    expected_version: current.version,
    publication_operation_id: op,
    source_quote: 'Undo that food change',
  });
  it('removes a newly created unused food and verifies absence', async () => {
    await service.publishFood(user, id, command, command.source_quote);
    const result = await undone(undo(), 'Undo that food change');
    expect(result.result).toMatchObject({ kind: 'food_undo', after: null });
    expect(library.deleteUnusedFood).toHaveBeenCalledWith(client, user, foodId);
  });
  it('restores all original variants, notes and source provenance after a correction', async () => {
    stored = existing();
    const before = structuredClone(stored);
    current = task({
      name: 'White bread',
      notes: 'Changed',
      variants: [{ variant_id: variantId, calories: 90, carbs: 17 }],
    });
    await service.publishFood(
      user,
      id,
      {
        ...command,
        food_id: foodId,
        expected_fingerprint: service.foodLibraryFingerprint(before),
      },
      command.source_quote
    );
    await service.undoFood(user, id, undo(), 'Undo that food change');
    expect(stored!.food).toMatchObject({
      notes: 'Original notes',
      provider_verified: true,
    });
    expect(stored!.variants[0]).toMatchObject({
      calories: 80,
      source: 'imported',
      traces: ['sesame'],
    });
  });
  it('changes and restores a default even when the new default sorts before the old one', async () => {
    stored = existing();
    stored.variants.reverse();
    const before = structuredClone(stored);
    current = task({
      name: 'White bread',
      variants: [{ variant_id: extraId }],
      default_variant_index: 0,
    });
    const write = vi.mocked(updateOwnedSnapshot).getMockImplementation()!;
    vi.mocked(updateOwnedSnapshot).mockImplementation(
      async (client, table, user, row, clock) => {
        if (
          table === 'food_variants' &&
          row.is_default === true &&
          stored!.variants.some(
            (other) => other.id !== row.id && other.is_default === true
          )
        )
          throw new Error('Two defaults would conflict');
        await write(client, table, user, row, clock);
      }
    );
    await service.publishFood(user, id, {
      operation_id: op,
      expected_version: 1,
      food_id: foodId,
      expected_fingerprint: service.foodLibraryFingerprint(before),
    });
    expect(stored!.variants.find((row) => row.id === extraId)?.is_default).toBe(
      true
    );
    await service.undoFood(user, id, undo(), 'Undo that food change');
    expect(
      stored!.variants.find((row) => row.id === variantId)?.is_default
    ).toBe(true);
  });
  it('refuses overwriting a newer edit or deleting a food now in use', async () => {
    await service.publishFood(user, id, command, command.source_quote);
    stored!.food.notes = 'Newer';
    await expect(
      service.undoFood(user, id, undo(), 'Undo that food change')
    ).rejects.toThrow(/newer/);
    expect(library.deleteUnusedFood).not.toHaveBeenCalled();
    delete stored!.food.notes;
    vi.mocked(library.deleteUnusedFood).mockRejectedValue(
      new tasks.FoodAssistantConflict('Food is now in use')
    );
    await expect(
      service.undoFood(user, id, undo(), 'Undo that food change')
    ).rejects.toThrow(/in use/);
  });
  it('requires the exact completed publication and an explicit current undo request', async () => {
    await service.publishFood(user, id, command, command.source_quote);
    await expect(
      service.undoFood(user, id, undo(), 'Other request')
    ).rejects.toThrow(/explicit current/);
    await expect(
      service.undoFood(
        user,
        id,
        { ...undo(), publication_operation_id: randomUUID() },
        'Undo that food change'
      )
    ).rejects.toThrow(/current completed/);
  });
});
it('rejects duplicate serving edits, unsafe nutrients and unselected defaults at the shared contract', () => {
  expect(
    foodAssistantFoodDraftSchema.safeParse({
      name: 'Bread',
      variants: [{ variant_id: variantId }, { variant_id: variantId }],
    }).success
  ).toBe(false);
  expect(
    foodAssistantFoodDraftSchema.safeParse({
      name: 'Bread',
      variants: [{ calories: -1 }],
    }).success
  ).toBe(false);
  expect(
    foodAssistantFoodDraftSchema.safeParse({
      name: 'Bread',
      variants: [],
      default_variant_index: 0,
    }).success
  ).toBe(false);
});
