import { z } from 'zod/v4';

const huaweiTimestampSchema = z.union([z.number(), z.string()]);

export const huaweiValueSchema = z
  .object({
    fieldName: z.string().min(1),
    integerValue: z.number().optional(),
    floatValue: z.number().optional(),
    longValue: z.union([z.number(), z.string()]).optional(),
    doubleValue: z.number().optional(),
    stringValue: z.string().optional(),
  })
  .passthrough();

export const huaweiSamplePointSchema = z
  .object({
    startTime: huaweiTimestampSchema.optional(),
    endTime: huaweiTimestampSchema.optional(),
    dataTypeName: z.string().min(1),
    value: z.array(huaweiValueSchema).default([]),
  })
  .passthrough();

const huaweiSampleSetSchema = z
  .object({
    samplePoints: z.array(huaweiSamplePointSchema).default([]),
  })
  .passthrough();

export const huaweiDailySummaryResponseSchema = z.object({
  group: z
    .array(
      z
        .object({
          startTime: huaweiTimestampSchema,
          endTime: huaweiTimestampSchema.optional(),
          sampleSet: z.array(huaweiSampleSetSchema).default([]),
        })
        .passthrough()
    )
    .default([]),
});

export const huaweiSleepRecordsResponseSchema = z.object({
  healthRecords: z
    .array(
      z
        .object({
          id: z.string().min(1),
          startTime: huaweiTimestampSchema.optional(),
          endTime: huaweiTimestampSchema.optional(),
          dataTypeName: z.string().min(1),
          timeZone: z.string().optional(),
          value: z.array(huaweiValueSchema).default([]),
        })
        .passthrough()
    )
    .default([]),
});

const huaweiActivitySummarySchema = z
  .object({
    dataSummary: z.array(huaweiSamplePointSchema).default([]),
  })
  .passthrough();

export const huaweiActivitiesResponseSchema = z
  .object({
    activityRecord: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().optional(),
            desc: z.string().optional(),
            startTime: z.number(),
            endTime: z.number(),
            modifyTime: z.number().optional(),
            activityType: z.number().int(),
            activeTime: z.number().optional(),
            timeZone: z.string().optional(),
            activitySummary: huaweiActivitySummarySchema.optional(),
          })
          .passthrough()
      )
      .default([]),
    deletedActivityRecord: z.array(z.unknown()).default([]),
    hasMoreData: z.boolean().optional(),
    cursor: z.string().optional(),
  })
  .passthrough();

export const huaweiConsentsResponseSchema = z
  .object({
    url2Desc: z.record(z.string(), z.string()).default({}),
    authTime: z.string().optional(),
    appName: z.string().optional(),
  })
  .passthrough();

export type HuaweiValue = z.infer<typeof huaweiValueSchema>;
export type HuaweiDailySummaryResponse = z.infer<
  typeof huaweiDailySummaryResponseSchema
>;
export type HuaweiSleepRecordsResponse = z.infer<
  typeof huaweiSleepRecordsResponseSchema
>;
export type HuaweiActivitiesResponse = z.infer<
  typeof huaweiActivitiesResponseSchema
>;
