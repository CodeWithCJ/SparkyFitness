import { debug, info, error } from '@/utils/logging';
import { apiCall } from '@/services/api';

// Helper function to convert File to Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// Function to save a message to the database
export const saveMessageToHistory = async (
  content: string,
  messageType: 'user' | 'assistant',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any
) => {
  try {
    debug(null, 'Attempting to save message to history:', {
      content,
      messageType,
      metadata,
    }); // Added logging
    await apiCall('/chat/save-history', {
      method: 'POST',
      body: { content, messageType, metadata },
    });
    info(null, '✅ Message saved to history.'); // Added logging
  } catch (err) {
    error(
      null,
      '❌ [Nutrition Coach] Unexpected error saving message to history:',
      err
    );
  }
};

// Function to clear chat history based on preference
export const clearHistory = async (autoClearPreference: string) => {
  try {
    info(
      null,
      `Attempting to clear history with preference: ${autoClearPreference}`
    );
    if (
      autoClearPreference === 'session' ||
      autoClearPreference === 'all' ||
      autoClearPreference === 'manual'
    ) {
      info(null, `Clearing all chat history.`);
      try {
        await apiCall('/chat/clear-all-history', {
          method: 'POST',
          body: {}, // No body needed, user is identified by JWT
        });
        info(null, '✅ All chat history cleared via backend.');
      } catch (fetchError) {
        error(
          null,
          '❌ [Nutrition Coach] Network error calling clear_all_chat_history backend:',
          fetchError
        );
      }
    } else if (autoClearPreference === '7days') {
      info(null, `Calling backend to clear old chat history.`);
      try {
        await apiCall('/chat/clear-old-history', {
          method: 'POST',
          // No body needed for this endpoint based on current backend implementation
        });
        info(null, '✅ Old chat history cleared via backend.');
      } catch (fetchError) {
        error(
          null,
          '❌ [Nutrition Coach] Network error calling clear_old_chat_history backend:',
          fetchError
        );
      }
    } else {
      info(
        null,
        'ℹ️ Chat history not cleared based on preference:',
        autoClearPreference
      );
    }
  } catch (err) {
    error(
      null,
      '❌ [Nutrition Coach] Unexpected error clearing chat history:',
      err
    );
  }
};

// Note: Extraction functions and generateFoodOptions will be moved to specific handlers or refactored.
