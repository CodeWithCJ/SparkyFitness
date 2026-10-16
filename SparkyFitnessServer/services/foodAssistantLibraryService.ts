import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  publishFoodAssistantFoodSchema,
  undoFoodAssistantFoodSchema,
  sanitizeNotes,
  type FoodAssistantTask,
} from '@workspace/shared';
import * as tasks from '../models/foodAssistantRepository.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import * as library from '../models/foodAssistantLibraryRepository.js';
import type { FoodLibrarySnapshot } from '../models/foodAssistantLibraryRepository.js';
import foodRepository from '../models/foodRepository.js';
import { importProviderIngredient } from './foodAssistantRecipeService.js';
import { updateOwnedSnapshot } from '../utils/ownedSnapshotWriter.js';
import { canonicalJson } from '../utils/canonicalJson.js';
import { normalizeBarcode } from '../utils/foodUtils.js';
import {
  assertFoodEstimateAccepted,
  nutrientFields,
  validateNamedFoodReference,
} from '../utils/foodNutritionSnapshot.js';
import { nutrientNumber } from '../utils/foodPortionResolver.js';
const json = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));
const rowSchema = z.record(z.string(), z.json());
type Snapshot = z.infer<typeof rowSchema>;
export function foodLibraryFingerprint(value: FoodLibrarySnapshot) {
  return createHash('sha256')
    .update(
      canonicalJson({
        food: value.food,
        variants: [...value.variants].sort((a, b) =>
          String(a.id).localeCompare(String(b.id))
        ),
      })
    )
    .digest('hex');
}
export async function inspectFood(userId: string, foodId: string) {
  const value = await library.readFoodLibrary(userId, foodId);
  if (!value)
    throw new FoodAssistantConflict('Food not found or not accessible.');
  return { ...value, fingerprint: foodLibraryFingerprint(value) };
}
export async function importLibraryFood(
  userId: string,
  taskId: string,
  input: unknown
) {
  const task = await tasks.getTask(userId, taskId);
  if (task?.kind !== 'food')
    throw new FoodAssistantConflict(
      'Library imports require a food task. Use the ingredient import action for recipes, plans or diary tasks.'
    );
  return importProviderIngredient(userId, taskId, input);
}
function resolveDraft(
  task: FoodAssistantTask,
  before: FoodLibrarySnapshot | null
) {
  const draft = task.checkpoint.food;
  if (task.kind !== 'food' || !draft)
    throw new FoodAssistantConflict(
      'Save a food-library draft before publication.'
    );
  if (!before && !draft.variants.length)
    throw new FoodAssistantConflict(
      'A new food needs at least one complete serving reference.'
    );
  const variants = draft.variants.map((input) => {
    const old = input.variant_id
      ? before?.variants.find((row) => row.id === input.variant_id)
      : undefined;
    if (input.variant_id && !old)
      throw new FoodAssistantConflict(
        'The selected variant does not belong to this food. Inspect it again.'
      );
    const { variant_id: _id, ...patch } = input;
    const changesNutrition =
      !old ||
      Object.keys(patch).some((key) =>
        [
          ...nutrientFields,
          'serving_size',
          'serving_unit',
          'custom_nutrients',
          'glycemic_index',
          'abv_percent',
          'source',
          'allergens',
          'traces',
        ].includes(key)
      );
    const row = rowSchema.parse({
      ...old,
      ...patch,
      source:
        patch.source ??
        (changesNutrition ? 'manual' : (old?.source ?? 'manual')),
    });
    if (
      changesNutrition ||
      draft.default_variant_index !== undefined ||
      before?.food.name !== draft.name
    ) {
      const serving = z
        .object({
          serving_size: z.number().positive().finite(),
          serving_unit: z.string().min(1),
        })
        .safeParse(row);
      if (!serving.success)
        throw new FoodAssistantConflict(
          'Confirm the serving quantity and unit before saving.'
        );
      const issue = validateNamedFoodReference(draft.name, {
        ...serving.data,
        ...Object.fromEntries(
          nutrientFields.map((field) => [field, nutrientNumber(row[field])])
        ),
      });
      if (issue) throw new FoodAssistantConflict(issue);
      if (
        ['calories', 'protein', 'carbs', 'fat'].some(
          (field) => nutrientNumber(row[field]) === null
        )
      )
        throw new FoodAssistantConflict(
          'Core nutrition is incomplete. Verify the label or source before saving.'
        );
    }
    return { row, changesNutrition };
  });
  return { draft, variants };
}
function assertReadback(expected: Snapshot, actual: Snapshot) {
  if (
    Object.entries(expected).some(
      ([key, value]) =>
        !['created_at', 'updated_at'].includes(key) &&
        canonicalJson(actual[key] ?? null) !== canonicalJson(value ?? null)
    )
  )
    throw new FoodAssistantConflict(
      'Persisted food identity, serving or nutrition did not match. Nothing was committed.'
    );
}
export async function previewFood(
  userId: string,
  taskId: string,
  foodId?: string
) {
  const task = await tasks.getTask(userId, taskId);
  if (!task) throw new FoodAssistantConflict('Food task not found.');
  const before = foodId ? await library.readFoodLibrary(userId, foodId) : null;
  if (foodId && (!before || before.food.user_id !== userId))
    throw new FoodAssistantConflict(
      'That food is not owned by you. Copy its verified source into a new private food instead.'
    );
  const resolved = resolveDraft(task, before);
  return {
    food_id: foodId ?? null,
    expected_fingerprint: before ? foodLibraryFingerprint(before) : null,
    food: resolved.draft,
    variants: resolved.variants.map((value) => value.row),
    preserved_variant_ids:
      before?.variants
        .filter(
          (row) => !resolved.variants.some((value) => value.row.id === row.id)
        )
        .map((row) => row.id) ?? [],
    estimate_acceptance_required: resolved.variants.some(
      (value) => value.changesNutrition && value.row.source === 'ai_estimate'
    ),
    historical_diary_entries_changed: 0,
  };
}
export async function publishFood(
  userId: string,
  taskId: string,
  raw: unknown,
  currentText?: string
) {
  const input = publishFoodAssistantFoodSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'publish_food',
      request: input,
    },
    async (task, client) => {
      const before = input.food_id
        ? await library.readFoodLibrary(userId, input.food_id, client, true)
        : null;
      if (
        input.food_id &&
        (!before ||
          foodLibraryFingerprint(before) !== input.expected_fingerprint)
      )
        throw new FoodAssistantConflict(
          'The food or its serving variants changed or are not owned by you. Inspect them again.'
        );
      const resolved = resolveDraft(task, before);
      const estimated = resolved.variants.some(
        (value) => value.changesNutrition && value.row.source === 'ai_estimate'
      );
      assertFoodEstimateAccepted(
        estimated,
        input.estimate_source_quote,
        currentText
      );
      if (
        resolved.variants.some(
          (value) =>
            value.changesNutrition && value.row.source !== 'ai_estimate'
        ) &&
        !(input.source_quote && currentText?.includes(input.source_quote)) &&
        !task.checkpoint.evidence.some(
          (value) =>
            value.source === 'label' || (value.source === 'web' && value.url)
        )
      )
        throw new FoodAssistantConflict(
          'Record the actual label or source evidence, or quote the current user-provided nutrition values before saving.'
        );
      const {
        variants: _variants,
        default_variant_index: _default,
        ...metadata
      } = resolved.draft;
      const correctedSource =
        !!before &&
        (resolved.variants.some((value) => value.changesNutrition) ||
          ['name', 'brand', 'barcode'].some(
            (key) =>
              key in metadata &&
              canonicalJson(before.food[key] ?? null) !==
                canonicalJson(
                  (metadata as Record<string, unknown>)[key] ?? null
                )
          ));
      const values = rowSchema.parse({
        ...metadata,
        ...(correctedSource ? { provider_verified: false } : {}),
        ...('notes' in metadata
          ? { notes: sanitizeNotes(metadata.notes) ?? null }
          : {}),
        ...('barcode' in metadata
          ? {
              barcode: metadata.barcode
                ? normalizeBarcode(metadata.barcode)
                : null,
            }
          : {}),
      });
      let foodId = input.food_id;
      const written: Snapshot[] = [];
      if (!before) {
        const first = resolved.variants[0]!.row;
        const created = await foodRepository.createFoodWithClient(client, {
          ...first,
          ...values,
          name: resolved.draft.name,
          user_id: userId,
          is_custom: true,
          shared_with_public: false,
          serving_size: z.number().parse(first.serving_size),
          serving_unit: z.string().parse(first.serving_unit),
        });
        foodId = z.string().uuid().parse(created.id);
        written.push({
          ...first,
          id: z.string().uuid().parse(created.default_variant.id),
          food_id: foodId,
        });
      } else
        await updateOwnedSnapshot(
          client,
          'foods',
          userId,
          { ...before.food, ...values },
          true
        );
      for (const [index, value] of resolved.variants.entries()) {
        if (!before && index === 0) continue;
        if (value.row.id) {
          await updateOwnedSnapshot(
            client,
            'food_variants',
            userId,
            value.row,
            true
          );
          written.push(value.row);
        } else {
          const created = await foodRepository.createFoodVariant(
            {
              ...value.row,
              food_id: foodId!,
              serving_size: z.number().parse(value.row.serving_size),
              serving_unit: z.string().parse(value.row.serving_unit),
            },
            userId,
            client
          );
          written.push({
            ...value.row,
            id: z.string().uuid().parse(created.id),
            food_id: foodId!,
          });
        }
      }
      let after = await library.readFoodLibrary(userId, foodId!, client);
      if (!after)
        throw new FoodAssistantConflict('Saved food readback failed.');
      if (resolved.draft.default_variant_index !== undefined) {
        const selected = written[resolved.draft.default_variant_index];
        if (!selected)
          throw new FoodAssistantConflict(
            'The default serving reference could not be found.'
          );
        for (const row of [...after.variants].sort(
          (a, b) =>
            Number(b.is_default === true) - Number(a.is_default === true)
        ))
          if (row.is_default !== (row.id === selected.id))
            await updateOwnedSnapshot(
              client,
              'food_variants',
              userId,
              { ...row, is_default: row.id === selected.id },
              true
            );
        after = await library.readFoodLibrary(userId, foodId!, client);
        if (
          !after ||
          after.variants.filter((row) => row.is_default === true).length !==
            1 ||
          !after.variants.find((row) => row.id === selected.id)?.is_default
        )
          throw new FoodAssistantConflict('Default serving readback failed.');
      }
      assertReadback({ ...before?.food, ...values }, after.food);
      if (
        after.food.user_id !== userId ||
        (!before && after.food.shared_with_public !== false)
      )
        throw new FoodAssistantConflict(
          'Saved food owner or visibility did not match.'
        );
      for (const row of written) {
        const actual = after.variants.find((value) => value.id === row.id);
        if (!actual)
          throw new FoodAssistantConflict('Saved serving readback failed.');
        const expected = { ...row };
        delete expected.is_default;
        assertReadback(expected, actual);
      }
      const expectedIds = new Set([
        ...(before?.variants.map((row) => String(row.id)) ?? []),
        ...written.map((row) => String(row.id)),
      ]);
      if (
        after.variants.length !== expectedIds.size ||
        after.variants.some((row) => !expectedIds.has(String(row.id)))
      )
        throw new FoodAssistantConflict(
          'Saved serving identities did not match. Nothing was committed.'
        );
      for (const row of before?.variants ?? []) {
        if (written.some((value) => value.id === row.id)) continue;
        const expected = { ...row };
        if (resolved.draft.default_variant_index !== undefined)
          delete expected.is_default;
        assertReadback(
          expected,
          after.variants.find((value) => value.id === row.id)!
        );
      }
      return {
        ...task,
        status: 'complete',
        result: json({
          kind: 'food',
          publication_operation_id: input.operation_id,
          food_id: foodId,
          before,
          after,
          estimate_acceptance_quote: estimated
            ? input.estimate_source_quote
            : null,
        }),
      };
    }
  );
}
const publication = z.object({
  kind: z.enum(['food', 'food_import']),
  publication_operation_id: z.string().uuid(),
  food_id: z.string().uuid(),
  before: library.foodLibrarySnapshotSchema.nullable(),
  after: library.foodLibrarySnapshotSchema,
});
export async function undoFood(
  userId: string,
  taskId: string,
  raw: unknown,
  currentText?: string
) {
  const input = undoFoodAssistantFoodSchema.parse(raw);
  return tasks.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'undo_food',
      request: input,
      allowComplete: true,
    },
    async (task, client) => {
      if (
        !currentText?.includes(input.source_quote) ||
        !/\b(undo|revert|restore)\b/i.test(input.source_quote)
      )
        throw new FoodAssistantConflict(
          'Undo needs an explicit current user request.'
        );
      const saved = publication.safeParse(task.result);
      if (
        task.kind !== 'food' ||
        task.status !== 'complete' ||
        !saved.success ||
        saved.data.publication_operation_id !== input.publication_operation_id
      )
        throw new FoodAssistantConflict(
          'That publication is not the current completed food task.'
        );
      const value = saved.data,
        current = await library.readFoodLibrary(
          userId,
          value.food_id,
          client,
          true
        );
      if (
        !current ||
        foodLibraryFingerprint(current) !== foodLibraryFingerprint(value.after)
      )
        throw new FoodAssistantConflict(
          'The food or serving variants changed after publication. Undo would overwrite newer work.'
        );
      if (!value.before) {
        await library.deleteUnusedFood(client, userId, value.food_id);
        if (await library.readFoodLibrary(userId, value.food_id, client))
          throw new FoodAssistantConflict(
            'Food deletion readback failed. Nothing was committed.'
          );
      } else {
        for (const row of value.after.variants.filter(
          (row) => !value.before!.variants.some((old) => old.id === row.id)
        ))
          await library.deleteUnusedVariant(
            client,
            userId,
            value.food_id,
            z.string().uuid().parse(row.id)
          );
        await updateOwnedSnapshot(
          client,
          'foods',
          userId,
          value.before.food,
          true
        );
        for (const row of current.variants) {
          if (
            row.is_default === true &&
            value.before.variants.some(
              (old) => old.id === row.id && old.is_default !== true
            )
          )
            await updateOwnedSnapshot(
              client,
              'food_variants',
              userId,
              { ...row, is_default: false },
              true
            );
        }
        for (const row of value.before.variants)
          await updateOwnedSnapshot(client, 'food_variants', userId, row, true);
        const restored = await library.readFoodLibrary(
          userId,
          value.food_id,
          client
        );
        if (!restored)
          throw new FoodAssistantConflict('Restored food readback failed.');
        assertReadback(value.before.food, restored.food);
        if (value.before.variants.length !== restored.variants.length)
          throw new FoodAssistantConflict(
            'Restored serving count did not match.'
          );
        for (const row of value.before.variants) {
          const actual = restored.variants.find((other) => other.id === row.id);
          if (!actual)
            throw new FoodAssistantConflict(
              'Restored serving readback failed.'
            );
          assertReadback(row, actual);
        }
      }
      return {
        ...task,
        result: json({
          kind: 'food_undo',
          food_id: value.food_id,
          publication_operation_id: input.publication_operation_id,
          after: await library.readFoodLibrary(userId, value.food_id, client),
        }),
      };
    }
  );
}
