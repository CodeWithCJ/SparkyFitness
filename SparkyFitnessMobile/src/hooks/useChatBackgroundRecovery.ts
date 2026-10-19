import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  loadChatHistory,
  type ChatHistoryEntry,
} from '../services/api/chatApi';

// The server ends a chat turn after five minutes (CHAT_REQUEST_TIMEOUT_MS).
// Allow fifteen seconds for final history writes, without resending the turn.
const RECOVERY_TIMEOUT_MS = 5 * 60 * 1000 + 15_000;
const POLL_INTERVAL_MS = 3000;

interface PendingTurn {
  id: string;
  deadline: number;
  backgrounded: boolean;
}

interface RecoveryOptions {
  onRecovered: (history: ChatHistoryEntry[]) => void;
  onRecoveryFailed: () => void;
}

function belongsToTurn(entry: ChatHistoryEntry, id: string): boolean {
  return (
    !!entry.metadata &&
    typeof entry.metadata === 'object' &&
    'client_message_id' in entry.metadata &&
    entry.metadata.client_message_id === id
  );
}

/** Recover a disconnected turn by reading its saved result, never by resending. */
export function useChatBackgroundRecovery({
  onRecovered,
  onRecoveryFailed,
}: RecoveryOptions) {
  const turnRef = useRef<PendingTurn | null>(null);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      const turn = turnRef.current;
      if (!turn) return;
      if (nextState !== 'active') {
        turn.backgrounded = true;
      } else if (turn.backgrounded) {
        // Also recover a stalled stream which has not reported an error yet.
        setPending(turn);
      }
    });
    return () => subscription.remove();
  }, []);

  const startTurn = useCallback((id: string) => {
    turnRef.current = {
      id,
      deadline: Date.now() + RECOVERY_TIMEOUT_MS,
      backgrounded: AppState.currentState !== 'active',
    };
    setPending(null);
  }, []);

  const finishTurn = useCallback((confirmed = true) => {
    const turn = turnRef.current;
    if (!confirmed && turn?.backgrounded) {
      // Android can deliver EOF without an error when a suspended connection
      // closes. Only the protocol's finish event confirms a completed reply.
      setPending(turn);
      return;
    }
    turnRef.current = null;
    setPending(null);
  }, []);

  const recoverError = useCallback((error: Error): boolean => {
    const turn = turnRef.current;
    if (
      turn?.backgrounded &&
      // expo/fetch can reject a suspended response with an empty Error message.
      (/^\s*$/.test(error.message) ||
        /network|fetch|connection|software|load failed|terminated/i.test(
          error.message
        ))
    ) {
      setPending(turn);
      return true;
    }
    turnRef.current = null;
    setPending(null);
    return false;
  }, []);

  useEffect(() => {
    if (!pending || appState !== 'active') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // This timer also releases the composer if a history read never settles.
    const deadlineTimer = setTimeout(
      () => {
        if (cancelled || turnRef.current !== pending) return;
        turnRef.current = null;
        setPending(null);
        onRecoveryFailed();
      },
      Math.max(0, pending.deadline - Date.now())
    );

    const poll = async () => {
      if (cancelled || turnRef.current !== pending) return;
      try {
        const history = await loadChatHistory();
        if (cancelled || turnRef.current !== pending) return;
        if (
          history.some(
            (entry) =>
              entry.message_type === 'assistant' &&
              belongsToTurn(entry, pending.id)
          )
        ) {
          turnRef.current = null;
          setPending(null);
          onRecovered(history);
          return;
        }
      } catch {
        // The connection may still be returning after unlock. Keep the local
        // transcript and try the history read again while this turn is pending.
      }
      if (cancelled || turnRef.current !== pending) return;
      if (Date.now() >= pending.deadline) {
        turnRef.current = null;
        setPending(null);
        onRecoveryFailed();
        return;
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
    };
  }, [appState, onRecovered, onRecoveryFailed, pending]);

  return { startTurn, finishTurn, recoverError, recovering: pending !== null };
}
