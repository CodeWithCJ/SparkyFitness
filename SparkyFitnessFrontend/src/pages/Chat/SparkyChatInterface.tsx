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
import { useToast } from '@/hooks/use-toast';

import { MessagePart, ImagePart } from '@/types/Chatbot_types';
import { type UIMessage } from 'ai';

interface SparkyChatInnerProps {
  activeAIServiceSetting: { id: string } | null;
  history: Array<{
    id: string;
    content: string;
    isUser: boolean;
    parts?: MessagePart[];
  }>;
}

const resizeImageBase64 = (
  base64Str: string,
  maxDim = 1024
): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxDim && height <= maxDim) {
        resolve(base64Str);
        return;
      }

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Convert to JPEG with 0.8 quality to keep size minimal
      const resized = canvas.toDataURL('image/jpeg', 0.8);
      resolve(resized);
    };

    img.onerror = () => {
      resolve(base64Str);
    };

    img.src = base64Str;
  });
};

const SparkyChatInner = ({
  activeAIServiceSetting,
  history,
}: SparkyChatInnerProps) => {
  const invalidateDiary = useDiaryInvalidation();
  const invalidateChat = useChatInvalidation();
  const userDate = formatDateToYYYYMMDD(new Date());
  const { toast } = useToast();

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

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/chat/stream',
      body: {
        service_config_id: activeAIServiceSetting?.id,
        user_date: userDate,
      },
      prepareSendMessagesRequest: async (options: {
        id: string;
        messages: UIMessage[];
        requestMetadata: unknown;
        body: Record<string, unknown> | undefined;
        credentials: RequestCredentials | undefined;
        headers: HeadersInit | undefined;
        api: string;
      }) => {
        // Deep copy/map messages to avoid in-place mutation and process in parallel
        const processedMessages = await Promise.all(
          options.messages.map(async (message) => {
            if (message.role === 'user' && message.parts) {
              const processedParts = await Promise.all(
                message.parts.map(async (part) => {
                  if (
                    part.type === 'file' &&
                    part.mediaType?.startsWith('image/') &&
                    part.url?.startsWith('data:image/')
                  ) {
                    const resizedUrl = await resizeImageBase64(part.url);
                    return { ...part, url: resizedUrl };
                  }
                  return part;
                })
              );
              return { ...message, parts: processedParts };
            }
            return message;
          })
        );

        return {
          body: {
            ...options.body,
            messages: processedMessages,
          },
        };
      },
    }),
    messages: initialMessages,
    onFinish: () => {
      // Invalidate queries to refresh diary nutrition and check-ins in real-time
      invalidateDiary();
      invalidateChat();
    },
    onError: (error) => {
      toast({
        title: 'Chat Error',
        description:
          error.message ||
          'Failed to process message. Please check your AI service settings.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden py-4">
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
