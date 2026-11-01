import { z } from 'zod/v4';
import {
  NormalizedFoodSchema,
  barcodeLookupResponseSchema,
} from '@workspace/shared';
export { FoodVariantSchema, NormalizedFoodSchema } from '@workspace/shared';
export type { FoodVariant, NormalizedFood } from '@workspace/shared';
export const PaginationSchema = z.object({
  // Some providers (e.g. Open Food Facts' legacy cgi/search.pl endpoint) report
  // these pagination values as strings, and the same field can switch between a
  // string and a number across requests. Coerce them so any provider that sends
  // string-typed numeric pagination is normalized rather than failing response
  // validation. `.int()` makes the integer intent explicit and rejects
  // non-integer floats (e.g. "1.5"). `hasMore` stays a strict boolean.
  page: z.coerce.number().int(),
  pageSize: z.coerce.number().int(),
  totalCount: z.coerce.number().int(),
  hasMore: z.boolean(),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const SearchResponseSchema = z.object({
  foods: z.array(NormalizedFoodSchema),
  pagination: PaginationSchema,
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const BarcodeResponseSchema = barcodeLookupResponseSchema;

export type BarcodeResponse = z.infer<typeof BarcodeResponseSchema>;
