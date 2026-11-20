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
  const initial = await turns.open('a', 'actor', {
    start,
    timeoutMs: 10000,
    fail: vi.fn(),
  });
  if (!(initial instanceof ReadableStream)) throw Error('Expected stream');
  await initial.cancel();
  const event: UIMessageChunk = {
    type: 'error',
    errorText: 'Provider unavailable',
  };
  source.enqueue(event);
  source.close();
  const resumed = await turns.open('a', 'actor', {
    start,
    timeoutMs: 10000,
    fail: vi.fn(),
  });
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
  const initial = await turns.open('a', 'actor', {
    start,
    timeoutMs: 10000,
    fail: vi.fn(),
  });
  if (!(initial instanceof ReadableStream)) throw Error('Expected stream');
  const reader = initial.getReader();
  const event: UIMessageChunk = {
    type: 'text-delta',
    id: 'answer',
    delta: 'sample'.repeat(12),
  };
  source.enqueue(event);
  expect((await reader.read()).value).toEqual(event);
  expect(await turns.open('a', 'actor')).toBe('pending');
  expect(
    await turns.open('b', 'actor', { start, timeoutMs: 10000, fail: vi.fn() })
  ).toBe('capacity');
  source.close();
  expect((await reader.read()).done).toBe(true);
  expect(await turns.open('a', 'actor')).toBeUndefined();
});

it('reserves a producer per actor before setup while letting duplicates attach', async () => {
  const turns = new ChatTurnStreams(4096, 3, 1);
  let accept!: (stream: ReadableStream<UIMessageChunk>) => void;
  const start = vi.fn(
    () =>
      new Promise<ReadableStream<UIMessageChunk>>((resolve) => {
        accept = resolve;
      })
  );
  const producer = { timeoutMs: 60_000, start, fail: vi.fn() };
  const first = turns.open('primary', 'one', producer);
  const duplicate = turns.open('primary', 'one', producer);
  expect(await turns.open('family-profile', 'one', producer)).toBe('capacity');
  const other = await turns.open('other', 'two', {
    ...producer,
    start: async () =>
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
  });
  expect(other).toBeInstanceOf(ReadableStream);
  accept(
    new ReadableStream({
      start(c) {
        c.close();
      },
    })
  );
  expect(await first).toBeInstanceOf(ReadableStream);
  expect(await duplicate).toBeInstanceOf(ReadableStream);
  expect(start).toHaveBeenCalledTimes(1);
});

it('explicitly stops an active producer after its subscriber disconnects', async () => {
  const turns = new ChatTurnStreams();
  let generation!: AbortSignal;
  const cancel = vi.fn();
  const producer = {
    timeoutMs: 60_000,
    fail: vi.fn(),
    start: async (signal: AbortSignal) => {
      generation = signal;
      return new ReadableStream<UIMessageChunk>({ cancel });
    },
  };
  const subscription = await turns.open('sample', 'actor', producer);
  if (!(subscription instanceof ReadableStream)) throw Error('Expected stream');
  await subscription.cancel();
  expect(generation.aborted).toBe(false);
  turns.stop('sample');
  expect(generation.aborted).toBe(true);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  expect(await turns.open('sample', 'actor')).toBeUndefined();
});

it('ends setup at the same deadline used for generation', async () => {
  vi.useFakeTimers();
  try {
    const turns = new ChatTurnStreams();
    const fail = vi.fn(async (error: string) => ({ error }));
    const pending = turns.open('sample', 'actor', {
      timeoutMs: 100,
      fail,
      start: (signal, deadline) => {
        expect(deadline).toBe(Date.now() + 100);
        expect(signal.aborted).toBe(false);
        return new Promise(() => {});
      },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual({ error: 'The chat request timed out.' });
    expect(fail).toHaveBeenCalledWith('The chat request timed out.');
    expect(await turns.open('sample', 'actor')).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

it('reports producer failure to a connected reader and durably records the same message', async () => {
  const turns = new ChatTurnStreams();
  let commit!: (outcome: { error: string }) => void;
  const saved = new Promise<{ error: string }>((resolve) => {
    commit = resolve;
  });
  const fail = vi.fn(() => saved);
  const subscription = await turns.open('sample', 'actor', {
    timeoutMs: 60_000,
    fail,
    start: async () =>
      new ReadableStream({
        start(controller) {
          controller.error(new Error('Provider internals'));
        },
      }),
  });
  if (!(subscription instanceof ReadableStream)) throw Error('Expected stream');
  const reader = subscription.getReader();
  const errorText = 'The AI service could not complete the request.';
  const received = vi.fn();
  const next = reader.read().then((chunk) => {
    received();
    return chunk;
  });
  await vi.waitFor(() => expect(fail).toHaveBeenCalledWith(errorText));
  expect(received).not.toHaveBeenCalled();
  commit({ error: errorText });
  expect((await next).value).toEqual({ type: 'error', errorText });
  expect((await reader.read()).done).toBe(true);
  expect(fail).toHaveBeenCalledWith(errorText);
});

it('errors the transport if approval settlement could not be committed', async () => {
  const turns = new ChatTurnStreams();
  const subscription = await turns.open('sample', 'actor', {
    timeoutMs: 60_000,
    fail: async () => undefined,
    start: async () =>
      new ReadableStream({
        start(c) {
          c.error(new Error('Storage failed'));
        },
      }),
  });
  if (!(subscription instanceof ReadableStream)) throw Error('Expected stream');
  await expect(subscription.getReader().read()).rejects.toThrow(
    'Chat turn status unavailable.'
  );
});
