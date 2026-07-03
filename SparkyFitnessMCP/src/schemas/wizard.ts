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

// Flat shape published to MCP clients as `inputSchema`. The MCP TS SDK serializes
// `z.object()` to JSON Schema but emits an empty object for `z.discriminatedUnion()`,
// so clients can't see `action` or the fields. Strict validation still runs in the
// tool handler via `manageWizardSchema.safeParse`.
export const manageWizardInput = z.object({
  action: z.enum(["daily_checkin"]).describe("Action to perform."),
  step: z
    .enum(["start", "weight", "steps", "sleep", "mood", "habits", "complete"])
    .optional()
    .describe("The current step in the check-in process (defaults to 'start')"),
  answer: z.string().optional().describe("User's answer to the current question"),
});
