import { z } from 'zod';
import { NormalizedFoodSchema } from './FoodLookup.api.zod.ts';

export const BARCODE_FALLBACK_PROVIDER_ID = 'openfoodfacts-fallback';
export const barcodeValueSchema = z.string().regex(/^\d{8,14}$/);
export const barcodeProviderSchema = z.object({
  id: z.union([z.string().uuid(), z.literal(BARCODE_FALLBACK_PROVIDER_ID)]),
  name: z.string(),
  type: z.string(),
  isFallback: z.boolean(),
});
export type BarcodeProvider = z.infer<typeof barcodeProviderSchema>;
export const barcodeCandidateSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  source: z.string(),
  status: z.enum(['found', 'not_found', 'error']),
  food: NormalizedFoodSchema.nullable(),
});
export type BarcodeCandidate = z.infer<typeof barcodeCandidateSchema>;
export const barcodeLookupResponseSchema = z.object({
  source: z.string(),
  food: NormalizedFoodSchema.nullable(),
  providerId: z.string().nullable().optional(),
  providerName: z.string().optional(),
});
export type BarcodeLookupResponse = z.infer<typeof barcodeLookupResponseSchema>;
export const barcodeAlternativesResponseSchema = z.object({
  results: z.array(barcodeCandidateSchema),
});
export type BarcodeAlternativesResponse = z.infer<
  typeof barcodeAlternativesResponseSchema
>;
