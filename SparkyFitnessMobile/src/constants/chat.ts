export interface ChatSuggestion {
  prompt: string;
  labelKey: string;
  defaultLabel: string;
}

/** Canonical English prompts sent to the assistant; labels are localized at render time. */
export const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    prompt: 'Log two eggs and a banana for breakfast',
    labelKey: 'chat.suggestions.breakfast',
    defaultLabel: 'Log two eggs and a banana for breakfast',
  },
  {
    prompt: 'Log a 30 minute run today',
    labelKey: 'chat.suggestions.run',
    defaultLabel: 'Log a 30 minute run today',
  },
  {
    prompt: 'How many calories do I have left today?',
    labelKey: 'chat.suggestions.calories',
    defaultLabel: 'How many calories do I have left today?',
  },
  {
    prompt: 'Suggest a high-protein snack',
    labelKey: 'chat.suggestions.snack',
    defaultLabel: 'Suggest a high-protein snack',
  },
];

export {
  getToolDisplay,
  isLookupTool,
  type ToolDisplay,
} from '@workspace/shared';
