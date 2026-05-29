import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Overwrite the encryption key to match the test/local database key if different
process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY =
  process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY ||
  '7bee6b7620e1d8b4be251c2e50728409299a412c55f46d853eba100b35163428';

import { describe, it, expect } from 'vitest';
import { streamText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import chatRepository from '../models/chatRepository.js';
import { auth } from '../auth.js';

describe('MCP Chat Integration Tool-Calling', () => {
  it('should call tools when user logs food', async () => {
    const userId = '4f9c5565-ed2e-4e1c-beae-19510484d26d';

    // Retrieve active AI configuration for testing
    const activeSetting =
      await chatRepository.getActiveAiServiceSetting(userId);
    expect(activeSetting).toBeDefined();

    const decrypted = await chatRepository.getAiServiceSettingForBackend(
      activeSetting!.id,
      userId
    );
    expect(decrypted).toBeDefined();

    console.log(
      `Loaded testing setting: service_type=${decrypted!.service_type}, model_name=${decrypted!.model_name}`
    );

    // Setup provider model instance
    let modelInstance: any;
    const apiKey = decrypted!.api_key;
    const modelName = decrypted!.model_name;

    if (decrypted!.service_type === 'openai') {
      const provider = createOpenAI({ apiKey });
      modelInstance = provider.chat(modelName);
    } else if (decrypted!.service_type === 'anthropic') {
      const provider = createAnthropic({ apiKey });
      modelInstance = provider(modelName);
    } else if (decrypted!.service_type === 'google') {
      const provider = createGoogleGenerativeAI({ apiKey });
      modelInstance = provider(modelName);
    } else {
      let baseURL = decrypted!.custom_url;
      if (decrypted!.service_type === 'ollama') {
        baseURL = `${decrypted!.custom_url}/v1`;
      } else if (decrypted!.service_type === 'groq') {
        baseURL = 'https://api.groq.com/openai/v1';
      } else if (decrypted!.service_type === 'openrouter') {
        baseURL = 'https://openrouter.ai/api/v1';
      } else if (decrypted!.service_type === 'mistral') {
        baseURL = 'https://api.mistral.ai/v1';
      }
      const provider = createOpenAI({
        baseURL,
        apiKey: apiKey || 'no-key',
      });
      modelInstance = provider.chat(modelName);
    }

    // Connect to MCP Server via Stdio transport
    const indexCjsPath = path.resolve(
      process.cwd(),
      '../SparkyFitnessMCP/dist/index.cjs'
    );

    // Generate temporary API key for local MCP client authentication in the test database
    const apiResult = await (auth.api as any).createApiKey({
      body: {
        userId,
        name: 'test',
      },
    });
    const testApiKey = apiResult.key;
    const testApiKeyId = apiResult.id;
    console.log(
      `Generated temporary API key in database for testing: id=${testApiKeyId}`
    );

    const mcpClient = await createMCPClient({
      transport: new StdioClientTransport({
        command: 'node',
        args: [indexCjsPath],
        env: {
          ...process.env,
          SPARKY_FITNESS_API_KEY: testApiKey,
          MCP_TRANSPORT: 'stdio',
        },
      }),
    });

    const allTools = await mcpClient.tools();
    const chatbotTools: Record<string, any> = {};
    for (const [key, tool] of Object.entries(allTools)) {
      const isBlocked = [
        'sparky_run_project_tests',
        'sparky_inspect_schema',
      ].includes(key);
      if (!isBlocked) {
        chatbotTools[key] = tool;
      }
    }
    console.log(
      `Loaded tools from MCP client: ${Object.keys(chatbotTools).join(', ')}`
    );

    const messages = [
      { role: 'user' as const, content: 'log chicken pasta for lunch today' },
    ];

    const systemPromptContent = `You are Sparky, an AI nutrition and wellness coach. Your primary goal is to help users track their food, exercise, and measurements, and provide helpful advice and motivation based on their data and general health knowledge.

The current local date is 2026-05-29.

When the user mentions logging food, exercise, or measurements, prioritize using the matching tools.

Here are the user's existing custom measurement categories:
None

When logging measurements or custom categories, compare user inputs to the list above. If you find a match or variations (synonyms, capitalization), use the exact category name.

For solid food items or beverages that are not water, use the 'sparky_manage_food' tool. Do NOT classify water as food. Use the 'sparky_manage_water' tool for water intake.

Be precise with data extraction, search the database first if needed, and call the correct tools.`;

    const executedTools: Array<{ name: string; args: any }> = [];

    try {
      const result = streamText({
        model: modelInstance,
        system: systemPromptContent,
        messages: messages as any,
        tools: chatbotTools,
        stopWhen: stepCountIs(10),
        onChunk({ chunk }) {
          if (chunk.type === 'text-delta') {
            process.stdout.write(chunk.text);
          }
        },
        onStepFinish({ toolCalls }) {
          if (toolCalls && toolCalls.length > 0) {
            toolCalls.forEach((call: any) => {
              console.log(
                `\n\n[VITEST TOOL CALL]: ${call.toolName} with args:`,
                call.args
              );
              executedTools.push({
                name: call.toolName,
                args: call.args,
              });
            });
          }
        },
      });

      // Wait for the stream to fully complete
      await result.text;

      console.log('\n\nExecuted tools list in test run:', executedTools);
      expect(executedTools.length).toBeGreaterThan(0);
      expect(executedTools[0].name).toBe('sparky_manage_food');
    } finally {
      await mcpClient.close().catch(() => {});
      // Delete temporary test key from database
      if (testApiKeyId) {
        await (auth.api as any)
          .deleteApiKey({
            apiKeyId: testApiKeyId,
            userId,
          })
          .catch(() => {});
        console.log('Cleaned up temporary test key from database');
      }
    }
  }, 45000); // 45 second timeout for model API requests
});
