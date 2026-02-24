import { Button } from '@/components/ui/button';
import { MessageCircle, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import SparkyChatInterface from './SparkyChatInterface';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useAIServices } from '@/hooks/AI/useAIServiceSettings';
import { useState } from 'react';
import { useClearChatHistoryMutation } from '@/hooks/AI/useSparkyChat';

const SparkyChat = () => {
  const { isChatOpen, closeChat } = useChatbotVisibility();
  const { data: services } = useAIServices();
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
  const hasEnabledServices =
    services?.some((service) => service.is_active) ?? false;

  if (!hasEnabledServices) {
    return null;
  }

  return (
    <Sheet open={isChatOpen} onOpenChange={closeChat}>
      <SheetContent side="right" className="w-full sm:w-[500px] p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="p-6 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Sparky AI Coach
              </SheetTitle>
              <SheetDescription>
                Your personal AI nutrition and fitness coach.
              </SheetDescription>
              {/* Add Clear History Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearHistory}
                disabled={isClearing}
                aria-label="Clear chat history"
                className="ml-auto" // Push button to the right
              >
                {/* Using Trash2 icon for clear */}
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
