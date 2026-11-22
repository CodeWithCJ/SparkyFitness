import type { UIMessageChunk } from 'ai';
import { log } from '../config/logging.js';

type Stream = ReadableStream<UIMessageChunk>;
type Reader = ReadableStreamDefaultController<UIMessageChunk>;
type Replay = Stream | 'pending' | 'gone' | 'capacity' | { error: string };
type PersistedFailure = { error: string } | 'cancelled' | undefined;
type Producer = {
  timeoutMs: number;
  start: (signal: AbortSignal, deadline: number) => Promise<Stream | null>;
  fail: (message: string) => Promise<PersistedFailure>;
};
export function chatTurnFailure(signal: AbortSignal) {
  return signal.reason?.name === 'TimeoutError'
    ? 'The chat request timed out.'
    : 'The AI service could not complete the request.';
}

type Turn = {
  actor: string;
  controller: AbortController;
  chunks: UIMessageChunk[] | null;
  bytes: number;
  readers: Set<Reader>;
  done: boolean;
  ready: Promise<boolean>;
  expiration?: NodeJS.Timeout;
};

// One producer owns the provider stream. HTTP requests only own subscriptions.
export class ChatTurnStreams {
  private readonly turns = new Map<string, Turn>();

  constructor(
    private readonly byteLimit = 2 * 1024 * 1024,
    private readonly turnLimit = 16,
    private readonly actorLimit = 2
  ) {}

  stop(key: string) {
    this.turns.get(key)?.controller.abort();
  }

  async open(
    key: string,
    actor: string,
    producer?: Producer
  ): Promise<Replay | undefined> {
    let turn = this.turns.get(key);
    if (!turn) {
      if (!producer) return undefined;
      const entries = [...this.turns];
      const owned = entries.filter(([, current]) => current.actor === actor);
      const candidates = owned.length >= this.actorLimit ? owned : entries;
      if (owned.length >= this.actorLimit || entries.length >= this.turnLimit) {
        const idle = candidates.find(([, current]) => current.done);
        if (!idle) return 'capacity';
        clearTimeout(idle[1].expiration);
        this.turns.delete(idle[0]);
      }
      const created: Turn = {
        actor,
        controller: new AbortController(),
        bytes: 0,
        chunks: [],
        readers: new Set(),
        done: false,
        ready: Promise.resolve(false),
      };
      turn = created;
      this.turns.set(key, created);
      created.ready = this.start(key, created, producer);
    }
    if (!(await turn.ready)) {
      return turn.controller.signal.reason?.name === 'TimeoutError'
        ? { error: chatTurnFailure(turn.controller.signal) }
        : 'gone';
    }
    if (!turn.chunks) return turn.done ? 'gone' : 'pending';
    if (turn.readers.size >= 8) return 'pending';
    return this.subscribe(turn, turn.chunks);
  }

  private async start(key: string, turn: Turn, producer: Producer) {
    const { signal } = turn.controller;
    const deadline = Date.now() + producer.timeoutMs;
    const timer = setTimeout(
      () =>
        turn.controller.abort(
          new DOMException('Chat turn timed out.', 'TimeoutError')
        ),
      producer.timeoutMs
    ).unref();
    let onAbort!: () => void;
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    try {
      const stream = await Promise.race([
        producer.start(signal, deadline),
        interrupted,
      ]);
      if (stream) {
        // Subscribe the accepting request before draining buffered events.
        setImmediate(() => {
          this.consume(key, turn, stream, producer, cleanup).catch(() => {
            log('error', 'Could not record the terminal chat turn status.');
          });
        });
        return true;
      }
    } catch (error) {
      try {
        const persisted = await producer.fail(chatTurnFailure(signal));
        if (!persisted && !signal.aborted) throw error;
      } finally {
        cleanup();
        this.turns.delete(key);
      }
      // Look up the durable failure or cancellation before replying.
      return false;
    }
    cleanup();
    this.turns.delete(key);
    return false;
  }

  private subscribe(turn: Turn, replay: UIMessageChunk[]): Stream {
    let reader: Reader;
    return new ReadableStream<UIMessageChunk>(
      {
        start(controller) {
          reader = controller;
          for (const chunk of replay) controller.enqueue(chunk);
          if (turn.done) controller.close();
          else turn.readers.add(controller);
        },
        cancel() {
          turn.readers.delete(reader);
        },
      },
      {
        highWaterMark: this.byteLimit,
        // Streams hand a chunk directly to a waiting reader without queueing.
        size: (chunk) => {
          const bytes = Buffer.byteLength(JSON.stringify(chunk));
          if (bytes > (reader.desiredSize ?? 0))
            throw new Error('Chat reader fell behind.');
          return bytes;
        },
      }
    );
  }

  private async consume(
    key: string,
    turn: Turn,
    stream: Stream,
    producer: Producer,
    cleanup: () => void
  ) {
    const { signal } = turn.controller;
    const source = stream.getReader();
    let cancellation: Promise<void> | undefined;
    const onAbort = () => {
      cancellation ??= source.cancel(signal.reason).catch(() => {});
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      if (signal.aborted) onAbort();
      for (;;) {
        const { done, value } = await source.read();
        signal.throwIfAborted();
        if (done) break;
        const bytes = Buffer.byteLength(JSON.stringify(value));
        if (turn.chunks) {
          turn.bytes += bytes;
          if (turn.bytes > this.byteLimit) turn.chunks = null;
          else turn.chunks.push(value);
        }
        for (const reader of turn.readers) {
          try {
            reader.enqueue(value);
          } catch {
            turn.readers.delete(reader);
          }
        }
      }
      for (const reader of turn.readers) reader.close();
    } catch {
      turn.chunks = null;
      let outcome: PersistedFailure;
      try {
        await cancellation;
        outcome = await producer.fail(chatTurnFailure(signal));
      } finally {
        // A replay reader refreshes history as soon as it sees a terminal event.
        // Only publish one after its corresponding database write has committed.
        const terminal: UIMessageChunk | undefined =
          outcome === 'cancelled'
            ? { type: 'abort' }
            : outcome && { type: 'error', errorText: outcome.error };
        for (const reader of turn.readers) {
          if (!terminal) {
            reader.error(new Error('Chat turn status unavailable.'));
            continue;
          }
          try {
            reader.enqueue(terminal);
            reader.close();
          } catch (error) {
            reader.error(error);
          }
        }
      }
    } finally {
      cleanup();
      signal.removeEventListener('abort', onAbort);
      source.releaseLock();
      turn.done = true;
      turn.readers.clear();
      if (!turn.chunks) this.turns.delete(key);
      else
        turn.expiration = setTimeout(
          () => this.turns.delete(key),
          10 * 60_000
        ).unref();
    }
  }
}
