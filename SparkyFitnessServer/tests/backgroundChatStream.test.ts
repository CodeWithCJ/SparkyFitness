import { expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';
import { backgroundChatStream } from '../utils/backgroundChatStream.js';
import { streamText, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

it.each([false, true])(
  'keeps SDK result promises and existing consumers working (discard=%s)',
  async (discardInternalStream) => {
    const result = streamText({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'reply' },
              { type: 'text-delta', id: 'reply', delta: 'Saved reply' },
              { type: 'text-end', id: 'reply' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 2, text: 2, reasoning: 0 },
                },
              },
            ],
          }),
        }),
      }),
      prompt: 'Hello',
    });
    const reader = result.textStream.getReader();
    await result.consumeStream({ discardInternalStream });
    expect(await result.text).toBe('Saved reply');
    expect(await reader.read()).toMatchObject({
      done: false,
      value: 'Saved reply',
    });
    expect((await reader.read()).done).toBe(true);
    const later = result.textStream.getReader();
    expect(await later.read()).toEqual(
      discardInternalStream
        ? { done: true, value: undefined }
        : { done: false, value: 'Saved reply' }
    );
    await later.cancel();
  }
);
function source(count: number) {
  let produced = 0;
  const cancel = vi.fn();
  let finish!: () => void;
  const drained = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    cancel,
    drained,
    stream: new ReadableStream<UIMessageChunk>({
      pull(controller) {
        if (produced++ < count)
          controller.enqueue({
            type: 'text-delta',
            id: 'reply',
            delta: 'x'.repeat(100),
          });
        else {
          controller.close();
          finish();
        }
      },
      cancel,
    }),
  };
}
it('continues draining generation after the phone cancels its response', async () => {
  const provider = source(1000);
  const reader = backgroundChatStream(provider.stream).getReader();
  await reader.read();
  await reader.cancel();
  await provider.drained;
  expect(provider.cancel).not.toHaveBeenCalled();
});
it('bounds queued delivery for a stalled phone without cancelling generation', async () => {
  const provider = source(1000);
  const stream = backgroundChatStream(provider.stream, 1024);
  await provider.drained;
  await expect(stream.getReader().read()).rejects.toThrow(
    'connection is too slow'
  );
  expect(provider.cancel).not.toHaveBeenCalled();
});
it('delivers every chunk while the client reads normally', async () => {
  const provider = source(1000);
  const reader = backgroundChatStream(provider.stream, 1024).getReader();
  let received = 0;
  while (!(await reader.read()).done) received++;
  expect(received).toBe(1000);
});

it('delivers a single oversized chunk to an active reader', async () => {
  const chunk = {
    type: 'text-delta' as const,
    id: 'reply',
    delta: 'x'.repeat(150_000),
  };
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
  const reader = backgroundChatStream(stream).getReader();
  expect(await reader.read()).toEqual({ done: false, value: chunk });
  expect((await reader.read()).done).toBe(true);
});
