import type { IconName } from '../components/Icon';

/**
 * Tappable starter prompts shown in the empty chat state. Tuned for mobile from
 * the web app's defaults — short, action-oriented, one per row.
 */
export const CHAT_SUGGESTIONS = [
  'Log two eggs and a banana for breakfast',
  'Log a 30 minute run today',
  'How many calories do I have left today?',
  'Suggest a high-protein snack',
] as const;

export interface ToolDisplay {
  label: string;
  icon: IconName;
}

/**
 * Friendly labels + icons for the high-traffic logging tools the server exposes
 * over `/api/chat/stream`. This is intentionally a short list, not a mirror of
 * the server tool registry: anything unmapped falls back to a `sparky_get_*`
 * "Looked up …" rule and finally a humanized tool name (see {@link getToolDisplay}).
 */
const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  sparky_manage_food: { label: 'Food', icon: 'food' },
  sparky_manage_exercise: { label: 'Exercise', icon: 'exercise' },
  sparky_manage_checkin: { label: 'Check-in', icon: 'measurements' },
  sparky_manage_goals: { label: 'Goals', icon: 'flame' },
};

/** Turns a snake_case tool name fragment into a capitalized phrase. */
function humanize(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Lookup/search tools (`sparky_get_*`) return raw data meant for the model, not
 * the user (the server serializes it as JSON via `formatSuccess`). The card
 * hides their result body and shows just the labeled status.
 */
export function isLookupTool(toolName: string): boolean {
  return /^sparky_get_/.test(toolName);
}

/** Resolves the display label + icon for a tool call by name. */
export function getToolDisplay(toolName: string): ToolDisplay {
  const explicit = TOOL_DISPLAY[toolName];
  if (explicit) return explicit;

  const lookup = toolName.match(/^sparky_get_(.+)$/);
  if (lookup) {
    return { label: `Looked up ${humanize(lookup[1]).toLowerCase()}`, icon: 'search' };
  }

  return { label: humanize(toolName.replace(/^sparky_/, '')), icon: 'wrench' };
}
