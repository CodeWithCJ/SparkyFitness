import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { ChatConnectionError } from '../services/api/chatTransport';
import { randomUUID } from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import {
  loadChatHistory,
  stopChatTurn,
  mapHistoryToInitialMessages,
} from '../services/api/chatApi';
import {
  pendingHistoryTurn,
  recoverChatTurn,
} from '../services/api/chatTurnRecovery';

type Seed = ReturnType<typeof mapHistoryToInitialMessages>;

export function sameChatAccount(
  current: ServerConfig | null,
  owner: ServerConfig
): current is ServerConfig {
  return (
    !!current &&
    current.id === owner.id &&
    current.url === owner.url &&
    getAuthHeaders(current).Authorization ===
      getAuthHeaders(owner).Authorization
  );
}

async function readReplay(
  config: ServerConfig,
  id: string,
  signal: AbortSignal
) {
  const transport = new AssistantChatTransport({
    api: normalizeUrl(config.url) + '/api/chat/turns',
    fetch: expoFetch as unknown as typeof globalThis.fetch,
    headers: {
      ...proxyHeadersToRecord(config.proxyHeaders),
      ...getAuthHeaders(config),
    },
  });
  try {
    const stream = await transport.reconnectToStream({
      chatId: id,
      abortSignal: signal,
    });
    const reader = stream?.getReader();
    if (reader) {
      const cancelReader = () => {
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener('abort', cancelReader);
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.type === 'error') throw Error(value.errorText);
        }
      } finally {
        signal.removeEventListener('abort', cancelReader);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    return 'closed' as const;
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      if (error.statusCode === 503) return 'pending' as const;
      if (
        (error.statusCode === 410 || error.statusCode === 422) &&
        'responseBody' in error &&
        typeof error.responseBody === 'string'
      ) {
        let details: unknown;
        try {
          details = JSON.parse(error.responseBody);
        } catch {
          // Older servers may return a plain-text HTTP status.
        }
        if (details && typeof details === 'object') {
          if (
            error.statusCode === 410 &&
            'cancelled' in details &&
            details.cancelled === true
          )
            return 'cancelled' as const;
          if (
            error.statusCode === 422 &&
            'error' in details &&
            typeof details.error === 'string'
          )
            throw new Error(details.error);
        }
      }
      if (error.statusCode === 410 || error.statusCode === 404)
        return 'expired' as const;
    }
    throw error;
  }
}

// ChatThread remounts after restoring history. An undelivered Stop must
// survive that remount, and only the originating account may retry it.
type Cancellation = {
  id: string;
  owner: ServerConfig;
  sending: boolean;
  retryRequested: boolean;
};
const cancellations = new Set<Cancellation>();

function cancellationFor(owner: ServerConfig, id: string) {
  for (const target of cancellations) {
    if (target.id === id && sameChatAccount(owner, target.owner)) return target;
  }
}

export function useChatTurnRecovery(
  owner: ServerConfig,
  seed: Seed,
  onRecovered: (history: Seed) => void,
  onError: (error: Error) => void
) {
  const pending = useRef(pendingHistoryTurn(seed));
  const retryStops = useCallback(() => {
    async function deliver(target: Cancellation) {
      target.sending = true;
      try {
        do {
          target.retryRequested = false;
          try {
            if (!sameChatAccount(await getActiveServerConfig(), target.owner))
              continue;
            await stopChatTurn(target.owner, target.id);
            cancellations.delete(target);
            return;
          } catch (error) {
            const active = await getActiveServerConfig().catch(() => null);
            if (sameChatAccount(active, target.owner) && !target.retryRequested)
              onError(error instanceof Error ? error : Error(String(error)));
          }
        } while (target.retryRequested);
      } finally {
        target.sending = false;
      }
    }
    for (const target of cancellations) {
      if (!sameChatAccount(owner, target.owner)) continue;
      if (target.sending) target.retryRequested = true;
      else void deliver(target);
    }
  }, [owner, onError]);
  const reader = useRef<AbortController | undefined>(undefined);
  const backgrounded = useRef(false);
  const interrupted = useRef(false);
  const disconnected = useRef<ChatConnectionError | undefined>(undefined);
  const missingPrompt = useRef(false);
  const recover = useCallback(async () => {
    const id = pending.current;
    if (!id || reader.current) return;
    if (cancellationFor(owner, id)) {
      pending.current = undefined;
      return;
    }
    const controller = new AbortController();
    reader.current = controller;
    const { signal } = controller;
    try {
      if (
        !sameChatAccount(await getActiveServerConfig(), owner) ||
        signal.aborted
      )
        return;
      const history = await recoverChatTurn(
        id,
        signal,
        async () =>
          mapHistoryToInitialMessages(await loadChatHistory(owner, signal)),
        () => readReplay(owner, id, signal)
      );
      if (
        !sameChatAccount(await getActiveServerConfig(), owner) ||
        signal.aborted
      )
        return;
      if (history === null) {
        pending.current = undefined;
      } else if (history) {
        pending.current = undefined;
        onRecovered(history);
      } else {
        missingPrompt.current = true;
        if (disconnected.current) onError(disconnected.current);
      }
    } catch (error) {
      if (
        sameChatAccount(
          await getActiveServerConfig().catch(() => null),
          owner
        ) &&
        !signal.aborted
      ) {
        onError(error instanceof Error ? error : Error(String(error)));
      }
    } finally {
      if (reader.current === controller) reader.current = undefined;
    }
  }, [owner, onRecovered, onError]);

  useEffect(() => {
    function stopReader() {
      reader.current?.abort();
      reader.current = undefined;
    }
    if (AppState.currentState !== 'background') {
      retryStops();
      void recover();
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (backgrounded.current) {
          retryStops();
          void recover();
        }
        backgrounded.current = false;
      } else if (state === 'background') {
        backgrounded.current = true;
        interrupted.current = !!pending.current;
        stopReader();
      }
    });
    return () => {
      stopReader();
      subscription.remove();
    };
  }, [recover, retryStops]);

  const begin = useCallback((recoverable: boolean) => {
    reader.current?.abort();
    reader.current = undefined;
    interrupted.current = false;
    disconnected.current = undefined;
    missingPrompt.current = false;
    pending.current = recoverable ? randomUUID() : undefined;
    return pending.current;
  }, []);

  const stop = useCallback(() => {
    const id = pending.current;
    if (id) {
      if (!cancellationFor(owner, id))
        cancellations.add({ id, owner, sending: false, retryRequested: false });
      pending.current = undefined;
      reader.current?.abort();
    }
    retryStops();
  }, [owner, retryStops]);

  const finish = useCallback(
    (isAbort: boolean, isDisconnect: boolean, isError: boolean) => {
      if (
        isDisconnect ||
        (isError && disconnected.current) ||
        (isAbort && backgrounded.current)
      )
        return;
      if (isAbort || isError) reader.current?.abort();
      else if (reader.current) return;
      pending.current = undefined;
    },
    []
  );
  const handleError = useCallback(
    (error: Error) => {
      disconnected.current =
        error instanceof ChatConnectionError ? error : undefined;
      if (disconnected.current && interrupted.current && !missingPrompt.current)
        return;
      onError(error);
    },
    [onError]
  );
  return { begin, finish, handleError, stop };
}
