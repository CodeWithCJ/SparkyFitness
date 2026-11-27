import type { ChatToolCategorySlug } from '@workspace/shared';

/** Translation key and English fallback for each chat tool category, shared by
 * the chat's tool picker and the coach editor's data-access chips. */
export const CHAT_TOOL_CATEGORY_LABELS: Record<
  ChatToolCategorySlug,
  [string, string]
> = {
  food: ['chat.toolCategories.food', 'Food & Water'],
  exercise: ['chat.toolCategories.exercise', 'Exercise'],
  checkin: ['chat.toolCategories.checkin', 'Body & Check-ins'],
  goals: ['chat.toolCategories.goals', 'Goals'],
  reports: ['chat.toolCategories.reports', 'Reports & Analytics'],
  coaching: ['chat.toolCategories.coaching', 'Coaching'],
  vision: ['chat.toolCategories.vision', 'Vision'],
  profile: ['chat.toolCategories.profile', 'Profile & Habits'],
  medications: ['chat.toolCategories.medications', 'Medications'],
};
