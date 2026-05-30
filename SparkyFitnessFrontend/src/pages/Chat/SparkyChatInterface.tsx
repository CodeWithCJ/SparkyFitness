import { formatDateToYYYYMMDD } from '@/lib/utils';
import { useActiveAIService } from '@/hooks/AI/useAIServiceSettings';
import { useAuth } from '@/hooks/useAuth';
import {
  useChatInvalidation,
  useDiaryInvalidation,
} from '@/hooks/useInvalidateKeys';
import {
  useChatPreferencesQuery,
  useChatHistoryQuery,
} from '@/hooks/AI/useSparkyChat';
import {
  AssistantChatTransport,
  useChatRuntime,
} from '@assistant-ui/react-ai-sdk';
import { Thread } from '@/components/thread';

import { MessagePart, ImagePart } from '@/types/Chatbot_types';

interface SparkyChatInnerProps {
  activeAIServiceSetting: { id: string } | null;
  history: Array<{
    id: string;
    content: string;
    isUser: boolean;
    parts?: MessagePart[];
  }>;
}

const SparkyChatInner = ({
  activeAIServiceSetting,
  history,
}: SparkyChatInnerProps) => {
  const invalidateDiary = useDiaryInvalidation();
  const invalidateChat = useChatInvalidation();
  const userDate = formatDateToYYYYMMDD(new Date());

  // Map database message history to ai@6.x UIMessage format (requires `parts` + `attachments`)
  const initialMessages = history.map((msg, i) => {
    // Prioritize structured 'parts' from database if available
    const parts: MessagePart[] =
      msg.parts && Array.isArray(msg.parts)
        ? msg.parts
        : [{ type: 'text' as const, text: msg.content }];

    // Reconstruct attachments for messages that have image parts so that assistant-ui can render them
    const attachments = msg.isUser
      ? parts
          .filter((part): part is ImagePart => part.type === 'image')
          .map((part, partIdx: number) => ({
            id: `${msg.id || `history-${i}`}-attachment-${partIdx}`,
            name: `attachment-${partIdx}.png`,
            type: 'image' as const,
            contentType: 'image/png',
            content: [part],
          }))
      : undefined;

    return {
      id: msg.id || `history-${i}`,
      role: msg.isUser ? ('user' as const) : ('assistant' as const),
      content: msg.content,
      parts,
      attachments,
    };
  }) as unknown as NonNullable<
    Parameters<typeof useChatRuntime>[0]
  >['messages'];

  // Create assistant-ui runtime
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/chat/stream',
      body: {
        service_config_id: activeAIServiceSetting?.id,
        user_date: userDate,
      },
    }),
    messages: initialMessages,
    onFinish: () => {
      // Invalidate queries to refresh diary nutrition and check-ins in real-time
      invalidateDiary();
      invalidateChat();
    },
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden p-4">
        <Thread runtime={runtime} />
      </div>
    </div>
  );
};

const SparkyChatInterface = () => {
  const { user } = useAuth();
  const { data: activeAIServiceSetting, isLoading: isActiveServiceLoading } =
    useActiveAIService(!!user);
  const { data: preferences, isLoading: isPrefsLoading } =
    useChatPreferencesQuery();
  const { data: history, isLoading: isHistoryLoading } = useChatHistoryQuery(
    preferences?.auto_clear_history || 'never',
    !!user
  );

  if (isActiveServiceLoading || isPrefsLoading || isHistoryLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <SparkyChatInner
      activeAIServiceSetting={activeAIServiceSetting || null}
      history={history || []}
    />
  );
};

export default SparkyChatInterface;
