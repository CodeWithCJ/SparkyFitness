
import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { MessageCircle, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from '@/hooks/useAuth';
import SparkyChatInterface from './SparkyChatInterface';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { getAIServices } from '@/services/aiServiceSettingsService';

const SparkyChat = () => {
  const { user, loading } = useAuth(); // Get loading state from useAuth
  const { isChatOpen, closeChat } = useChatbotVisibility();
  const [hasEnabledServices, setHasEnabledServices] = useState(false); // Keep this state

  const checkEnabledServices = useCallback(async () => {
    if (loading) { // Do not proceed if authentication is still loading
      setHasEnabledServices(false);
      return;
    }
    try {
      const services = await getAIServices();
      const enabled = services.some(service => service.is_active);
      setHasEnabledServices(enabled);
    } catch (error) {
      console.error('Error fetching AI services:', error);
      setHasEnabledServices(false);
    }
  }, [loading]); // Add loading to dependency array

  useEffect(() => {
    checkEnabledServices();
  }, [checkEnabledServices]);

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
                onClick={() => {
                  // This will be handled by the SparkyChatInterface component
                  // We just need to trigger the action
                  const event = new CustomEvent('clearChatHistory');
                  window.dispatchEvent(event);
                }}
                aria-label="Clear chat history"
                className="ml-auto" // Push button to the right
              >
                {/* Using Trash2 icon for clear */}
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden">
            <SparkyChatInterface />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SparkyChat;
