import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import {
  jsonSchema,
  simulateReadableStream,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import {
  createChatApprovalGate,
  needsOutsideApproval,
  outsideResultSeen,
} from '../ai/chatToolApproval.js';

describe('outside chat approval policy', () => {
  it('the SDK approval callback sees earlier steps outside results in one streamText call', async () => {
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            {
              type: 'tool-call' as const,
              toolCallId: `call-${step}`,
              toolName: step++ === 0 ? 'mcp_notes' : 'sparky_write',
              input: '{}',
            },
            {
              type: 'finish' as const,
              finishReason: { unified: 'tool-calls' as const, raw: undefined },
              usage,
            },
          ],
        }),
      }),
    });
    const write = vi.fn(async () => 'saved');
    const gate = createChatApprovalGate([
      { role: 'user', content: 'Read notes and save.' },
    ]);
    const observations: boolean[] = [];
    const result = streamText({
      model,
      prompt: 'Read notes and save.',
      tools: {
        mcp_notes: tool({
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: async () => 'outside result',
        }),
        sparky_write: tool({
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: write,
        }),
      },
      prepareStep: (options) => {
        gate.prepareStep(options);
        return {};
      },
      toolApproval: (options) => {
        if (options.toolCall.toolName === 'sparky_write') {
          observations.push(
            options.messages.some(
              (message) =>
                message.role === 'tool' &&
                message.content.some(
                  (part) =>
                    part.type === 'tool-result' && part.toolName === 'mcp_notes'
                )
            )
          );
        }
        return gate.toolApproval(options);
      },
      stopWhen: stepCountIs(3),
    });
    const chunks = [];
    for await (const chunk of result.fullStream) chunks.push(chunk);
    expect(observations).toEqual([true]);
    expect(write).not.toHaveBeenCalled();
    expect(chunks.some((chunk) => chunk.type === 'tool-approval-request')).toBe(
      true
    );
  });

  it('treats an outside tool error as an outside result within one streamText call', async () => {
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            {
              type: 'tool-call' as const,
              toolCallId: `call-${step}`,
              toolName: step++ === 0 ? 'mcp_notes' : 'sparky_write',
              input: '{}',
            },
            {
              type: 'finish' as const,
              finishReason: { unified: 'tool-calls' as const, raw: undefined },
              usage,
            },
          ],
        }),
      }),
    });
    const write = vi.fn(async () => 'saved');
    const gate = createChatApprovalGate([
      { role: 'user', content: 'Read notes and save.' },
    ]);
    const observations: boolean[] = [];
    const result = streamText({
      model,
      prompt: 'Read notes and save.',
      tools: {
        mcp_notes: tool({
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: async (): Promise<string> => {
            throw new Error('text the outside server chose');
          },
        }),
        sparky_write: tool({
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: write,
        }),
      },
      prepareStep: (options) => {
        gate.prepareStep(options);
        return {};
      },
      toolApproval: (options) => {
        if (options.toolCall.toolName === 'sparky_write') {
          observations.push(
            options.messages.some(
              (message) =>
                message.role === 'tool' &&
                message.content.some(
                  (part) =>
                    part.type === 'tool-result' && part.toolName === 'mcp_notes'
                )
            )
          );
        }
        return gate.toolApproval(options);
      },
      stopWhen: stepCountIs(3),
    });
    const chunks = [];
    for await (const chunk of result.fullStream) chunks.push(chunk);
    expect(write).not.toHaveBeenCalled();
    expect(chunks.some((chunk) => chunk.type === 'tool-approval-request')).toBe(
      true
    );
  });

  it('retains UI taint after approval responses and resets only after new user text', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: 'Use notes.' }] },
      { role: 'assistant', parts: [{ type: 'tool-mcp_notes', output: null }] },
      {
        role: 'assistant',
        parts: [{ type: 'tool-sparky_write', state: 'approval-responded' }],
      },
    ];
    expect(outsideResultSeen(messages)).toBe(true);
    expect(
      outsideResultSeen([
        ...messages,
        { role: 'user', content: 'Next question.' },
      ])
    ).toBe(false);
    expect(
      outsideResultSeen([
        {
          role: 'assistant',
          parts: [{ type: 'tool-mcp_notes', state: 'approval-requested' }],
        },
      ])
    ).toBe(false);
    expect(
      outsideResultSeen([], [{ toolResults: [{ toolName: 'mcp_notes' }] }])
    ).toBe(true);
    expect(
      outsideResultSeen([
        { role: 'user', content: 'Use notes.' },
        {
          role: 'assistant',
          parts: [{ type: 'tool-mcp_notes', state: 'output-error' }],
        },
      ])
    ).toBe(true);
    expect(
      outsideResultSeen(
        [],
        [{ content: [{ type: 'tool-error', toolName: 'mcp_notes' }] }]
      )
    ).toBe(true);
  });

  it('exempts only local chat controls and fails closed for unlisted tools and actions', () => {
    expect(needsOutsideApproval('sparky_ask_user', {})).toBe(false);
    expect(needsOutsideApproval('sparky_enable_tools', {})).toBe(false);
    expect(
      needsOutsideApproval('sparky_manage_food', { action: 'list_diary' })
    ).toBe(false);
    expect(
      needsOutsideApproval('sparky_manage_food', { action: 'log_food' })
    ).toBe(true);
    expect(needsOutsideApproval('sparky_daily_checkin_wizard', {})).toBe(false);
    expect(needsOutsideApproval('sparky_log_food_photo', {})).toBe(true);
    expect(needsOutsideApproval('unknown', {})).toBe(true);
    expect(needsOutsideApproval('mcp_notes', {})).toBe(true);
  });
});
