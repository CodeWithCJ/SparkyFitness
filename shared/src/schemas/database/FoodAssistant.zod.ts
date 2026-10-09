import { z } from "zod";
import {
  foodAssistantCheckpointSchema,
  foodAssistantTaskStatusSchema,
  foodAssistantTaskOriginSchema,
} from "../api/FoodAssistant.api.zod.ts";

export const foodAssistantPreferenceSchema = z.object({
  user_id: z.string().uuid(),
  key: z.string(),
  value: z.string(),
  source_quote: z.string(),
  version: z.number().int().positive(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export const foodAssistantTaskSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: z.enum([
    "recipe",
    "meal_plan",
    "diary",
    "shopping",
    "analysis",
    "food",
  ]),
  title: z.string(),
  creation_hash: z.string(),
  origin: foodAssistantTaskOriginSchema.default({ type: "user_draft" }),
  status: foodAssistantTaskStatusSchema,
  checkpoint: foodAssistantCheckpointSchema,
  result: z.json().nullable(),
  version: z.number().int().positive(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export const foodAssistantOperationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  task_id: z.string().uuid(),
  kind: z.string(),
  request_hash: z.string(),
  before_state: z.json(),
  after_state: z.json(),
  created_at: z.coerce.date(),
});
export type FoodAssistantPreference = z.infer<
  typeof foodAssistantPreferenceSchema
>;
export type FoodAssistantTask = z.infer<typeof foodAssistantTaskSchema>;
export type FoodAssistantOperation = z.infer<
  typeof foodAssistantOperationSchema
>;
