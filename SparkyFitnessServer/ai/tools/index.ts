import { buildCheckinTools } from './checkinTools.js';
import { buildCoachTools } from './coachTools.js';
import { buildEngagementTools } from './engagementTools.js';
import { buildExerciseTools } from './exerciseTools.js';
import { buildFoodTools } from './foodTools.js';
import { buildGoalTools } from './goalTools.js';
import { buildHabitTools } from './habitTools.js';
import { buildProfileTools } from './profileTools.js';
import { buildReportTools } from './reportTools.js';
import { buildVisionTools } from './visionTools.js';
import { buildWizardTools } from './wizardTools.js';

/**
 * Composes the full in-process chatbot tool set for generateText/streamText.
 * Handlers close over the authenticated userId — chat tools always act as the
 * session user, so two-actor services receive (userId, userId, …) — and the
 * user's IANA timezone, used for "today" defaults and day bucketing.
 *
 * Domain order mirrors MCP's registerAllTools; the MCP-only dev tools are
 * intentionally not part of the chat surface.
 */
export function buildChatbotTools(userId: string, tz: string) {
  const tools = {
    ...buildExerciseTools(userId, tz),
    ...buildFoodTools(userId, tz),
    ...buildCheckinTools(userId, tz),
    ...buildCoachTools(userId, tz),
    ...buildEngagementTools(userId, tz),
    ...buildVisionTools(userId),
    ...buildGoalTools(userId, tz),
    ...buildProfileTools(userId),
    ...buildHabitTools(userId),
    ...buildWizardTools(userId),
    ...buildReportTools(userId, tz),
  };
  // The published flat schemas are advisory; real validation is the strict
  // per-action union inside each handler. Strict provider-side mode must stay
  // off: OpenAI's Responses API treats an omitted flag as "attempt strict
  // mode" and then forces models to emit every published property, producing
  // placeholder junk that the per-action validation rejects.
  for (const tool of Object.values(tools)) {
    tool.strict = false;
  }
  return tools;
}
