import { z } from 'zod';
import { isDayString } from '../../utils/timezone.ts';

const dayString = z
  .string()
  .refine(isDayString, { message: 'Expected YYYY-MM-DD' });

const selectedFoodEntrySchema = z
  .object({
    entryId: z.string().uuid(),
    quantity: z.number().finite().positive(),
    sourceFingerprint: z.string().min(1).max(20_000),
  })
  .strict();

const reviewedFoodEntrySchema = z
  .object({
    entryId: z.string().uuid(),
    sourceFingerprint: z.string().min(1).max(20_000),
  })
  .strict();

function rejectDuplicateEntryIds(
  entries: Array<{ entryId: string }>,
  context: z.RefinementCtx,
  message: string
) {
  const seen = new Set<string>();
  entries.forEach(({ entryId }, index) => {
    if (seen.has(entryId)) {
      context.addIssue({
        code: 'custom',
        path: ['entries', index, 'entryId'],
        message,
      });
    }
    seen.add(entryId);
  });
}

export const CopySelectedFoodEntriesFromUserBodySchema = z
  .object({
    familyUserId: z.string().uuid(),
    sourceDate: dayString,
    targetDate: dayString,
    targetMealType: z.string().uuid(),
    entries: z.array(selectedFoodEntrySchema).min(1).max(100),
  })
  .strict()
  .superRefine(({ entries }, context) => {
    rejectDuplicateEntryIds(
      entries,
      context,
      'Source entry IDs must be unique'
    );
  });

export type CopySelectedFoodEntriesFromUserPayload = z.infer<
  typeof CopySelectedFoodEntriesFromUserBodySchema
>;
export type CopySelectedFoodEntriesFromUserBody =
  CopySelectedFoodEntriesFromUserPayload;

export const CopyReviewedFoodEntriesFromUserBodySchema = z
  .object({
    familyUserId: z.string().uuid(),
    sourceDate: dayString,
    sourceMealType: z.string().trim().min(1),
    targetDate: dayString,
    targetMealType: z.string().uuid(),
    entries: z.array(reviewedFoodEntrySchema).min(1).max(100),
  })
  .strict()
  .superRefine(({ entries }, context) => {
    rejectDuplicateEntryIds(
      entries,
      context,
      'Reviewed source entry IDs must be unique'
    );
  });

export type CopyReviewedFoodEntriesFromUserPayload = z.infer<
  typeof CopyReviewedFoodEntriesFromUserBodySchema
>;
export type CopyReviewedFoodEntriesFromUserBody =
  CopyReviewedFoodEntriesFromUserPayload;

// Both directions review the same selections. Only the server-derived source
// and target differ; never accept a source user ID from the client.
export const CopySelectedFoodEntriesToUserBodySchema =
  CopySelectedFoodEntriesFromUserBodySchema;
export type CopySelectedFoodEntriesToUserPayload = z.infer<
  typeof CopySelectedFoodEntriesToUserBodySchema
>;
export type CopySelectedFoodEntriesToUserBody =
  CopySelectedFoodEntriesToUserPayload;

export const CopyReviewedFoodEntriesToUserBodySchema =
  CopyReviewedFoodEntriesFromUserBodySchema;
export type CopyReviewedFoodEntriesToUserPayload = z.infer<
  typeof CopyReviewedFoodEntriesToUserBodySchema
>;
export type CopyReviewedFoodEntriesToUserBody =
  CopyReviewedFoodEntriesToUserPayload;

export const FamilyMealTypesParamSchema = z
  .object({ familyUserId: z.string().uuid() })
  .strict();

export const FamilyMealTypesResponseSchema = z.array(
  z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      user_id: z.string().uuid().nullable(),
      sort_order: z.number().nullable(),
      is_visible: z.boolean(),
      show_in_quick_log: z.boolean(),
      default_time: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
    })
    .strict()
);
export type FamilyMealTypesResponse = z.infer<
  typeof FamilyMealTypesResponseSchema
>;
