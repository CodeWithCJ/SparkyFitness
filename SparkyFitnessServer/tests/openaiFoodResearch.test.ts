import { describe, expect, it } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { buildChatProviderOptions } from '../services/chatService.js';

describe('GPT-6 food research protocol', () => {
  it.each(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol'])(
    'sends supported options and preserves citations for %s',
    async (model) => {
      let request: Record<string, unknown> = {};
      let endpoint = '';
      const provider = createOpenAI({
        apiKey: 'test-placeholder',
        fetch: async (url, init) => {
          endpoint = String(url);
          request = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              id: 'resp_food_test',
              object: 'response',
              created_at: 1,
              status: 'completed',
              model,
              output: [
                {
                  type: 'message',
                  id: 'msg_food_test',
                  role: 'assistant',
                  status: 'completed',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Verified label.',
                      annotations: [
                        {
                          type: 'url_citation',
                          start_index: 0,
                          end_index: 14,
                          url: 'https://example.com/official-label',
                          title: 'Official label',
                        },
                      ],
                    },
                  ],
                },
              ],
              usage: {
                input_tokens: 10,
                output_tokens: 3,
                total_tokens: 13,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });
      const result = await generateText({
        model: provider.responses(model),
        prompt: 'Check the official bread label.',
        providerOptions: buildChatProviderOptions(
          'openai',
          'user-1',
          model,
          'high'
        ),
        tools: {
          web_search: provider.tools.webSearch({ searchContextSize: 'high' }),
        },
      });
      expect(endpoint).toBe('https://api.openai.com/v1/responses');
    expect(request.reasoning).toMatchObject({ effort: 'high' });
      expect(request.prompt_cache_options).toEqual({ ttl: '30m' });
      expect(request.prompt_cache_retention).toBeUndefined();
      expect(request.temperature).toBeUndefined();
      expect(request.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'web_search' }),
        ])
      );
      expect(result.text).toBe('Verified label.');
      expect(result.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceType: 'url',
            url: 'https://example.com/official-label',
            title: 'Official label',
          }),
        ])
      );
    }
  );
});
