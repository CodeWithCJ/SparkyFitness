import { z } from 'zod';
import { NormalizedFoodSchema } from './FoodLookup.api.zod.ts';

const positive = z.number().finite().positive().max(1e9);
const identifier = z.string().min(1).max(300);
export const recipeImportMappingSchema = z
  .object({
    ingredientId: identifier,
    foodId: z.uuid(),
    variantId: z.uuid(),
    quantity: positive,
    unit: z.string().trim().min(1).max(80),
    confirmed: z.literal(true),
  })
  .strict();
export type RecipeImportMapping = z.infer<typeof recipeImportMappingSchema>;
export const recipeImportSuggestedMappingSchema =
  recipeImportMappingSchema.extend({ confirmed: z.literal(false) });
export type RecipeImportSuggestedMapping = z.infer<
  typeof recipeImportSuggestedMappingSchema
>;
export const recipeImportIngredientSchema = z.object({
  ingredientId: identifier,
  sourceFoodKey: z.string(),
  name: z.string(),
  originalText: z.string(),
  note: z.string(),
  noteNeedsReview: z.boolean().optional(),
  originalQuantity: positive.nullable().optional(),
  quantity: positive.nullable(),
  unit: z.string().nullable(),
  originalUnit: z.string().nullable(),
  issues: z.array(
    z.enum([
      'missing_quantity',
      'missing_unit',
      'unstructured_food',
      'linked_recipe',
      'mapping_unavailable',
      'incomplete_nutrition',
      'incompatible_unit',
    ])
  ),
  missingNutrients: z.array(z.string()),
  mapping: recipeImportMappingSchema.nullable(),
  suggestedMapping: recipeImportSuggestedMappingSchema.nullish(),
  savedMappingId: z.uuid().nullish(),
  mappingOrigin: z.enum(['saved']).nullable(),
});
export type RecipeImportIngredient = z.infer<
  typeof recipeImportIngredientSchema
>;
export const recipeImportNutritionSchema = z.record(
  z.string(),
  z.number().finite().nonnegative().nullable()
);
export type RecipeImportNutrition = z.infer<typeof recipeImportNutritionSchema>;
export const recipeImportPreviewRequestSchema = z
  .object({ providerId: z.uuid(), recipeSlug: identifier })
  .strict();
export type RecipeImportPreviewRequest = z.infer<
  typeof recipeImportPreviewRequestSchema
>;
export const recipeImportPreviewSchema =
  recipeImportPreviewRequestSchema.extend({
    recipeId: z.string().nullable(),
    name: z.string(),
    recipeServings: positive.nullable(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    ingredients: z.array(recipeImportIngredientSchema).max(100),
    syncWarnings: z.array(z.string()),
  });
export type RecipeImportPreview = z.infer<typeof recipeImportPreviewSchema>;
export const recipeImportSaveRequestSchema = recipeImportPreviewRequestSchema
  .extend({
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(1).max(255).optional(),
    servings: positive.optional(),
    finishedWeightGrams: positive.optional(),
    mappings: z.array(recipeImportMappingSchema).min(1).max(100),
  })
  .strict();
export type RecipeImportSaveRequest = z.infer<
  typeof recipeImportSaveRequestSchema
>;
export const recipeImportSourceSchema = recipeImportPreviewSchema.extend({
  mealId: z.uuid(),
  mappings: z.array(recipeImportMappingSchema),
  syncEligible: z.boolean(),
  lastSyncedAt: z.string().nullable(),
});
export type RecipeImportSource = z.infer<typeof recipeImportSourceSchema>;
export const recipeImportSaveResponseSchema = z.object({
  mealId: z.uuid(),
  source: recipeImportSourceSchema,
  nutrition: recipeImportNutritionSchema,
  servingSize: positive,
  servingUnit: z.enum(['g', 'serving']),
  totalServings: positive,
});
export type RecipeImportSaveResponse = z.infer<
  typeof recipeImportSaveResponseSchema
>;
export const recipeImportCandidateSchema = z.object({
  candidateId: identifier,
  source: z.enum(['local', 'external']),
  foodId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  providerType: z.string().optional(),
  providerId: z.string().optional(),
  providerExternalId: z.string().optional(),
  name: z.string(),
  brand: z.string().nullable(),
  servingSize: positive,
  servingUnit: z.string(),
  nutrition: recipeImportNutritionSchema,
  nutritionComplete: z.boolean(),
  unitCompatible: z.boolean(),
});
export type RecipeImportCandidate = z.infer<typeof recipeImportCandidateSchema>;
export const recipeImportSuggestionRequestSchema =
  recipeImportPreviewRequestSchema
    .extend({
      sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      ingredientIds: z.array(identifier).max(20).optional(),
      confirmedIngredientIds: z.array(identifier).max(100).default([]),
      useAi: z.boolean().default(false),
      serviceConfigId: z.uuid().optional(),
    })
    .strict();
export type RecipeImportSuggestionRequest = z.infer<
  typeof recipeImportSuggestionRequestSchema
>;
export const recipeImportSuggestionResponseSchema = z.object({
  ingredients: z.array(
    z.object({
      ingredientId: identifier,
      candidates: z.array(recipeImportCandidateSchema),
      suggestedCandidateId: identifier.nullable(),
    })
  ),
  aiUsed: z.boolean(),
  warnings: z.array(z.string()),
});
export type RecipeImportSuggestionResponse = z.infer<
  typeof recipeImportSuggestionResponseSchema
>;
export const recipeImportBrowseResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().nullable(),
      slug: z.string(),
      name: z.string(),
      recipeServings: positive.nullable(),
      food: NormalizedFoodSchema.optional(),
    })
  ),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalCount: z.number(),
    hasMore: z.boolean(),
  }),
});
export type RecipeImportBrowseResponse = z.infer<
  typeof recipeImportBrowseResponseSchema
