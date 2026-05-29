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

interface SparkyChatInnerProps {
  activeAIServiceSetting: { id: string } | null;
  history: Array<{
    id: string;
    content: string;
    isUser: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parts?: any[];
  }>;
}

const SparkyChatInner = ({
  activeAIServiceSetting,
  history,
}: SparkyChatInnerProps) => {
  const invalidateDiary = useDiaryInvalidation();
  const invalidateChat = useChatInvalidation();
  const userDate = formatDateToYYYYMMDD(new Date());

  // Map database message history to ai@6.x UIMessage format (requires `parts`)
  const initialMessages = history.map((msg, i) => {
    // Prioritize structured 'parts' from database if available
    const parts =
      msg.parts && Array.isArray(msg.parts)
        ? msg.parts
        : [{ type: 'text' as const, text: msg.content }];

    return {
      id: msg.id || `history-${i}`,
      role: msg.isUser ? ('user' as const) : ('assistant' as const),
      content: msg.content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parts: parts as any,
    };
  });

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
