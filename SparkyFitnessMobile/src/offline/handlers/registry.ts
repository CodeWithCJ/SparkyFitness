import type { OutboxHandler } from '../types';

const handlers = new Map<string, OutboxHandler>();

/**
 * Makes one kind of queued work sendable. A module that wants offline
 * writes registers a handler for its kind; the queue and the sync engine
 * need no other change.
 */
export function registerOutboxHandler(handler: OutboxHandler): void {
  handlers.set(handler.kind, handler);
}

export function getOutboxHandler(kind: string): OutboxHandler | undefined {
  return handlers.get(kind);
}

/** Tests only. */
export function __clearOutboxHandlersForTests(): void {
  handlers.clear();
}
