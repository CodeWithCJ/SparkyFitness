import type { UIMessageChunk } from 'ai';
import { expect, it, vi } from 'vitest';
import { ChatTurnStreams } from '../services/chatTurnStreams.js';

it('drains the producer after the original socket leaves and replays every event', async () => {
  let source!: ReadableStreamDefaultController<UIMessageChunk>;
  const cancelled = vi.fn();
  const start = vi.fn(
    async () =>
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          source = controller;
        },
        cancel: cancelled,
      })
  );
  const turns = new ChatTurnStreams();
  const initial = await turns.open('a', start);
  if (!(initial instanceof ReadableStream)) throw Error('Expected stream');
  await initial.cancel();
  const event: UIMessageChunk = {
    type: 'error',
    errorText: 'Provider unavailable',
  };
  source.enqueue(event);
  source.close();
  const resumed = await turns.open('a', start);
  if (!(resumed instanceof ReadableStream)) throw Error('Expected replay');
  const reader = resumed.getReader();
  expect((await reader.read()).value).toEqual(event);
  expect((await reader.read()).done).toBe(true);
  expect(start).toHaveBeenCalledTimes(1);
  expect(cancelled).not.toHaveBeenCalled();
});

it('keeps generating when replay exceeds its limit and frees its slot after completion', async () => {
  const turns = new ChatTurnStreams(40, 1);
  let source!: ReadableStreamDefaultController<UIMessageChunk>;
  const start = async () =>
    new ReadableStream<UIMessageChunk>({
      start(c) {
        source = c;
      },
    });
  const initial = await turns.open('a', start);
  if (!(initial instanceof ReadableStream)) throw Error('Expected stream');
  const reader = initial.getReader();
  const event: UIMessageChunk = {
    type: 'text-delta',
    id: 'answer',
    delta: 'sample'.repeat(12),
  };
  source.enqueue(event);
  expect((await reader.read()).value).toEqual(event);
  expect(await turns.open('a')).toBe('pending');
  expect(await turns.open('b', start)).toBe('pending');
  source.close();
  expect((await reader.read()).done).toBe(true);
  expect(await turns.open('a')).toBeUndefined();
});
