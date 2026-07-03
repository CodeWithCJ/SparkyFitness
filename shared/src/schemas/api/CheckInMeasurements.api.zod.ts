import {
  checkInMeasurementsMutatorSchema,
  checkInMeasurementsSchema,
} from "../database/CheckInMeasurements.zod.ts";
import { z } from "zod";

export const checkInMeasurementsResponseSchema = checkInMeasurementsSchema
  .extend({
    entry_date: z.string(),
    updated_at: z.string(),
  })
  .omit({
    created_at: true,
  });

export const recentCheckInMeasurementsSchema = z.object({
  weight: z.number().nullish(),
  neck: z.number().nullish(),
  waist: z.number().nullish(),
  hips: z.number().nullish(),
  steps: z.number().nullish(),
  height: z.number().nullish(),
  body_fat_percentage: z.number().nullish(),
});

export const updateCheckInMeasurementsRequestSchema =
  checkInMeasurementsMutatorSchema
    .extend({
      entry_date: z.string(),
    })
    .omit({
      created_at: true,
      updated_at: true,
    });

export type RecentCheckInMeasurementsResponse = z.infer<
  typeof recentCheckInMeasurementsSchema
>;
export type CheckInMeasurementsResponse = z.infer<
  typeof checkInMeasurementsResponseSchema
>;
export type UpdateCheckInMeasurementsRequest = z.infer<
  typeof updateCheckInMeasurementsRequestSchema
>;
