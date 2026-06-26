import { Button } from '@/components/ui/button';
import { MessageCircle, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
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

  return (
    <Sheet open={isChatOpen} onOpenChange={closeChat}>
      <SheetContent side="right" className="w-full sm:w-[500px] p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle className="flex items-center gap-2 shrink-0">
                <MessageCircle className="h-5 w-5" />
                Sparky AI Coach
              </SheetTitle>
              <SheetDescription className="sr-only">
                Your personal AI nutrition and fitness coach.
              </SheetDescription>

              {/* Provider switcher — only shown when multiple usable services exist */}
              {usableServices.length > 1 && (
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
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden">
            <SparkyChatInterface key={resetKey} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SparkyChat;
