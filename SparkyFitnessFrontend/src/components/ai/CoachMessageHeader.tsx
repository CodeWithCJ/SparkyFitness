import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useAuiState } from '@assistant-ui/react';
import { readChatCoachMessage } from '@workspace/shared';
import { becauseText, coachName } from '@/utils/coachLabels';

/**
 * The coach's name above a message it sent, and the numbers behind it in a
 * small "Because" line. A message written without an AI shows the translated
 * fixed text for its rule instead.
 */
export function CoachMessageHeader() {
  const { t } = useTranslation();
  const message = useAuiState((s) => s.message);
  if (message.role !== 'assistant') return null;
  const coach = readChatCoachMessage(message.metadata);
  if (!coach) return null;
  return (
    <div className="mb-1 text-sm" data-testid="coach-message-header">
      <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {coachName(t, coach.builtinKey, coach.name)}
      </p>
      {coach.because.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('coaches.because', 'Because: {{reason}}', {
            reason: becauseText(t, coach.because),
          })}
        </p>
      )}
    </div>
  );
}
