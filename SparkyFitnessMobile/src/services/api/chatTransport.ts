import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import type { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { fetch as expoFetch } from 'expo/fetch';

type Seed = NonNullable<
  NonNullable<Parameters<typeof useChatRuntime>[0]>['messages']
>;

// NSURLSession reports translated strings, sometimes after the app is active
// again. Mark failures at the Expo I/O boundary, before the SDK decodes SSE.
// Provider errors are valid SSE data and retain their original SDK behavior.
export class ChatConnectionError extends Error {}
function connectionError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return error;
  return new ChatConnectionError(
    error instanceof Error ? error.message : String(error)
  );
}

export const chatFetch: typeof globalThis.fetch = async (input, init) => {
  try {
    return await (expoFetch as unknown as typeof globalThis.fetch)(input, init);
  } catch (error) {
    throw connectionError(error);
  }
};

export class NativeChatTransport extends AssistantChatTransport<Seed[number]> {
  protected override processResponseStream(
    body: ReadableStream<Uint8Array<ArrayBufferLike>>
  ) {
    const reader = body.getReader();
    return super.processResponseStream(
      new ReadableStream({
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) controller.close();
            else controller.enqueue(chunk.value);
          } catch (error) {
            controller.error(connectionError(error));
          }
        },
        cancel: (reason) => reader.cancel(reason),
      })
    );
  }
}
