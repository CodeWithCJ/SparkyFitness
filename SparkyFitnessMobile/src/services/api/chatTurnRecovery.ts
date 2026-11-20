type Message = { role: string; metadata?: unknown };

function turnIdOf(
  message: Message,
  key: 'turnId' | 'pendingTurnId' = 'turnId'
) {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== 'object') return;
  const id: unknown = Reflect.get(metadata, key);
  return typeof id === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : undefined;
}

function checkpointId(message: Message) {
  if (message.role === 'assistant') return turnIdOf(message, 'pendingTurnId');
  if (message.role !== 'user') return;
  const metadata = message.metadata;
  if (
    metadata &&
    typeof metadata === 'object' &&
    'turnState' in metadata &&
    (metadata.turnState === 'cancelled' || metadata.turnState === 'complete')
  )
    return;
  return turnIdOf(message);
}

export function pendingHistoryTurn(messages: readonly Message[]) {
  const last = messages.at(-1);
  return last && checkpointId(last);
}

// The server returns 503 while a running turn exceeds its replay buffer.
// Leave the foreground reader cancellable during the documented two-second delay.
function waitForHistory(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    const timer = setTimeout(done, 2000);
    signal.addEventListener('abort', done);
    if (signal.aborted) done();
  });
}

export async function recoverChatTurn<T extends Message>(
  id: string,
  signal: AbortSignal,
  read: () => Promise<T[]>,
  attach: () => Promise<'closed' | 'pending' | 'expired' | 'cancelled'>
): Promise<T[] | null | undefined> {
  let status: Awaited<ReturnType<typeof attach>> | undefined;
  while (!signal.aborted) {
    const history = await read();
    if (signal.aborted) return;
    if (history.some((m) => m.role === 'assistant' && turnIdOf(m) === id))
      return history;
    if (!history.some((m) => checkpointId(m) === id)) return;
    if (status === 'closed' || status === 'expired') {
      // The screen uses its localized error/retry message for an expired turn.
      throw new Error();
    }
    status = await attach();
    if (status === 'cancelled') return null;
    if (status === 'pending') await waitForHistory(signal);
  }
}
