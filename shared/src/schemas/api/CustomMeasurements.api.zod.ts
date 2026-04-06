import {
  customMeasurementsInitializerSchema,
  customMeasurementsMutatorSchema,
  customMeasurementsSchema,
} from "../database/CustomMeasurements.zod.ts";
import { z } from "zod";
import { customCategoriesResponseSchema } from "./CustomCategories.api.zod.ts";

export const customMeasurementsResponseSchema = customMeasurementsSchema.extend(
  {
    custom_categories: customCategoriesResponseSchema
      .omit({ id: true })
      .optional(),
    entry_date: z.string(),
    entry_timestamp: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  },
);

export const updateCustomMeasurementsRequestSchema =
  customMeasurementsMutatorSchema.extend({
    entry_date: z.string().optional(),
    entry_timestamp: z.string().optional(),
  });

export const createCustomMeasurementsRequestSchema =
  customMeasurementsInitializerSchema;

export type CustomMeasurementsResponse = z.infer<
  typeof customMeasurementsResponseSchema
>;
export type CreateCustomMeasurementsRequest = z.infer<
  typeof createCustomMeasurementsRequestSchema
>;
export type UpdateCustomMeasurementsRequest = z.infer<
  typeof updateCustomMeasurementsRequestSchema
>;
