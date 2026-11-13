import { z } from 'zod';

export const recipeFoodMappingsSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  provider_id: z.uuid(),
  source_food_key: z.string(),
  food_id: z.uuid(),
  variant_id: z.uuid(),
  quantity_per_source_unit: z.number().positive(),
  unit: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type RecipeFoodMappings = z.infer<typeof recipeFoodMappingsSchema>;
