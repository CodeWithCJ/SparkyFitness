import type { IconName } from '../components/Icon';

export interface ChatSuggestion {
  prompt: string;
  labelKey: string;
  defaultLabel: string;
}

/** Canonical English prompts sent to the assistant; labels are localized at render time. */
export const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
  { prompt: 'Log two eggs and a banana for breakfast', labelKey: 'chat.suggestions.breakfast', defaultLabel: 'Log two eggs and a banana for breakfast' },
  { prompt: 'Log a 30 minute run today', labelKey: 'chat.suggestions.run', defaultLabel: 'Log a 30 minute run today' },
  { prompt: 'How many calories do I have left today?', labelKey: 'chat.suggestions.calories', defaultLabel: 'How many calories do I have left today?' },
  { prompt: 'Suggest a high-protein snack', labelKey: 'chat.suggestions.snack', defaultLabel: 'Suggest a high-protein snack' },
];

export interface ToolDisplay {
  labelKey?: string;
  defaultLabel: string;
  icon: IconName;
}

const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  sparky_manage_food: { labelKey: 'chat.tools.food', defaultLabel: 'Food', icon: 'food' },
  sparky_manage_exercise: { labelKey: 'chat.tools.exercise', defaultLabel: 'Exercise', icon: 'exercise' },
  sparky_manage_checkin: { labelKey: 'chat.tools.checkin', defaultLabel: 'Check-in', icon: 'measurements' },
  sparky_manage_goals: { labelKey: 'chat.tools.goals', defaultLabel: 'Goals', icon: 'flame' },
};

function humanize(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isLookupTool(toolName: string): boolean {
  return /^sparky_get_/.test(toolName);
}

export function getToolDisplay(toolName: string): ToolDisplay {
  const explicit = TOOL_DISPLAY[toolName];
  if (explicit) return explicit;

  const lookup = toolName.match(/^sparky_get_(.+)$/);
  if (lookup) {
    return { labelKey: 'chat.tools.lookedUp', defaultLabel: humanize(lookup[1]).toLowerCase(), icon: 'search' };
  }

  return { defaultLabel: humanize(toolName.replace(/^sparky_/, '')), icon: 'wrench' };
}
