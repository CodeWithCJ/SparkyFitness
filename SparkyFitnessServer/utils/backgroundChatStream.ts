import type { UIMessageChunk } from 'ai';

/** Drain generation after an HTTP consumer disconnects, with a bounded live
 * delivery queue. Dropping live delivery never cancels provider/tool work. */
export function backgroundChatStream(
  source: ReadableStream<UIMessageChunk>,
  bufferBytes = 256 * 1024
): ReadableStream<UIMessageChunk> {
  const reader = source.getReader();
  let abandoned = false;
  const chunkBytes = (chunk: UIMessageChunk) =>
    JSON.stringify(chunk).length * 2;
  return new ReadableStream<UIMessageChunk>(
    {
      start(controller) {
        void (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (abandoned) continue;
              const available = controller.desiredSize ?? 0;
              // A single provider chunk can exceed the whole buffer. Let it
              // through when empty so a fast reader can still receive it.
              if (available < bufferBytes && available < chunkBytes(value)) {
                abandoned = true;
                controller.error(
                  new Error(
                    'Live reply delivery stopped because the connection is too slow. Reopen the chat to restore the saved reply.'
                  )
                );
              } else controller.enqueue(value);
            }
            if (!abandoned) controller.close();
          } catch (error) {
            if (!abandoned) controller.error(error);
          } finally {
            reader.releaseLock();
          }
        })();
      },
      cancel() {
        abandoned = true;
      },
    },
    { highWaterMark: bufferBytes, size: chunkBytes }
  );
}
