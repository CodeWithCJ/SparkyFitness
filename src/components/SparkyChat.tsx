
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { MessageCircle, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import SparkyChatInterface from './SparkyChatInterface';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';

const SparkyChat = () => {
  const { user } = useAuth();
  const { isChatOpen, closeChat } = useChatbotVisibility();
  const [hasEnabledServices, setHasEnabledServices] = useState(false); // Keep this state

  useEffect(() => {
    if (user) {
      checkEnabledServices();
    }
  }, [user]);

  const checkEnabledServices = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_service_settings')
        .select('is_active')
        .eq('user_id', user?.id)
        .eq('is_active', true);

      if (error) {
        console.error('Error checking AI services:', error);
        return;
      }

      setHasEnabledServices(data && data.length > 0);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Temporarily render the chat even if no enabled services for debugging
  // if (!hasEnabledServices) {
  //   return null;
  // }

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
            <SparkyChatInterface userId={user?.id || ''} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SparkyChat;
