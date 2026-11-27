import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useCoachSettings } from '@/hooks/Coaches/useCoaches';
import { coachName } from '@/utils/coachLabels';

const SPARKY_VALUE = 'sparky';

/**
 * Sparky and each coach that has a thread: one chat, many voices. A dot marks
 * a coach with unread messages.
 */
export function CoachThreadPicker() {
  const { t } = useTranslation();
  const { activeCoachId, setActiveCoachId } = useChatbotVisibility();
  const { data } = useCoachSettings();
  const coaches = (data?.coaches ?? []).filter(
    (coach) => coach.id && (coach.enabled || coach.unread > 0)
  );
  if (coaches.length === 0) return null;

  const options = [
    {
      id: null as string | null,
      label: t('coaches.thread.sparky', 'Sparky'),
      unread: 0,
    },
    ...coaches.map((coach) => ({
      id: coach.id,
      label: coachName(t, coach.builtin_key, coach.name),
      unread: coach.unread,
    })),
  ];

  const current = options.find((option) => option.id === activeCoachId);
  const othersUnread = options.some(
    (option) => option.unread > 0 && option.id !== activeCoachId
  );
  const unreadLabel = (count: number) =>
    t('coaches.thread.unread', '{{count}} unread', { count });

  return (
    <Select
      value={activeCoachId ?? SPARKY_VALUE}
      onValueChange={(value) =>
        setActiveCoachId(value === SPARKY_VALUE ? null : value)
      }
    >
      <SelectTrigger
        className="h-9 w-full"
        aria-label={t('coaches.thread.label', 'Chat with')}
      >
        <span className="flex min-w-0 items-center gap-2">
          <SelectValue>{current?.label}</SelectValue>
          {othersUnread && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-red-500"
              aria-label={t('coaches.thread.otherUnread', 'Unread messages')}
            />
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.id ?? SPARKY_VALUE}
            value={option.id ?? SPARKY_VALUE}
          >
            <span className="flex items-center gap-2">
              {option.label}
              {option.unread > 0 && (
                <span
                  className="h-2 w-2 rounded-full bg-red-500"
                  aria-label={unreadLabel(option.unread)}
                />
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