>;
export const RECIPE_IMPORT_MAPPING_PAGE_SIZE = 25;
export const recipeImportSavedMappingsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const recipeImportSavedMappingSchema = z.object({
  id: z.uuid(),
  foodId: z.uuid(),
  variantId: z.uuid(),
  foodName: z.string().nullable(),
  ingredientName: z.string().nullable(),
  sourceUnit: z.string().nullable(),
  quantityPerSourceUnit: z.number().finite().positive(),
  unit: z.string(),
  updatedAt: z.iso.datetime(),
});
export type RecipeImportSavedMapping = z.infer<
  typeof recipeImportSavedMappingSchema
>;
export const recipeImportSavedMappingsResponseSchema = z.object({
  items: z
    .array(recipeImportSavedMappingSchema)
    .max(RECIPE_IMPORT_MAPPING_PAGE_SIZE),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalCount: z.number().int(),
    hasMore: z.boolean(),
  }),
});
export type RecipeImportSavedMappingsResponse = z.infer<
  typeof recipeImportSavedMappingsResponseSchema
>;
export const recipeImportForgetMappingResponseSchema = z.object({
  deleted: z.literal(true),
});
export const recipeImportSyncResponseSchema = z.object({
  status: z.literal('synced'),
  source: recipeImportSourceSchema,
});
export type RecipeImportSyncResponse = z.infer<
  typeof recipeImportSyncResponseSchema
>;
export const recipeImportSyncRequestSchema = z
  .object({
    confirmationFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type RecipeImportSyncRequest = z.infer<
  typeof recipeImportSyncRequestSchema
>;
export const recipeImportSyncPreviewSchema = z.object({
  mealId: z.uuid(),
  mealName: z.string(),
  recipeName: z.string(),
  recipeSlug: z.string(),
  recipeServings: positive,
  sourceChanged: z.boolean(),
  existingNutrition: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.null()])
  ),
  batchNutrition: recipeImportNutritionSchema,
  nutrition: recipeImportNutritionSchema,
  nutritionCoverage: z
    .record(
      z.string(),
      z.object({
        known: z.number().int().nonnegative().max(100),
        total: z.number().int().positive().max(100),
      })
    )
    .optional(),
  mealSavedAt: z.iso.datetime().nullable().optional(),
  confirmationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RecipeImportSyncPreview = z.infer<
  typeof recipeImportSyncPreviewSchema
>;
