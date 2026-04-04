import { api } from '../api';

export interface TelegramStatusResponse {
  isLinked: boolean;
  chatId: string | null;
}

export interface TelegramLinkCodeResponse {
  code: string;
}

/**
 * Get the current Telegram link status for the user
 */
export const getTelegramStatus = (): Promise<TelegramStatusResponse> => {
  return api.get('/telegram/status');
};

/**
 * Generate a new linking code for Telegram
 */
export const generateTelegramLinkCode =
  (): Promise<TelegramLinkCodeResponse> => {
    return api.post('/telegram/link-code');
  };

/**
 * Unlink the Telegram account from the current user
 */
export const unlinkTelegram = (): Promise<{ message: string }> => {
  return api.post('/telegram/unlink');
};
