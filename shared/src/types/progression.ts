import { z } from "zod";

export const progressionModeSchema = z.enum(["rep_goal", "fixed", "step_load", "manual"]);
export type ProgressionMode = z.infer<typeof progressionModeSchema>;

export const progressionIncrementTypeSchema = z.enum(["weight", "reps"]);
export type ProgressionIncrementType = z.infer<typeof progressionIncrementTypeSchema>;

export const exerciseProgressionConfigSchema = z.object({
  progressionMode: progressionModeSchema.default("rep_goal").optional(),
  targetSets: z.number().int().positive().default(3),
  repGoal: z.number().int().positive().nullable().optional(),
  incrementType: progressionIncrementTypeSchema.default("weight"),
  incrementValue: z.number().positive().default(5),
  equipmentBrand: z.string().nullable().optional(),
});

export type ExerciseProgressionConfig = z.infer<typeof exerciseProgressionConfigSchema>;

export interface CompletedSetHistory {
  setNumber: number;
  reps: number;
  weight: number;
  completed?: boolean;
}

export interface LastExercisePerformance {
  date?: string | Date;
  baseWeight: number;
  sets: CompletedSetHistory[];
}

export interface ProgressionEvaluationResult {
  goalAchieved: boolean;
  status: "PROGRESSION_WEIGHT_INCREASE" | "PROGRESSION_REPS_INCREASE" | "MAINTAIN_TARGET" | "FIRST_SESSION" | "MANUAL";
  suggestedWeight: number;
  suggestedRepGoal: number;
  totalRepsAchieved: number;
  repDifference: number;
  message: string;
}