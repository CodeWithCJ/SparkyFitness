import type { UIMessageChunk } from 'ai';

type Stream = ReadableStream<UIMessageChunk>;
type Reader = ReadableStreamDefaultController<UIMessageChunk>;
type Replay = Stream | 'pending' | 'gone';
type Turn = {
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
    private readonly turnLimit = 16
  ) {}

  async open(
    key: string,
    start?: () => Promise<Stream | null>
  ): Promise<Replay | undefined> {
    let turn = this.turns.get(key);
    if (!turn) {
      if (!start) return undefined;
      if (this.turns.size >= this.turnLimit) {
        const idle = [...this.turns].find(([, value]) => value.done);
        if (!idle) return 'pending';
        clearTimeout(idle[1].expiration);
        this.turns.delete(idle[0]);
      }
      const created: Turn = {
        bytes: 0,
        chunks: [],
        readers: new Set(),
        done: false,
        ready: Promise.resolve(false),
      };
      turn = created;
      this.turns.set(key, created);
      created.ready = Promise.resolve()
        .then(start)
        .then((stream) => {
          if (!stream) {
            this.turns.delete(key);
            return false;
          }
          // Attach the accepting reader before draining any buffered provider events.
          setImmediate(() => void this.consume(key, created, stream));
          return true;
        })
        .catch((error: unknown) => {
          this.turns.delete(key);
          throw error;
        });
    }
    if (!(await turn.ready)) return 'gone';
    if (!turn.chunks) return turn.done ? 'gone' : 'pending';
    if (turn.readers.size >= 8) return 'pending';
    return this.subscribe(turn, turn.chunks);
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

  private async consume(key: string, turn: Turn, stream: Stream) {
    const source = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await source.read();
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
    } catch (error) {
      // Do not replay a truncated event sequence as a successful completion.
      turn.chunks = null;
      for (const reader of turn.readers) reader.error(error);
    } finally {
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
