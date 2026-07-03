import { z } from "zod";

export const CheckEngagementSchema = z.object({}).strict();

export const GetLoggingStreakSchema = z.object({}).strict();

export const GetContextualNudgeSchema = z.object({}).strict();

export type CheckEngagementInput = z.infer<typeof CheckEngagementSchema>;
export type GetLoggingStreakInput = z.infer<typeof GetLoggingStreakSchema>;
export type GetContextualNudgeInput = z.infer<typeof GetContextualNudgeSchema>;
