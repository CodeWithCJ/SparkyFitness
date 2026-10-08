import { z } from 'zod';
import type { PoolClient } from 'pg';
import { nutrientNumber, resolveFoodPortion } from './foodPortionResolver.js';
import {
  nutrientFields,
  validateNamedFoodReference,
} from './foodNutritionSnapshot.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import mealRepository from '../models/mealRepository.js';
import type { DiarySnapshot } from '../models/foodAssistantDiaryRepository.js';

const componentSchema = z
  .object({
    id: z.string().uuid(),
    food_id: z.string().uuid().nullable(),
    variant_id: z.string().uuid().nullable(),
    child_meal_id: z.string().uuid().nullable().optional(),
    item_type: z.string().optional(),
    quantity: z.coerce.number().positive().finite(),
    unit: z.string().nullable(),
    food_name: z.string().nullable(),
    brand: z.string().nullable().optional(),
  })
  .passthrough();
const mealSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    user_id: z.string().uuid(),
    serving_size: z.coerce.number().positive().finite(),
    serving_unit: z.string(),
    total_servings: z.coerce.number().positive().finite(),
    updated_at: z.coerce.date(),
    description: z.string().nullable().optional(),
    images: z.array(z.string()).optional(),
    foods: z.array(componentSchema).min(1).max(100),
  })
  .passthrough();

/** Expand every nested component, with no silent depth/cycle truncation and
 * no missing-nutrient zeros. Each leaf retains its saved nutrient reference. */
export async function expandSavedMeal(
  userId: string,
  selection: {
    meal_id: string;
    quantity: number;
    unit: string;
    expected_updated_at?: string;
  },
  client?: PoolClient
) {
  const references = new Map<string, z.infer<typeof mealSchema>>();
  const leaves: DiarySnapshot[] = [];
  const estimated: string[] = [];
  const load = async (id: string) => {
    const cached = references.get(id);
    if (cached) return cached;
    const raw = await mealRepository.getMealById(id, userId, client, false);
    if (!raw)
      throw new FoodAssistantConflict(
        'A linked recipe is missing or inaccessible. Resolve every ingredient before continuing.'
      );
    const meal = mealSchema.parse(raw);
    references.set(id, meal);
    return meal;
  };
  const root = await load(selection.meal_id);
  const rootPortion = resolveFoodPortion({
    quantity: selection.quantity,
    unit: selection.unit,
    variants: [root],
    explicitVariant: root,
  });
  if (!rootPortion.ok) throw new FoodAssistantConflict(rootPortion.message);
  if (
    selection.expected_updated_at &&
    root.updated_at.toISOString() !== selection.expected_updated_at
  )
    throw new FoodAssistantConflict(
      'The selected recipe changed. Read its current version before continuing.'
    );
  const walk = async (
    meal: z.infer<typeof mealSchema>,
    quantity: number,
    unit: string,
    multiplier: number,
    path: string[]
  ) => {
    if (path.includes(meal.id) || path.length >= 8)
      throw new FoodAssistantConflict(
        'The recipe contains a cycle or excessive nesting. No partial meal was saved.'
      );
    const portion = resolveFoodPortion({
      quantity,
      unit,
      variants: [meal],
      explicitVariant: meal,
    });
    if (!portion.ok) throw new FoodAssistantConflict(portion.message);
    const factor =
      (multiplier * portion.quantity) /
      (meal.serving_size * meal.total_servings);
    if (!Number.isFinite(factor) || factor <= 0)
      throw new FoodAssistantConflict(
        'The recipe portion needs clarification.'
      );
    for (const component of meal.foods) {
      if (!component.unit)
        throw new FoodAssistantConflict(
          'A recipe component has no confirmed unit.'
        );
      if (component.item_type === 'meal' || component.child_meal_id) {
        if (!component.child_meal_id)
          throw new FoodAssistantConflict(
            'A linked recipe was deleted. Resolve its components first.'
          );
        await walk(
          await load(component.child_meal_id),
          component.quantity,
          component.unit,
          factor,
          [...path, meal.id]
        );
        continue;
      }
      const name = component.food_name;
      if (!name)
        throw new FoodAssistantConflict(
          'A recipe ingredient no longer has a readable food identity.'
        );
      if (component.nutrition_source === 'ai_estimate') estimated.push(name);
      const stored = z
        .record(z.string(), z.unknown())
        .safeParse(component.nutrition_snapshot);
      // A recorded reference is authoritative, including deliberate unknowns.
      // Legacy rows with no recorded serving basis may use the live variant.
      const nutrition =
        stored.success &&
        nutrientNumber(stored.data.serving_size) !== null &&
        typeof stored.data.serving_unit === 'string'
          ? stored.data
          : component;
      const reference = {
        serving_size: nutrientNumber(nutrition.serving_size),
        serving_unit:
          typeof nutrition.serving_unit === 'string'
            ? nutrition.serving_unit
            : null,
        ...Object.fromEntries(
          nutrientFields.map((field) => [
            field,
            nutrientNumber(nutrition[field]),
          ])
        ),
      };
      const issue = validateNamedFoodReference(name, reference);
      const resolved = resolveFoodPortion({
        quantity: component.quantity * factor,
        unit: component.unit,
        variants: [reference],
        explicitVariant: reference,
      });
      if (
        issue ||
        !resolved.ok ||
        ['calories', 'protein', 'carbs', 'fat'].some(
          (field) => nutrientNumber(nutrition[field]) === null
        )
      )
        throw new FoodAssistantConflict(
          issue ??
            (!resolved.ok
              ? resolved.message
              : `Core nutrition for ${name} is incomplete.`)
        );
      if (leaves.length >= 100)
        throw new FoodAssistantConflict(
          'The expanded recipe has too many components. Split it into smaller meals.'
        );
      leaves.push(
        z.record(z.string(), z.json()).parse({
          ...reference,
          food_id: component.food_id,
          variant_id: component.variant_id,
          food_name: name,
          brand_name: component.brand ?? null,
          quantity: resolved.quantity,
          unit: resolved.unit,
          custom_nutrients: nutrition.custom_nutrients ?? {},
          glycemic_index: nutrition.glycemic_index ?? null,
          allergens: component.allergens ?? null,
          traces: component.traces ?? null,
          images: component.images ?? [],
        })
      );
    }
  };
  await walk(root, selection.quantity, selection.unit, 1, []);
  return {
    meal: root,
    leaves,
    estimated,
    portion: { quantity: rootPortion.quantity, unit: rootPortion.unit },
    references: [...references.values()].map((meal) => ({
      meal_id: meal.id,
      name: meal.name,
      updated_at: meal.updated_at.toISOString(),
    })),
  };
}
