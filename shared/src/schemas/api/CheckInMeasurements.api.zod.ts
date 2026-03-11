import {
  checkInMeasurementsMutatorSchema,
  checkInMeasurementsSchema,
} from "../database/CheckInMeasurements.zod";
import { z } from "zod";

export const checkInMeasurementsResponseSchema = checkInMeasurementsSchema
  .extend({
    entry_date: z.string(),
    updated_at: z.string(),
  })
  .omit({
    created_at: true,
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
export type CheckInMeasurementsResponse = z.infer<
  typeof checkInMeasurementsResponseSchema
>;
export type UpdateCheckInMeasurementsRequest = z.infer<
  typeof updateCheckInMeasurementsRequestSchema
>;
