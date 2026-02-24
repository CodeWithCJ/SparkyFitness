import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, ImageIcon, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import DOMPurify from 'dompurify';
import { usePreferences } from '@/contexts/PreferencesContext';
import { info, warn, error } from '@/utils/logging';
import { type Message } from '@/api/Chatbot/sparkyChatService';
import { useActiveAIService } from '@/hooks/AI/useAIServiceSettings';
import {
  useChatHistoryQuery,
  useChatPreferencesQuery,
  useClearChatHistoryMutation,
  useProcessUserInputMutation,
  useSaveMessageMutation,
  useTodaysNutritionQuery,
} from '@/hooks/AI/useSparkyChat';
import { CoachResponse } from '@/types/Chatbot_types';
import { useDiaryInvalidation } from '@/hooks/Diary/useDiaryInvalidation';
import { chatbotKeys } from '@/api/keys/ai';
import { useQueryClient } from '@tanstack/react-query';

const SparkyChatInterface = () => {
  const { formatDateInUserTimezone } = usePreferences();

  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [hasAutoCleared, setHasAutoCleared] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { data: activeAIServiceSetting } = useActiveAIService();
  const { data: userPreferences, isLoading: isPrefsLoading } =
    useChatPreferencesQuery();

  const autoClearHistory = userPreferences?.auto_clear_history || 'never';

  const { data: historyData } = useChatHistoryQuery(
    autoClearHistory,
    !!userPreferences
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const { data: nutritionData } = useTodaysNutritionQuery(
    todayStr,
    !!userPreferences
  );

  const { mutateAsync: saveMessageToHistory } =
    useSaveMessageMutation(autoClearHistory);
  const { mutateAsync: clearChatHistory } = useClearChatHistoryMutation();
  const { mutateAsync: processUserInput } = useProcessUserInputMutation();

  const invalidate = useDiaryInvalidation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (userPreferences?.auto_clear_history === 'all' && !hasAutoCleared) {
      clearChatHistory('all').catch(() => {});
      setHasAutoCleared(true);
    }
  }, [userPreferences, hasAutoCleared, clearChatHistory]);

  const welcomeMessage = useMemo<Message | null>(() => {
    if (!nutritionData) return null;

    const timestamp = new Date();
    return {
      id: 'msg-welcome-default',
      content:
        '👋 **Hi! I\'m Sparky, your AI nutrition coach!**\n\n🍎 I can help you with nutrition advice and healthy living tips\n🏃‍♂️ Ask me about exercise recommendations\n📊 Get insights about your eating habits\n💡 Receive personalized wellness guidance\n\n💬 Try asking: "What should I eat for a healthy breakfast?" or "How can I increase my protein intake?"',
      isUser: false,
      timestamp,
    };
  }, [nutritionData]);

  const displayMessages = useMemo(() => {
    const serverMessages = historyData || [];

    const filteredLocal = localMessages.filter(
      (local) =>
        !serverMessages.some(
          (server) =>
            server.content === local.content && server.isUser === local.isUser
        )
    );

    if (
      serverMessages.length === 0 &&
      filteredLocal.length === 0 &&
      welcomeMessage
    ) {
      return [welcomeMessage];
    }

    return [...serverMessages, ...filteredLocal];
  }, [historyData, localMessages, welcomeMessage]);

  useEffect(() => {
    if (historyData && historyData.length > 0) {
      setLocalMessages([]);
    }
  }, [historyData]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [displayMessages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (!activeAIServiceSetting) {
      toast({
        title: 'Error',
        description:
          'No active AI service configured. Please go to settings to set one up.',
        variant: 'destructive',
      });
      return;
    }

    const currentInput = inputValue.trim();

    const userMessage: Message = {
      id: `temp-user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      content: currentInput,
      isUser: true,
      timestamp: new Date(),
    };

    setLocalMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    info(
      userPreferences?.logging_level || 'INFO',
      `[${transactionId}] Starting message processing for:`,
      currentInput
    );

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const userDate = `${year}-${month}-${day}`;

    try {
      await saveMessageToHistory({
        content: userMessage.content,
        messageType: 'user',
      });

      let response: CoachResponse;

      if (selectedImage) {
        const userMessageWithImage: Message = {
          id: `temp-user-image-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content: currentInput || 'Image uploaded',
          isUser: true,
          timestamp: new Date(),
          metadata: { imageUrl: URL.createObjectURL(selectedImage) },
        };

        setLocalMessages((prev) => [...prev, userMessageWithImage]);

        response = await processUserInput({
          input: currentInput,
          image: selectedImage,
          transactionId,
          lastBotMessageMetadata: null,
          userLoggingLevel: userPreferences?.logging_level || 'INFO',
          formatDateInUserTimezone,
          activeAIServiceSetting,
          messages: displayMessages,
          userDate,
        });

        setSelectedImage(null);
      } else {
        const numberMatch = currentInput.match(/^(\d+)$/);

        if (numberMatch) {
          info(
            userPreferences?.logging_level || 'INFO',
            `[${transactionId}] Numbered input detected:`,
            numberMatch[1]
          );

          const lastBotMessage = displayMessages
            .slice()
            .reverse()
            .find((msg) => !msg.isUser && msg.metadata);

          if (lastBotMessage?.metadata?.foodOptions) {
            response = await processUserInput({
              input: currentInput,
              image: null,
              transactionId,
              lastBotMessageMetadata: lastBotMessage.metadata,
              userLoggingLevel: userPreferences?.logging_level || 'INFO',
              formatDateInUserTimezone,
              activeAIServiceSetting,
              messages: displayMessages,
              userDate,
            });
          } else {
            response = await processUserInput({
              input: currentInput,
              image: null,
              transactionId,
              lastBotMessageMetadata: null,
              userLoggingLevel: userPreferences?.logging_level || 'INFO',
              formatDateInUserTimezone,
              activeAIServiceSetting,
              messages: displayMessages,
              userDate,
            });
          }
        } else {
          response = await processUserInput({
            input: currentInput,
            image: null,
            transactionId,
            lastBotMessageMetadata: null,
            userLoggingLevel: userPreferences?.logging_level || 'INFO',
            formatDateInUserTimezone,
            activeAIServiceSetting,
            messages: displayMessages,
            userDate,
          });
        }
      }

      let botMessageContent = '';
      let messageMetadata = response?.metadata;

      if (response) {
        switch (response.action) {
          case 'food_added':
          case 'exercise_added':
          case 'log_water':
          case 'water_added':
            botMessageContent =
              response.response || 'Entry logged successfully!';
            invalidate();
            queryClient.invalidateQueries({
              queryKey: chatbotKeys.todaysNutrition(todayStr),
            });
            break;
          case 'measurement_added':
            botMessageContent =
              response.response || 'Entry logged successfully!';
            invalidate();
            break;
          case 'food_options':
          case 'exercise_options':
            botMessageContent = response.response;
            messageMetadata = response.metadata;
            break;
          case 'advice':
          case 'chat':
            botMessageContent = response.response;
            break;
          case 'none':
            botMessageContent =
              response.response || "I'm not sure how to handle that request.";
            break;
          default:
            warn(
              userPreferences?.logging_level || 'INFO',
              `[${transactionId}] Unexpected response action:`,
              response.action
            );
            botMessageContent =
              response.response || 'An unexpected response was received.';
            break;
        }
      } else {
        botMessageContent = 'Sorry, I did not receive a valid response.';
      }

      const botMessage: Message = {
        id: `temp-bot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        content: botMessageContent,
        isUser: false,
        timestamp: new Date(),
        metadata: messageMetadata,
      };

      setLocalMessages((prev) => [...prev, botMessage]);

      await saveMessageToHistory({
        content: botMessage.content,
        messageType: 'assistant',
        metadata: botMessage.metadata,
      });
    } catch (err) {
      error(
        userPreferences?.logging_level || 'INFO',
        `[${transactionId}] Error processing message:`,
        err
      );

      const errorMessage: Message = {
        id: `temp-error-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        content:
          'Sorry, I encountered an error. Please check your AI service settings.',
        isUser: false,
        timestamp: new Date(),
      };

      setLocalMessages((prev) => [...prev, errorMessage]);

      toast({
        title: 'Error',
        description:
          'Failed to process your message. Please check your AI service settings.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
    } else {
      setSelectedImage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessage = (message: Message) => {
    let content = message.content;
    content = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');

    if (message.metadata?.imageUrl) {
      content = `<img src="${message.metadata.imageUrl}" alt="Uploaded preview" class="max-w-full h-auto rounded-md mb-2" /><br />${content}`;
    }

    return DOMPurify.sanitize(content);
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {displayMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.isUser
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                }`}
              >
                <div
                  dangerouslySetInnerHTML={{
                    __html: formatMessage(message),
                  }}
                />
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp && !isNaN(message.timestamp.getTime())
                    ? formatDateInUserTimezone(message.timestamp, 'p')
                    : 'Invalid Date'}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div
              className="flex justify-start"
              key="sparky-chat-loading-spinner"
            >
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Sparky is thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        {selectedImage && (
          <div className="mb-4 relative w-32 h-32">
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Selected food image preview"
              className="w-full h-full object-cover rounded-md"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 rounded-full"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about nutrition, exercise, or healthy lifestyle tips..."
            disabled={isLoading}
            className="flex-1"
          />
          <input
            type="file"
            accept="image/*"
            id="image-upload"
            className="hidden"
            onChange={handleImageSelect}
          />
          <label htmlFor="image-upload">
            <Button asChild variant="outline" size="icon" disabled={isLoading}>
              <ImageIcon className="h-4 w-4" />
            </Button>
          </label>
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || (!inputValue.trim() && !selectedImage)}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {isPrefsLoading && (
          <div className="text-xs text-gray-500 mt-1">
            AI coach is initializing...
          </div>
        )}
      </div>
    </div>
  );
};

export default SparkyChatInterface;
