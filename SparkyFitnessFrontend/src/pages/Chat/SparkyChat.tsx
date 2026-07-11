import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageCircle, Trash2, Minus, ChevronUp, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SparkyChatInterface from './SparkyChatInterface';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import {
  useAIServices,
  useActiveAIService,
  useUserAIPreferences,
  useUpdateUserAIPreferences,
} from '@/hooks/AI/useAIServiceSettings';
import { useState } from 'react';
import { useClearChatHistoryMutation } from '@/hooks/AI/useSparkyChat';
import { useAuth } from '@/hooks/useAuth';

const SparkyChat = () => {
  const { isChatOpen, closeChat } = useChatbotVisibility();
  const { user } = useAuth();
  const { data: services } = useAIServices();
  const { data: activeService } = useActiveAIService(!!user);
  const { data: preferences } = useUserAIPreferences();
  const { mutate: updatePreferences } = useUpdateUserAIPreferences();
  const [resetKey, setResetKey] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const { mutate: clearHistory, isPending: isClearing } =
    useClearChatHistoryMutation();

  const handleClearHistory = () => {
    clearHistory('all', {
      onSuccess: () => {
        setResetKey((prev) => prev + 1);
      },
    });
  };

  // Chatbot is available if the user has any service they can actually use:
  // - their own active service
  // - an admin global (is_public) service
  const usableServices = services?.filter((service) => service.is_active) ?? [];

  const hasEnabledServices = usableServices.length > 0;

  if (!hasEnabledServices) {
    return null;
  }

  const handleServiceSwitch = (serviceId: string) => {
    updatePreferences({
      active_ai_service_id: serviceId,
      auto_clear_history: preferences?.auto_clear_history || 'never',
    });
    // Reset chat since we're switching providers
    setResetKey((prev) => prev + 1);
  };

  const currentServiceId =
    preferences?.active_ai_service_id || activeService?.id || '';

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeChat();
    }
  };

  return (
    // modal={false} keeps the rest of the app interactive while the chat is
    // open (no focus trap, no pointer-events lockout) and we deliberately omit
    // the overlay so the diary/dashboard behind stays usable — the "chat widget"
    // behaviour the user expects instead of a blocking dialog.
    <DialogPrimitive.Root
      open={isChatOpen}
      onOpenChange={handleOpenChange}
      modal={false}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          // Clicking or focusing the main app must NOT close the panel.
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed z-50 flex flex-col bg-background shadow-2xl border transition-all duration-300 ease-in-out',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            isMinimized
              ? 'bottom-4 right-4 h-14 w-[calc(100%-2rem)] sm:w-80 rounded-lg overflow-hidden'
              : 'inset-y-0 right-0 w-full sm:w-[500px] sm:max-w-[500px] border-l p-0'
          )}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b flex flex-col space-y-2 text-left">
              <div className="flex items-center justify-between gap-2">
                <DialogPrimitive.Title
                  className="flex items-center gap-2 shrink-0 text-lg font-semibold text-foreground cursor-pointer"
                  onClick={() => isMinimized && setIsMinimized(false)}
                >
                  <MessageCircle className="h-5 w-5" />
                  Sparky AI Coach
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Your personal AI nutrition and fitness coach.
                </DialogPrimitive.Description>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Provider switcher + clear history are hidden when minimized
                      to keep the collapsed bar compact. */}
                  {!isMinimized && usableServices.length > 1 && (
                    <Select
                      value={currentServiceId}
                      onValueChange={handleServiceSwitch}
                    >
                      <SelectTrigger
                        id="ai-provider-select"
                        className="h-8 text-xs max-w-[160px]"
                      >
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {usableServices.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.service_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {!isMinimized && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleClearHistory}
                      disabled={isClearing}
                      aria-label="Clear chat history"
                      className="shrink-0"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMinimized((prev) => !prev)}
                    aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
                    className="shrink-0"
                  >
                    {isMinimized ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <Minus className="h-5 w-5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={closeChat}
                    aria-label="Close chat"
                    className="shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Keep the interface mounted when minimized so the conversation
                (and any in-flight streaming) is preserved on restore. */}
            <div
              className={cn('flex-1 overflow-hidden', isMinimized && 'hidden')}
            >
              <SparkyChatInterface key={resetKey} />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default SparkyChat;
