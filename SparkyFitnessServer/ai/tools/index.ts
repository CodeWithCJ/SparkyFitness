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
 * session user, so two-actor services receive (userId, userId, …).
 *
 * Domain order mirrors MCP's registerAllTools; the MCP-only dev tools are
 * intentionally not part of the chat surface.
 */
export function buildChatbotTools(userId: string) {
  return {
    ...buildExerciseTools(userId),
    ...buildFoodTools(userId),
    ...buildCheckinTools(userId),
    ...buildCoachTools(userId),
    ...buildEngagementTools(userId),
    ...buildVisionTools(userId),
    ...buildGoalTools(userId),
    ...buildProfileTools(userId),
    ...buildHabitTools(userId),
    ...buildWizardTools(userId),
    ...buildReportTools(userId),
  };
}
