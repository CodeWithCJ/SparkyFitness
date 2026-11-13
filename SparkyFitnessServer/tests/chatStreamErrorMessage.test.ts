import { describe, expect, it } from 'vitest';
import { APICallError, RetryError } from 'ai';
import { chatStreamErrorMessage } from '../services/chatService.js';

const apiError = (message: string) =>
  new APICallError({
    message,
    url: 'https://example.test/v1/chat/completions',
    requestBodyValues: { messages: [{ role: 'user', content: 'private' }] },
    statusCode: 403,
  });

describe('chatStreamErrorMessage', () => {
  it('passes a provider API error message through', () => {
    expect(
      chatStreamErrorMessage(apiError('Model requires a privacy setting.'))
    ).toBe('Model requires a privacy setting.');
  });

  it('unwraps the last error of an exhausted retry', () => {
    const retry = new RetryError({
      message: 'Failed after 4 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [apiError('Rate limited.')],
    });
    expect(chatStreamErrorMessage(retry)).toBe('Rate limited.');
  });

  it('truncates a long provider message', () => {
    const text = chatStreamErrorMessage(apiError('x'.repeat(900)));
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(501);
  });

  it('keeps other errors generic so internal details stay private', () => {
    expect(chatStreamErrorMessage(new Error('db password is wrong'))).toBe(
      'The AI service could not complete the request.'
    );
    expect(chatStreamErrorMessage('boom')).toBe(
      'The AI service could not complete the request.'
    );
  });
});
