import { z } from 'zod';

// Saved recipes may retain an ingredient with quantity zero. Missing or blank
// quantities are different: never coerce those to an omitted ingredient.
export const savedMealIngredientQuantitySchema = z
  .union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())])
  .pipe(z.number().nonnegative().finite());
