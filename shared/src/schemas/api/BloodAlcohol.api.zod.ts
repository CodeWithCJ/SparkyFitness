import { z } from 'zod';
import {
  BAC_BODY_INPUTS,
  BAC_DISPLAY_UNITS,
  BAC_DISTRIBUTION_FORMULAS,
  BAC_ESTIMATE_STATUSES,
} from '../../nutrients/alcoholKinetics.ts';

export const alcoholDoseSchema = z.object({
  at: z.string(),
  grams: z.number(),
  name: z.string().optional(),
  is_estimated: z.boolean().optional(),
});

/**
 * An estimated blood alcohol curve for one day. Clients draw the curve from
 * `doses` with the shared `bloodAlcoholCurve`, using the model fields below,
 * so it always matches `estimated_now_permille`. There is deliberately no
 * "back to zero" time: the estimate must never read as fitness to drive.
 */
export const bloodAlcoholResponseSchema = z.object({
  status: z.enum(BAC_ESTIMATE_STATUSES),
  /** Profile inputs the chosen formula needs and the profile lacks. */
  missing_inputs: z.array(z.enum(BAC_BODY_INPUTS)),
  /** The formula the estimate used. */
  formula: z.enum(BAC_DISTRIBUTION_FORMULAS),
  /**
   * The formula the person chose, when it could not describe their body and
   * Watson was used instead; null otherwise.
   */
  fell_back_from: z.enum(BAC_DISTRIBUTION_FORMULAS).nullable(),
  display_unit: z.enum(BAC_DISPLAY_UNITS),
  /** Per mille per hour. */
  elimination_rate: z.number(),
  /** Widmark's r; null unless status is "ok". */
  distribution_factor: z.number().nullable(),
  weight_kg: z.number().nullable(),
  doses: z.array(alcoholDoseSchema),
  /** Null unless status is "ok". */
  estimated_now_permille: z.number().nullable(),
  /** Highest estimate over the span the chart draws (it can fall after midnight); null when it stays at zero or there is no estimate. */
  peak: z.object({ at: z.string(), permille: z.number() }).nullable(),
  has_estimated_times: z.boolean(),
});

export type AlcoholDoseApi = z.infer<typeof alcoholDoseSchema>;
export type BloodAlcoholResponse = z.infer<typeof bloodAlcoholResponseSchema>;
