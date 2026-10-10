import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import {
  type FoodAssistantCheckpoint,
  publishFoodAssistantRecipeSchema,
  importFoodAssistantProviderFoodSchema,
  undoFoodAssistantRecipeSchema,
  createFoodAssistantTaskSchema,
} from '@workspace/shared';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import mealService from './mealService.js';
import * as taskRepository from '../models/foodAssistantRepository.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import {
  resolveFoodPortion,
  nutrientNumber,
  normalizePortionUnit,
} from '../utils/foodPortionResolver.js';
import type { MealFoodInput } from '../types/nutrition.js';
import { fetchProviderFoodDetails } from './foodProviderDetailService.js';
import { sanitizeGlycemicIndex } from '../models/food.js';

import {
  nutrientFields,
  type Nutrient,
  variantSchema,
  foodSchema,
  resolveFoodSelection,
  validateNamedFoodReference,
  assertFoodEstimateAccepted,
} from '../utils/foodNutritionSnapshot.js';

const providerVariantSchema = variantSchema.omit({ id: true, food_id: true });
const providerFoodSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  provider_external_id: z.union([z.string(), z.number()]).transform(String),
  variants: z.array(providerVariantSchema).optional(),
  default_variant: providerVariantSchema.optional(),
});

/** Source I/O happens before the transaction; only verified data enters it.
 * A committed retry returns its audit record even if the provider is offline. */
