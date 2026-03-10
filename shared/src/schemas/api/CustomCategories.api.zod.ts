import {
  customCategoriesMutatorSchema,
  customCategoriesSchema,
} from "../database/CustomCategories.zod";
import { z } from "zod";

export const customCategoriesResponseSchema = customCategoriesSchema
  .omit({
    created_at: true,
    created_by_user_id: true,
    updated_by_user_id: true,
    user_id: true,
  })
  .extend({
    updated_at: z.coerce.date().optional(),
  });

export const updatCustomCategoriesRequestSchema =
  customCategoriesMutatorSchema.omit({
    created_at: true,
    updated_at: true,
    created_by_user_id: true,
    updated_by_user_id: true,
    user_id: true,
  });

export const createCustomCategoriesRequestSchema =
  customCategoriesMutatorSchema.omit({
    created_at: true,
    updated_at: true,
    created_by_user_id: true,
    updated_by_user_id: true,
  });

export type CustomCategoriesResponse = z.infer<
  typeof customCategoriesResponseSchema
>;
export type UpdateCustomCategoriesRequest = z.infer<
  typeof updatCustomCategoriesRequestSchema
>;

export type CreateCustomCategoriesRequest = z.infer<
  typeof createCustomCategoriesRequestSchema
>;
