import { z } from "zod";

const dailyCheckinSchema = z.object({
  action: z.literal("daily_checkin"),
  step: z.enum(["start", "weight", "steps", "sleep", "mood", "habits", "complete"]).default("start").describe("The current step in the check-in process"),
  answer: z.string().optional().describe("User's answer to the current question"),
}).strict();

export const manageWizardSchema = z.discriminatedUnion("action", [
  dailyCheckinSchema,
]);

export type ManageWizardInput = z.infer<typeof manageWizardSchema>;
