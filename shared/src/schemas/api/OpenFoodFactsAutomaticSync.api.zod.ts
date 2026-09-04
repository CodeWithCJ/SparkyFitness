import { z } from "zod";

export const OpenFoodFactsProductLanguageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, "Use a two-letter product language code.");

export const OpenFoodFactsAutomaticSyncRequestSchema = z
  .object({
    enabled: z.boolean(),
    productLanguage: OpenFoodFactsProductLanguageSchema,
  })
  .strict();

export const OpenFoodFactsSyncStatusCountsSchema = z
  .object({
    pending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
  })
  .strict();

export const OpenFoodFactsSyncFailureSchema = z
  .object({
    foodId: z.string().min(1),
    foodName: z.string().nullable(),
    error: z.string().nullable(),
    attemptCount: z.number().int().nonnegative(),
    updatedAt: z.string().min(1),
  })
  .strict();

export const OpenFoodFactsAutomaticSyncResponseSchema = z
  .object({
    serverEnabled: z.boolean(),
    userEnabled: z.boolean(),
    productLanguage: OpenFoodFactsProductLanguageSchema,
    providerScope: z.enum(["personal", "global"]).nullable(),
    status: OpenFoodFactsSyncStatusCountsSchema,
    recentFailures: z.array(OpenFoodFactsSyncFailureSchema),
  })
  .strict();

export const OpenFoodFactsAdminSyncFailureSchema =
  OpenFoodFactsSyncFailureSchema.extend({
    userId: z.string().min(1),
  }).strict();

export const OpenFoodFactsAdminSyncStatusResponseSchema = z
  .object({
    enabled: z.boolean(),
    status: OpenFoodFactsSyncStatusCountsSchema,
    recentFailures: z.array(OpenFoodFactsAdminSyncFailureSchema),
  })
  .strict();

export type OpenFoodFactsAutomaticSyncRequest = z.infer<
  typeof OpenFoodFactsAutomaticSyncRequestSchema
>;
export type OpenFoodFactsAutomaticSyncResponse = z.infer<
  typeof OpenFoodFactsAutomaticSyncResponseSchema
>;
export type OpenFoodFactsAdminSyncStatusResponse = z.infer<
  typeof OpenFoodFactsAdminSyncStatusResponseSchema
>;