export async function importProviderIngredient(
  userId: string,
  taskId: string,
  rawInput: unknown
) {
  const input = importFoodAssistantProviderFoodSchema.parse(rawInput);
  const command = {
    taskId,
    operationId: input.operation_id,
    expectedVersion: input.expected_version,
    kind: 'import_recipe_ingredient',
    request: input,
  };
  const replay = await taskRepository.replayTaskMutation(userId, command);
  if (replay) return replay;
  const draft = await taskRepository.getTask(userId, taskId);
  const ingredient = draft?.checkpoint.ingredients.find(
    (row) => row.id === input.ingredient_id
  );
  if (
    !draft ||
    !['recipe', 'diary', 'meal_plan'].includes(draft.kind) ||
    !ingredient ||
    draft.version !== input.expected_version ||
    ['complete', 'cancelled'].includes(draft.status)
  )
    throw new FoodAssistantConflict(
      'Read the current food task before selecting an ingredient.'
    );
  if (ingredient.quantity === null || !ingredient.unit)
    throw new FoodAssistantConflict(
      'Confirm the ingredient quantity and unit before importing its nutrition.'
    );
  const details = await fetchProviderFoodDetails({
    credentialUserId: userId,
    dataUserId: userId,
    providerType: input.provider_type,
    externalId: input.external_id,
    providerId: input.provider_id,
  });
  const parsed = providerFoodSchema.safeParse(details);
  if (!parsed.success || parsed.data.provider_external_id !== input.external_id)
    throw new FoodAssistantConflict(
      'Full details for that exact provider item are unavailable. Nothing was imported.'
    );
  const source = parsed.data;
  const allVariants = source.variants?.length
    ? source.variants
    : source.default_variant
      ? [source.default_variant]
      : [];
  const candidates = input.serving_id
    ? allVariants.filter(
        (variant) => variant.provider_serving_id === input.serving_id
      )
    : allVariants;
  if (input.serving_id && !candidates.length)
    throw new FoodAssistantConflict(
      'The selected provider serving is no longer available. Inspect its full details again.'
    );
  const portion = resolveFoodPortion({
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    variants: candidates,
    preferredVariant: input.serving_id
      ? (candidates.find((variant) => variant.is_default) ?? candidates[0])
      : source.default_variant,
  });
  if (!portion.ok) throw new FoodAssistantConflict(portion.message);
  const issue = validateNamedFoodReference(source.name, portion.variant);
  const nutrients = Object.fromEntries(
    nutrientFields.map((field) => [
      field,
      nutrientNumber(portion.variant[field]),
    ])
  ) as Record<Nutrient, number | null>;
  const metadata = {
    custom_nutrients: portion.variant.custom_nutrients ?? {},
    glycemic_index: sanitizeGlycemicIndex(portion.variant.glycemic_index),
    allergens: portion.variant.allergens ?? null,
    traces: portion.variant.traces ?? null,
  };
  const metadataMatches = (variant: z.infer<typeof variantSchema>) =>
    (variant.glycemic_index ?? null) === metadata.glycemic_index &&
    JSON.stringify(Object.entries(variant.custom_nutrients ?? {}).sort()) ===
      JSON.stringify(Object.entries(metadata.custom_nutrients).sort()) &&
    JSON.stringify([...(variant.allergens ?? [])].sort()) ===
      JSON.stringify([...(metadata.allergens ?? [])].sort()) &&
    JSON.stringify([...(variant.traces ?? [])].sort()) ===
      JSON.stringify([...(metadata.traces ?? [])].sort());
  if (
    issue ||
    ['calories', 'protein', 'carbs', 'fat'].some(
      (field) => nutrients[field as Nutrient] === null
    )
  )
    throw new FoodAssistantConflict(
      `Provider nutrition needs verification: ${issue ?? 'core nutrition is incomplete'}. Nothing was imported.`
    );
  return taskRepository.mutateTask(userId, command, async (task, client) => {
    // Different task/request IDs selecting the same product must share a lock.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`food-provider:${userId}:${input.provider_type}:${input.external_id}`]
    );
    const existing = await foodRepository.findFoodByProviderExternalId(
      userId,
      input.external_id,
      input.provider_type,
      client
    );
    let selectedFood: z.infer<typeof foodSchema>;
    let selectedVariant: z.infer<typeof variantSchema>;
    if (existing) {
      selectedFood = foodSchema.parse(
        await foodRepository.getFoodById(existing.id, userId, client, true)
      );
      const matching = selectedFood.variants.find(
        (variant) =>
          variant.source === 'imported' &&
          metadataMatches(variant) &&
          nutrientNumber(variant.serving_size) ===
            nutrientNumber(portion.variant.serving_size) &&
          normalizePortionUnit(variant.serving_unit) ===
            normalizePortionUnit(portion.variant.serving_unit) &&
          nutrientFields.every(
            (field) => nutrientNumber(variant[field]) === nutrients[field]
          )
      );
      selectedVariant =
        matching ??
        variantSchema.parse(
          await foodRepository.createFoodVariant(
            {
              ...nutrients,
              ...metadata,
              food_id: selectedFood.id,
              serving_size: nutrientNumber(portion.variant.serving_size),
              serving_unit: portion.variant.serving_unit,
              source: 'imported',
              is_default: false,
            },
            userId,
            client
          )
        );
    } else {
      const created = await foodRepository.createFoodWithClient(client, {
        ...nutrients,
        ...metadata,
        user_id: userId,
        name: source.name,
        brand: source.brand ?? null,
        provider_type: input.provider_type,
        provider_external_id: input.external_id,
        provider_verified: true,
        is_custom: false,
        shared_with_public: false,
        serving_size: nutrientNumber(portion.variant.serving_size),
        serving_unit: portion.variant.serving_unit,
        source: 'imported',
      });
      selectedFood = foodSchema.parse(
        await foodRepository.getFoodById(created.id, userId, client, true)
      );
      selectedVariant = selectedFood.variants.find(
        (row) => row.id === created.default_variant.id
      )!;
    }
    if (
      !selectedVariant ||
      !metadataMatches(selectedVariant) ||
      nutrientFields.some(
        (field) => nutrientNumber(selectedVariant[field]) !== nutrients[field]
      ) ||
      nutrientNumber(selectedVariant.serving_size) !==
        nutrientNumber(portion.variant.serving_size) ||
      normalizePortionUnit(selectedVariant.serving_unit) !==
        normalizePortionUnit(portion.variant.serving_unit)
    )
      throw new FoodAssistantConflict(
        'Imported nutrition readback did not match the source. Nothing was saved.'
      );
    return {
      ...task,
      status: 'draft',
      checkpoint: {
        ...task.checkpoint,
        ingredients: task.checkpoint.ingredients.map((row) =>
          row.id !== ingredient.id
            ? row
            : {
                ...row,
                food_id: selectedFood.id,
                variant_id: selectedVariant.id,
                quantity: portion.quantity,
                unit: portion.unit,
                status: 'verified',
                issue: undefined,
                evidence: [
                  ...row.evidence,
                  {
                    source: 'provider',
                    title: source.name,
                    provider: input.provider_type,
                    external_id: input.external_id,
                    serving_id: portion.variant.provider_serving_id,
                    food_id: selectedFood.id,
                    variant_id: selectedVariant.id,
                  },
                ],
              }
        ),
      },
    };
  });
}
const mealSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable().optional(),
    serving_size: z.coerce.number().positive(),
    serving_unit: z.string(),
    total_servings: z.coerce.number().positive(),
    notes: z.string().nullable().optional(),
    is_public: z.boolean().nullable().optional(),
    images: z.array(z.string()).optional(),
    updated_at: z.coerce.date(),
    foods: z.array(
      z
        .object({
          id: z.string().uuid(),
          food_id: z.string().uuid().nullable(),
          variant_id: z.string().uuid().nullable(),
          food_name: z.string().nullable(),
          quantity: z.coerce.number().positive(),
          unit: z.string().nullable(),
          child_meal_id: z.string().uuid().nullable().optional(),
          child_meal_name: z.string().nullable().optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export async function getRecipe(
  userId: string,
  mealId: string,
  client?: PoolClient
) {
  const row = client
    ? await mealRepository.getMealById(mealId, userId, client, false)
    : await mealRepository.getMealById(mealId, userId);
  if (!row)
    throw new FoodAssistantConflict('Recipe not found or inaccessible.');
  return mealSchema.parse(row);
}

/** All variants are read with their food in one statement and copied to the
 * recipe snapshot. Read-only shared/public foods must not need UPDATE rights.
 */
export async function resolveRecipeCheckpoint(
  userId: string,
  checkpoint: FoodAssistantCheckpoint,
  client?: PoolClient
) {
  const ingredients: MealFoodInput[] = [];
  const issues: Array<{
    ingredient_id: string;
    description: string;
    message: string;
  }> = [];
  const known = Object.fromEntries(
    nutrientFields.map((field) => [field, 0])
  ) as Record<Nutrient, number>;
  const missing = new Set<Nutrient>();
  const foods = new Map<string, z.infer<typeof foodSchema>>();
  const estimatedIngredients: string[] = [];
  for (const ingredient of checkpoint.ingredients) {
    if (
      !ingredient.food_id ||
      ingredient.quantity === null ||
      !ingredient.unit ||
      ingredient.status === 'unresolved'
    ) {
      issues.push({
        ingredient_id: ingredient.id,
        description: ingredient.description,
        message:
          ingredient.issue ??
          'Resolve this ingredient and its quantity/unit before saving.',
      });
      continue;
    }
    let food = foods.get(ingredient.food_id);
    if (!food) {
      const row = await foodRepository.getFoodById(
        ingredient.food_id,
        userId,
        client,
        true
      );
      if (!row) {
        issues.push({
          ingredient_id: ingredient.id,
          description: ingredient.description,
          message: 'Selected food is no longer accessible.',
        });
        continue;
      }
      food = foodSchema.parse(row);
      foods.set(food.id, food);
    }
    const resolved = resolveFoodSelection(food, {
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      variant_id: ingredient.variant_id,
    });
    if (!resolved.ok) {
      issues.push({
        ingredient_id: ingredient.id,
        description: ingredient.description,
        message: resolved.message,
      });
      continue;
    }
    const snapshot = resolved.snapshot;
    const reference = snapshot.serving_size;
    if (resolved.estimated) estimatedIngredients.push(ingredient.description);
    ingredients.push({ ...snapshot, item_type: 'food' });
    for (const field of nutrientFields) {
      if (snapshot[field] === null) missing.add(field);
      else known[field] += (snapshot[field]! * snapshot.quantity) / reference;
    }
  }
  if (!checkpoint.recipe?.servings)
    issues.push({
      ingredient_id: '',
      description: checkpoint.recipe?.name ?? 'Recipe',
      message: 'The recipe yield needs a confirmed number of servings.',
    });
  if (!checkpoint.ingredients.length)
    issues.push({
      ingredient_id: '',
      description: 'Recipe',
      message: 'A recipe needs at least one ingredient.',
    });
  const batch = Object.fromEntries(
    nutrientFields.map((field) => [
      field,
      issues.length || missing.has(field) ? null : known[field],
    ])
  ) as Record<Nutrient, number | null>;
  const servings = checkpoint.recipe?.servings;
  const perServing = Object.fromEntries(
    nutrientFields.map((field) => [
      field,
      servings && batch[field] !== null ? batch[field]! / servings : null,
    ])
  );
  return {
    ingredients,
    issues,
    nutrition: {
      incomplete: issues.length > 0,
      batch,
      per_serving: perServing,
      known_subtotal: known,
      missing_fields: [...missing],
      estimated_ingredients: estimatedIngredients,
    },
  };
}

export async function previewRecipe(userId: string, taskId: string) {
  const task = await taskRepository.getTask(userId, taskId);
  if (!task || task.kind !== 'recipe')
    throw new FoodAssistantConflict('Recipe task not found.');
  const resolved = await resolveRecipeCheckpoint(userId, task.checkpoint);
  return {
    task_id: task.id,
    version: task.version,
    name: task.checkpoint.recipe?.name,
    ...resolved,
  };
}

export async function publishRecipe(
  userId: string,
  taskId: string,
  rawInput: unknown,
  latestUserText?: string
) {
  const input = publishFoodAssistantRecipeSchema.parse(rawInput);
  return taskRepository.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'publish_recipe',
      request: input,
    },
    async (task, client) => {
      if (task.kind !== 'recipe' || !task.checkpoint.recipe)
        throw new FoodAssistantConflict('This is not a recipe draft.');
      const resolved = await resolveRecipeCheckpoint(
        userId,
        task.checkpoint,
        client
      );
      assertFoodEstimateAccepted(
        resolved.nutrition.estimated_ingredients.length > 0,
        input.estimate_source_quote,
        latestUserText
      );
      if (resolved.issues.length)
        throw new FoodAssistantConflict(
          `Recipe remains incomplete: ${resolved.issues.map((issue) => `${issue.description}: ${issue.message}`).join(' ')} Nothing was published.`
        );
      let before: z.infer<typeof mealSchema> | null = null;
      if (input.meal_id) {
        const current = await mealRepository.getMealById(
          input.meal_id,
          userId,
          client
        );
        if (!current)
          throw new FoodAssistantConflict('Recipe not found or not editable.');
        before = mealSchema.parse(current);
        if (
          before.user_id !== userId ||
          before.updated_at.toISOString() !== input.expected_meal_updated_at
        )
          throw new FoodAssistantConflict(
            'The recipe changed or belongs to another person. Read it again before editing.'
          );
      }
      const recipe = task.checkpoint.recipe;
      const notes =
        [
          recipe.instructions,
          recipe.source_url ? `Source: ${recipe.source_url}` : undefined,
        ]
          .filter(Boolean)
          .join('\n\n') || null;
      const payload = {
        user_id: userId,
        name: recipe.name,
        serving_size: before?.serving_size ?? 1,
        serving_unit: before?.serving_unit ?? 'serving',
        total_servings: recipe.servings!,
        notes,
        foods: resolved.ingredients.map((ingredient) => ({
          ...ingredient,
          item_type: 'food' as const,
          child_meal_id: undefined,
          food_id: ingredient.food_id!,
          variant_id: ingredient.variant_id!,
          quantity: Number(ingredient.quantity),
          unit: ingredient.unit!,
        })),
      };
      const saved = before
        ? await mealRepository.updateMeal(before.id, userId, payload, client)
        : await mealService.createMeal(
            userId,
            { ...payload, is_public: false },
            client
          );
      const afterRow = await mealRepository.getMealById(
        saved.id,
        userId,
        client
      );
      const after = mealSchema.parse(afterRow);
      const unmatched = [...after.foods];
      const persistedIngredientsMatch = resolved.ingredients.every(
        (expected) => {
          const index = unmatched.findIndex(
            (row) =>
              row.food_id === expected.food_id &&
              row.variant_id === expected.variant_id &&
              row.quantity === expected.quantity &&
              row.unit === expected.unit &&
              nutrientNumber(row.serving_size) ===
                nutrientNumber(expected.serving_size) &&
              row.serving_unit === expected.serving_unit &&
              nutrientFields.every(
                (field) =>
                  nutrientNumber(row[field]) === nutrientNumber(expected[field])
              )
          );
          if (index < 0) return false;
          unmatched.splice(index, 1);
          return true;
        }
      );
      if (
        after.foods.length !== resolved.ingredients.length ||
        after.name !== recipe.name ||
        after.total_servings !== recipe.servings ||
        after.serving_size !== payload.serving_size ||
        after.serving_unit !== payload.serving_unit ||
        !persistedIngredientsMatch
      )
        throw new FoodAssistantConflict(
          'Saved recipe readback did not match the requested recipe.'
        );
      const result = z.json().parse(
        JSON.parse(
          JSON.stringify({
            kind: 'recipe',
            publication_operation_id: input.operation_id,
            meal_id: after.id,
            before,
            after,
            nutrition: resolved.nutrition,
            estimate_acceptance_quote: resolved.nutrition.estimated_ingredients
              .length
              ? input.estimate_source_quote
              : null,
          })
        )
      );
      return { ...task, status: 'complete', result };
    }
  );
}

const publicationSchema = z.object({
  kind: z.literal('recipe'),
  publication_operation_id: z.string().uuid(),
  before: mealSchema.nullable(),
  after: mealSchema,
});

/** Keep metadata and a multiset of ingredient snapshots in the fingerprint.
 * Row IDs and insert order change when a recipe is restored. */
function recipeFingerprint(meal: z.infer<typeof mealSchema>) {
  const foods = meal.foods
    .map((row) =>
      JSON.stringify({
        food_id: row.food_id,
        variant_id: row.variant_id,
        child_meal_id: row.child_meal_id ?? null,
        quantity: row.quantity,
        unit: row.unit,
        serving_size: nutrientNumber(row.serving_size),
        serving_unit: row.serving_unit ?? null,
        nutrients: nutrientFields.map((field) => nutrientNumber(row[field])),
        glycemic_index: row.glycemic_index ?? null,
        custom_nutrients: row.custom_nutrients ?? null,
      })
    )
    .sort();
  return JSON.stringify({
    id: meal.id,
    user_id: meal.user_id,
    name: meal.name,
    description: meal.description ?? null,
    notes: meal.notes ?? null,
    images: meal.images ?? [],
    is_public: meal.is_public ?? false,
    serving_size: meal.serving_size,
    serving_unit: meal.serving_unit,
    total_servings: meal.total_servings,
    foods,
  });
}

export async function undoRecipe(
  userId: string,
  taskId: string,
  rawInput: unknown,
  latestUserText?: string
) {
  const input = undoFoodAssistantRecipeSchema.parse(rawInput);
  return taskRepository.mutateTask(
    userId,
    {
      taskId,
      operationId: input.operation_id,
      expectedVersion: input.expected_version,
      kind: 'undo_recipe',
      request: input,
      allowComplete: true,
    },
    async (task, client) => {
      if (
        !latestUserText?.includes(input.source_quote) ||
        !/\b(undo|revert|restore)\b/i.test(input.source_quote)
      )
        throw new FoodAssistantConflict(
          'Undo needs an explicit request in the current user message.'
        );
      const publication = publicationSchema.safeParse(task.result);
      if (
        task.kind !== 'recipe' ||
        task.status !== 'complete' ||
        !publication.success ||
        publication.data.publication_operation_id !==
          input.publication_operation_id
      )
        throw new FoodAssistantConflict(
          'That publication is not the current completed recipe task.'
        );
      const { before, after } = publication.data;
      const current = mealSchema.parse(
        await mealRepository.getMealById(after.id, userId, client)
      );
      if (
        current.user_id !== userId ||
        current.updated_at.getTime() !== after.updated_at.getTime() ||
        recipeFingerprint(current) !== recipeFingerprint(after)
      )
        throw new FoodAssistantConflict(
          'The recipe changed after publication. Undo would overwrite newer work.'
        );
      let restored: z.infer<typeof mealSchema> | null = null;
      if (before) {
        await mealRepository.updateMeal(
          before.id,
          userId,
          {
            name: before.name,
            description: before.description,
            notes: before.notes,
            images: before.images,
            is_public: before.is_public,
            serving_size: before.serving_size,
            serving_unit: before.serving_unit,
            total_servings: before.total_servings,
            foods: before.foods.map((row) => ({
              ...Object.fromEntries(
                nutrientFields.map((field) => [
                  field,
                  nutrientNumber(row[field]),
                ])
              ),
              food_id: row.food_id,
              variant_id: row.variant_id,
              child_meal_id: row.child_meal_id,
              item_type: row.child_meal_id
                ? ('meal' as const)
                : ('food' as const),
              quantity: row.quantity,
              unit: row.unit,
              serving_size: nutrientNumber(row.serving_size),
              serving_unit:
                typeof row.serving_unit === 'string' ? row.serving_unit : null,
              glycemic_index:
                typeof row.glycemic_index === 'string'
                  ? row.glycemic_index
                  : null,
              custom_nutrients: z
                .record(z.string(), z.unknown())
                .nullable()
                .optional()
                .parse(row.custom_nutrients),
            })),
          },
          client
        );
        restored = mealSchema.parse(
          await mealRepository.getMealById(before.id, userId, client)
        );
        if (recipeFingerprint(restored) !== recipeFingerprint(before))
          throw new FoodAssistantConflict(
            'Restored recipe readback did not match its previous state.'
          );
      } else {
        if (await mealRepository.recipeHasDependants(client, current.id))
          throw new FoodAssistantConflict(
            'This recipe is now used by a diary entry, plan, recipe or favorite. Remove that use explicitly before undoing its creation.'
          );
        if (
          !(await mealRepository.deleteMeal(current.id, userId, client)) ||
          (await mealRepository.getMealById(current.id, userId, client))
        )
          throw new FoodAssistantConflict('Recipe deletion readback failed.');
      }
      return {
        ...task,
        result: z.json().parse(
          JSON.parse(
            JSON.stringify({
              kind: 'recipe_undo',
              publication_operation_id: input.publication_operation_id,
              meal_id: current.id,
              before: current,
              after: restored,
            })
          )
        ),
      };
    }
  );
}

export async function draftFromRecipe(
  userId: string,
  mealId: string,
  requestId: string
) {
  const existing = await taskRepository.getTask(userId, requestId);
  if (existing) {
    if (
      existing.origin.type !== 'saved_recipe' ||
      existing.origin.meal_id !== mealId
    )
      throw new FoodAssistantConflict(
        'This request ID belongs to different work.'
      );
    return existing;
  }
  const meal = await getRecipe(userId, mealId);
  const ingredients = meal.foods.map((food) => ({
    id: food.id,
    description:
      food.food_name ?? food.child_meal_name ?? 'Unlinked ingredient',
    food_id: food.child_meal_id ? undefined : (food.food_id ?? undefined),
    variant_id: food.variant_id ?? undefined,
    quantity: food.quantity,
    unit: food.unit,
    status:
      food.food_id && !food.child_meal_id && food.unit
        ? ('selected' as const)
        : ('unresolved' as const),
    issue: food.child_meal_id
      ? 'This ingredient is a linked recipe. Resolve its component foods before publishing this draft.'
      : undefined,
    evidence: [],
  }));
  const input = createFoodAssistantTaskSchema.parse({
    id: requestId,
    kind: 'recipe',
    title: meal.name,
    checkpoint: {
      summary: `Editing recipe ${meal.id}, last updated ${meal.updated_at.toISOString()}.`,
      selected_ids: [meal.id],
      ingredients,
      recipe: {
        name: meal.name,
        servings: meal.total_servings,
        instructions: meal.notes ?? undefined,
      },
    },
    origin: { type: 'saved_recipe', meal_id: mealId },
  });
  return taskRepository.createTask(userId, input);
}

export async function draftFromSource(
  userId: string,
  source: {
    name: string;
    ingredients: string[];
    yield: string | number | string[] | null;
    instructions: string;
  },
  sourceUrl: string,
  requestId: string,
  requestedUrl = sourceUrl,
  cardIndex = 0
) {
  const input = createFoodAssistantTaskSchema.parse({
    id: requestId,
    kind: 'recipe',
    title: source.name,
    checkpoint: {
      summary:
        'Original recipe imported. Ingredient matches, portions and yield still need verification.',
      next_step:
        'Look up each ingredient, retain every unresolved row, and confirm the number of servings.',
      ingredients: source.ingredients.map((description, index) => ({
        id: uuidv5(`${index}:${description}`, requestId),
        description,
        status: 'unresolved',
      })),
      recipe: {
        name: source.name,
        servings: null,
        source_yield: String(source.yield ?? ''),
        instructions: source.instructions,
        source_url: sourceUrl,
      },
      evidence: [{ source: 'recipe', title: source.name, url: sourceUrl }],
    },
    origin: { type: 'recipe_url', url: requestedUrl, card_index: cardIndex },
  });
  return taskRepository.createTask(userId, input);
}
