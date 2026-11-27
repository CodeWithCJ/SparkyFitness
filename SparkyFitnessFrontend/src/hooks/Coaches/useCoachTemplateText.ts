import { useTranslation } from 'react-i18next';
import { useAuiState } from '@assistant-ui/react';
import { readChatCoachMessage } from '@workspace/shared';

/** The fixed message for a coach that wrote without an AI, in the person's
 * language. Null when the text came from the AI. */
export function useCoachTemplateText(): string | null {
  const { t } = useTranslation();
  const message = useAuiState((s) => s.message);
  const coach =
    message.role === 'assistant'
      ? readChatCoachMessage(message.metadata)
      : null;
  if (!coach?.templateKey) return null;
  return t(coach.templateKey, {
    ...coach.templateParams,
    defaultValue: '',
  });
}
