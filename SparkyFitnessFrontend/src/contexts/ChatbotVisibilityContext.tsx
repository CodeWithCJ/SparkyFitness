import type React from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// Pure-local (localStorage, no DB) key for the advanced "show token usage"
// toggle. Persisted here rather than in user_preferences so the feature stays
// entirely client-side.
const TOKEN_STATS_STORAGE_KEY = 'chat_token_stats';

interface ChatbotVisibilityContextType {
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  showTokenStats: boolean;
  setShowTokenStats: (value: boolean) => void;
}

const ChatbotVisibilityContext = createContext<
  ChatbotVisibilityContextType | undefined
>(undefined);

export const useChatbotVisibility = () => {
  const context = useContext(ChatbotVisibilityContext);
  if (!context) {
    throw new Error(
      'useChatbotVisibility must be used within a ChatbotVisibilityProvider'
    );
  }
  return context;
};

export const ChatbotVisibilityProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Shared (not local) state so the settings Switch and the chat Thread, which
  // can be mounted simultaneously, stay in sync. Read once from localStorage on
  // init and mirror every change back, following ThemeContext.
  const [showTokenStats, setShowTokenStats] = useState<boolean>(
    () => localStorage.getItem(TOKEN_STATS_STORAGE_KEY) === 'true'
  );

  useEffect(() => {
    localStorage.setItem(TOKEN_STATS_STORAGE_KEY, String(showTokenStats));
  }, [showTokenStats]);

  const openChat = () => setIsChatOpen(true);
  const closeChat = () => setIsChatOpen(false);
  const toggleChat = () => setIsChatOpen((prev) => !prev);

  return (
    <ChatbotVisibilityContext.Provider
      value={{
        isChatOpen,
        openChat,
        closeChat,
        toggleChat,
        showTokenStats,
        setShowTokenStats,
      }}
    >
      {children}
    </ChatbotVisibilityContext.Provider>
  );
};
