import { isDayString } from '@workspace/shared';
import { z } from 'zod/v4';

const dayString = z
  .string()
  .refine(isDayString, { message: 'Expected YYYY-MM-DD' });

const SelectedFoodEntrySchema = z
  .object({
    entryId: z.string().uuid(),
    quantity: z.number().finite().positive(),
  })
  .strict();

const ReviewedFoodEntrySchema = z
  .object({
    entryId: z.string().uuid(),
    // This is an optimistic-concurrency snapshot, never a client-provided
    // quantity to persist. The service reloads and compares it before copy.
    quantity: z.number().finite().positive(),
  })
  .strict();

export const CopySelectedFoodEntriesFromUserBodySchema = z
  .object({
    familyUserId: z.string().uuid(),
    sourceDate: dayString,
    targetDate: dayString,
    targetMealType: z.string().uuid(),
    entries: z.array(SelectedFoodEntrySchema).min(1).max(100),
  })
  .strict()
  .superRefine(({ entries }, context) => {
    const seen = new Set<string>();
    entries.forEach(({ entryId }, index) => {
      if (seen.has(entryId)) {
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'entryId'],
          message: 'Source entry IDs must be unique',
        });
      }
      seen.add(entryId);
    });
  });

export type CopySelectedFoodEntriesFromUserBody = z.infer<
  typeof CopySelectedFoodEntriesFromUserBodySchema
>;

export const CopyReviewedFoodEntriesFromUserBodySchema = z
  .object({
    familyUserId: z.string().uuid(),
    sourceDate: dayString,
    sourceMealType: z.string().trim().min(1),
    targetDate: dayString,
    targetMealType: z.string().uuid(),
    entries: z.array(ReviewedFoodEntrySchema).min(1).max(100),
  })
  .strict()
  .superRefine(({ entries }, context) => {
    const seen = new Set<string>();
    entries.forEach(({ entryId }, index) => {
      if (seen.has(entryId)) {
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'entryId'],
          message: 'Reviewed source entry IDs must be unique',
        });
      }
      seen.add(entryId);
    });
  });

export type CopyReviewedFoodEntriesFromUserBody = z.infer<
  typeof CopyReviewedFoodEntriesFromUserBodySchema
>;
