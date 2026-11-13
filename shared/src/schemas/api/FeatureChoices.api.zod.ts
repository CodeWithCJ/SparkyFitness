import { z } from 'zod';
import {
  featureChoicesPatchSchema,
  featureChoicesSchema,
} from '../../features/optionalFeatures.ts';

/**
 * `GET` and `PATCH /api/user-preferences/features`: the person's explicit
 * optional-feature choices, per platform (a missing platform or key is at its
 * default). Someone acting for the person can read them; only the person can
 * change them.
 */
export const featureChoicesResponseSchema = z.object({
  feature_choices: featureChoicesSchema,
});
export type FeatureChoicesResponse = z.infer<
  typeof featureChoicesResponseSchema
>;

/** `PATCH /api/user-preferences/features` body. */
export const updateFeatureChoicesBodySchema = featureChoicesPatchSchema;
export type UpdateFeatureChoicesBody = z.infer<
  typeof updateFeatureChoicesBodySchema
>;
