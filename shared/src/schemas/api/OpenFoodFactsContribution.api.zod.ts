import { z } from "zod";
import { OpenFoodFactsProductLanguageSchema } from "./OpenFoodFactsAutomaticSync.api.zod.ts";

export const OpenFoodFactsPreviewRequestSchema = z
  .object({
    productLanguage: OpenFoodFactsProductLanguageSchema,
    imageType: z.enum(["front", "nutrition", "packaging"]),
    imageBase64: z
      .string()
      .min(4)
      .max(5_592_408)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const OpenFoodFactsConfirmRequestSchema =
  OpenFoodFactsPreviewRequestSchema.extend({
    previewToken: z.string().min(1).max(100),
    confirm: z.literal(true),
    confirmImageRights: z.literal(true),
  }).strict();

export const OpenFoodFactsPreviewResponseSchema = z
  .object({
    previewToken: z.string(),
    expiresAt: z.string(),
    productUrl: z.string().url(),
    providerScope: z.enum(["personal", "global"]),
    fields: z.record(z.string(), z.string()),
    imageBase64: z.string(),
    imageType: z.enum(["front", "nutrition", "packaging"]),
    existingProduct: z.boolean(),
  })
  .strict();

export const OpenFoodFactsConfirmResponseSchema = z
  .object({
    status: z.enum(["success", "partial"]),
    message: z.string(),
    productUrl: z.string().url(),
    providerScope: z.enum(["personal", "global"]),
  })
  .strict();

export type OpenFoodFactsPreviewRequest = z.infer<
  typeof OpenFoodFactsPreviewRequestSchema
>;
export type OpenFoodFactsConfirmRequest = z.infer<
  typeof OpenFoodFactsConfirmRequestSchema
>;
export type OpenFoodFactsPreviewResponse = z.infer<
  typeof OpenFoodFactsPreviewResponseSchema
>;
export type OpenFoodFactsConfirmResponse = z.infer<
  typeof OpenFoodFactsConfirmResponseSchema
>;
