
import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, ImageIcon, X } from 'lucide-react';
import { toast } from "@/hooks/use-toast";
import SparkyNutritionCoach from './SparkyNutritionCoach';
import { supabase } from '@/integrations/supabase/client';
import { info, error, warn, UserLoggingLevel } from '@/utils/logging'; // Import logging utilities

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  metadata?: any;
}

interface SparkyChatInterfaceProps {
  userId: string;
}

const SparkyChatInterface = ({ userId }: SparkyChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [userPreferences, setUserPreferences] = useState<any>(null); // State to store user preferences
  const [selectedImage, setSelectedImage] = useState<File | null>(null); // State to store the selected image file
  const coachRef = useRef<any>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load user preferences and chat history when userId is ready
  useEffect(() => {
    
    if (userId) {
      loadUserPreferencesAndHistory();
    }
  }, [userId]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Initialize chat when coach, userId, and preferences are ready
  // Initialize chat when coach, userId, and preferences are ready (runs once on mount)
  useEffect(() => {
    const checkAndInitialize = () => {
      if (userId && userPreferences && coachRef.current && !isInitialized) {
        initializeChat();
      } else if (!isInitialized) {
        // If not initialized but dependencies aren't ready, check again
        setTimeout(checkAndInitialize, 100);
      }
    };

    checkAndInitialize();

    // Cleanup function (optional, but good practice)
    return () => {
      // Any cleanup needed when the component unmounts
    };
  }, [userId, userPreferences, isInitialized]); // Dependencies for the effect (userId and preferences might load async)


  // Effect to listen for clear chat history event
  useEffect(() => {
    const handleClearChatHistory = async () => {
      if (coachRef.current) {
        setIsLoading(true);
        try {
          await coachRef.current.clearHistory('manual'); // Call clear history function
          setMessages([]); // Clear local state
          toast({
            title: "Chat Cleared",
            description: "Your chat history has been cleared.",
          });
        } catch (error) {
          console.error('SparkyChatInterface: Error clearing chat history:', error);
           toast({
            title: "Error",
            description: "Failed to clear chat history.",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      }
    };

    window.addEventListener('clearChatHistory', handleClearChatHistory);

    return () => {
      window.removeEventListener('clearChatHistory', handleClearChatHistory);
    };
  }, [userId, coachRef.current]); // Dependencies for the effect

  const loadUserPreferencesAndHistory = async () => {
    if (!userId) return;

    // Load user preferences
    const { data: preferencesData, error: preferencesError } = await supabase
      .from('user_preferences')
      .select('auto_clear_history')
      .eq('user_id', userId)
      .single();

    if (preferencesError) {
      console.error('Error loading user preferences:', preferencesError);
      // Continue without preferences if there's an error
      setUserPreferences({ auto_clear_history: 'never' }); // Default to never clear
    } else {
      setUserPreferences(preferencesData || { auto_clear_history: 'never' });
    }

    // Load chat history based on preference
    let historyQuery = supabase
      .from('sparky_chat_history')
      .select('id, content, message_type, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    const autoClearHistory = preferencesData?.auto_clear_history || 'never';

    // Clear history based on preference before loading (only for 'all')
    if (autoClearHistory === 'all') {
      // Use the clearHistory function from the coach ref
      await coachRef.current.clearHistory('all');
      // After clearing for 'all', the history query will naturally return empty
    } else if (autoClearHistory === '7days') {
      // The database function handles clearing older than 7 days,
      // so we only need to filter the *loading* query here.
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      historyQuery = historyQuery.gte('created_at', sevenDaysAgo.toISOString());
    } else {
      // 'never' or 'session' - load all history
      // For 'session', history is cleared on unmount (tab/window close)
      // No additional filter needed here
    }


    const { data: historyData, error: historyError } = await historyQuery;

    if (historyError) {
      console.error('Error loading chat history:', historyError);
    } else {
      const formattedHistory: Message[] = (historyData || []).map(item => ({
        id: item.id,
        content: item.content,
        isUser: item.message_type === 'user',
        timestamp: new Date(item.created_at),
        metadata: item.metadata
      }));
      setMessages(formattedHistory);
    }
    
    // Mark as initialized after loading history and preferences
    setIsInitialized(true);
  };


  const initializeChat = async () => {
    // Prevent multiple initializations
    if (isInitialized) {
      return;
    }

    // The check for coachRef.current is now handled in the useEffect
    // if (!coachRef.current) {
    //   setTimeout(() => {
    //     if (!isInitialized) {
    //       initializeChat();
    //     }
    //   }, 500);
    //   return;
    // }

    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const nutritionData = await coachRef.current.getTodaysNutrition(today);
      
      // Only add welcome message if no messages were loaded from history AND messages state is still empty
      // This prevents adding the welcome message if history was loaded but was empty
      
      // Only add welcome message if no messages were loaded from history AND messages state is still empty
      // This prevents adding the welcome message if history was loaded but was empty
      if (messages.length === 0) {
        if (nutritionData && nutritionData.analysis) {
          const welcomeMessage: Message = {
            id: `msg-${Date.now()}`,
            content: `👋 **Hi there! I'm Sparky, your AI nutrition coach!**\n\n${nutritionData.analysis}\n\n💡 **Tips for today:**\n${nutritionData.tips}\n\n🗣️ Ask me about nutrition, exercise, or healthy lifestyle tips! I can help you:\n• Understand your nutrition data\n• Suggest meal improvements\n• Provide exercise recommendations\n• Give wellness advice\n• Track food and workouts`,
            isUser: false,
            timestamp: new Date()
          };
          setMessages(prevMessages => [...prevMessages, welcomeMessage]);
        } else {
          const defaultMessage: Message = {
            id: `msg-${Date.now()}`,
            content: '👋 **Hi! I\'m Sparky, your AI nutrition coach!**\n\n🍎 I can help you with nutrition advice and healthy living tips\n🏃‍♂️ Ask me about exercise recommendations\n📊 Get insights about your eating habits\n💡 Receive personalized wellness guidance\n\n💬 Try asking: "What should I eat for a healthy breakfast?" or "How can I increase my protein intake?"',
            isUser: false,
            timestamp: new Date()
          };
          setMessages(prevMessages => [...prevMessages, defaultMessage]);
        }
      } else {
        // If messages were loaded from history, do not add a welcome message.
      }
      // setIsInitialized(true); // Moved to loadUserPreferencesAndHistory
    } catch (error) {
      console.error('SparkyChatInterface: Error initializing chat:', error);
      // Only add error message if no messages exist after loading history
      if (messages.length === 0) { // Check if messages state is empty after loading history
        const errorMessage: Message = {
          id: `msg-${Date.now()}`,
          content: '👋 **Hi! I\'m Sparky, your nutrition coach!**\n\n🥗 Ask me about nutrition and healthy eating\n💪 Get exercise and wellness tips\n📈 Learn about balanced nutrition\n\nI\'m here to help you achieve your health goals!',
          isUser: false,
          timestamp: new Date()
        };
        setMessages([errorMessage]);
      }
      // setIsInitialized(true); // Moved to loadUserPreferencesAndHistory
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // Check if coach is ready
    if (!coachRef.current) {
      error(userPreferences?.logging_level || 'INFO', 'SparkyChatInterface: Coach is not ready');
      toast({
        title: "Error",
        description: "AI coach is not ready yet. Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      content: inputValue.trim(),
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    // Save user message to history
    coachRef.current.saveMessageToHistory(userMessage.content, 'user'); // Corrected call
    
    const currentInput = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    
    try {
      let response;
      
      // If an image is selected, send both text and image
      if (selectedImage) {
        // Create a temporary user message to show the image preview in the chat
        const userMessageWithImage: Message = {
          id: `msg-${Date.now()}-user-image`,
          content: inputValue.trim() || 'Image uploaded', // Use input value or a default message
          isUser: true,
          timestamp: new Date(),
          metadata: { imageUrl: URL.createObjectURL(selectedImage) } // Store image URL for preview
        };
        setMessages(prev => [...prev, userMessageWithImage]);
        
        response = await coachRef.current.processUserInput(inputValue.trim(), selectedImage);
        setSelectedImage(null); // Clear the selected image after sending
        
      } else {
        // Check if it's a numbered response (for food options)
        const numberMatch = currentInput.match(/^(\d+)$/);
        
        if (numberMatch) {
          console.log('Numbered input detected:', numberMatch[1]);
          // Handle numbered responses for food options
          const lastBotMessage = messages.slice().reverse().find(msg => !msg.isUser && msg.metadata);
          console.log('Last bot message with metadata:', lastBotMessage);
          
          if (lastBotMessage?.metadata?.foodOptions) {
            const optionIndex = parseInt(numberMatch[1]) - 1;
            info(userPreferences?.logging_level || 'INFO', 'Processing food option selection:', optionIndex, lastBotMessage.metadata);
            response = await coachRef.current.addFoodOption(optionIndex, lastBotMessage.metadata);
          } else {
            info(userPreferences?.logging_level || 'INFO', 'No food options metadata found on last bot message, processing as new input.');
            response = await coachRef.current.processUserInput(currentInput);
          }
        } else {
          info(userPreferences?.logging_level || 'INFO', 'Processing input as new request:', currentInput);
          response = await coachRef.current.processUserInput(currentInput);
        }
      }
      
      info(userPreferences?.logging_level || 'INFO', 'Received response from coach:', response);
      
      // Handle different response scenarios based on action type
      let botMessageContent = '';
      let messageMetadata = response?.metadata; // Preserve metadata
      
      if (response) {
        switch (response.action) {
          case 'food_added':
          case 'exercise_added':
          case 'measurement_added':
            // For successful logging actions, display the confirmation message from the coach
            botMessageContent = response.response || 'Entry logged successfully!';
            // Trigger data refresh after a short delay
            setTimeout(async () => {
              try {
                const today = new Date().toISOString().split('T')[0];
                const nutritionData = await coachRef.current.getTodaysNutrition(today);
                if (nutritionData && nutritionData.analysis) {
                  const updateMessage: Message = {
                    id: `msg-${Date.now()}-update`,
                    content: `📊 **Updated Progress:**\n${nutritionData.analysis}\n\n💡 **Coaching tip:** ${nutritionData.tips}`,
                    isUser: false,
                    timestamp: new Date()
                  };
                  setMessages(prev => [...prev, updateMessage]);
                  
                  // Trigger global data refresh (e.g., food diary, measurements)
                  window.dispatchEvent(new Event('foodDiaryRefresh'));
                  window.dispatchEvent(new Event('measurementsRefresh'));
                }
              } catch (error) {
                console.error('SparkyChatInterface: Error refreshing data after logging:', error);
              }
            }, 1000);
            break;
          case 'food_options':
          case 'exercise_options':
            // For options, display the options and store metadata for the next user response
            botMessageContent = response.response;
            messageMetadata = response.metadata; // Ensure metadata with options is saved
            break;
          case 'advice':
          case 'chat':
            // For conversational responses, display the AI's reply
            botMessageContent = response.response;
            break;
          case 'none':
            // For 'none' action, display the provided response (e.g., error or clarification)
            botMessageContent = response.response || 'I\'m not sure how to handle that request.';
            break;
          default:
            // Fallback for unexpected actions
            warn(userPreferences?.logging_level || 'INFO', 'SparkyChatInterface: Unexpected response action:', response.action);
            botMessageContent = response.response || 'An unexpected response was received.';
            break;
        }
      } else {
        // Handle case where response is null or undefined
        warn(userPreferences?.logging_level || 'INFO', 'SparkyChatInterface: Received null or undefined response from coach');
        botMessageContent = 'Sorry, I did not receive a valid response.';
      }
      
      
      const botMessage: Message = {
        id: `msg-${Date.now()}-bot`,
        content: botMessageContent,
        isUser: false,
        timestamp: new Date(),
        metadata: messageMetadata // Use the potentially updated metadata
      };
      
      // Always add the bot message after processing, regardless of whether an image was sent
      setMessages(prev => [...prev, botMessage]);
      // Save bot message to history
      coachRef.current.saveMessageToHistory(botMessage.content, 'assistant', botMessage.metadata); // Corrected call
      
      
    } catch (err) {
      error(userPreferences?.logging_level || 'INFO', 'SparkyChatInterface: Error processing message:', err);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        content: 'Sorry, I encountered an error. Please check that you have AI services configured in Settings. In the meantime, I can still provide general nutrition and wellness advice! 🌟',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Error",
        description: "Failed to process your message. Please check your AI service settings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for image file selection
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      // Optionally, clear the input value if an image is selected
      // setInputValue('');
    } else {
      setSelectedImage(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Modify formatMessage to handle image previews
  const formatMessage = (message: Message) => {
    let content = message.content;
    // Simple markdown-like formatting
    content = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');

    // Add image preview if metadata contains imageUrl
    if (message.metadata?.imageUrl) {
      content = `<img src="${message.metadata.imageUrl}" alt="Uploaded image preview" class="max-w-full h-auto rounded-md mb-2" /><br />${content}`;
    }

    return content;
  };

  return (
    <div className="flex flex-col h-full">
      <SparkyNutritionCoach
        ref={coachRef}
        userId={userId}
        userLoggingLevel={userPreferences?.auto_clear_history || 'INFO'} // Pass logging level
      />
      
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
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
                    __html: formatMessage(message) // Pass the whole message object
                  }}
                />
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Sparky is thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        {/* Image Preview */}
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
              onClick={() => setSelectedImage(null)} // Add a way to remove the image
            >
              <X className="h-4 w-4" /> {/* Assuming X icon is available or will be added */}
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about nutrition, exercise, or healthy lifestyle tips..."
            disabled={isLoading || !coachRef.current}
            className="flex-1"
          />
          {/* Add file input for image upload */}
          <input
            type="file"
            accept="image/*"
            id="image-upload"
            className="hidden"
            onChange={handleImageSelect} // Add onChange handler
          />
          <label htmlFor="image-upload">
            <Button
              asChild
              variant="outline"
              size="icon"
              disabled={isLoading || !coachRef.current}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </label>
          {/* Add Clear History Button */}
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || (!inputValue.trim() && !selectedImage) || !coachRef.current} // Disable if no text and no image
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!coachRef.current && (
          <div className="text-xs text-gray-500 mt-1">
            AI coach is initializing...
          </div>
        )}
      </div>
    </div>
  );
};

export default SparkyChatInterface;

