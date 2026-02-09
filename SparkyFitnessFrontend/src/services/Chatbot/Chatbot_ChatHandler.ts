import type { CoachResponse } from './Chatbot_types';
import { debug, type UserLoggingLevel } from '../../utils/logging';

// Function to handle conversational intents (ask_question, chat)
export const processChatInput = async (data: any, aiResponseText: string, userLoggingLevel: UserLoggingLevel): Promise<CoachResponse> => {
  // For conversational intents, the AI's response is often directly usable.
  // The 'data' object might be empty or contain minimal information for these intents.
  // The actual response content is expected in the aiResponseText parameter.

  debug(userLoggingLevel, 'Processing chat input with data:', data);

  return {
    action: data?.intent === 'ask_question' ? 'advice' : 'chat', // Determine action based on original intent if available
    response: aiResponseText || 'Okay, what would you like to talk about?' // Use the AI's response text
  };
};